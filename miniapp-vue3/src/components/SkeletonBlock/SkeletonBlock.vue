<script setup lang="ts">
// 骨架块（旧端 SkeletonBlock.uvue 忠实移植）：宽/高/圆角可配。
// 背景 rgba(255,255,255,0.08) 为旧端固定值（暗底占位微光，非 token 语义，保持原值）。
// virtualHost（2026-09-19）：宿主透明化——旧端 uvue 组件编译即宿主透明；新端默认宿主节点在抖音端
// 不按块级撑开，内部 width:48%/100% 相对宿主解析出错（首页骨架卡片重合→归零缺块的根因）。
defineOptions({
  options: { virtualHost: true },
});

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
