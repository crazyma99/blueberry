<script setup lang="ts">
// 门面：options 用业务平面结构 {label,value}；confirm 只回传纯值数组，不透传 Wot 内部对象。
// 事实源：wot info Picker（v-model 数组/v-model:visible/columns/value-key/label-key；emits confirm/cancel）。
// 方案 A（migration §8.12）：
//  - 非抖音端保持 wd-picker 链，新增 rootPortal prop（默认 true；wd-picker types.ts:115 自带该 prop，
//    抖音端 wot 为 no-op、微信/支付宝/H5 生效）。
//  - 抖音端门面自绘降级：底部面板（纯 view+fixed，不经 wd-popup/wd-picker 组件链）＋取消/确认/清空交互。
//  对外合同（props/emits/expose）不变；confirm/cancel/clear 事件语义两条分支完全一致。
import { ref, watch } from "vue";
import { tokens } from "../generated/tokens";
import { isToutiaoPlatform } from "./ui-platform";

export interface PickerOption {
  label: string;
  value: string | number;
}

const props = withDefaults(
  defineProps<{
    show?: boolean;
    title?: string;
    options?: PickerOption[];
    modelValue?: (string | number)[];
    clearable?: boolean;
    rootPortal?: boolean;
  }>(),
  { show: false, title: "", options: () => [], modelValue: () => [], clearable: false, rootPortal: true },
);

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "confirm", value: (string | number)[]): void;
  (e: "cancel"): void;
  (e: "clear"): void;
  (e: "update:modelValue", value: (string | number)[]): void;
}>();

function onConfirm(value: (string | number)[]) {
  emit("confirm", Array.isArray(value) ? value : []);
  emit("update:show", false);
}
function onCancel() {
  emit("cancel");
  emit("update:show", false);
}
function onVisibleChange(v: boolean) {
  // 仅同步受控状态；confirm/cancel 语义由组件事件承担，避免二次 cancel
  if (!v && props.show) emit("update:show", false);
}
function onClear() {
  emit("clear");
  emit("update:modelValue", []);
}

// 运行时平台分支（抖音自绘；测试可经 setUiPlatformOverride 显式覆盖两条分支）
const useNative = isToutiaoPlatform();

// 抖音自绘分支的选中草稿：打开时从受控值出发，确认才提交（与 wd-picker「选中→确认」语义一致）
const draft = ref<(string | number)[]>([]);
watch(
  () => props.show,
  (visible) => {
    if (visible && useNative) draft.value = [...props.modelValue];
  },
  { immediate: true },
);
function onSelect(value: string | number) {
  draft.value = [value];
}
function onNativeConfirm() {
  onConfirm([...draft.value]);
}
</script>

<template>
  <view class="base-picker">
    <wd-picker
      v-if="!useNative"
      :model-value="modelValue"
      :visible="show"
      :columns="options"
      :title="title"
      :root-portal="rootPortal"
      @confirm="onConfirm"
      @cancel="onCancel"
      @update:visible="onVisibleChange"
    />
    <view v-else-if="show" class="base-picker-native">
      <view class="base-picker-native__mask" @click="onCancel" />
      <view class="base-picker-native__panel">
        <view class="base-picker-native__bar">
          <text class="base-picker-native__btn" @click="onCancel">取消</text>
          <text class="base-picker-native__title">{{ title }}</text>
          <text class="base-picker-native__btn base-picker-native__btn--ok" @click="onNativeConfirm">确定</text>
        </view>
        <scroll-view scroll-y class="base-picker-native__list">
          <view
            v-for="opt in options"
            :key="String(opt.value)"
            class="base-picker-native__item"
            :class="{ 'base-picker-native__item--active': draft.includes(opt.value) }"
            @click="onSelect(opt.value)"
          >
            <text>{{ opt.label }}</text>
          </view>
        </scroll-view>
      </view>
    </view>
    <view
      v-if="clearable && modelValue.length > 0"
      class="base-picker__clear"
      @click="onClear"
    >
      清空
    </view>
  </view>
</template>

<style scoped>
/* 抖音自绘分支：页面级节点 + fixed 底部面板，不经 wd-popup/wd-picker 组件链 */
.base-picker-native {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  animation: base-picker-fade-in v-bind("tokens.semantic.durationModal") ease;
}
.base-picker-native__mask {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.5);
}
.base-picker-native__panel {
  position: relative;
  background: v-bind("tokens.semantic.colorPage");
  border-radius: v-bind("tokens.component.popupRadiusRpx + 'rpx'")
    v-bind("tokens.component.popupRadiusRpx + 'rpx'")
    0 0;
  padding-bottom: v-bind("tokens.semantic.sizeTabBarAvoid");
}
.base-picker-native__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: v-bind("tokens.semantic.sizeHitArea");
  padding: 0 v-bind("tokens.primitive.spaceMd");
  border-bottom: 1rpx solid v-bind("tokens.semantic.colorDivider");
}
.base-picker-native__btn {
  font-size: v-bind("tokens.semantic.fontSizeBody");
  color: v-bind("tokens.semantic.colorTextSecondary");
}
.base-picker-native__btn--ok {
  color: v-bind("tokens.semantic.colorActionText");
  font-weight: 600;
}
.base-picker-native__title {
  font-size: v-bind("tokens.semantic.fontSizeSubTitle");
  color: v-bind("tokens.semantic.colorTextStrong");
}
.base-picker-native__list {
  max-height: 480rpx;
}
.base-picker-native__item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: v-bind("tokens.semantic.sizeHitArea");
  font-size: v-bind("tokens.semantic.fontSizeBody");
  color: v-bind("tokens.semantic.colorTextPrimary");
}
.base-picker-native__item--active {
  color: v-bind("tokens.semantic.colorActionText");
  background: v-bind("tokens.semantic.colorActionSoft");
}
@keyframes base-picker-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
