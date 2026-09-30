// 2026-09-28 流量成本 PRD（R16/R19）：人脸图上传前压缩。
// 2026-09-30 PRD 更新口径：**只做压缩，不裁剪、不做任何人脸加工**（旧 R17 人脸框裁剪已移除）；
// 失败语义 fail-closed：压缩不可用/异常返回 null，调用方阻断上传并提示重试（无「上传原图」旁路）。
// 本 spec：①域逻辑（长边 ≤1080 等比缩放）②微信胶水（无 wx/能力缺失 → null、5 参整图缩放、
// 永不出现 9 参裁剪、质量阶梯重试至 ≤500KB）。
import { beforeEach, describe, expect, it } from "vitest";
import {
  COMPRESS_MAX_LONG_EDGE,
  COMPRESS_TARGET_BYTES,
  computeCompressSize,
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

// —— 微信胶水（桩风格同 t52-face-share-card）——
type CompressOpts = {
  width?: number;
  height?: number;
  drawCalls?: Array<number[]>;
  exportSizes?: number[]; // 逐次 canvasToTempFilePath 产物的字节数（getFileInfo 按导出序返回）
  exportQualities?: number[];
};

function installWx(opts: CompressOpts): void {
  const width = opts.width ?? 3000;
  const height = opts.height ?? 4000;
  let exportIdx = 0;
  (globalThis as { wx?: unknown }).wx = {
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
  };
}

beforeEach(() => {
  delete (globalThis as { wx?: unknown }).wx;
});

describe("createWeixinPhotoCompress（容器胶水）", () => {
  it("无 wx → null（fail-closed：调用方阻断上传并提示重试，R19 无「上传原图」旁路）", async () => {
    await expect(createWeixinPhotoCompress().compress("/tmp/a.jpg")).resolves.toBeNull();
  });

  it("整图压缩：5 参整图缩放（PRD 口径不裁剪，永不出现 9 参裁剪写法），产物长边 ≤1080", async () => {
    const drawCalls: Array<number[]> = [];
    installWx({ drawCalls, exportSizes: [300 * 1024] });
    const r = await createWeixinPhotoCompress().compress("/tmp/a.jpg");
    expect(r).not.toBeNull();
    expect(r!.path).toContain("wxfile://tmp/out-");
    expect(r!.size).toBe(300 * 1024);
    // 3000×4000 → 810×1080
    expect([r!.width, r!.height]).toEqual([810, 1080]);
    expect(drawCalls.length).toBeGreaterThan(0);
    for (const call of drawCalls) {
      expect(call.length).toBe(5); // 5 参＝整图缩放（9 参＝裁剪，禁止）
    }
    const last = drawCalls[drawCalls.length - 1];
    expect(last.slice(-2)).toEqual([810, 1080]);
  });

  it("质量阶梯：超 500KB 逐档降质重试，直至达标（R16 体积红线）", async () => {
    const exportQualities: number[] = [];
    installWx({ exportSizes: [900 * 1024, 700 * 1024, 400 * 1024], exportQualities });
    const r = await createWeixinPhotoCompress().compress("/tmp/a.jpg");
    expect(exportQualities).toEqual([0.8, 0.7, 0.6]); // 第三档达标即停
    expect(r!.size).toBe(400 * 1024);
    expect(r!.size).toBeLessThanOrEqual(COMPRESS_TARGET_BYTES);
  });

  it("阶梯用尽仍超标：返回最后一档产物（体积红线由服务端 R22 二次压缩兜底）", async () => {
    const exportQualities: number[] = [];
    installWx({ exportSizes: [900 * 1024, 850 * 1024, 800 * 1024, 750 * 1024], exportQualities });
    const r = await createWeixinPhotoCompress().compress("/tmp/a.jpg");
    expect(exportQualities).toEqual([0.8, 0.7, 0.6, 0.5]);
    expect(r).not.toBeNull();
    expect(r!.size).toBe(750 * 1024);
  });

  it("画布导出持续失败（空路径）→ null（fail-closed）", async () => {
    (globalThis as { wx?: unknown }).wx = {
      getImageInfo: (o: { success: (r: unknown) => void }) => o.success({ width: 3000, height: 4000 }),
      createOffscreenCanvas: () => ({
        createImage: () => {
          const img: { onload?: () => void; src: string } = { src: "" };
          Object.defineProperty(img, "src", {
            set() {
              setTimeout(() => img.onload?.(), 0);
            },
          });
          return img;
        },
        getContext: () => ({ drawImage: () => undefined }),
      }),
      canvasToTempFilePath: (o: { success: (r: unknown) => void }) => o.success({ tempFilePath: "" }),
    };
    await expect(createWeixinPhotoCompress().compress("/tmp/a.jpg")).resolves.toBeNull();
  });
});
