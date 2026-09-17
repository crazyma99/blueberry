<script setup lang="ts">
// 契约桩：真实 wd-picker emits＝confirm/cancel/open/update:modelValue/update:visible（源码 grep 事实）
defineProps<{ modelValue?: (string | number)[]; visible?: boolean; columns?: unknown; title?: string }>();
const emit = defineEmits<{
  (e: "confirm", v: (string | number)[]): void;
  (e: "cancel"): void;
  (e: "update:modelValue", v: (string | number)[]): void;
  (e: "update:visible", v: boolean): void;
}>();
</script>
<template>
  <div class="stub-wd-picker">
    <button class="stub-confirm" @click="emit('confirm', ['stub-value'])">ok</button>
    <button class="stub-cancel" @click="emit('cancel')">no</button>
  </div>
</template>
