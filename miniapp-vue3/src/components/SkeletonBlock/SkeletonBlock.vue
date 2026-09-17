<script setup lang="ts">
// 骨架块（旧端 SkeletonBlock.uvue 忠实移植）：宽/高/圆角可配。
// 背景 rgba(255,255,255,0.08) 为旧端固定值（暗底占位微光，非 token 语义，保持原值）。
withDefaults(
  defineProps<{
    width?: string;
    height?: string;
    radius?: string;
  }>(),
  { width: "100%", height: "32rpx", radius: "8rpx" },
);
</script>

<template>
  <view
    class="sk-block-root"
    :style="{ width: width, height: height, borderRadius: radius }"
  />
</template>

<style scoped>
.sk-block-root {
  display: block;
  background: rgba(255, 255, 255, 0.08);
}
</style>
