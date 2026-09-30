// 人脸图上传前压缩 —— 微信管线容器胶水（2026-09-28 流量成本 PRD R16/R17/R19）。
// 链路：getImageInfo 取尺寸 → 降采样帧喂 VK 取最大人脸框（复用 vk-face）→ computeFaceCropRect
//   → 离屏 canvas 裁剪/缩放 → canvasToTempFilePath（jpg，质量阶梯重试至 ≤500KB）→ getFileInfo 取字节数。
// **fail-open**（与 photo-check 同纪律）：无 wx／画布或 VK 不可用／任何异常/超时一律返回 `null`，
//   调用方回退原图路径上传；体积红线由服务端 R22 二次压缩兜底（本模块只是体验与成本的前置优化）。
// canvas 胶水与 photo-check.ts / face-share-card.ts 同族（9 参 drawImage＝裁剪写法，5 参＝整图缩放）。
import {
  COMPRESS_QUALITY_LADDER,
  COMPRESS_TARGET_BYTES,
  computeCompressSize,
  computeFaceCropRect,
  type FaceBox,
} from "../../domain/photo-compress";
import { detectLargestFace } from "./vk-face";

export interface CompressResult {
  /** 压缩产物本地临时路径 */
  path: string;
  /** 产物字节数（getFileInfo 实测；容器不给时为 0） */
  size: number;
  width: number;
  height: number;
}

export interface PhotoCompressPort {
  /** 成功返回压缩产物；任何不可用/异常返回 null（fail-open，调用方回退原图） */
  compress(filePath: string): Promise<CompressResult | null>;
}

/** 压缩总超时（低端机 canvas 可能不回调 ⇒ 无超时会让页面永久停在「照片处理中…」；同 photo-check 教训） */
export const PHOTO_COMPRESS_TIMEOUT_MS = 8000;
/** VK 检测帧降采样上限（与 face-share-card DETECT_MAX_DIM 同口径） */
const DETECT_MAX_DIM = 1024;

interface WxCanvasLike {
  getImageInfo?: (o: {
    src: string;
    success: (res: { width?: number; height?: number }) => void;
    fail: (e?: unknown) => void;
  }) => void;
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
  getFileSystemManager?: () => {
    getFileInfo: (o: {
      filePath: string;
      success: (res: { size?: number }) => void;
      fail: (e?: unknown) => void;
    }) => void;
  };
}

interface OffscreenCanvasLike {
  getContext: (t: string) => {
    /** 微信 `drawImage`：2–5 参＝整图缩放；9 参＝源矩形裁剪（同 face-share-card 🔴1 注释口径） */
    drawImage: (img: unknown, ...args: number[]) => void;
    getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray };
  };
  createImage: () => { onload: () => void; onerror: (e?: unknown) => void; src: string };
}

function wxCanvas(): WxCanvasLike | undefined {
  return (globalThis as { wx?: WxCanvasLike }).wx;
}

export function createWeixinPhotoCompress(deps?: { timeoutMs?: number }): PhotoCompressPort {
  const timeoutMs = deps?.timeoutMs ?? PHOTO_COMPRESS_TIMEOUT_MS;
  return {
    async compress(filePath: string): Promise<CompressResult | null> {
      // 超时兜底：与内层实现赛跑，超时按 fail-open 返回 null（上传仍可继续，只是未压缩）
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<CompressResult | null>((resolve) => {
        timer = setTimeout(() => {
          console.warn("[photoCompress] 压缩超时，回退原图上传（fail-open）");
          resolve(null);
        }, timeoutMs);
      });
      try {
        return await Promise.race([compressInner(filePath), timeout]);
      } finally {
        if (timer != null) clearTimeout(timer);
      }
    },
  };
}

