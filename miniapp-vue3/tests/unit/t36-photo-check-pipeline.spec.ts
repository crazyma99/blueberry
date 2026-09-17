// T8 S3b-2：微信照片质量管线测试——fail-open、分辨率、模糊、VK 不可用跳过、人脸 0/多/占比、异常放行。
import { beforeEach, describe, expect, it } from "vitest";
import { createWeixinPhotoCheck } from "../../src/platform/weixin/photo-check";
import { detectFaces, detectLargestFace, vkAvailable } from "../../src/platform/weixin/vk-face";

type Face = { type?: number; size?: { width: number; height: number } };

function rgba(w: number, h: number, pattern: "flat" | "checker"): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = pattern === "flat" ? 128 : (i % 2 === 0 ? 0 : 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return data;
}

function installWx(opts: {
  width?: number;
  height?: number;
  pattern?: "flat" | "checker";
  vk?: boolean;
  faces?: Face[];
  throwInCanvas?: boolean;
}): void {
  const width = opts.width ?? 1000;
  const height = opts.height ?? 1000;
  const pattern = opts.pattern ?? "checker";
  (globalThis as { wx?: unknown }).wx = {
    canIUse: (s: string) => (s === "createVKSession" ? opts.vk === true : false),
    isVKSupport: () => true,
    getImageInfo: (o: { success: (r: unknown) => void; fail: () => void }) => o.success({ width, height }),
    createOffscreenCanvas: ({ width: cw, height: ch }: { width: number; height: number }) => ({
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
        drawImage: () => {
          if (opts.throwInCanvas === true) throw new Error("canvas boom");
        },
        getImageData: () => ({ data: rgba(cw, ch, pattern) }),
      }),
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

describe("platform/weixin/vk-face（VK 可用性与检出）", () => {
  it("无 wx／canIUse=false → 不可用且检出为空；有 wx 且支持 → 可用", async () => {
    expect(vkAvailable()).toBe(false);
    await expect(detectFaces(new ArrayBuffer(4), 2, 2, 50)).resolves.toEqual([]);
    installWx({ vk: true });
    expect(vkAvailable()).toBe(true);
    await expect(detectFaces(new ArrayBuffer(4), 2, 2, 50)).resolves.toEqual([]); // faces 默认空
  });

  it("anchors 过滤：仅收 type===3；detectLargestFace 取面积最大", async () => {
    installWx({
      vk: true,
      faces: [
        { type: 3, size: { width: 10, height: 10 } },
        { type: 99, size: { width: 999, height: 999 } },
        { type: 3, size: { width: 30, height: 30 } },
      ],
    });
    const faces = await detectFaces(new ArrayBuffer(4), 2, 2, 50);
    expect(faces.length).toBe(2);
    const largest = await detectLargestFace(new ArrayBuffer(4), 2, 2, 50);
    expect(largest?.size?.width).toBe(30);
  });
});

describe("platform/weixin/photo-check（T8 S3b 管线）", () => {
  it("无 wx → fail-open 放行", async () => {
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({ ok: true, reason: "" });
  });

  it("① 分辨率过低 → 拦截（文案取自域层）", async () => {
    installWx({ width: 300, height: 800 });
    const r = await createWeixinPhotoCheck().check("/tmp/a.jpg");
    expect(r).toEqual({ ok: false, reason: "照片分辨率过低，请上传更清晰的照片（最短边不低于 480 像素）" });
  });

  it("② 模糊（常量灰度 → 方差 0）→ 拦截；清晰（棋盘）→ 放行", async () => {
    installWx({ pattern: "flat" });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({
      ok: false,
      reason: "照片有点模糊，请重新拍摄清晰的照片",
    });
    installWx({ pattern: "checker" });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({ ok: true, reason: "" });
  });

  it("③④ VK 不可用 → 跳过人脸组检查（清晰图直接放行）", async () => {
    installWx({ pattern: "checker", vk: false });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({ ok: true, reason: "" });
  });

  it("③④ VK 可用：未检出/多张/占比过小/过大 → 逐条拦截；单人正常占比 → 放行", async () => {
    installWx({ pattern: "checker", vk: true, faces: [] });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({
      ok: false,
      reason: "未检测到人脸，请上传清晰的正面照片",
    });
    installWx({ pattern: "checker", vk: true, faces: [{ type: 3, size: { width: 0.1, height: 0.1 } }, { type: 3, size: { width: 0.1, height: 0.1 } }] });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({
      ok: false,
      reason: "检测到多张人脸，请上传单人照片",
    });
    installWx({ pattern: "checker", vk: true, faces: [{ type: 3, size: { width: 0.01, height: 0.01 } }] });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({
      ok: false,
      reason: "人脸在照片中占比太小，请靠近一些或裁剪后上传",
    });
    installWx({ pattern: "checker", vk: true, faces: [{ type: 3, size: { width: 0.9, height: 0.9 } }] });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({
      ok: false,
      reason: "人脸占照片比例过大，请适当拉远距离后拍摄",
    });
    installWx({ pattern: "checker", vk: true, faces: [{ type: 3, size: { width: 0.2, height: 0.2 } }] });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({ ok: true, reason: "" });
  });

  it("检测代码自身异常 → fail-open 放行（不阻断上传）", async () => {
    installWx({ pattern: "checker", throwInCanvas: true });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({ ok: true, reason: "" });
  });
});

describe("photo-check 超时兜底（2026-09-17：模拟器 canvas 不回调时不至于永久卡在「照片检测中…」）", () => {
  it("⭐检测实现永不返回（模拟 canvas/VK 卡住）→ 超时后 **fail-open 放行**，不阻塞上传", async () => {
    // 构造：getImageInfo 永不回调 ⇒ 内层实现挂起
    (globalThis as { wx?: unknown }).wx = {
      getImageInfo: () => undefined, // 既不 success 也不 fail
      createOffscreenCanvas: () => ({ getContext: () => ({}), createImage: () => ({ set src(_v: string) {}, onload: () => undefined }) }),
    };
    const r = await createWeixinPhotoCheck({ timeoutMs: 30 }).check("/tmp/a.jpg");
    expect(r).toEqual({ ok: true, reason: "" });
  });

  it("正常路径不受影响（未超时即返回真实判定）", async () => {
    installWx({ pattern: "flat" });
    const r = await createWeixinPhotoCheck({ timeoutMs: 5000 }).check("/tmp/a.jpg");
    expect(r.ok).toBe(false); // 常量灰度 → 模糊拦截
  });
});
