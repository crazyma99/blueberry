// T8 S3b 照片质量判定（纯领域规则，旧端 utils/photoCheck.uts 逐字移植的可测部分）。
// 检查顺序（短路，旧端 :76-133）：① 分辨率 ② 模糊（降采样 ≤256px 灰度图拉普拉斯方差）③ 人脸检出/人数 ④ 人脸占比。
// 失败策略 fail-open（旧端 :138-141）：检测环节自身异常一律放行（由平台层 catch 后返回 ok:true）。
// 阈值与文案逐字保留——文案直接面向用户，改动需产品确认。

export const PHOTO_MIN_SIDE = 480;
export const PHOTO_BLUR_THRESHOLD = 100;
export const PHOTO_FACE_AREA_MIN = 0.02;
export const PHOTO_FACE_AREA_MAX = 0.65;

export interface PhotoCheckResult {
  ok: boolean;
  reason: string;
}

/** 降采样尺寸（旧端 :86-88）：最长边压到 ≤256px，最短 64px（小幅图不放大） */
export function downsampleSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, 256 / Math.max(width, height));
  return {
    width: Math.max(64, Math.round(width * scale)),
    height: Math.max(64, Math.round(height * scale)),
  };
}

/** RGBA → 灰度（旧端 :96-101 系数：0.299/0.587/0.114，ITU-R BT.601） */
export function toGrayscale(rgba: ArrayLike<number>, pixelCount: number): number[] {
  const gray: number[] = [];
  for (let i = 0; i < pixelCount; i++) {
    const r = rgba[i * 4] ?? 0;
    const g = rgba[i * 4 + 1] ?? 0;
    const b = rgba[i * 4 + 2] ?? 0;
    gray.push(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

/** 灰度图拉普拉斯方差（旧端 :45-62 逐字）：方差小＝边缘弱＝模糊 */
export function laplacianVariance(gray: number[], w: number, h: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/**
 * 判定（旧端短路顺序与文案逐字）：
 * - 宽高任一 < 480（且两者>0，尺寸未知时跳过）→ 分辨率过低
 * - 方差 < 100 → 模糊（variance 为 null 表示未测/跳过 → 不拦）
 * - faceCount：0 → 未检出；>1 → 多张（null 表示 VK 不可用 → 跳过该组检查）
 * - faceArea（人脸 anchor 面积占比）：<0.02 太小；>0.65 过大
 */
export function evaluatePhotoCheck(input: {
  width: number;
  height: number;
  variance: number | null;
  faceCount?: number | null;
  faceArea?: number | null;
}): PhotoCheckResult {
  const { width: w, height: h, variance } = input;
  if (w > 0 && h > 0 && (w < PHOTO_MIN_SIDE || h < PHOTO_MIN_SIDE)) {
    return { ok: false, reason: `照片分辨率过低，请上传更清晰的照片（最短边不低于 ${PHOTO_MIN_SIDE} 像素）` };
  }
  if (variance != null && variance < PHOTO_BLUR_THRESHOLD) {
    return { ok: false, reason: "照片有点模糊，请重新拍摄清晰的照片" };
  }
  const faceCount = input.faceCount ?? null;
  if (faceCount != null) {
    if (faceCount === 0) return { ok: false, reason: "未检测到人脸，请上传清晰的正面照片" };
    if (faceCount > 1) return { ok: false, reason: "检测到多张人脸，请上传单人照片" };
    const area = input.faceArea ?? 0;
    if (area < PHOTO_FACE_AREA_MIN) {
      return { ok: false, reason: "人脸在照片中占比太小，请靠近一些或裁剪后上传" };
    }
    if (area > PHOTO_FACE_AREA_MAX) {
      return { ok: false, reason: "人脸占照片比例过大，请适当拉远距离后拍摄" };
    }
  }
  return { ok: true, reason: "" };
}
