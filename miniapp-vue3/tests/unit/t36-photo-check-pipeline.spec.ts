// T8 S3b-2：微信照片质量管线测试——fail-open、模糊（端侧唯一规则）、不触碰 VK、异常放行、超时兜底。
//
// 【2026-10-09 主人拍板 · 方案A】端侧只做模糊；已摘除分辨率规则与 VK 人脸检测三组规则。
// 本用例同步调整，并新增**两条防回归守卫**：
//   ① `createVKSession` **调用次数必须为 0**（端侧不得再触碰 VK；VK 现仅服务「分享卡片人脸居中」）；
//   ② 即使 VK 可用且「检出 0 张人脸」，也不得产生任何人脸类拦截（方案A 前会拦「未检测到人脸」）。
import { beforeEach, describe, expect, it } from "vitest";
import { createWeixinPhotoCheck } from "../../src/platform/weixin/photo-check";

function rgba(w: number, h: number, pattern: "flat" | "checker"): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = pattern === "flat" ? 128 : i % 2 === 0 ? 0 : 255;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** 统计 VK 会话创建次数（方案A 守卫：端侧管线不得再调用 VK） */
const vkStats = { created: 0 };

function installWx(opts: {
  width?: number;
  height?: number;
  pattern?: "flat" | "checker";
  /** 是否让 `wx` **假装**支持 VK（方案A 守卫用：即便可用也不得被调用） */
  vk?: boolean;
  faces?: { type?: number; size?: { width: number; height: number } }[];
  throwInCanvas?: boolean;
  /** 模拟「像素缓冲为空」（个别机型/异常容器）——CR R2 的误拦路径守卫 */
  emptyPixels?: boolean;
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
        getImageData: () => ({ data: opts.emptyPixels === true ? new Uint8ClampedArray(0) : rgba(cw, ch, pattern) }),
      }),
    }),
    createVKSession: () => {
      vkStats.created++;
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
  vkStats.created = 0;
});

describe("platform/weixin/photo-check（T8 S3b 管线 · 方案A）", () => {
  it("无 wx → fail-open 放行", async () => {
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({ ok: true, reason: "" });
  });

  it("① 模糊（常量灰度 → 方差 0）→ 拦截；清晰（棋盘）→ 放行", async () => {
    installWx({ pattern: "flat" });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({
      ok: false,
      reason: "照片有点模糊，请重新拍摄清晰的照片",
    });
    installWx({ pattern: "checker" });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({ ok: true, reason: "" });
  });

  it("② 小尺寸图不再被拦（分辨率规则已摘除）：300×800 清晰图 → 放行", async () => {
    installWx({ width: 300, height: 800, pattern: "checker" });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({ ok: true, reason: "" });
  });

  it("③ 域层口径：VK 可用且「检出 0 张人脸」→ 不拦截（**仅覆盖域层**；管线级守卫见 ④）", async () => {
    installWx({ pattern: "checker", vk: true, faces: [] });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({ ok: true, reason: "" });
  });

  it("⭐④ 防回归：端侧管线**不得调用 VK**（createVKSession 调用次数 = 0）", async () => {
    installWx({ pattern: "checker", vk: true, faces: [{ type: 3, size: { width: 0.2, height: 0.2 } }] });
    await createWeixinPhotoCheck().check("/tmp/a.jpg");
    expect(vkStats.created).toBe(0);
  });

  it("⭐⑤ 防御（CR R2/R3）：尺寸非有限（NaN）或为 0 → 不拿 64×64 兜底算模糊，直接放行", async () => {
    // 构造「flat（本会判模糊）」+ 异常尺寸：若走 64×64 兜底，高频内容方差会塌到 0 ⇒ 误拦
    installWx({ width: Number.NaN, height: Number.NaN, pattern: "flat" });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({ ok: true, reason: "" });
    installWx({ width: 0, height: 0, pattern: "flat" });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({ ok: true, reason: "" });
    installWx({ width: -1, height: -1, pattern: "flat" });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({ ok: true, reason: "" });
  });

  it("⭐⑥ 防御（CR R2）：像素缓冲为空/不完整 → 视为检测失败并放行（不得因空缓冲方差 0 而误拦）", async () => {
    installWx({ pattern: "flat", emptyPixels: true });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({ ok: true, reason: "" });
  });

  it("检测代码自身异常 → fail-open 放行（不阻断上传）", async () => {
    installWx({ pattern: "checker", throwInCanvas: true });
    await expect(createWeixinPhotoCheck().check("/tmp/a.jpg")).resolves.toEqual({ ok: true, reason: "" });
  });
});

describe("photo-check 超时兜底（2026-09-17：模拟器 canvas 不回调时不至于永久卡在「照片检测中…」）", () => {
  it("⭐检测实现永不返回（模拟 canvas 卡住）→ 超时后 **fail-open 放行**，不阻塞上传", async () => {
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
