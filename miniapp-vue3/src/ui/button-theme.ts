// BaseButton 品牌金主题（纯 CSS 变量覆盖 wot，不改 wot 源码；零 #ifdef，微信/抖音/小红书同一份）。
// 事实源（node_modules/@wot-ui/ui/components/wd-button/index.scss，2.3.2）：
//   · base 变体：背景取 --wot-button-primary-bg（`background:` 简写，可放渐变）、
//     文字取 --wot-button-main-color（默认白）——**plain 变体才取 --wot-button-primary-color**，
//     故只写后者会让文字仍为白色；两者此处都显式设（docs/plans/button-facade-inventory.md 第 13 条）；
//   · 按压态背景取 --wot-button-primary-bg-active（.wd-button--active）；
//   · 圆角取 --wot-button-radius-main（非 round 时）。
// 禁用态：wot 仅用 --wot-button-disabled 的 opacity 表达，这里**不覆盖**任何 disabled 变量。
// 口径同全站 .btn-primary（App.vue）：linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%)、墨色字、胶囊。
import { tokens } from "../generated/tokens";

/** token primitive.gold（＝semantic.colorAction）：渐变中段 */
const GOLD = tokens.primitive.gold;
/** token semantic.colorActionText（＝primitive.ink）：主按钮文字色 */
const INK = tokens.semantic.colorActionText;
/** 渐变首/尾端点：与 App.vue `.btn-primary` 逐字一致（暂无对应 token；测试对照 App.vue 防漂移） */
const GOLD_BRIGHT = "#FFDF9F";
const GOLD_DEEP = "#D9A75C";

export const PRIMARY_GOLD_GRADIENT = `linear-gradient(135deg, ${GOLD_BRIGHT} 0%, ${GOLD} 45%, ${GOLD_DEEP} 100%)`;
/** 按压态：金到深金（取同一组端点，比常态更沉，提供按压反馈） */
export const PRIMARY_GOLD_GRADIENT_ACTIVE = `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_DEEP} 100%)`;

export const PRIMARY_BUTTON_STYLE =
  `--wot-button-primary-bg: ${PRIMARY_GOLD_GRADIENT}; ` +
  `--wot-button-primary-bg-active: ${PRIMARY_GOLD_GRADIENT_ACTIVE}; ` +
  `--wot-button-main-color: ${INK}; ` +
  `--wot-button-radius-main: 999rpx; ` +
  `color: ${INK};`;

export type ButtonType = "primary" | "success" | "info" | "warning" | "danger";

/** 默认样式：仅 primary 带金色；其它 type 保持 wot 默认（返回空串） */
export function defaultButtonStyle(type: ButtonType): string {
  return type === "primary" ? PRIMARY_BUTTON_STYLE : "";
}
