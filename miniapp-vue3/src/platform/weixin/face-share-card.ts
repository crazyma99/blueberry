// 分享封面（端侧人脸居中 5:4 卡片）——旧端 `utils/faceShareCard.uts` 忠实移植
// （2026-09-21 主人：「AI试衣结果分享的 VK 人脸算法裁切也遗漏了」）。
// 链路（旧端逐字）：`wx.getImageInfo`（本地路径+原图尺寸）→ 离屏 2D canvas 取 RGBA 像素（降采样 ≤1024）
//   → `createVKSession(track.face.mode=2)` + `detectFace` 取**面积最大**人脸框（`vkFace.uts` → 本仓 `./vk-face`）
//   → 按 5:4（750×600）算裁剪窗（人脸中心对齐 + 边界 clamp）→ 新离屏 canvas 裁剪出图 → `wx.canvasToTempFilePath`。
// 降级链：人脸居中 → 中心裁剪 → `null`（调用方回退网络 JPG）。**任何异常静默降级，绝不让分享功能崩溃**。
// 平台：仅微信端可用（VisionKit + 离屏 canvas）；非微信/无 wx/无能力 → `null`（fail-open 同 photo-check 口径）。
// 备注：`photo-check.ts` 内有同族 canvas 胶水（getImageInfo/loadCanvasImage）；此处按「忠实移植 + 不动已冻结管线」原则
//   自持一份（约 30 行），后续若要收敛可再抽公共模块（列为观察项，不在本轮）。
import { detectLargestFace } from "./vk-face";

export interface FaceCardResult {
  imagePath: string;
}

const CARD_W = 750;
const CARD_H = 600;
const DETECT_MAX_DIM = 1024;
/** 真机首次 VK 模型初始化较慢（旧端 2026-09-10 真机联调结论：3s 太短） */
const VK_TIMEOUT_MS = 10000;
/** 人脸框面积占全图 <2% 视为噪声（旧端同值） */
const MIN_FACE_RATIO = 0.02;

interface WxCanvasLike {
  getImageInfo?: (o: { src: string; success: (res: { width?: number; height?: number; path?: string }) => void; fail: (e?: unknown) => void }) => void;
  createOffscreenCanvas?: (o: { type: string; width: number; height: number }) => OffscreenCanvasLike;
  canvasToTempFilePath?: (o: {
    canvas: OffscreenCanvasLike;
    x: number;
    y: number;
    width: number;
    height: number;
    destWidth: number;
    destHeight: number;
    fileType: string;
    quality: number;
    success: (res: { tempFilePath?: string }) => void;
    fail: (e?: unknown) => void;
  }) => void;
}

interface OffscreenCanvasLike {
  getContext: (t: string) => {
    /** 微信 `drawImage`：2–5 参＝源图矩形写法（整图缩放），9 参＝裁剪写法（见下方 🔴1 注释） */
    drawImage: (img: unknown, ...args: number[]) => void;
    getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray };
  };
  createImage: () => { onload: () => void; onerror: (e?: unknown) => void; src: string };
}

function wxCanvas(): WxCanvasLike | undefined {
  return (globalThis as { wx?: WxCanvasLike }).wx;
}

function getImageInfo(wx: WxCanvasLike, src: string): Promise<{ width: number; height: number; path: string }> {
  return new Promise((resolve, reject) => {
    if (typeof wx.getImageInfo !== "function") {
      reject(new Error("getImageInfo unavailable"));
      return;
    }
    wx.getImageInfo({
      src,
      success: (res) => resolve({ width: Number(res.width ?? 0), height: Number(res.height ?? 0), path: String(res.path ?? "") }),
      fail: (e) => reject(e),
    });
  });
}

