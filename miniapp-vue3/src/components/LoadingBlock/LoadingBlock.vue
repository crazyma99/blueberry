<script setup lang="ts">
// 通用加载块（旧端 LoadingBlock.uvue 移植）：金色旋转圈＋浅金文字。
// 派生色说明：旧端 --color-primary-20/-70 为金色 20%/70% 透明度派生；
// 新端 token 仅有实色 gold(#F1CD91=rgb(241,205,145))，故按同值 rgba 派生并注明。
withDefaults(defineProps<{ text?: string }>(), { text: "加载中…" });
</script>

<template>
  <view class="loading-block">
    <view class="loading-spinner" />
    <text v-if="text !== ''" class="loading-text">{{ text }}</text>
  </view>
</template>

<style lang="scss" scoped>
.loading-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.loading-spinner {
  width: 80rpx;
  height: 80rpx;
  border: 6rpx solid rgba(241, 205, 145, 0.2);
  border-top-color: $color-action;
  border-radius: 999rpx;
  animation: spin 1s linear infinite;
}
.loading-text {
  margin-top: $space-md;
  font-size: $font-size-body;
  color: rgba(241, 205, 145, 0.7);
  font-weight: 400;
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
