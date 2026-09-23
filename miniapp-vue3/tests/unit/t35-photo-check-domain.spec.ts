// T8 S3b：照片质量判定域层测试——阈值/降采样/灰度/拉普拉斯方差/短路顺序与文案逐字。
import { describe, expect, it } from "vitest";
import {
  downsampleSize,
  evaluatePhotoCheck,
  laplacianVariance,
  toGrayscale,
  PHOTO_BLUR_THRESHOLD,
  PHOTO_FACE_AREA_MIN,
  PHOTO_MIN_SIDE,
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

describe("domain/photo-check（T8 S3b 纯规则）", () => {
  it("阈值常量与旧端逐字一致（480 / 100 / 0.02 / 0.65）", () => {
    expect([PHOTO_MIN_SIDE, PHOTO_BLUR_THRESHOLD, PHOTO_FACE_AREA_MIN]).toEqual([480, 100, 0.02]); // 2026-09-23 主人拍板：删除占比上限（后端无此规则，纯误杀）
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

  it("⭐短路顺序与文案逐字：分辨率 → 模糊 → 未检出人脸 → 多张人脸 → 占比过小（上限已按主人拍板删除）", () => {
    const lowRes = evaluatePhotoCheck({ width: 300, height: 800, variance: 999 });
    expect(lowRes).toEqual({ ok: false, reason: "照片分辨率过低，请上传更清晰的照片（最短边不低于 480 像素）" });
    // 分辨率未知（0）→ 跳过该检查
    const unknownSize = evaluatePhotoCheck({ width: 0, height: 0, variance: 999 });
    expect(unknownSize.ok).toBe(true);

    const blurry = evaluatePhotoCheck({ width: 800, height: 800, variance: 50 });
    expect(blurry).toEqual({ ok: false, reason: "照片有点模糊，请重新拍摄清晰的照片" });

    const noFace = evaluatePhotoCheck({ width: 800, height: 800, variance: 500, faceCount: 0 });
    expect(noFace).toEqual({ ok: false, reason: "未检测到人脸，请上传清晰的正面照片" });

    const multi = evaluatePhotoCheck({ width: 800, height: 800, variance: 500, faceCount: 2 });
    expect(multi).toEqual({ ok: false, reason: "检测到多张人脸，请上传单人照片" });

    const tooSmall = evaluatePhotoCheck({ width: 800, height: 800, variance: 500, faceCount: 1, faceArea: 0.01 });
    expect(tooSmall).toEqual({ ok: false, reason: "人脸在照片中占比太小，请靠近一些或裁剪后上传" });

    // 2026-09-23 主人拍板（按调研结论）：**删除占比上限** —— 后端 4002 只有「下限（单轴线性比 ≥10%）」无上限，
    // 端侧再拦「脸过大」纯属误杀（特写/大头自拍会被端侧拦、后端判合格）⇒ 占比很大也放行
    const tooBig = evaluatePhotoCheck({ width: 800, height: 800, variance: 500, faceCount: 1, faceArea: 0.9 });
    expect(tooBig).toEqual({ ok: true, reason: "" });
  });

  it("variance=null（未测/无 canvas）与 faceCount=null（VK 不可用）→ 跳过对应检查，放行", () => {
    expect(evaluatePhotoCheck({ width: 800, height: 800, variance: null })).toEqual({ ok: true, reason: "" });
    expect(evaluatePhotoCheck({ width: 800, height: 800, variance: 500, faceCount: null })).toEqual({ ok: true, reason: "" });
    // 边界：恰在阈值上/占比恰为边界值 → 放行（旧端用严格小于/大于）
    expect(evaluatePhotoCheck({ width: 800, height: 800, variance: PHOTO_BLUR_THRESHOLD }).ok).toBe(true);
    expect(evaluatePhotoCheck({ width: 800, height: 800, variance: 500, faceCount: 1, faceArea: PHOTO_FACE_AREA_MIN }).ok).toBe(true);
    // 上限删除后：占比很大（0.9）也**不再端侧拦截**（交后端/生成端兜底；特写/大头自拍不再被误杀）
  });
});
