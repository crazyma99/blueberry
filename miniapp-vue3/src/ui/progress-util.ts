// BaseProgress 的纯函数（独立模块：<script setup> 不允许具名导出，测试需要直接 import）。

/** 进度值收敛：非有限（NaN/Infinity/非数字）⇒ 0；四舍五入到整数；夹到 [0,100]（避免 wot 里 `${percentage}%` 渲染出 NaN%） */
export function clampPercent(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, Math.round(v)));
}
