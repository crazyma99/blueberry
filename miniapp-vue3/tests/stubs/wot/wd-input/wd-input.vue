<script setup lang="ts">
// 契约桩：真实 wd-input emits＝input/blur/clear/confirm/focus（源码 grep 事实）
defineProps<{ modelValue?: string; placeholder?: string; disabled?: boolean; clearable?: boolean; type?: string }>();
const emit = defineEmits<{
  (e: "update:modelValue", v: string): void;
  (e: "input", v: string): void;
  (e: "blur"): void;
  (e: "clear"): void;
}>();
function onInput(ev: Event) {
  const v = (ev.target as HTMLInputElement).value;
  emit("update:modelValue", v);
  emit("input", v);
}
</script>
<template>
  <input class="stub-wd-input" :value="modelValue" :placeholder="placeholder" @input="onInput" @blur="emit('blur')" />
</template>