function getImageInfo(wx: WxCanvasLike, src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (typeof wx.getImageInfo !== "function") {
      reject(new Error("getImageInfo unavailable"));
      return;
    }
    wx.getImageInfo({
      src,
      success: (res) => resolve({ width: Number(res.width ?? 0), height: Number(res.height ?? 0) }),
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

function canvasToTempFile(
  wx: WxCanvasLike,
  canvas: OffscreenCanvasLike,
  width: number,
  height: number,
  quality: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath?.({
      canvas,
      x: 0,
      y: 0,
      width,
      height,
      destWidth: width,
      destHeight: height,
      fileType: "jpg",
      quality,
      success: (res) => resolve(String(res.tempFilePath ?? "")),
      fail: (e) => reject(e),
    });
  });
}

function getFileSize(wx: WxCanvasLike, filePath: string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const fsm = typeof wx.getFileSystemManager === "function" ? wx.getFileSystemManager() : null;
      if (fsm == null) {
        resolve(0);
        return;
      }
      fsm.getFileInfo({
        filePath,
        success: (res) => resolve(Number(res.size ?? 0)),
        fail: () => resolve(0), // 容器不给字节数时按 0（不阻断上传；10MB 上限判定会跳过）
      });
    } catch {
      resolve(0);
    }
  });
}

async function compressInner(filePath: string): Promise<CompressResult | null> {
  try {
    const wx = wxCanvas();
    if (wx?.getImageInfo == null || wx.createOffscreenCanvas == null || wx.canvasToTempFilePath == null) {
      return null; // 非微信端/能力缺失：fail-open
    }
    const info = await getImageInfo(wx, filePath);
    const imgW = info.width;
    const imgH = info.height;
    if (imgW <= 0 || imgH <= 0) return null;

    // VK 人脸检测（降采样帧；不可用/未检出 → null → 不裁剪只压缩）
    let face: FaceBox | null = null;
    try {
      const scale = Math.min(1, DETECT_MAX_DIM / Math.max(imgW, imgH));
      const dw = Math.round(imgW * scale);
      const dh = Math.round(imgH * scale);
      const detCanvas = wx.createOffscreenCanvas({ type: "2d", width: dw, height: dh });
      const detCtx = detCanvas.getContext("2d");
      const detImg = await loadCanvasImage(detCanvas, filePath);
      // ⚠️ 5 参（整图缩放），9 参会把左上角 dw×dh 当源矩形（同 face-share-card 🔴1）
      detCtx.drawImage(detImg, 0, 0, dw, dh);
      const frameBuffer = detCtx.getImageData(0, 0, dw, dh).data.buffer as ArrayBuffer;
      const anchor = await detectLargestFace(frameBuffer, dw, dh, 8000);
      if (anchor != null) {
        face = {
          origin: { x: Number(anchor.origin?.x ?? 0), y: Number(anchor.origin?.y ?? 0) },
          size: { width: Number(anchor.size?.width ?? 0), height: Number(anchor.size?.height ?? 0) },
        };
      }
    } catch (err) {
      console.warn("[photoCompress] 人脸检测异常，跳过裁剪（仅压缩）:", err);
    }

    const crop = computeFaceCropRect(imgW, imgH, face);
    const srcW = crop != null ? crop[2] : imgW;
    const srcH = crop != null ? crop[3] : imgH;
    const target = computeCompressSize(srcW, srcH);

    const outCanvas = wx.createOffscreenCanvas({ type: "2d", width: target.width, height: target.height });
    const outCtx = outCanvas.getContext("2d");
    const outImg = await loadCanvasImage(outCanvas, filePath);
    if (crop != null) {
      // 9 参：源矩形裁剪 → 目标整幅
      outCtx.drawImage(outImg, crop[0], crop[1], crop[2], crop[3], 0, 0, target.width, target.height);
    } else {
      outCtx.drawImage(outImg, 0, 0, target.width, target.height);
    }

    // 质量阶梯重试至 ≤500KB（或阶梯用尽，取最后一档产物）
    let lastPath = "";
    let lastSize = 0;
    for (const quality of COMPRESS_QUALITY_LADDER) {
      const path = await canvasToTempFile(wx, outCanvas, target.width, target.height, quality);
      if (path === "") continue;
      const size = await getFileSize(wx, path);
      lastPath = path;
      lastSize = size;
      if (size === 0 || size <= COMPRESS_TARGET_BYTES) break; // size 未知（0）时按达标收口，不空转阶梯
    }
    if (lastPath === "") return null;
    return { path: lastPath, size: lastSize, width: target.width, height: target.height };
  } catch (err) {
    // fail-open：压缩代码自身异常一律回退原图（不阻断上传）
    console.error("[photoCompress] 压缩异常，回退原图上传:", err);
    return null;
  }
}
