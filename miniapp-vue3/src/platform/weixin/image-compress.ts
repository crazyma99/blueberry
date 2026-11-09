// 微信端图片压缩适配（issue #14 · M2 商家端相册批量上传）。
// 链路：getImageInfo 取尺寸 → 判定是否需要压缩 → 离屏 canvas 整图等比缩放（5 参 drawImage，**只缩放不裁剪**）→
//       canvasToTempFilePath（jpg，质量阶梯）→ getFileInfo 取字节数。
// 与 AI 试衣的 `platform/weixin/photo-compress.ts` 完全独立（后者 1080/500KB，不得改）：**参数全部由调用方注入**
// （商家口径：长边 1600 / ≤3MB / 质量 0.85→0.7，常量在 pkg-merchant 的 domain/merchant-upload.ts），
// 本适配器因此不 import 任何商家模块（共享目录不得反向依赖 pkg-merchant 分包）。
//
// 为什么用 canvas 而不是 wx.compressImage：后者**只调质量、不能指定尺寸**，无法保证长边 ≤1600（超大图仍可能很大）。
// 失败语义（fail-closed，对齐后台 compressImageStrict）：能力缺失/解码失败/任何异常/超时/阶梯用尽仍超预算 ⇒ 返回 null，
// 调用方判该张失败并允许重试——**绝不回退上传原图**（后台批量上传曾因静默回退原图撞 413）。
// 「已在预算内」的原图直接复用原文件（`reused:true`），不重编码、免二次画质损失。
export interface ImageCompressOptions {
  /** 长边上限 px */
  maxLongEdge: number;
  /** 目标体积（字节） */
  maxBytes: number;
  /** 质量阶梯（按序尝试，0-1） */
  qualities: readonly number[];
  /** 总超时（ms）；低端机 canvas 可能永不回调，超时按失败返回 null */
  timeoutMs: number;
  /** 是否需要压缩（已在预算内则 false ⇒ 复用原文件）；体积未知时应返回 true（保守） */
  needsCompress: (info: { size: number; width: number; height: number }) => boolean;
  /** 等比缩放目标尺寸（不放大、不裁剪） */
  computeSize: (width: number, height: number) => { width: number; height: number };
}

export interface ImageCompressResult {
  /** 产物（或复用的原文件）本地路径 */
  path: string;
  /** 产物字节数（getFileInfo 实测；容器不给为 0） */
  size: number;
  width: number;
  height: number;
  /** true＝原图已在预算内，直接复用（未重编码） */
  reused: boolean;
}

export interface ImageCompressPort {
  /** `knownSize`：选图 API 给的原图字节数（0＝未知） */
  compress(filePath: string, knownSize: number): Promise<ImageCompressResult | null>;
}

interface OffscreenCanvasLike {
  getContext: (t: string) => { drawImage: (img: unknown, ...args: number[]) => void };
  createImage: () => { onload: () => void; onerror: (e?: unknown) => void; src: string };
}

interface WxLike {
  getImageInfo?: (o: { src: string; success: (r: { width?: number; height?: number }) => void; fail: (e?: unknown) => void }) => void;
  createOffscreenCanvas?: (o: { type: string; width: number; height: number }) => OffscreenCanvasLike;
  canvasToTempFilePath?: (o: Record<string, unknown>) => void;
  getFileSystemManager?: () => {
    getFileInfo: (o: { filePath: string; success: (r: { size?: number }) => void; fail: (e?: unknown) => void }) => void;
  };
}

function wxApi(): WxLike | undefined {
  return typeof globalThis === "undefined" ? undefined : (globalThis as { wx?: WxLike }).wx;
}

function getImageInfo(wx: WxLike, src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (typeof wx.getImageInfo !== "function") return reject(new Error("getImageInfo unavailable"));
    wx.getImageInfo({ src, success: (r) => resolve({ width: Number(r.width ?? 0), height: Number(r.height ?? 0) }), fail: reject });
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

function toTempFile(wx: WxLike, canvas: OffscreenCanvasLike, w: number, h: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath?.({
      canvas,
      x: 0,
      y: 0,
      width: w,
      height: h,
      destWidth: w,
      destHeight: h,
      fileType: "jpg",
      quality,
      success: (r: { tempFilePath?: string }) => resolve(String(r?.tempFilePath ?? "")),
      fail: reject,
    });
  });
}

/** 文件字节数；容器不给/失败 ⇒ 0（调用方把 0 当「未知」，**不得当成达标**） */
function fileSize(wx: WxLike, filePath: string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const fsm = typeof wx.getFileSystemManager === "function" ? wx.getFileSystemManager() : null;
      if (fsm == null) return resolve(0);
      fsm.getFileInfo({ filePath, success: (r) => resolve(Number(r.size ?? 0)), fail: () => resolve(0) });
    } catch {
      resolve(0);
    }
  });
}

export function createWeixinImageCompress(options: ImageCompressOptions): ImageCompressPort {
  async function inner(filePath: string, knownSize: number): Promise<ImageCompressResult | null> {
    try {
      const wx = wxApi();
      if (wx?.getImageInfo == null || wx.createOffscreenCanvas == null || wx.canvasToTempFilePath == null) return null; // 能力缺失：fail-closed
      const info = await getImageInfo(wx, filePath);
      if (!(info.width > 0 && info.height > 0)) return null;

      let size = knownSize;
      if (!(size > 0)) size = await fileSize(wx, filePath); // 选图没给体积时自己量一次
      if (!options.needsCompress({ size, width: info.width, height: info.height })) {
        return { path: filePath, size, width: info.width, height: info.height, reused: true };
      }

      const target = options.computeSize(info.width, info.height);
      const canvas = wx.createOffscreenCanvas({ type: "2d", width: target.width, height: target.height });
      const ctx = canvas.getContext("2d");
      const img = await loadCanvasImage(canvas, filePath);
      ctx.drawImage(img, 0, 0, target.width, target.height); // 5 参整图缩放：禁止 9 参裁剪

      for (const quality of options.qualities) {
        const path = await toTempFile(wx, canvas, target.width, target.height, quality);
        if (path === "") continue;
        const out = await fileSize(wx, path);
        // 体积未知（0）时**不能**当达标：继续走完阶梯，最后仍未知则判失败（fail-closed，宁可失败重试也不放过超大文件）
        if (out > 0 && out <= options.maxBytes) return { path, size: out, width: target.width, height: target.height, reused: false };
      }
      return null; // 阶梯用尽仍超预算/体积未知：失败，不回退原图
    } catch (err) {
      console.error("[imageCompress] 压缩异常（fail-closed，不回退原图）:", err);
      return null;
    }
  }

  return {
    async compress(filePath: string, knownSize: number): Promise<ImageCompressResult | null> {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.warn("[imageCompress] 压缩超时（fail-closed）");
          resolve(null);
        }, options.timeoutMs);
      });
      try {
        return await Promise.race([inner(filePath, knownSize), timeout]);
      } finally {
        if (timer != null) clearTimeout(timer);
      }
    },
  };
}
