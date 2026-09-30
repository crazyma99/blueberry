// 人脸图上传前压缩 —— 微信管线容器胶水（2026-09-28 流量成本 PRD R16/R19；2026-09-30 按 PRD 更新去裁剪）。
// 链路：getImageInfo 取尺寸 → 离屏 canvas 整图缩放（5 参 drawImage）→ canvasToTempFilePath
//   （jpg，质量阶梯重试至 ≤500KB）→ getFileInfo 取字节数。
// ⚠️ PRD 2026-09-30 口径：只做压缩，**不裁剪、不做任何人脸加工**（旧版 VK 人脸框裁剪已随 R17 移除）。
// 失败语义（R19，fail-closed）：无 wx／画布不可用／任何异常/超时一律返回 `null`，
//   调用方**阻断上传并提示重试**——客户端不存在任何「上传原图」路径；体积红线另有服务端 R22 二次压缩兜底。
import { COMPRESS_QUALITY_LADDER, COMPRESS_TARGET_BYTES, computeCompressSize } from "../../domain/photo-compress";

export interface CompressResult {
  /** 压缩产物本地临时路径 */
  path: string;
  /** 产物字节数（getFileInfo 实测；容器不给时为 0） */
  size: number;
  width: number;
  height: number;
}

export interface PhotoCompressPort {
  /** 成功返回压缩产物；任何不可用/异常返回 null（fail-closed，调用方阻断上传并提示重试） */
  compress(filePath: string): Promise<CompressResult | null>;
}

/** 压缩总超时（低端机 canvas 可能不回调 ⇒ 无超时会让页面永久停在「照片处理中…」；同 photo-check 教训） */
export const PHOTO_COMPRESS_TIMEOUT_MS = 8000;

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
    /** 微信 `drawImage`：2–5 参＝整图缩放；9 参＝源矩形裁剪（本模块只用 5 参整图缩放——PRD 口径不裁剪） */
    drawImage: (img: unknown, ...args: number[]) => void;
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
      // 超时兜底：与内层实现赛跑，超时按失败返回 null（调用方阻断并提示重试，不上传原图）
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<CompressResult | null>((resolve) => {
        timer = setTimeout(() => {
          console.warn("[photoCompress] 压缩超时，阻断上传并提示重试（R19 fail-closed）");
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
      return null; // 非微信端/能力缺失：fail-closed（R19 无旁路）
    }
    const info = await getImageInfo(wx, filePath);
    const imgW = info.width;
    const imgH = info.height;
    if (imgW <= 0 || imgH <= 0) return null;

    // 只压缩不裁剪（PRD 2026-09-30 口径）：整图等比缩放至长边 ≤1080
    const target = computeCompressSize(imgW, imgH);
    const outCanvas = wx.createOffscreenCanvas({ type: "2d", width: target.width, height: target.height });
    const outCtx = outCanvas.getContext("2d");
    const outImg = await loadCanvasImage(outCanvas, filePath);
    // 5 参（整图缩放）——禁止 9 参裁剪写法
    outCtx.drawImage(outImg, 0, 0, target.width, target.height);

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
    // fail-closed：压缩失败一律返回 null，由页面阻断上传并提示重试（R19 无旁路）
    console.error("[photoCompress] 压缩异常，阻断上传并提示重试:", err);
    return null;
  }
}
