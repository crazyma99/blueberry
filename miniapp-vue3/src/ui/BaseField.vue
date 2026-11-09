<script setup lang="ts">
// 门面：label/modelValue/placeholder/disabled/clearable/type 与标准 update:modelValue/blur/clear（对外合同不变）。
//
// ⭐实现（2026-11 真机批次 2，主人 trial-m2b 反馈：「wd-input 原生样式、直角白框」「label 紧贴输入框且在深色 sheet 上看不见」）：
//  内部由 <wd-input> 改为**原生 <input> + 完整 token 化样式**——与 C 端预约页/ProfilePopup 的表单写法一致，跨端稳定
//  （wd-input 的白底直角来自 --wot-input-* 变量，抖音 TTSS 不吃 CSS 变量；原生 input 两端行为一致，软键盘由系统负责）。
//  样式：圆角 18rpx、半透明金底、金色细边框、焦点态金色边框、placeholder 用 muted 金（placeholder-style，token 取值）、字号 $font-size-body；
//  label：次要文字色、caption 字号、与输入框之间 12rpx 间距（深色 sheet 与浅色页均读 token，可读）。
//  行为：type（text/number/digit/idcard/tel 透传为原生键盘类型）、disabled（不可编辑 + 降透明度）、clearable（有值且非禁用时显示 ×，
//  点击清空并发 clear + update:modelValue ""）均保留。
import { ref } from "vue";
import { hapticTap } from "../application/haptics";
import { INPUT_PLACEHOLDER_STYLE, valueFromInputEvent, type FieldType } from "./field-theme";

const props = withDefaults(
  defineProps<{
    label?: string;
    modelValue?: string;
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    type?: FieldType;
  }>(),
  { label: "", modelValue: "", placeholder: "请输入", disabled: false, clearable: false, type: "text" },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "blur"): void;
  (e: "clear"): void;
}>();

const focused = ref(false);

function onInput(e: unknown) {
  emit("update:modelValue", valueFromInputEvent(e));
}
function onFocus() {
  focused.value = true;
}
function onBlur() {
  focused.value = false;
  emit("blur");
}
function onClear() {
  if (props.disabled) return;
  hapticTap(); // 弹层内交互：触感统一（主人 2026-09-23）
  emit("update:modelValue", "");
  emit("clear");
}
</script>

<template>
  <view class="base-field">
    <text v-if="label" class="base-field__label">{{ label }}</text>
    <view :class="['base-field__box', focused ? 'is-focused' : '', disabled ? 'is-disabled' : '']">
      <input
        class="base-field__input"
        :value="modelValue"
        :type="type"
        :placeholder="placeholder"
        :placeholder-style="INPUT_PLACEHOLDER_STYLE"
        :disabled="disabled"
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
      />
      <view v-if="clearable && modelValue !== '' && !disabled" class="base-field__clear" hover-class="press-dim" @click="onClear">
        <text class="base-field__clear-text">×</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.base-field {
  display: flex;
  flex-direction: column;
  margin-bottom: $space-md;
}
.base-field__label {
  display: block;
  margin-bottom: 12rpx;
  font-size: $font-size-caption;
  color: $color-text-secondary;
}
.base-field__box {
  display: flex;
  flex-direction: row;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  height: $size-hit-area;
  padding: 0 $space-md;
  border-radius: 18rpx;
  border: 2rpx solid $color-border;
  background: rgba(241, 205, 145, 0.06);
}
.base-field__box.is-focused {
  border-color: $color-action;
}
.base-field__box.is-disabled {
  opacity: 0.5;
}
.base-field__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  font-size: $font-size-body;
  color: $color-text-primary;
}
.base-field__clear {
  flex-shrink: 0;
  width: 56rpx;
  height: 56rpx;
  margin-left: $space-sm;
  display: flex;
  align-items: center;
  justify-content: center;
}
.base-field__clear-text {
  font-size: $font-size-title;
  line-height: 1;
  color: $color-text-muted;
}
</style>
