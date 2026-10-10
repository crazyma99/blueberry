// T8 S3b-2：上传照片质量拦截（微信管线，旧端 utils/photoCheck.uts:67-145 忠实移植）。
// 顺序：降采样 ≤256px → 灰度 → 拉普拉斯方差（模糊度）。
//
// 【2026-10-09 主人拍板 · 方案A】端侧**只做模糊一项**；已摘除：
//   · 分辨率规则（后端 4 条规则里没有 ⇒ 端侧拦下后端会放行的照片，结构性误拦）；
//   · VK 人脸检测三组规则（未检出／多张／占比过小）——人脸判定**唯一裁决权交后端 `4002`**，
//     端侧不再调用 `vk-face`（该模块仍为「分享卡片人脸居中」提供能力，见 platform/weixin/face-share-card.ts）。
//   详见 domain/photo-check.ts 头注（含误拦根因清单与模糊阈值的待标定风险）。
//
// **fail-open**（旧端 :138-141）：无 wx／画布不可用／检测异常 一律放行 `{ok:true}`，不阻断用户上传。
// ⭐P3-08 明文声明（T8 CR 🟡P2）：**前端质量检查仅为体验拦截，不代替后端人脸/安全校验**——后端校验始终是唯一裁决；
// 且本管线 fail-open（检测不可用/异常一律放行），故任何“未通过”都只是提示用户重选，绝不构成准入判定。
import {
  downsampleSize,
  evaluatePhotoCheck,
  laplacianVariance,
  toGrayscale,
  type PhotoCheckResult,
} from "../../domain/photo-check";

interface WxCanvasLike {
  getImageInfo?: (o: { src: string; success: (res: { width?: number; height?: number }) => void; fail: () => void }) => void;
  createOffscreenCanvas?: (o: { type: string; width: number; height: number }) => {
    getContext: (t: string) => {
      drawImage: (img: unknown, x: number, y: number, w: number, h: number) => void;
      getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray };
    };
    createImage: () => { onload: () => void; onerror: () => void; src: string };
  };
}

function wxCanvas(): WxCanvasLike | undefined {
  return (typeof globalThis === "undefined" ? undefined : (globalThis as { wx?: WxCanvasLike }).wx);
}

export interface PhotoCheckPort {
  check(filePath: string): Promise<PhotoCheckResult>;
}

/** 检测总超时（2026-09-17 补：模拟器/低端机 offscreen canvas 可能不回调 ⇒ 无超时会让页面永久停在「照片检测中…」） */
export const PHOTO_CHECK_TIMEOUT_MS = 6000;

export function createWeixinPhotoCheck(deps?: { timeoutMs?: number }): PhotoCheckPort {
  const timeoutMs = deps?.timeoutMs ?? PHOTO_CHECK_TIMEOUT_MS;
  const raw = createWeixinPhotoCheckInner();
  return {
    async check(filePath: string): Promise<PhotoCheckResult> {
      // ⭐超时兜底：与内层实现赛跑，超时按 **fail-open 放行**（前端检查只是体验拦截，后端校验才是裁决）
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<PhotoCheckResult>((resolve) => {
        timer = setTimeout(() => {
          console.warn("[photoCheck] 检测超时，放行上传（fail-open）");
          resolve({ ok: true, reason: "" });
        }, timeoutMs);
      });
      try {
        return await Promise.race([raw.check(filePath), timeout]);
      } finally {
        if (timer != null) clearTimeout(timer);
      }
    },
  };
}

function createWeixinPhotoCheckInner(): PhotoCheckPort {
  /** 取原图宽高：**仅用于**按比例算降采样尺寸（不再做分辨率拦截，见方案A） */
  function getImageInfo(src: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const wx = wxCanvas();
      if (wx?.getImageInfo == null) {
        reject(new Error("getImageInfo unavailable"));
        return;
      }
      wx.getImageInfo({
        src,
        // ⚠️ 必须用 Number.isFinite 取数：`typeof NaN === "number"`，旧写法会把 NaN 当有效尺寸带下去
        //    ⇒ 画布/getImageData 尺寸为 NaN ⇒ 空缓冲 ⇒ 方差 0 ⇒ 被误判「模糊」硬拦（CR R2 实测）
        success: (res) =>
          resolve({
            width: typeof res.width === "number" ? res.width : Number.NaN,
            height: typeof res.height === "number" ? res.height : Number.NaN,
          }),
        fail: () => reject(new Error("getImageInfo failed")),
      });
    });
  }

  function loadCanvasImage(canvas: NonNullable<ReturnType<NonNullable<WxCanvasLike["createOffscreenCanvas"]>>>, src: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const img = canvas.createImage();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image load failed"));
      img.src = src;
    });
  }

  async function check(filePath: string): Promise<PhotoCheckResult> {
    try {
      const wx = wxCanvas();
      // 无 wx / 无画布能力 → 直接放行（fail-open）
      if (wx?.getImageInfo == null || wx.createOffscreenCanvas == null) {
        return { ok: true, reason: "" };
      }
      // ① 原图宽高（只用于算降采样比例）
      const info = await getImageInfo(filePath);
      const { width: w, height: h } = info;
      // ⭐尺寸未知/非有限（0、NaN、负数）⇒ 无法按比例降采样 ⇒ **直接放行**（fail-open）。
      //   不得拿 64×64 兜底去算模糊：阈值 100 是 256px 设计口径，64px 下高频内容方差会塌到 0 ⇒ 误拦（CR R3 实测）。
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        return { ok: true, reason: "" };
      }
      // ② 模糊（降采样 ≤256px → 灰度 → 拉普拉斯方差）；**端侧唯一规则**
      const { width: dw, height: dh } = downsampleSize(w, h);
      const canvas = wx.createOffscreenCanvas({ type: "2d", width: dw, height: dh });
      const ctx = canvas.getContext("2d");
      const img = await loadCanvasImage(canvas, filePath);
      ctx.drawImage(img, 0, 0, dw, dh);
      const imgData = ctx.getImageData(0, 0, dw, dh);
      // ⭐像素缓冲不完整（个别机型/异常容器返回空数据）⇒ 视为**检测失败**并放行；
      //   否则空缓冲会被 toGrayscale 补 0 ⇒ 方差 0 ⇒ 误判「模糊」硬拦（CR R2）。
      if (imgData.data == null || imgData.data.length < dw * dh * 4) {
        return { ok: true, reason: "" };
      }
      const gray = toGrayscale(imgData.data, dw * dh);
      const variance = laplacianVariance(gray, dw, dh);
      return evaluatePhotoCheck({ variance });
    } catch (err) {
      // fail-open：检测代码自身异常一律放行（旧端 :138-141）
      console.error("[photoCheck] 检测异常，放行上传:", err);
      return { ok: true, reason: "" };
    }
  }

  return { check };
}
