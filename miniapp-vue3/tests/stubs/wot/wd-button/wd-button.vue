<script setup lang="ts">
// 契约桩：真实 wd-button 的 emit('click') 事实（源码 grep），桩不因 disabled 吞事件——门面守卫须自行拦截
defineProps<{ type?: string; size?: string; block?: boolean; round?: boolean; disabled?: boolean; loading?: boolean }>();
const emit = defineEmits<{ (e: "click", ev: MouseEvent): void }>();
function onClick(ev: MouseEvent) { emit("click", ev); }
</script>
<template>
  <button class="stub-wd-button" :disabled="disabled" @click="onClick"><slot /></button>
</template>
