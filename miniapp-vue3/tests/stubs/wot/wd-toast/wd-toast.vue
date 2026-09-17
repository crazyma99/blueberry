<script setup lang="ts">
// 契约桩：真实 wd-toast 为受控 show prop（types.ts 事实：show?: boolean），无内部 emit
defineProps<{ show?: boolean; msg?: string; iconName?: string }>();
</script>
<template>
  <div v-if="show" class="stub-wd-toast">{{ msg }}</div>
</template>