function loadCanvasImage(canvas: OffscreenCanvasLike, src: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/** 5:4 裁剪窗：人脸中心对齐 + clamp；face=null 时中心裁剪（旧端逐字） */
export function computeFaceCenteredCrop(
  imgW: number,
  imgH: number,
  face: { origin: { x: number; y: number }; size: { width: number; height: number } } | null,
): [number, number, number, number] {
  let cropW = imgW;
  let cropH = imgW * 0.8;
  if (imgH * 1.25 < imgW) {
    cropW = imgH * 1.25;
    cropH = imgH;
  }
  let sx = 0;
  let sy = 0;
  if (face != null) {
    const fx = (face.origin.x + face.size.width / 2) * imgW;
    const fy = (face.origin.y + face.size.height / 2) * imgH;
    sx = fx - cropW / 2;
    sy = fy - cropH / 2;
  } else {
    sx = (imgW - cropW) / 2;
    sy = (imgH - cropH) / 2;
  }
  if (sx < 0) sx = 0;
  if (sy < 0) sy = 0;
  if (sx + cropW > imgW) sx = imgW - cropW;
  if (sy + cropH > imgH) sy = imgH - cropH;
  return [Math.round(sx), Math.round(sy), Math.round(cropW), Math.round(cropH)];
}

/**
 * 生成人脸居中 5:4 分享封面。成功返回 `{ imagePath }`（本地临时图），任何失败/不可用返回 `null`。
 */
export async function generateFaceCenteredCard(imageUrl: string): Promise<FaceCardResult | null> {
  const wx = wxCanvas();
  if (wx == null || imageUrl === "" || typeof wx.createOffscreenCanvas !== "function" || typeof wx.canvasToTempFilePath !== "function") {
    return null; // 非微信端/能力缺失：调用方回退网络图
  }
  try {
    const info = await getImageInfo(wx, imageUrl);
    const imgW = info.width;
    const imgH = info.height;
    const localPath = info.path !== "" ? info.path : imageUrl;
    if (imgW <= 0 || imgH <= 0) return null;

    // 检测降采样（与服务端 DETECT_MAX_DIM=1024 同口径）
    const scale = Math.min(1, DETECT_MAX_DIM / Math.max(imgW, imgH));
    const dw = Math.round(imgW * scale);
    const dh = Math.round(imgH * scale);

    const detCanvas = wx.createOffscreenCanvas({ type: "2d", width: dw, height: dh });
    const detCtx = detCanvas.getContext("2d");
    const detImg = await loadCanvasImage(detCanvas, localPath);
    // ⚠️ 必须用 **5 参**（整图缩放到 dw×dh）；9 参写法会把「原图左上角 dw×dh 像素」当成源矩形
    // （微信 drawImage 2–5 参＝源图矩形），长边 >1024 的图（预览图 cosThumb 1080 ⇒ 真机必命中）
    // 会喂给 VK 一块裁切区 ⇒ 检不到脸、静默退回中心裁剪。旧端 faceShareCard.uts:108 与同族胶水
    // photo-check.ts 均为 5 参写法（独立 CR 🔴1）。
    detCtx.drawImage(detImg, 0, 0, dw, dh);
    const frameBuffer = detCtx.getImageData(0, 0, dw, dh).data.buffer as ArrayBuffer;

    // 端侧人脸检测（不可用/未检出 → null → 中心裁剪）
    let face: { origin: { x: number; y: number }; size: { width: number; height: number } } | null = null;
    const anchor = await detectLargestFace(frameBuffer, dw, dh, VK_TIMEOUT_MS);
    if (anchor != null) {
      const sw = Number(anchor.size?.width ?? 0);
      const sh = Number(anchor.size?.height ?? 0);
      if (sw * sh >= MIN_FACE_RATIO) {
        face = { origin: { x: Number(anchor.origin?.x ?? 0), y: Number(anchor.origin?.y ?? 0) }, size: { width: sw, height: sh } };
      }
    }

    const crop = computeFaceCenteredCrop(imgW, imgH, face);
    const outCanvas = wx.createOffscreenCanvas({ type: "2d", width: CARD_W, height: CARD_H });
    const outCtx = outCanvas.getContext("2d");
    const outImg = await loadCanvasImage(outCanvas, localPath);
    outCtx.drawImage(outImg, crop[0], crop[1], crop[2], crop[3], 0, 0, CARD_W, CARD_H);

    const tempFilePath = await new Promise<string>((resolve, reject) => {
      wx.canvasToTempFilePath?.({
        canvas: outCanvas,
        x: 0,
        y: 0,
        width: CARD_W,
        height: CARD_H,
        destWidth: CARD_W,
        destHeight: CARD_H,
        fileType: "jpg",
        quality: 0.85,
        success: (res) => resolve(String(res.tempFilePath ?? "")),
        fail: (e) => reject(e),
      });
    });
    return tempFilePath !== "" ? { imagePath: tempFilePath } : null;
  } catch (err) {
    console.error("[faceShareCard] 生成分享封面异常，回退网络图:", err);
    return null;
  }
}
