// T8 S3b-2：上传照片质量拦截（微信管线，旧端 utils/photoCheck.uts:67-145 忠实移植）。
// 顺序（短路）：分辨率 → 模糊（离屏画布灰度＋拉普拉斯方差）→ 人脸检出/人数/占比（VK）。
// **fail-open**（旧端 :138-141）：无 wx／画布或 VK 不可用／检测异常 一律放行 `{ok:true}`，不阻断用户上传。
// 判定逻辑与文案全部来自 domain/photo-check（单一事实源，已单测）。
// ⭐P3-08 明文声明（T8 CR 🟡P2）：**前端质量检查仅为体验拦截，不代替后端人脸/安全校验**——后端校验始终是唯一裁决；
// 且本管线 fail-open（检测不可用/异常一律放行），故任何“未通过”都只是提示用户重选，绝不构成准入判定。
import {
  downsampleSize,
  evaluatePhotoCheck,
  laplacianVariance,
  toGrayscale,
  type PhotoCheckResult,
} from "../../domain/photo-check";
import { detectFaces, vkAvailable } from "./vk-face";

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
  return (globalThis as { wx?: WxCanvasLike }).wx;
}

export interface PhotoCheckPort {
  check(filePath: string): Promise<PhotoCheckResult>;
}

export function createWeixinPhotoCheck(): PhotoCheckPort {
  function getImageInfo(src: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const wx = wxCanvas();
      if (wx?.getImageInfo == null) {
        reject(new Error("getImageInfo unavailable"));
        return;
      }
      wx.getImageInfo({
        src,
        success: (res) => resolve({ width: typeof res.width === "number" ? res.width : 0, height: typeof res.height === "number" ? res.height : 0 }),
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
      // ① 分辨率
      const info = await getImageInfo(filePath);
      const { width: w, height: h } = info;
      if (w > 0 && h > 0 && (w < 480 || h < 480)) {
        return evaluatePhotoCheck({ width: w, height: h, variance: null });
      }
      // ② 模糊（降采样 ≤256px → 灰度 → 拉普拉斯方差）
      const { width: dw, height: dh } = downsampleSize(w, h);
      const canvas = wx.createOffscreenCanvas({ type: "2d", width: dw, height: dh });
      const ctx = canvas.getContext("2d");
      const img = await loadCanvasImage(canvas, filePath);
      ctx.drawImage(img, 0, 0, dw, dh);
      const imgData = ctx.getImageData(0, 0, dw, dh);
      const gray = toGrayscale(imgData.data, dw * dh);
      const variance = laplacianVariance(gray, dw, dh);
      if (variance < 100) {
        return evaluatePhotoCheck({ width: w, height: h, variance });
      }
      // ③④ 人脸检出 / 人数 / 占比（VK 不可用则跳过该组检查）
      if (vkAvailable()) {
        const frameBuffer = (imgData.data.buffer ?? new ArrayBuffer(0)) as ArrayBuffer;
        const faces = await detectFaces(frameBuffer, dw, dh, 5000);
        const first = faces[0];
        const sw = typeof first?.size?.width === "number" ? (first.size.width as number) : 0;
        const sh = typeof first?.size?.height === "number" ? (first.size.height as number) : 0;
        return evaluatePhotoCheck({
          width: w,
          height: h,
          variance,
          faceCount: faces.length,
          faceArea: sw * sh,
        });
      }
      return evaluatePhotoCheck({ width: w, height: h, variance });
    } catch (err) {
      // fail-open：检测代码自身异常一律放行（旧端 :138-141）
      console.error("[photoCheck] 检测异常，放行上传:", err);
      return { ok: true, reason: "" };
    }
  }

  return { check };
}
