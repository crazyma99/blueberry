<script setup lang="ts">
// 门面：双平台对话框，对外合同 confirm(options): Promise<"confirm" | "cancel">。
// 事实源：wd-dialog 2.3.2 无任何 emit、无 show prop（types.ts:287 dialogProps），可见性仅
// useDialog() provide/inject 驱动（wd-dialog/index.ts:34；resolve=confirm、reject=cancel/modal/close，
// index.ts:124-137）。真机根因（§8.13）：wd-dialog.vue:1-12 内部包裹 wd-popup——按钮处于抖音
// 失效的 fixed 链内 ⇒ 点击无响应；抖音端照搬 BasePopup 已真机验证的自绘模式降级。
import { ref } from "vue";
import { isToutiaoPlatform } from "./ui-platform";
import { useDialog } from "./wot-composables";
import { tokens } from "../generated/tokens";

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

// 非抖音分支：与本组件模板内的 <wd-dialog /> 挂载点同组件 provide/inject 配对
// （showCancel 语义由 wot confirm() 天然满足：确认＋取消双按钮）
const dialog = useDialog();

function confirm(options: BaseDialogOptions = {}): Promise<"confirm" | "cancel"> {
  title.value = options.title ?? "";
  msg.value = options.msg ?? "";
  showCancel.value = options.showCancel ?? true;
  if (useNative) {
    visible.value = true;
    return new Promise((resolve) => {
      resolver = resolve;
    });
  }
  return dialog
    .confirm({ title: title.value, msg: msg.value })
    .then(() => "confirm" as const)
    .catch(() => "cancel" as const);
}

function settle(result: "confirm" | "cancel") {
  visible.value = false;
  const r = resolver;
  resolver = null;
  if (r) r(result);
}

// 蒙层点击默认不关闭（对话确认语义，防误触）
function onMask() {}

defineExpose<{ confirm: (options?: BaseDialogOptions) => Promise<"confirm" | "cancel"> }>({ confirm });
</script>

<template>
  <wd-dialog v-if="!useNative" root-portal :show-close="false" />
  <view v-else-if="visible" class="base-dialog-native">
    <view class="base-dialog-native__mask" @click="onMask" />
    <view class="base-dialog-native__box">
      <text v-if="title" class="base-dialog-native__title">{{ title }}</text>
      <text v-if="msg" class="base-dialog-native__msg">{{ msg }}</text>
      <view class="base-dialog-native__actions">
        <view
          v-if="showCancel"
          class="base-dialog-native__btn base-dialog-native__btn--cancel"
          @click="settle('cancel')"
        >
          <text class="base-dialog-native__btn-text base-dialog-native__btn-text--cancel">取消</text>
        </view>
        <view class="base-dialog-native__btn base-dialog-native__btn--confirm" @click="settle('confirm')">
          <text class="base-dialog-native__btn-text">确认</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
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
  animation: base-dialog-fade-in v-bind("tokens.semantic.durationModal") ease;
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
  border-radius: v-bind("tokens.component.popupRadiusRpx + 'rpx'");
  background: v-bind("tokens.semantic.colorPage");
  padding: v-bind("tokens.primitive.spaceLg");
}
.base-dialog-native__title {
  display: block;
  margin-bottom: v-bind("tokens.primitive.spaceSm");
  font-size: v-bind("tokens.semantic.fontSizeSubTitle");
  color: v-bind("tokens.semantic.colorTextStrong");
}
.base-dialog-native__msg {
  display: block;
  margin-bottom: v-bind("tokens.primitive.spaceLg");
  font-size: v-bind("tokens.semantic.fontSizeBody");
  color: v-bind("tokens.semantic.colorTextSecondary");
}
.base-dialog-native__actions {
  display: flex;
  gap: v-bind("tokens.primitive.spaceSm");
}
.base-dialog-native__btn {
  flex: 1;
  height: v-bind("tokens.semantic.sizeHitArea");
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: v-bind("tokens.component.popupRadiusRpx + 'rpx'");
}
.base-dialog-native__btn--confirm {
  background: v-bind("tokens.semantic.colorAction");
}
.base-dialog-native__btn--cancel {
  background: v-bind("tokens.semantic.colorDivider");
}
.base-dialog-native__btn-text {
  font-size: v-bind("tokens.semantic.fontSizeBody");
  color: v-bind("tokens.semantic.colorActionText");
}
.base-dialog-native__btn-text--cancel {
  color: v-bind("tokens.semantic.colorTextSecondary");
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
