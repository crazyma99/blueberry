<script setup lang="ts">
// 门面：环形进度（wot `wd-circle`）——**业务组件零 `wd-*` 直用**（plan §26 门面纪律）。
// 事实源：`npx wot info Circle`（v-model 进度 / size(px) / color / layer-color / speed / stroke-width / text / 默认 slot）。
// 2026-09-23 主人：「AI 推荐与 AI 试衣的 Loading 页进度文案没有动画 ⇒ 加 wot 动画与 Circle 组件（circle.html）并绑定 Tokens」。
// Token 绑定：进度色 `semantic.colorAction`（品牌金）、轨道色 `semantic.colorBorder`（金 30%）、
//            直径/描边 `component.progressCircleSizeRpx`／`progressCircleStrokeRpx`（rpx 档位 → 运行时 upx2px 转 px，wot 收 px）。
import { computed } from "vue";
import { tokens } from "../generated/tokens";

const props = withDefaults(
  defineProps<{
    /** 进度 0-100（由父级伪进度驱动，wd-circle 内部按 `speed` 平滑动画） */
    modelValue?: number;
    /** 覆盖直径（px）；默认取 token `progressCircleSizeRpx` */
    size?: number;
    /** 覆盖描边（px）；默认取 token `progressCircleStrokeRpx` */
    strokeWidth?: number;
    /** 覆盖进度色；默认 token 金 */
    color?: string;
    /** 覆盖轨道色；默认 token 金 30% */
    layerColor?: string;
    /** 动画速度（rate/s，wot 默认 50） */
    speed?: number;
    customClass?: string;
  }>(),
  { modelValue: 0, size: 0, strokeWidth: 0, color: "", layerColor: "", speed: 50, customClass: "" },
);

/** rpx(token) → px（wot 的 size/stroke-width 收 px）；测试环境无 upx2px 时按 2:1 折算，保证可测 */
function upx2px(rpx: number): number {
  const u = (globalThis as { uni?: { upx2px?: (n: number) => number } }).uni;
  return typeof u?.upx2px === "function" ? u.upx2px(rpx) : rpx / 2;
}
const pxSize = computed(() => (props.size > 0 ? props.size : upx2px(tokens.component.progressCircleSizeRpx)));
const pxStroke = computed(() => (props.strokeWidth > 0 ? props.strokeWidth : upx2px(tokens.component.progressCircleStrokeRpx)));
const progressColor = computed(() => (props.color !== "" ? props.color : tokens.semantic.colorAction));
const trackColor = computed(() => (props.layerColor !== "" ? props.layerColor : tokens.semantic.colorBorder));
</script>

<template>
  <wd-circle
    :model-value="modelValue"
    :size="pxSize"
    :stroke-width="pxStroke"
    :color="progressColor"
    :layer-color="trackColor"
    :speed="speed"
    :custom-class="customClass"
  >
    <!-- 中心内容走 slot（仅在未传 text 时显示）⇒ 文案样式由使用方 token 化控制 -->
    <slot />
  </wd-circle>
</template>
