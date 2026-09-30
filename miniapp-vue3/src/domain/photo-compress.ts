// 人脸图上传前压缩 —— 域逻辑（纯函数、单一事实源；容器胶水在 platform/weixin/photo-compress.ts）。
// 2026-09-28 流量成本 PRD（R16/R17/R19）：
//  · R16 用户手机拍摄人脸图 3–10MB，客户端压缩至「长边 ≤1080px、体积 ≤500KB」后再上传
//    （10MB 在 4G 弱网约 27s，压缩后 ≈1.3s）；
//  · R17 按 VK 人脸框外扩居中裁剪，去掉无效背景像素；
//  · R19 客户端不存在任何「上传原图」入口——压缩是唯一上传路径；
//    容器不支持时 fail-open 回退原图（与 photo-check 同纪律），由服务端 R22 二次压缩兜底。

/** 压缩后长边上限（px） */
export const COMPRESS_MAX_LONG_EDGE = 1080;
/** 压缩后体积上限（字节） */
export const COMPRESS_TARGET_BYTES = 500 * 1024;
/** JPEG 质量阶梯：逐档重试直至 ≤500KB 或阶梯用尽 */
export const COMPRESS_QUALITY_LADDER: readonly number[] = [0.8, 0.7, 0.6, 0.5];
/** 人脸框外扩倍数（保守取值：去背景但不贴脸，防后端 4002 人脸检出率下降） */
export const FACE_CROP_EXPAND = 2.5;
/** 裁剪后短边下限（px）：低于则不裁（给 photo-check 最短边 480 判定留余量） */
export const CROP_MIN_SHORT_SIDE = 640;
/** 裁剪面积收益下限：砍掉不足 20% 面积时不裁（白裁只损失画质） */
export const CROP_MIN_AREA_GAIN = 0.2;

/** VK 人脸框（归一化 0-1，同 vk-face/face-share-card 口径） */
export interface FaceBox {
  origin: { x: number; y: number };
  size: { width: number; height: number };
}

/** 长边 ≤ COMPRESS_MAX_LONG_EDGE 的等比缩放尺寸（已达标则原样） */
export function computeCompressSize(imgW: number, imgH: number): { width: number; height: number } {
  const longEdge = Math.max(imgW, imgH);
  if (longEdge <= COMPRESS_MAX_LONG_EDGE || longEdge <= 0) {
    return { width: Math.round(imgW), height: Math.round(imgH) };
  }
  const scale = COMPRESS_MAX_LONG_EDGE / longEdge;
  return { width: Math.round(imgW * scale), height: Math.round(imgH * scale) };
}

/**
 * 人脸居中裁剪窗（像素坐标 [sx, sy, w, h]）；不应裁剪时返回 null。
 * face=null（未检出/VK 不可用）→ null（只压缩不裁剪）。
 */
export function computeFaceCropRect(
  imgW: number,
  imgH: number,
  face: FaceBox | null,
): [number, number, number, number] | null {
  if (face == null || imgW <= 0 || imgH <= 0) return null;
  const fw = face.size.width * imgW;
  const fh = face.size.height * imgH;
  if (fw <= 0 || fh <= 0) return null;
  const cx = (face.origin.x + face.size.width / 2) * imgW;
  const cy = (face.origin.y + face.size.height / 2) * imgH;
  let cw = fw * FACE_CROP_EXPAND;
  let ch = fh * FACE_CROP_EXPAND;
  if (cw > imgW) cw = imgW;
  if (ch > imgH) ch = imgH;
  let sx = cx - cw / 2;
  let sy = cy - ch / 2;
  if (sx < 0) sx = 0;
  if (sy < 0) sy = 0;
  if (sx + cw > imgW) sx = imgW - cw;
  if (sy + ch > imgH) sy = imgH - ch;
  // 裁剪后短边不足下限：不裁（防压缩后触发 photo-check 最短边拦截）
  if (Math.min(cw, ch) < CROP_MIN_SHORT_SIDE) return null;
  // 面积收益不足：不裁
  if (cw * ch > imgW * imgH * (1 - CROP_MIN_AREA_GAIN)) return null;
  return [Math.round(sx), Math.round(sy), Math.round(cw), Math.round(ch)];
}
