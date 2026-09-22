<script setup lang="ts">
// 门面：show 受控弹层；关闭统一走 cancel（遮罩/关闭按钮/返回键收敛为一个出口）。
// 事实源：wot info Popup（v-model/position/closable/close-on-click-modal…；emits close/click-modal）。
// 方案 A（migration §8.12）：
//  - 非抖音端保持 wd-popup 链，新增 rootPortal prop（默认 true；抖音端 wot 为 no-op、微信/支付宝/H5 生效）。
//  - 抖音端门面自绘降级：纯 view+fixed 蒙层＋居中容器，绕开 wot 自定义组件宿主节点（fixed 失效根因）。
//  对外合同（props/emits）不变；cancel 单一出口与去重逻辑两条分支共用。
import { isToutiaoPlatform } from "./ui-platform";

withDefaults(
  defineProps<{
    show?: boolean;
    title?: string;
    position?: "center" | "top" | "right" | "bottom" | "left";
    closable?: boolean;
    rootPortal?: boolean;
    /**
     * 弹层层级。⚠️ **必须显式给**（与 `BaseLoadingPopup` 同家法、`deviations #29`／独立 CR 同族结论）：
     * wot `wd-popup` 默认 `z-index: 10`（`npx wot info Popup` 实测），而本仓自绘标题栏 `z-index: 998`
     * （`components/CustomNavBar`，不透明）⇒ 默认值下遮罩**盖不住顶栏**（不压暗、返回键仍可点）；抖音自绘分支须一致。
     */
    zIndex?: number;
  }>(),
  { show: false, title: "", position: "center", closable: false, rootPortal: true, zIndex: 1001 },
);

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "cancel"): void;
}>();

// 去重：close 与 update:modelValue 可能在同一动作里都触发，只发一次 cancel
let handled = false;
function onClose() {
  if (handled) return;
  handled = true;
  emit("update:show", false);
  emit("cancel");
  setTimeout(() => {
    handled = false;
  }, 0);
}

// wd-popup v-model 回落：仅在回写 false 时收敛到 cancel 统一出口（模板内禁 TS 标注，提为具名方法）
function onModelValueUpdate(v: boolean): void {
  if (!v) onClose();
}

// 运行时平台分支（抖音自绘；测试可经 setUiPlatformOverride 显式覆盖两条分支）
const useNative = isToutiaoPlatform();
</script>

<template>
  <wd-popup
    v-if="!useNative"
    :model-value="show"
    :position="position"
    :closable="closable"
    :root-portal="rootPortal"
    :z-index="zIndex"
    @close="onClose"
    @update:model-value="onModelValueUpdate"
  >
    <view class="base-popup">
      <text v-if="title" class="base-popup__title">{{ title }}</text>
      <slot />
    </view>
  </wd-popup>
  <view v-else-if="show" class="base-popup-native" :style="{ zIndex }">
    <view class="base-popup-native__mask" @click="onClose" />
    <view class="base-popup-native__box">
      <view v-if="closable" class="base-popup-native__close" @click="onClose">
        <text class="base-popup-native__close-text">×</text>
      </view>
      <view class="base-popup">
        <text v-if="title" class="base-popup__title">{{ title }}</text>
        <slot />
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
/* 抖音自绘分支：页面级节点 + fixed，不经过 wot 自定义组件宿主节点 */
.base-popup-native {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: base-popup-fade-in $duration-modal ease;
}
.base-popup-native__mask {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.5);
}
.base-popup-native__box {
  position: relative;
  width: 560rpx;
  max-width: 80%;
  border-radius: #{$popup-radius-rpx}rpx;
  background: $color-page;
  padding: $space-lg;
}
.base-popup-native__close {
  position: absolute;
  top: 8rpx;
  right: 8rpx;
  width: $size-hit-area;
  height: $size-hit-area;
  display: flex;
  align-items: center;
  justify-content: center;
}
.base-popup-native__close-text {
  font-size: $font-size-title;
  color: $color-text-muted;
}
.base-popup__title {
  display: block;
  margin-bottom: $space-md;
  font-size: $font-size-sub-title;
  color: $color-text-strong;
}
@keyframes base-popup-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
