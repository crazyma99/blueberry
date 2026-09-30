// 2026-09-28 流量成本 PRD（R16/R17/R19）：人脸图上传前压缩。
// 本 spec：①域逻辑（缩放尺寸/人脸裁剪窗/不裁场景）②微信胶水（无 wx → null fail-open、
// 未检出人脸只压不裁、检出人脸 9 参裁剪、质量阶梯重试至 ≤500KB）。
import { beforeEach, describe, expect, it } from "vitest";
import {
  COMPRESS_MAX_LONG_EDGE,
  COMPRESS_TARGET_BYTES,
  computeCompressSize,
  computeFaceCropRect,
} from "../../src/domain/photo-compress";
import { createWeixinPhotoCompress } from "../../src/platform/weixin/photo-compress";

describe("computeCompressSize（长边 ≤1080 等比缩放）", () => {
  it("超限缩放到达标；已达标原样；长边恰为上限不缩", () => {
    expect(computeCompressSize(4000, 3000)).toEqual({ width: COMPRESS_MAX_LONG_EDGE, height: 810 });
    expect(computeCompressSize(3000, 4000)).toEqual({ width: 810, height: COMPRESS_MAX_LONG_EDGE });
    expect(computeCompressSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(computeCompressSize(1080, 500)).toEqual({ width: 1080, height: 500 });
  });
});

describe("computeFaceCropRect（R17 人脸框外扩裁剪）", () => {
  it("face=null → 不裁（只压缩）", () => {
    expect(computeFaceCropRect(2000, 3000, null)).toBeNull();
  });

  it("常规人脸：外扩 2.5 倍居中；贴边 clamp 到图内", () => {
    // 图 2000×3000，人脸框归一化 origin(0.4,0.1) size(0.2,0.1) ⇒ 像素框 400×300，中心 (1000, 450)
    // 外扩 2.5 ⇒ 1000×750 ⇒ sx=500, sy=75
    const r = computeFaceCropRect(2000, 3000, { origin: { x: 0.4, y: 0.1 }, size: { width: 0.2, height: 0.1 } });
    expect(r).toEqual([500, 75, 1000, 750]);
  });

  it("裁剪后短边 <640 → 不裁（防触发 photo-check 最短边拦截）", () => {
    // 人脸框 0.1×0.05（2000×3000 图）⇒ 外扩 500×375 ⇒ 短边 375 < 640
    expect(
      computeFaceCropRect(2000, 3000, { origin: { x: 0.4, y: 0.4 }, size: { width: 0.1, height: 0.05 } }),
    ).toBeNull();
  });

  it("面积收益 <20%（人脸几乎占满画面）→ 不裁", () => {
    // 人脸框 0.5×0.5（2000×2000）⇒ 外扩 2500×2500 clamp 到 2000×2000＝整图 ⇒ 收益 0
    expect(
      computeFaceCropRect(2000, 2000, { origin: { x: 0.25, y: 0.25 }, size: { width: 0.5, height: 0.5 } }),
    ).toBeNull();
  });

  it("脏值（零尺寸人脸框/非法图尺寸）→ 不裁", () => {
    expect(computeFaceCropRect(2000, 3000, { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } })).toBeNull();
    expect(computeFaceCropRect(0, 0, { origin: { x: 0.4, y: 0.1 }, size: { width: 0.2, height: 0.1 } })).toBeNull();
  });
});

// —— 微信胶水（桩风格同 t52-face-share-card）——
type CropOpts = {
  width?: number;
  height?: number;
  faces?: Array<{ type?: number; origin: { x: number; y: number }; size: { width: number; height: number } }>;
  vk?: boolean;
  drawCalls?: Array<number[]>;
  exportSizes?: number[]; // 逐次 canvasToTempFilePath 产物的字节数（getFileInfo 按导出序返回）
  exportQualities?: number[];
};

