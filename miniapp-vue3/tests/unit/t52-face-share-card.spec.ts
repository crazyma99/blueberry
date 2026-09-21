// 2026-09-21 主人④：「AI试衣结果分享的 VK 人脸算法裁切也遗漏了」——
// 旧端 `utils/faceShareCard.uts`：VK 人脸检测 → 人脸中心对齐 5:4（750×600）裁剪窗 → 离屏 canvas 出图；
// 降级链＝人脸居中 → 中心裁剪 → null（调用方回退网络 JPG）；非微信/无能力 → null（fail-open）。
// 本 spec：①裁剪窗数学（含 clamp 与噪声阈值边界）②无 wx → null ③假 wx（VK 可用）端到端出图并核对裁剪参数。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeFaceCenteredCrop, generateFaceCenteredCard } from "../../src/platform/weixin/face-share-card";

type Face = { type?: number; origin: { x: number; y: number }; size: { width: number; height: number } };

function installWx(opts: {
  width?: number;
  height?: number;
  faces?: Face[];
  vk?: boolean;
  drawCalls?: Array<number[]>;
  tempPath?: string;
  failImageInfo?: boolean;
}): void {
  const width = opts.width ?? 1000;
  const height = opts.height ?? 1000;
  (globalThis as { wx?: unknown }).wx = {
    canIUse: (s: string) => (s === "createVKSession" ? opts.vk === true : false),
    isVKSupport: () => true,
    getImageInfo: (o: { success: (r: unknown) => void; fail: () => void }) => {
      if (opts.failImageInfo === true) o.fail();
      else o.success({ width, height, path: "wxfile://tmp/orig.jpg" });
    },
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
        drawImage: (...args: unknown[]) => {
          opts.drawCalls?.push(args.map((a) => (typeof a === "number" ? a : -1)));
        },
        getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      }),
    }),
    canvasToTempFilePath: (o: { success: (r: unknown) => void }) => o.success({ tempFilePath: opts.tempPath ?? "wxfile://tmp/share-card.jpg" }),
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

describe("computeFaceCenteredCrop（5:4 裁剪窗，旧端逐字）", () => {
  it("横图（2000×1000）：窗宽受限 ⇒ 1250×1000；人脸中心对齐", () => {
    const face = { origin: { x: 0.4, y: 0.3 }, size: { width: 0.2, height: 0.4 } };
    const [sx, sy, w, hgt] = computeFaceCenteredCrop(2000, 1000, face);
    expect([w, hgt]).toEqual([1250, 1000]);
    // 人脸中心 = (0.5*2000, 0.5*1000) = (1000, 500) ⇒ sx = 1000-625 = 375、sy = 500-500 = 0
    expect(sx).toBe(375);
    expect(sy).toBe(0);
  });

  it("竖图（1000×2000）：窗高受限 ⇒ 1000×800；贴边时 clamp 到边界不为负", () => {
    const face = { origin: { x: 0.45, y: 0.02 }, size: { width: 0.1, height: 0.1 } };
    const [sx, sy, w, hgt] = computeFaceCenteredCrop(1000, 2000, face);
    expect([w, hgt]).toEqual([1000, 800]);
    expect(sx).toBe(0); // 人脸水平居中 ⇒ sx=(1000-1000)/2=0
    expect(sy).toBe(0); // 人脸靠上 ⇒ 目标 sy 为负 ⇒ clamp 0
  });

  it("face=null ⇒ 中心裁剪（降级链第二档）", () => {
    const [sx, sy, w, hgt] = computeFaceCenteredCrop(1600, 900, null);
    expect([w, hgt]).toEqual([1125, 900]);
    expect(sx).toBe(Math.round((1600 - 1125) / 2));
    expect(sy).toBe(0);
  });

  it("右下角人脸：clamp 到右/下边界（窗不越界）", () => {
    const face = { origin: { x: 0.9, y: 0.9 }, size: { width: 0.1, height: 0.1 } };
    const [sx, sy, w, hgt] = computeFaceCenteredCrop(2000, 1000, face);
    expect(sx).toBe(2000 - w);
    expect(sy).toBe(1000 - hgt);
  });
});

