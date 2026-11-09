// BaseField / 商家端原生输入框的共用主题常量（issue #14 · m2b 真机批次 2）。
// 原生 <input> 的 placeholder 颜色只能经 `placeholder-style` 属性设置（样式表 `::placeholder` 在小程序不生效）；
// 值取 design token（colorTextMuted），不依赖 CSS 变量（抖音 TTSS 不支持）。
import { tokens } from "../generated/tokens";

/** 深色面上的 placeholder：muted 金（rgba(241,205,145,0.5)） */
export const INPUT_PLACEHOLDER_STYLE = "color:" + tokens.semantic.colorTextMuted;

/** 键盘类型闭集（微信 <input type>；ProfilePopup/预约页同样直接用原生 input） */
export type FieldType = "text" | "number" | "digit" | "idcard" | "tel";

/** 从 input 事件取值：小程序是 e.detail.value；H5/测试环境回落 e.target.value；都没有 ⇒ "" */
export function valueFromInputEvent(e: unknown): string {
  const ev = e as { detail?: { value?: unknown }; target?: { value?: unknown } } | null | undefined;
  const v = ev?.detail?.value ?? ev?.target?.value;
  return v == null ? "" : String(v);
}
