<script setup lang="ts">
// 契约桩：真实 wd-popup emits＝close/click-modal/before-enter…（源码 grep 事实）＋rootPortal prop（types.ts:105，默认 false）
defineProps<{ modelValue?: boolean; position?: string; closable?: boolean; rootPortal?: boolean }>();
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void; (e: "close"): void; (e: "click-modal"): void }>();
function onClose() { emit("close"); emit("update:modelValue", false); }
</script>
<template>
  <div class="stub-wd-popup">
    <slot />
    <button class="stub-close" @click="onClose">x</button>
  </div>
</template>
