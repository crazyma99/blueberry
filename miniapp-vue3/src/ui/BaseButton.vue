<script setup lang="ts">
// 门面：统一 label/disabled/busy 与标准 click；业务层不接触 Wot 内部对象。
// 事实源：wot info Button --version 2.3.2（type/variant/size/round/disabled/loading…）。

const props = withDefaults(
  defineProps<{
    label?: string;
    disabled?: boolean;
    busy?: boolean;
    type?: "primary" | "success" | "info" | "warning" | "danger";
    /** wot `variant`（`npx wot info Button` 事实源）：base｜plain｜dashed｜soft｜subtle｜text
     *  —— `plain`＝描边/幽灵按钮、`text`＝纯文字按钮（此前误以为 wot 无变体，2026-09-23 主人纠正） */
    variant?: "base" | "plain" | "dashed" | "soft" | "subtle" | "text";
    /** 透传 wot `custom-class`/`custom-style`（品牌 token 覆盖用；业务方不必接触 wot 内部对象） */
    customClass?: string;
    customStyle?: string;
    size?: "mini" | "small" | "medium" | "large";
    block?: boolean;
    round?: boolean;
  }>(),
  {
    label: "",
    disabled: false,
    busy: false,
    type: "primary",
    variant: "base",
    size: "medium",
    block: false,
    round: false,
    customClass: "",
    customStyle: "",
  },
);

const emit = defineEmits<{ (e: "click"): void }>();

// 守卫：禁用/忙态一律不放行（防重复提交，P1-24）
function onClick() {
  if (props.disabled || props.busy) return;
  emit("click");
}
</script>

<template>
  <wd-button
    :type="type"
    :variant="variant"
    :custom-class="customClass"
    :custom-style="customStyle"
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
