<script setup lang="ts">
// 门面：线性进度条（wot `wd-progress`）——**业务组件零 `wd-*` 直用**（plan §26 门面纪律）。
// 事实源：`wd-progress/types.ts`（percentage 0-100 / color 字符串 / hide-text / percent-position / custom-style）。
// 主人 2026-11-09 指示：新增组件从 wot-ui 选并自定义成小程序样式 token（不自绘）。
// Token 绑定：进度色 `semantic.colorAction`（品牌金）、轨道色 `semantic.colorBorder`（金 30%）、
//            条高 `component.progressBarHeightRpx`（rpx 档位 → 运行时 upx2px 转 px，wot 的 --wot-progress-bar-height 收 px/任意长度）。
// 实现要点：
//  · wot 的颜色/高度通过 CSS 变量覆盖（`--wot-progress-*`），经 wd-progress 根节点 `custom-style` 注入；变量**只在微信端生效**
//    （抖音 TTSS 不支持 CSS 变量——本组件目前只被商家分包使用，商家端只做微信；若将来 C 端要用，需另做抖音降级）。
//  · 进度值收敛到 [0,100] 的整数；NaN/非有限 ⇒ 0（避免 wot 里 `${percentage}%` 渲染出 NaN%）。
//  · 文案：默认隐藏 wot 自带的「xx%」（由页面按「第 n/m 张」自行描述），可通过 showText 打开。
import { computed } from "vue";
import { tokens } from "../generated/tokens";
import { clampPercent } from "./progress-util";

const props = withDefaults(
  defineProps<{
    /** 进度 0-100 */
    percentage?: number;
    /** 是否显示 wot 自带的百分比文字 */
    showText?: boolean;
    /** 覆盖进度色；默认 token 金 */
    color?: string;
    /** 覆盖轨道色；默认 token 金 30% */
    trackColor?: string;
    /** 覆盖条高（px）；默认取 token `progressBarHeightRpx` */
    height?: number;
  }>(),
  { percentage: 0, showText: false, color: "", trackColor: "", height: 0 },
);

/** rpx(token) → px；无 upx2px（测试/异常）时按 2:1 折算（同 BaseCircle 口径：优先注入桩，再回落裸 `uni`） */
function upx2px(rpx: number): number {
  const injected = (typeof globalThis === "undefined" ? undefined : (globalThis as { uni?: { upx2px?: (n: number) => number } }).uni);
  if (typeof injected?.upx2px === "function") return injected.upx2px(rpx);
  if (typeof uni !== "undefined" && typeof uni.upx2px === "function") return uni.upx2px(rpx);
  return rpx / 2;
}

const percent = computed(() => clampPercent(props.percentage));
const barHeightPx = computed(() => (props.height > 0 ? props.height : upx2px(tokens.component.progressBarHeightRpx)));
const progressColor = computed(() => (props.color !== "" ? props.color : tokens.semantic.colorAction));
const trackColor = computed(() => (props.trackColor !== "" ? props.trackColor : tokens.semantic.colorBorder));
const rootStyle = computed(
  () => `--wot-progress-bg: ${trackColor.value}; --wot-progress-bar-height: ${barHeightPx.value}px; --wot-progress-label-color: ${progressColor.value};`,
);
</script>

<template>
  <wd-progress :percentage="percent" :color="progressColor" :hide-text="!showText" :custom-style="rootStyle" />
</template>
