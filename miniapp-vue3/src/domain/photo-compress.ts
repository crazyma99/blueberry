// 人脸图上传前压缩 —— 域逻辑（纯函数、单一事实源；容器胶水在 platform/weixin/photo-compress.ts）。
// 2026-09-28 流量成本 PRD（R16/R19）：
//  · R16 用户手机拍摄人脸图 3–10MB，客户端压缩至「长边 ≤1080px、体积 ≤500KB」后再上传
//    （10MB 在 4G 弱网约 27s，压缩后 ≈1.3s）。
//    ⚠️ 2026-09-30 PRD 更新口径：**只做压缩，不裁剪、不做任何人脸加工**——
//    旧版 R17「VK 人脸框外扩裁剪」已从 PRD 删除，本模块不再含任何裁剪逻辑；
//  · R19 客户端不存在任何「上传原图」入口——压缩是唯一上传路径；
//    压缩不可用/失败时页面阻断并提示重试（fail-closed），体积红线另有服务端 R22 二次压缩兜底。

/** 压缩后长边上限（px） */
export const COMPRESS_MAX_LONG_EDGE = 1080;
/** 压缩后体积上限（字节） */
export const COMPRESS_TARGET_BYTES = 500 * 1024;
/** JPEG 质量阶梯：逐档重试直至 ≤500KB 或阶梯用尽 */
export const COMPRESS_QUALITY_LADDER: readonly number[] = [0.8, 0.7, 0.6, 0.5];

/** 长边 ≤ COMPRESS_MAX_LONG_EDGE 的等比缩放尺寸（已达标则原样） */
export function computeCompressSize(imgW: number, imgH: number): { width: number; height: number } {
  const longEdge = Math.max(imgW, imgH);
  if (longEdge <= COMPRESS_MAX_LONG_EDGE || longEdge <= 0) {
    return { width: Math.round(imgW), height: Math.round(imgH) };
  }
  const scale = COMPRESS_MAX_LONG_EDGE / longEdge;
  return { width: Math.round(imgW * scale), height: Math.round(imgH * scale) };
}
