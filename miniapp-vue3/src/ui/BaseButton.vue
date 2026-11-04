<script setup lang="ts">
// 门面：统一 label/disabled/busy 与标准 click；业务层不接触 Wot 内部对象。
// 事实源：wot info Button --version 2.3.2（type/variant/size/round/disabled/loading…）。

import { computed } from "vue";
import { hapticTap } from "../application/haptics";
import { defaultButtonStyle } from "./button-theme";

const props = withDefaults(
  defineProps<{
    label?: string;
    disabled?: boolean;
    busy?: boolean;
    type?: "primary" | "success" | "info" | "warning" | "danger";
    size?: "mini" | "small" | "medium" | "large";
    block?: boolean;
    round?: boolean;
    /** 根节点样式覆盖（CSS 变量串）；不传＝按 type 取默认：primary→品牌金（button-theme.ts），其它 type 空串＝wot 默认 */
    customStyle?: string;
  }>(),
  { label: "", disabled: false, busy: false, type: "primary", size: "medium", block: false, round: false, customStyle: undefined },
);

const resolvedStyle = computed(() => props.customStyle ?? defaultButtonStyle(props.type));

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
    :custom-style="resolvedStyle"
    :disabled="disabled"
    :loading="busy"
    @click="onClick"
  >
    <slot>{{ label }}</slot>
  </wd-button>
</template>
