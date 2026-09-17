<script setup lang="ts">
// 门面：label/modelValue/placeholder/disabled/clearable 与标准 update:modelValue/blur/clear。
// 事实源：wot info Input（v-model/type/placeholder/clearable…；emits input/blur/clear/confirm/focus）。

withDefaults(
  defineProps<{
    label?: string;
    modelValue?: string;
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    type?: "text" | "number" | "digit" | "idcard" | "tel";
  }>(),
  { label: "", modelValue: "", placeholder: "请输入", disabled: false, clearable: false, type: "text" },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "blur"): void;
  (e: "clear"): void;
}>();

function onInput(v: string | number) {
  emit("update:modelValue", v == null ? "" : String(v));
}
function onBlur() {
  emit("blur");
}
function onClear() {
  emit("clear");
}
</script>

<template>
  <view class="base-field">
    <text v-if="label" class="base-field__label">{{ label }}</text>
    <wd-input
      :model-value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :clearable="clearable"
      :type="type"
      @update:model-value="onInput"
      @blur="onBlur"
      @clear="onClear"
    />
  </view>
</template>
