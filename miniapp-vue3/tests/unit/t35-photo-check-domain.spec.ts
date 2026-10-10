// T8 S3b：照片质量判定域层测试——降采样/灰度/拉普拉斯方差/模糊阈值与文案逐字。
//
// 【2026-10-09 主人拍板 · 方案A】端侧只保留「模糊」一项 ⇒ 本用例同步调整：
//   · 删除「分辨率过低（最短边 480）」用例 —— 端侧独有规则、后端 4 条里没有，属结构性误拦，已摘除；
//   · 删除「未检出人脸／多张人脸／占比过小」三组用例 —— 人脸判定唯一裁决权交后端 `4002`；
//   · 新增**防回归**用例：域层已无 `faceCount`／`faceArea` 入参，即便调用方误传（运行时）也不得产生人脸拦截。
import { describe, expect, it } from "vitest";
import {
  downsampleSize,
  evaluatePhotoCheck,
  laplacianVariance,
  toGrayscale,
  PHOTO_BLUR_THRESHOLD,
} from "../../src/domain/photo-check";

/** 构造常量灰度图（方差 0）与棋盘图（方差大） */
function flatGray(w: number, h: number, v = 128): number[] {
  return new Array(w * h).fill(v);
}
function checkerGray(w: number, h: number): number[] {
  const g: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g.push((x + y) % 2 === 0 ? 0 : 255);
  return g;
}

describe("domain/photo-check（T8 S3b 纯规则 · 方案A）", () => {
  it("模糊阈值常量 = 100（分辨率 480／人脸占比 0.02 已随方案A 摘除）", () => {
    expect(PHOTO_BLUR_THRESHOLD).toBe(100);
  });

  it("降采样：最长边压到 ≤256 且最短 64；小图不放大", () => {
    expect(downsampleSize(800, 600)).toEqual({ width: 256, height: 192 });
    expect(downsampleSize(600, 800)).toEqual({ width: 192, height: 256 });
    expect(downsampleSize(100, 50)).toEqual({ width: 100, height: 64 }); // 50→64（下限），宽不动
    expect(downsampleSize(2000, 100)).toEqual({ width: 256, height: 64 }); // 128→64 下限
  });

  it("灰度：BT.601 系数；越界索引按 0 处理不抛", () => {
    const gray = toGrayscale([255, 0, 0, 255, 0, 255, 0, 255], 2);
    expect(gray[0]).toBeCloseTo(0.299 * 255, 5);
    expect(gray[1]).toBeCloseTo(0.587 * 255, 5);
    expect(() => toGrayscale([1], 2)).not.toThrow();
  });

  it("拉普拉斯方差：常量图≈0；棋盘图显著大于阈值；尺寸过小回 0", () => {
    expect(laplacianVariance(flatGray(32, 32), 32, 32)).toBeCloseTo(0, 6);
    expect(laplacianVariance(checkerGray(64, 64), 64, 64)).toBeGreaterThan(PHOTO_BLUR_THRESHOLD);
    expect(laplacianVariance(flatGray(2, 2), 2, 2)).toBe(0); // 无内点
  });

  it("⭐方案A 唯一规则：方差 < 100 → 模糊拦截（文案逐字）；恰在阈值/高于阈值 → 放行", () => {
    expect(evaluatePhotoCheck({ variance: 50 })).toEqual({ ok: false, reason: "照片有点模糊，请重新拍摄清晰的照片" });
    expect(evaluatePhotoCheck({ variance: 0 })).toEqual({ ok: false, reason: "照片有点模糊，请重新拍摄清晰的照片" });
    expect(evaluatePhotoCheck({ variance: PHOTO_BLUR_THRESHOLD }).ok).toBe(true); // 边界：恰在阈值上放行（旧端用严格小于）
    expect(evaluatePhotoCheck({ variance: 500 })).toEqual({ ok: true, reason: "" });
  });

  it("variance=null（未测/无 canvas）→ 跳过检查，放行", () => {
    expect(evaluatePhotoCheck({ variance: null })).toEqual({ ok: true, reason: "" });
  });

  it("⭐防御（CR R2）：variance 为非有限值（NaN/±Infinity）→ 视为未测，放行（不得走成硬拦）", () => {
    expect(evaluatePhotoCheck({ variance: Number.NaN })).toEqual({ ok: true, reason: "" });
    expect(evaluatePhotoCheck({ variance: Number.POSITIVE_INFINITY })).toEqual({ ok: true, reason: "" });
    expect(evaluatePhotoCheck({ variance: Number.NEGATIVE_INFINITY })).toEqual({ ok: true, reason: "" });
  });

  it("⭐防回归：域层已无人脸入参 ⇒ 即便运行时误传 faceCount/faceArea 也不得产生人脸拦截", () => {
    // 方案A 前：faceCount=0 ⇒ 「未检测到人脸」拦截；faceCount=2 ⇒ 「多张人脸」拦截；占比过小 ⇒ 拦截
    // 方案A 后：这些字段不再参与判定（签名已无该入参，此处以断言锁定「传了也不拦」）
    const legacy = { variance: 500, faceCount: 0, faceArea: 0.001 };
    expect(evaluatePhotoCheck(legacy as unknown as { variance: number | null })).toEqual({ ok: true, reason: "" });
  });
});
