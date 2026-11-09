// BasePicker 的纯逻辑与主题（issue #14 · m2b 真机批次 1）。
// 事实源（wot 2.3.2 源码，逐行核对，见 tests/unit/wot-contract-guard.spec.ts 的源码级守卫）：
//   · wd-picker-view：props modelValue/columns/cascade/childrenKey/valueKey/labelKey；emits change/pickstart/pickend/update:modelValue；
//     expose getSelectedValues()/getSelectedLabels()/getSelectedOptions()（useSelection.ts 的 selectedValues/selectedLabels）。
//   · 级联：columns 为树形（节点带 `children`），**且第一项必须含 `children` 键**（useSelection.resetColumns 以
//     `childrenKey in columns[0]` 判定树形；否则按普通二维数组处理 ⇒ 级联失效）；modelValue 为「每列一个值」的路径数组。
//   · 空 modelValue 的级联：picker-view 只会铺第一列（selectWithValue([]) 只取现有列的首项）⇒ 门面必须自己补全默认路径。
// 层级约定（z-index）：CustomNavBar 998 < BasePopup 默认 1001 < 业务自定义 sheet 2000 < BasePicker 2100。
import { tokens } from "../generated/tokens";

export interface PickerOption {
  label: string;
  value: string | number;
  /** 级联子选项（cascade 模式）。叶子可省略；但**第一项必须带 children 键**（空数组也行） */
  children?: PickerOption[];
}

/** BasePicker 弹层默认层级：高于业务 sheet（2000），否则从 sheet 内打开的选择器会被压在下面 */
export const PICKER_Z_INDEX = 2100;

/** 在 options 里按值找项（宽松比较：数字/字符串同值视为相等，与 wot 的 toString 比较口径一致） */
function findByValue(list: readonly PickerOption[], value: string | number | undefined): PickerOption | undefined {
  if (value === undefined || value === null) return undefined;
  return list.find((o) => String(o.value) === String(value));
}

/**
 * 补全级联路径：逐级按 value 取项，找不到就取该级第一项，然后沿「第一个孩子」一路补到叶子。
 * 例：options=[A{a1,a2},B{b1}]，value=[] ⇒ [A,a1]；value=[B] ⇒ [B,b1]；value=[A,a2] ⇒ [A,a2]；value=[X(不存在)] ⇒ [A,a1]。
 */
export function completeCascadePath(options: readonly PickerOption[], value: readonly (string | number)[]): (string | number)[] {
  const path: (string | number)[] = [];
  let level: readonly PickerOption[] = options;
  let i = 0;
  while (level.length > 0) {
    const hit = findByValue(level, value[i]) ?? level[0];
    path.push(hit.value);
    level = hit.children ?? [];
    i++;
  }
  return path;
}

/** 路径对应的 label 路径（找不到的层级停止） */
export function labelsOfPath(options: readonly PickerOption[], path: readonly (string | number)[]): string[] {
  const out: string[] = [];
  let level: readonly PickerOption[] = options;
  for (const v of path) {
    const hit = findByValue(level, v);
    if (hit === undefined) break;
    out.push(hit.label);
    level = hit.children ?? [];
  }
  return out;
}

/** 某一级值下的子选项（自绘分支右列用） */
export function childrenOfValue(options: readonly PickerOption[], parentValue: string | number | undefined): PickerOption[] {
  return findByValue(options, parentValue)?.children ?? [];
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (m === null) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

const S = tokens.semantic;
const CARD = S.colorPopupCard;

/**
 * wd-picker-view 的主题（深色卡片 + 金色）：经 custom-style 注入 `--wot-picker-view-*`。
 * 为什么不用 wd-picker：它渲染在 root-portal 内，且不向内部 wd-popup 透传 custom-style ⇒ CSS 变量无处可落；
 * 而 wd-picker-view 的根节点吃 custom-style，变量落在同一棵树（含原生 picker-view 的 mask/indicator）。
 * 数值全部取自 design token（S.*），与 BasePopup / 其它底部弹层同源。
 */
export const PICKER_VIEW_THEME_STYLE = [
  "--wot-picker-view-bg: transparent",
  `--wot-picker-view-mask-start-color: ${hexToRgba(CARD, 0.94)}`,
  `--wot-picker-view-mask-end-color: ${hexToRgba(CARD, 0.4)}`,
  `--wot-picker-view-column-item-color: ${S.colorTextPrimary}`,
  `--wot-picker-view-column-item-disabled-color: ${S.colorTextMuted}`,
  `--wot-picker-view-column-item-font-size: ${S.fontSizeBody}`,
  "--wot-picker-view-column-item-font-weight-active: 600",
  "--wot-picker-view-roller-bg: rgba(241, 205, 145, 0.14)",
  "--wot-picker-view-roller-border-radius: 16rpx",
].join("; ") + ";";
