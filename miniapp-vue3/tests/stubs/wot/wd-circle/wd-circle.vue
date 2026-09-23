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
    text?: string;
    customClass?: string;
  }>(),
  { modelValue: 0, size: 120, strokeWidth: 18, color: "#1C64FD", layerColor: "#F2F3F5", speed: 50, customClass: "", text: "" },
);
</script>

<template>
  <!-- 忠实镜像 wot `wd-circle.vue:10` 的 `v-if="!text"`：传了 text 就不渲染中心 slot（CR 🟡4/M9） -->
  <view class="stub-wd-circle" :data-value="modelValue"><slot v-if="!text" /></view>
</template>
