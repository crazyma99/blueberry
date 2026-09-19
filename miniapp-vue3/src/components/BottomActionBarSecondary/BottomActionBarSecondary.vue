<script setup lang="ts">
// BottomActionBarSecondary — 底部固定栏（次级款，组件级重构）
// 旧端源：/home/majunhi/blueberry/src/components/BottomActionBarSecondary/BottomActionBarSecondary.uvue（51 行）
// 忠实移植：模板 :14-18；props :22-28；computed :29-34；样式 :37-50。
//
// 与 BottomActionBar 同款容器（渐变遮罩 + 64/24 节奏 + 12rpx 底部），但不内置版权 footer，
// 用于接入次级操作（如我的页退出登录按钮）。
// - bottomOffset：底部偏移（tab 页需上移避开底部 tabbar），传完整 CSS bottom 值，默认贴底 0
// - 按钮由默认插槽传入
//
// 使用：
// <BottomActionBarSecondary bottomOffset="calc(116rpx + env(safe-area-inset-bottom))">
//   <button class="xxx">退出登录</button>
// </BottomActionBarSecondary>
//
// token 映射：旧 var(--color-bg) #160F04 为「页面底色」（非金色面上的墨色文字）；
// tokens.semantic.colorPage 已于 2026-09-19 恢复深色 #160F04，与旧值一致；此处仍按旧值硬编码保留深色底。
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    bottomOffset?: string;
  }>(),
  { bottomOffset: "" },
);

// 旧端 :29-33 computed.barStyle：空串则不输出 bottom（贴底 0），否则输出完整 bottom 值
const barStyle = computed(() => (props.bottomOffset !== "" ? "bottom: " + props.bottomOffset + ";" : ""));
</script>

<template>
  <view class="bottom-bar-secondary" :style="barStyle">
    <slot />
  </view>
</template>

<style scoped>
.bottom-bar-secondary {
  position: fixed;
  left: 0;
  bottom: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 64rpx 0 24rpx 0;
  padding-bottom: 30rpx;
  background: linear-gradient(to top, #160F04 59.6%, rgba(22, 15, 4, 0)); /* 旧 var(--color-bg) #160F04 */
  z-index: 100;
}
</style>