function installWx(opts: CropOpts): void {
  const width = opts.width ?? 3000;
  const height = opts.height ?? 4000;
  let exportIdx = 0;
  (globalThis as { wx?: unknown }).wx = {
    canIUse: (s: string) => (s === "createVKSession" ? opts.vk === true : false),
    isVKSupport: () => true,
    getImageInfo: (o: { success: (r: unknown) => void }) => o.success({ width, height, path: "wxfile://tmp/in.jpg" }),
    createOffscreenCanvas: () => ({
      createImage: () => {
        const img: { onload?: () => void; onerror?: () => void; src: string } = { src: "" };
        Object.defineProperty(img, "src", {
          set() {
            setTimeout(() => img.onload?.(), 0);
          },
          get() {
            return "";
          },
        });
        return img;
      },
      getContext: () => ({
        drawImage: (...args: unknown[]) => {
          opts.drawCalls?.push(args.map((a) => (typeof a === "number" ? a : -1)));
        },
        getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      }),
    }),
    canvasToTempFilePath: (o: { quality: number; success: (r: unknown) => void }) => {
      opts.exportQualities?.push(o.quality);
      exportIdx += 1;
      o.success({ tempFilePath: `wxfile://tmp/out-${exportIdx}.jpg` });
    },
    getFileSystemManager: () => ({
      getFileInfo: (o: { success: (r: { size: number }) => void }) => {
        const sizes = opts.exportSizes ?? [200 * 1024];
        o.success({ size: sizes[Math.min(exportIdx - 1, sizes.length - 1)] });
      },
    }),
    createVKSession: () => {
      let anchorsCb: ((a: unknown) => void) | null = null;
      return {
        on: (ev: string, cb: (payload: unknown) => void) => {
          if (ev === "updateAnchors" || ev === "addAnchors") anchorsCb = cb;
        },
        start: (cb: (err: unknown) => void) => cb(null),
        detectFace: () => {
          setTimeout(() => anchorsCb?.(opts.faces ?? []), 0);
        },
        destroy: () => undefined,
      };
    },
  };
}

beforeEach(() => {
  delete (globalThis as { wx?: unknown }).wx;
});

describe("createWeixinPhotoCompress（容器胶水）", () => {
  it("无 wx → null（fail-open，调用方回退原图）", async () => {
    await expect(createWeixinPhotoCompress().compress("/tmp/a.jpg")).resolves.toBeNull();
  });

  it("未检出人脸：只压不裁（5 参整图缩放），产物尺寸长边 ≤1080", async () => {
    const drawCalls: Array<number[]> = [];
    installWx({ vk: false, drawCalls, exportSizes: [300 * 1024] });
    const r = await createWeixinPhotoCompress().compress("/tmp/a.jpg");
    expect(r).not.toBeNull();
    expect(r!.path).toContain("wxfile://tmp/out-");
    expect(r!.size).toBe(300 * 1024);
    // 3000×4000 → 810×1080
    expect([r!.width, r!.height]).toEqual([810, 1080]);
    const last = drawCalls[drawCalls.length - 1];
    expect(last.length).toBe(5); // 5 参＝整图缩放（无裁剪）
    expect(last.slice(-2)).toEqual([810, 1080]);
  });

  it("检出人脸：9 参裁剪（R17），裁剪窗＝人脸框外扩 2.5 倍", async () => {
    const drawCalls: Array<number[]> = [];
    // 图 3000×4000；人脸框归一化 origin(0.4,0.1) size(0.2,0.1) ⇒ 像素 600×400 中心 (1500, 600)
    // 外扩 2.5 ⇒ 1500×1000 ⇒ sx=750, sy=100（随后整体缩放到长边 1080，不影响源矩形断言）
    installWx({
      vk: true,
      faces: [{ type: 3, origin: { x: 0.4, y: 0.1 }, size: { width: 0.2, height: 0.1 } }],
      drawCalls,
      exportSizes: [300 * 1024],
    });
    const r = await createWeixinPhotoCompress().compress("/tmp/a.jpg");
    expect(r).not.toBeNull();
    const last = drawCalls[drawCalls.length - 1];
    expect(last.length).toBe(9); // 9 参＝源矩形裁剪
    expect(last.slice(1, 5)).toEqual([750, 100, 1500, 1000]);
  });

  it("质量阶梯：超 500KB 逐档降质重试，直至达标（R16 体积红线）", async () => {
    const exportQualities: number[] = [];
    installWx({ vk: false, exportSizes: [900 * 1024, 700 * 1024, 400 * 1024], exportQualities });
    const r = await createWeixinPhotoCompress().compress("/tmp/a.jpg");
    expect(exportQualities).toEqual([0.8, 0.7, 0.6]); // 第三档达标即停
    expect(r!.size).toBe(400 * 1024);
    expect(r!.size).toBeLessThanOrEqual(COMPRESS_TARGET_BYTES);
  });

  it("阶梯用尽仍超标：返回最后一档产物（fail-open 交由服务端 R22 兜底）", async () => {
    const exportQualities: number[] = [];
    installWx({ vk: false, exportSizes: [900 * 1024, 850 * 1024, 800 * 1024, 750 * 1024], exportQualities });
    const r = await createWeixinPhotoCompress().compress("/tmp/a.jpg");
    expect(exportQualities).toEqual([0.8, 0.7, 0.6, 0.5]);
    expect(r).not.toBeNull();
    expect(r!.size).toBe(750 * 1024);
  });
});
