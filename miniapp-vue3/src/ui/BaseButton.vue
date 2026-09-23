<script setup lang="ts">
// 门面：统一 label/disabled/busy 与标准 click；业务层不接触 Wot 内部对象。
// 事实源：wot info Button --version 2.3.2（type/variant/size/round/disabled/loading…）。

import { hapticTap } from "../application/haptics";

const props = withDefaults(
  defineProps<{
    label?: string;
    disabled?: boolean;
    busy?: boolean;
    type?: "primary" | "success" | "info" | "warning" | "danger";
    size?: "mini" | "small" | "medium" | "large";
    block?: boolean;
    round?: boolean;
  }>(),
  { label: "", disabled: false, busy: false, type: "primary", size: "medium", block: false, round: false },
);

const emit = defineEmits<{ (e: "click"): void }>();

// 守卫：禁用/忙态一律不放行（防重复提交，P1-24）
function onClick() {
  if (props.disabled || props.busy) return;
  // 触感反馈：门面按钮统一（主人 2026-09-23「Popup 内的按钮缺少震动反馈和按压效果」）
  hapticTap();
  emit("click");
}
</script>

<template>
  <wd-button
    :type="type"
    :size="size"
    :block="block"
    :round="round"
    :disabled="disabled"
    :loading="busy"
    @click="onClick"
  >
    <slot>{{ label }}</slot>
  </wd-button>
</template>
