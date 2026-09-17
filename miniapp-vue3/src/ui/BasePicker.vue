<script setup lang="ts">
// 门面：options 用业务平面结构 {label,value}；confirm 只回传纯值数组，不透传 Wot 内部对象。
// 事实源：wot info Picker（v-model 数组/v-model:visible/columns/value-key/label-key；emits confirm/cancel）。

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
  }>(),
  { show: false, title: "", options: () => [], modelValue: () => [], clearable: false },
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
</script>

<template>
  <view class="base-picker">
    <wd-picker
      :model-value="modelValue"
      :visible="show"
      :columns="options"
      :title="title"
      @confirm="onConfirm"
      @cancel="onCancel"
      @update:visible="onVisibleChange"
    />
    <view
      v-if="clearable && modelValue.length > 0"
      class="base-picker__clear"
      @click="onClear"
    >
      清空
    </view>
  </view>
</template>
