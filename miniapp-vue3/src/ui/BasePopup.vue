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
    /** 🟡CR4：把「遮罩点击是否关闭」从 wot 上游默认值变成**门面合同**（`wd-popup` 默认 true） */
    closeOnClickModal?: boolean;
    /** wot `round`：开启后**按弹出位置自动适配圆角**（底部弹出→上圆角）——底部弹层接管圆角，勿手写（`npx wot info Popup`） */
    round?: boolean;
    /** wot `safe-area-inset-bottom`：底部弹层是否适配底部安全区（同上，由组件负责，勿手写 padding hack） */
    safeAreaInsetBottom?: boolean;
    /** 覆盖弹层 surface（如 `--wot-popup-bg: <主题 token 色>`；默认透明 = 由内容自带面） */
    customStyle?: string;
  }>(),
  {
    show: false, title: "", position: "center", closable: false, rootPortal: true, zIndex: 1001, closeOnClickModal: true,
    round: false, safeAreaInsetBottom: false, customStyle: "",
  },
);

/** 🔴CR2（2026-09-22）：wot `wd-popup` 根节点自带**不透明**默认底色（`.wd-popup{background:var(--wot-popup-bg,…white)}`，本仓未定义任何 `--wot-*`）
 * ⇒ 不置透明会在深色圆角卡片四角露出白色直角。与 `BaseLoadingPopup` 同家法（`deviations #29` 一族）。 */
const POPUP_TRANSPARENT_STYLE = "--wot-popup-bg: transparent; --wot-popup-radius: 0;";

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
    :close-on-click-modal="closeOnClickModal"
    :round="round"
    :safe-area-inset-bottom="safeAreaInsetBottom"
    :custom-style="customStyle !== '' ? customStyle : POPUP_TRANSPARENT_STYLE"
    @close="onClose"
    @update:model-value="onModelValueUpdate"
  >
    <view class="base-popup">
      <text v-if="title" class="base-popup__title">{{ title }}</text>
      <slot />
    </view>
  </wd-popup>
  <view v-else-if="show" :class="position === 'bottom' ? 'base-popup-native is-bottom' : 'base-popup-native'" :style="{ zIndex }">
    <view class="base-popup-native__mask" @click="onClose" @touchmove.stop.prevent />
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
.base-popup {
  /* 组件样式隔离（默认 isolated）：app.wxss 的 `page{font-family}` 与全局 `.font-harmony` **进不来组件**
     ⇒ 门面自带正文字体（弹窗内文案在真机才不会是系统字体；2026-09-22 主人报「只弹窗字体不对」的根因） */
  font-family: 'HarmonyOS-Sans-SC';
}

.base-popup-native {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
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
.base-popup-native.is-bottom {
  align-items: flex-end; /* 抖音自绘分支：底部弹层对齐（wot 的 position/round/safe-area 在 TTSS 下不可用，此处等价实现） */
}
.base-popup-native.is-bottom .base-popup-native__box {
  width: 100%;
  background: transparent; /* 面由内容卡片承载（SCSS token）⇒ 两端同源 */
  border-radius: 0;
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
