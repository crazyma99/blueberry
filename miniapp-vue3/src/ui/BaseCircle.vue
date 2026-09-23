<script setup lang="ts">
// 门面：环形进度（wot `wd-circle`）——**业务组件零 `wd-*` 直用**（plan §26 门面纪律）。
// 事实源：`npx wot info Circle`（v-model 进度 / size(px) / color / layer-color / speed / stroke-width / text / 默认 slot）。
// 2026-09-23 主人：「AI 推荐与 AI 试衣的 Loading 页进度文案没有动画 ⇒ 加 wot 动画与 Circle 组件（circle.html）并绑定 Tokens」。
// Token 绑定：进度色 `semantic.colorAction`（品牌金）、轨道色 `semantic.colorBorder`（金 30%）、
//            直径/描边 `component.progressCircleSizeRpx`／`progressCircleStrokeRpx`（rpx 档位 → 运行时 upx2px 转 px，wot 收 px）。
import { computed, onUnmounted, ref, watch } from "vue";
import { tokens } from "../generated/tokens";

const props = withDefaults(
  defineProps<{
    /** 进度 0-100（由父级伪进度驱动，wd-circle 内部按 `speed` 平滑动画） */
    modelValue?: number;
    /** 覆盖直径（px）；默认取 token `progressCircleSizeRpx`（注：本门面为**只读展示**，不 emit `update:modelValue`，勿用 `v-model`） */
    size?: number;
    /** 覆盖描边（px）；默认取 token `progressCircleStrokeRpx` */
    strokeWidth?: number;
    /** 覆盖进度色；默认 token 金 */
    color?: string;
    /** 覆盖轨道色；默认 token 金 30% */
    layerColor?: string;
    /** wot 内部动画速度（rate/s）。**默认 0＝关闭 wot 自带动画**，改由本门面自行补间（见下） */
    speed?: number;
    /** 自补间步长（每 tick 推进的百分点） */
    step?: number;
    /** 自补间 tick 间隔（ms） */
    tickMs?: number;
    customClass?: string;
  }>(),
  { modelValue: 0, size: 0, strokeWidth: 0, color: "", layerColor: "", speed: 0, step: 1, tickMs: 100, customClass: "" },
);

/** rpx(token) → px（wot 的 size/stroke-width 收 px）；无 upx2px（测试/异常）时按 2:1 折算以保证可测
 *  ⚠️ 必须用**裸 `uni`**：mp-weixin 产物把 `uni` 编译成 `common_vendor.index`，**不存在 `globalThis.uni`**
 *  （CR 🟡1 实证：产物 vendor.js 只 `globalThis.wx=e`）⇒ 用 globalThis 取会永远走兜底、环不随 rpx 缩放。 */
function upx2px(rpx: number): number {
  const injected = (globalThis as { uni?: { upx2px?: (n: number) => number } }).uni; // 测试桩/H5
  if (typeof injected?.upx2px === "function") return injected.upx2px(rpx);
  if (typeof uni !== "undefined" && typeof uni.upx2px === "function") return uni.upx2px(rpx);
  return rpx / 2;
}
const pxSize = computed(() => (props.size > 0 ? props.size : upx2px(tokens.component.progressCircleSizeRpx)));
const pxStroke = computed(() => (props.strokeWidth > 0 ? props.strokeWidth : upx2px(tokens.component.progressCircleStrokeRpx)));
/**
 * 自补间（2026-09-23 主人报「等待过程中圆环进度不会自己推进」的修复）：
 * wot `wd-circle` 自带动画依赖它**内部定时器 + canvas 节点查询**（`getContext()` 在 MP-WEIXIN 仅查到节点才 resolve），
 * 真机上易出现「环停在初始值不动」。⇒ 门面**自己把进度平滑推进**（每 tickMs 前进 step 个百分点），
 * 并把 `speed` 默认置 0（wot 收到 0 时直接 `drawCircle(modelValue)`，不再依赖其内部定时器）⇒ 每步都必然重绘。
 */
const displayValue = ref(props.modelValue);
let timer: ReturnType<typeof setTimeout> | null = null;
function stopTween(): void {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
}
/** 自调度 setTimeout 链（不用 setInterval：与页面/宿主计时器解耦，到达目标即停） */
function startTween(): void {
  stopTween();
  timer = setTimeout(() => {
    const target = props.modelValue;
    const cur = displayValue.value;
    if (cur === target) return stopTween();
    const diff = target - cur;
    displayValue.value = Math.abs(diff) <= props.step ? target : cur + Math.sign(diff) * props.step;
    startTween();
  }, props.tickMs);
}
watch(
  () => props.modelValue,
  (v) => {
    if (!Number.isFinite(v)) return;
    displayValue.value = Math.min(displayValue.value, v > displayValue.value ? displayValue.value : v); // 回退（重算/重置）时直接落位
    startTween();
  },
);
onUnmounted(stopTween);

const progressColor = computed(() => (props.color !== "" ? props.color : tokens.semantic.colorAction));
const trackColor = computed(() => (props.layerColor !== "" ? props.layerColor : tokens.semantic.colorBorder));
</script>

<template>
  <wd-circle
    :model-value="displayValue"
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
