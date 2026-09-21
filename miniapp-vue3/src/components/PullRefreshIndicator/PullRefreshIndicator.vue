<script setup lang="ts">
// 下拉刷新指示器（5 页共用一份实现：首页／客片列表／客片详情／AI试衣记录／价目表 tab）。
// 结构＝玄墨胶囊（token `$color-page`）＋品牌金 30% 描边（`$color-border`）＋门面 `BaseLoading`（金 spinner + 文案，token 默认值）。
// 位置由页面经 `:top` 传入（px 字符串；口径见 `composables/use-pull-refresh.ts`），组件自身不含平台判定。
// 2026-09-21 主人：「自绘金胶囊的内 padding 加大一些」⇒ 内距 8rpx 16rpx → **16rpx 24rpx**（token spaceSm / spaceMd）。
import BaseLoading from "../../ui/BaseLoading.vue";

withDefaults(
  defineProps<{
    /** 是否显示（＝页面 refreshing 态） */
    show?: boolean;
    /** `top` 定位值（px 字符串） */
    top?: string;
    /** 文案（默认「刷新中…」） */
    text?: string;
  }>(),
  { show: false, top: "0px", text: "刷新中…" },
);
</script>

<template>
  <view v-if="show" class="pull-refresh-indicator" :style="{ top }">
    <BaseLoading :text="text" />
  </view>
</template>

<style lang="scss" scoped>
.pull-refresh-indicator {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000; /* 高于品牌馆浮钮 999、低于原生 tabbar */
  padding: $space-sm $space-md; /* 16rpx 24rpx（token；原 8rpx 16rpx） */
  border-radius: 999rpx; /* 胶囊 */
  background: $color-page; /* 玄墨 #160F04（token semantic colorPage） */
  border: 2rpx solid $color-border; /* 品牌金 30%（token semantic colorBorder） */
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.4); /* 浮层投影：暗底用纯黑透明度，非 token 色阶 */
  pointer-events: none; /* 指示器不拦截手势（同 .hero-mask 口径） */
}
</style>
