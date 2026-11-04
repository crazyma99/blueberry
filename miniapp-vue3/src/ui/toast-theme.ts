// 轻提示品牌金主题（wot 变量，事实源 node_modules/@wot-ui/ui/components/wd-toast/index.scss）：
//   --wot-toast-bg / --wot-toast-color / --wot-toast-border-radius。
// 颜色来自 tokens：文字＝semantic.colorAction（＝primitive.gold #F1CD91）；底＝primitive.ink（#160F04）0.92 透明度。
import { tokens } from "../generated/tokens";

/** 层级：高于 BasePopup 默认 2000 与顶栏 998（wd-toast 默认 100 会被弹层盖住） */
export const TOAST_Z_INDEX = 3000;

/** #RRGGBB → rgba(r, g, b, a)（输入必须是 6 位十六进制 token 值） */
function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const TOAST_BG = hexToRgba(tokens.primitive.ink, 0.92);
export const TOAST_COLOR = tokens.semantic.colorAction;

export const TOAST_THEME_STYLE =
  `--wot-toast-bg: ${TOAST_BG}; ` + `--wot-toast-color: ${TOAST_COLOR}; ` + `--wot-toast-border-radius: 999rpx; ` + `color: ${TOAST_COLOR};`;
