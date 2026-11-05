<script setup lang="ts">
// 门面：双平台对话框，对外合同 confirm(options): Promise<"confirm" | "cancel">（props/emits/expose 不变）。
// 两条分支共用同一套状态（visible/title/msg/showCancel/resolver）与 settle()，仅渲染外壳不同：
//  - 抖音：自绘 `.base-dialog-native*`（真机根因 §8.13：wot 原生对话框内部包裹 wd-popup——按钮处于抖音失效的 fixed 链内
//    ⇒ 点击无响应；照搬 BasePopup 已真机验证的自绘模式）。**该分支经真机验证，勿改。**
//  - 微信等非抖音：**品牌卡片**（2026-11 主人：「取消预约确认框不要 wot 原生白底蓝按钮」）——经门面 `BasePopup`
//    （居中 bare）承载，卡片面/标题/按钮沿用 `QualityRejectSheet` 已验证的 token 写法；不再依赖 wot 原生对话框组件及其函数式驱动通道。
//    ⚠️ 组件样式隔离（isolated）⇒ 按钮/字体样式**全部在本组件内声明**，不依赖 App.vue 全局 `.btn-primary` 等类。
import { ref } from "vue";
import { isToutiaoPlatform } from "./ui-platform";
import { hapticTap } from "../application/haptics";
import BasePopup from "./BasePopup.vue";
export interface BaseDialogOptions {
  title?: string;
  msg?: string;
  showCancel?: boolean;
}

const useNative = isToutiaoPlatform();
const visible = ref(false);
const title = ref("");
const msg = ref("");
const showCancel = ref(true);
let resolver: ((r: "confirm" | "cancel") => void) | null = null;

function confirm(options: BaseDialogOptions = {}): Promise<"confirm" | "cancel"> {
  title.value = options.title ?? "";
  msg.value = options.msg ?? "";
  showCancel.value = options.showCancel ?? true;
  visible.value = true;
  return new Promise((resolve) => {
    resolver = resolve;
  });
}

function settle(result: "confirm" | "cancel") {
  hapticTap(); // 弹层内按钮：触感统一（主人 2026-09-23）
  visible.value = false;
  const r = resolver;
  resolver = null;
  if (r) r(result);
}

// 蒙层点击默认不关闭（对话确认语义，防误触）。抖音分支蒙层 @click 空函数；微信分支 BasePopup `:close-on-click-modal="false"` 且不接 @cancel
function onMask() {}

defineExpose<{ confirm: (options?: BaseDialogOptions) => Promise<"confirm" | "cancel"> }>({ confirm });
</script>

<template>
  <!-- 微信等非抖音：品牌卡片（BasePopup 居中 bare；z-index 2000＝仓内弹层惯例档；蒙层点击不关闭）。
       卡片 v-if=visible：关闭即卸载内容（BasePopup 自带遮罩淡出） -->
  <BasePopup v-if="!useNative" :show="visible" position="center" :bare="true" :close-on-click-modal="false" :z-index="2000">
    <view v-if="visible" class="base-dialog-card">
      <text v-if="title" class="base-dialog-title">{{ title }}</text>
      <text v-if="msg" class="base-dialog-msg">{{ msg }}</text>
      <view class="base-dialog-actions">
        <view class="base-dialog-btn base-dialog-btn-confirm" hover-class="press-dim" @click="settle('confirm')">
          <text class="base-dialog-btn-text base-dialog-btn-text--confirm">确认</text>
        </view>
        <view v-if="showCancel" class="base-dialog-btn base-dialog-btn-cancel" hover-class="press-dim" @click="settle('cancel')">
          <text class="base-dialog-btn-text base-dialog-btn-text--cancel">取消</text>
        </view>
      </view>
    </view>
  </BasePopup>
  <view v-else-if="visible" class="base-dialog-native">
    <view class="base-dialog-native__mask" @click="onMask" />
    <view class="base-dialog-native__box">
      <text v-if="title" class="base-dialog-native__title">{{ title }}</text>
      <text v-if="msg" class="base-dialog-native__msg">{{ msg }}</text>
      <view class="base-dialog-native__actions">
        <view
          v-if="showCancel"
          class="base-dialog-native__btn base-dialog-native__btn--cancel"
          hover-class="press-dim"
          @click="settle('cancel')"
        >
          <text class="base-dialog-native__btn-text base-dialog-native__btn-text--cancel">取消</text>
        </view>
        <view class="base-dialog-native__btn base-dialog-native__btn--confirm" hover-class="press-dim" @click="settle('confirm')">
          <text class="base-dialog-native__btn-text">确认</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
/* 微信分支：品牌卡片（token 写法同 QualityRejectSheet；组件隔离，样式自包含） */
.base-dialog-card {
  box-sizing: border-box;
  width: 560rpx; /* 沿用抖音分支定宽；无对应 token */
  max-width: 80vw; /* 居中弹层容器随内容收缩，百分比无参照 ⇒ 用 vw */
  background: $color-popup-card;
  border-radius: #{$popup-radius-rpx * 2}rpx;
  padding: $space-lg;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.base-dialog-title {
  font-size: $font-size-sub-title;
  color: $color-action;
  text-align: center;
}
.base-dialog-msg {
  margin-top: $space-sm;
  font-size: $font-size-body;
  color: $color-text-primary;
  text-align: center;
  line-height: 1.5;
}
.base-dialog-actions {
  margin-top: $space-lg;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.base-dialog-btn {
  width: 100%;
  height: #{$button-height-rpx}rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx; /* 仓内无 pill token */
  box-sizing: border-box;
}
.base-dialog-btn-confirm {
  background: linear-gradient(135deg, $color-action-soft 0%, $color-action 45%, #d9a75c 100%);
}
.base-dialog-btn-cancel {
  margin-top: $space-sm;
  border: 2rpx solid $color-border;
}
.base-dialog-btn-text {
  font-size: $font-size-body;
}
.base-dialog-btn-text--confirm {
  color: $color-action-text;
}
.base-dialog-btn-text--cancel {
  color: $color-action;
}

/* 抖音自绘分支：页面级节点 + fixed，不经过 wot 自定义组件宿主节点（同 BasePopup §8.12 模式） */
.base-dialog-native {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: base-dialog-fade-in $duration-modal ease;
}
.base-dialog-native__mask {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.5);
}
.base-dialog-native__box {
  position: relative;
  width: 560rpx;
  max-width: 80%;
  border-radius: #{$popup-radius-rpx}rpx;
  background: $color-page;
  padding: $space-lg;
}
.base-dialog-native__title {
  display: block;
  margin-bottom: $space-sm;
  font-size: $font-size-sub-title;
  color: $color-text-strong;
}
.base-dialog-native__msg {
  display: block;
  margin-bottom: $space-lg;
  font-size: $font-size-body;
  color: $color-text-secondary;
}
.base-dialog-native__actions {
  display: flex;
  gap: $space-sm;
}
.base-dialog-native__btn {
  flex: 1;
  height: $size-hit-area;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: #{$popup-radius-rpx}rpx;
}
.base-dialog-native__btn--confirm {
  background: $color-action;
}
.base-dialog-native__btn--cancel {
  background: $color-divider;
}
.base-dialog-native__btn-text {
  font-size: $font-size-body;
  color: $color-action-text;
}
.base-dialog-native__btn-text--cancel {
  color: $color-text-secondary;
}
@keyframes base-dialog-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
