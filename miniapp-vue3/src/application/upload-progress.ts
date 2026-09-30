// 上传进度文案（2026-09-30 流量成本 PRD R18：上传进度 + 剩余时间 + 弱网提示）。
// 纯函数、单一事实源；aiTryOn（loading 弹层文案）与 aiRecommend（按钮文案）共用。
// 口径：
//  · 剩余时间＝按已耗时长与当前百分比线性外推（elapsed × (100−p)/p），进度 ≤5% 时估算不稳，不显示；
//  · 弱网判定：已耗时 >8s 且进度仍 <60%（压缩后 ≤500KB 正常 4G 约 1–2s 完成，超过即视为弱网）。

/** 视为弱网的已耗时阈值（毫秒） */
export const WEAK_NETWORK_ELAPSED_MS = 8000;
/** 弱网判定下的进度上限（低于该进度才提示） */
export const WEAK_NETWORK_PERCENT = 60;
/** 剩余时间估算的最小进度（低于该值不外推，避免 0 除与大幅抖动） */
export const REMAINING_MIN_PERCENT = 5;

/**
 * 生成上传进度文案。
 * @param p 进度 0–100（越界按边界收）
 * @param startTs 上传开始时间戳（Date.now()）
 * @param nowTs 当前时间戳（默认 Date.now()，测试可注入）
 */
export function formatUploadProgressText(p: number, startTs: number, nowTs: number = Date.now()): string {
  const percent = Math.max(0, Math.min(100, Math.round(p)));
  const elapsed = Math.max(0, nowTs - startTs);
  let text = `上传中 ${percent}%`;
  if (percent > REMAINING_MIN_PERCENT && percent < 100) {
    const remainSec = Math.ceil((elapsed / percent) * (100 - percent) / 1000);
    if (remainSec >= 1) text += ` · 约剩${remainSec}秒`;
  }
  if (elapsed > WEAK_NETWORK_ELAPSED_MS && percent < WEAK_NETWORK_PERCENT) {
    text += " · 网络较慢，请耐心等待";
  }
  return text;
}
