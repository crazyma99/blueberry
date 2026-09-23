<script setup lang="ts">
// wot `wd-circle` 测试桩（门面 BaseCircle 的契约断言用）：暴露 props、渲染默认 slot
withDefaults(
  defineProps<{
    modelValue?: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
    layerColor?: string;
    speed?: number;
    customClass?: string;
  }>(),
  { modelValue: 0, size: 120, strokeWidth: 18, color: "#1C64FD", layerColor: "#F2F3F5", speed: 50, customClass: "" },
);
</script>

<template>
  <view class="stub-wd-circle" :data-value="modelValue"><slot /></view>
</template>