describe("generateFaceCenteredCard（端侧链路与降级）", () => {
  it("非微信/无 wx ⇒ null（调用方回退网络 JPG）", async () => {
    expect(await generateFaceCenteredCard("https://cdn/result.webp")).toBeNull();
    (globalThis as { wx?: unknown }).wx = { canIUse: () => false };
    expect(await generateFaceCenteredCard("https://cdn/result.webp")).toBeNull();
  });

  it("⭐检测段必须是 5 参「整图缩放」写法（独立 CR 🔴1：9 参会把左上角裁剪区喂给 VK）", async () => {
    const drawCalls: Array<number[]> = [];
    installWx({ width: 2400, height: 3200, vk: true, faces: [], drawCalls });
    await generateFaceCenteredCard("https://cdn/result.webp");
    const detect = drawCalls[0]; // 第一次 drawImage＝检测段（降采样 768×1024）
    expect(detect.slice(1)).toEqual([0, 0, 768, 1024]); // 5 参：整图 → 768×1024
    expect(detect.length - 1).toBe(4); // 参数个数＝4（image + 4）⇒ 非 9 参裁剪写法
  });

  it("VK 可用 + 检出人脸 ⇒ 出本地临时图，且裁剪窗按人脸中心（非中心裁剪）", async () => {
    const drawCalls: Array<number[]> = [];
    // 竖图 1200×2400（窗 1200×960）；人脸靠下（中心 y=0.9 ⇒ 2160px）⇒ sy 目标 1680 被下边界 clamp 到 1440
    installWx({
      width: 1200,
      height: 2400,
      vk: true,
      faces: [{ type: 3, origin: { x: 0.4, y: 0.85 }, size: { width: 0.2, height: 0.1 } }],
      drawCalls,
    });
    const card = await generateFaceCenteredCard("https://cdn/result.webp");
    expect(card).toEqual({ imagePath: "wxfile://tmp/share-card.jpg" });
    // 最后一次 drawImage＝输出画布：9 参版本 (img, sx,sy,sw,sh, dx,dy,dw,dh)
    const out = drawCalls[drawCalls.length - 1];
    expect(out).toEqual([-1, 0, 1440, 1200, 960, 0, 0, 750, 600]);
    expect(out.slice(1, 5)).not.toEqual(computeFaceCenteredCrop(1200, 2400, null)); // 确实不是中心裁剪
  });

  it("VK 不可用（旧微信/模拟器）⇒ 中心裁剪仍然出图（不阻断分享）", async () => {
    const drawCalls: Array<number[]> = [];
    installWx({ width: 1200, height: 2400, vk: false, faces: [], drawCalls });
    const card = await generateFaceCenteredCard("https://cdn/result.webp");
    expect(card).not.toBeNull();
    const out = drawCalls[drawCalls.length - 1];
    expect(out.slice(1, 5)).toEqual(computeFaceCenteredCrop(1200, 2400, null)); // 中心裁剪：sy=(2400-960)/2=720
    expect(out.slice(1, 5)).toEqual([0, 720, 1200, 960]);
    expect(out.slice(5)).toEqual([0, 0, 750, 600]);
  });

  it("人脸过小（面积 <2%）视为噪声 ⇒ 退回中心裁剪", async () => {
    const drawCalls: Array<number[]> = [];
    installWx({ width: 1000, height: 1000, vk: true, faces: [{ type: 3, origin: { x: 0.01, y: 0.01 }, size: { width: 0.05, height: 0.05 } }], drawCalls });
    await generateFaceCenteredCard("https://cdn/result.webp");
    const faceCrop = drawCalls[drawCalls.length - 1].slice(1, 5);
    const centerCrop = computeFaceCenteredCrop(1000, 1000, null);
    expect(faceCrop).toEqual(centerCrop);
  });

  it("取图失败：静默降级为 null（绝不抛，分享不崩）", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    installWx({ failImageInfo: true });
    expect(await generateFaceCenteredCard("https://cdn/result.webp")).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
