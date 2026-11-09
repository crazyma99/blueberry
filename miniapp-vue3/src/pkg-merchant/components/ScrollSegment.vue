<script setup lang="ts">
// 横滑分段（商家预约状态筛选 · issue #14）：视觉沿用 AppSegment（金色渐变选中胶囊 / 半透明轨道 / 同字号，同 token），
// 但 AppSegment 是**等宽 flex:1 不可横滑**（8 个状态放不下）⇒ 在商家分包内包一层 scroll-x，选中项自动滚到可见位置。
// 不改共享 AppSegment（C 端 AI 试衣在用，change 载荷是纯下标 number——本组件保持同样的载荷口径，页面接线一致）。
// 事件：只 emit("change", index: number)。无任何平台 API。
import { computed } from "vue";

const props = withDefaults(defineProps<{ options?: string[]; currentIndex?: number }>(), { options: () => [], currentIndex: 0 });
const emit = defineEmits<{ (e: "change", index: number): void }>();

/** scroll-view 的 scroll-into-view 需要元素 id；选中项前留出一格，让它不贴边 */
const intoView = computed(() => "seg-" + Math.max(0, props.currentIndex - 1));

function onItemTap(index: number): void {
  emit("change", index);
}
</script>

<template>
  <scroll-view class="scroll-segment" scroll-x :show-scrollbar="false" :scroll-into-view="intoView" scroll-with-animation>
    <view class="seg-track">
      <view
        v-for="(opt, index) in options"
        :id="'seg-' + index"
        :key="index"
        :class="index === currentIndex ? 'seg-item is-active' : 'seg-item'"
        hover-class="press-dim"
        @click="onItemTap(index)"
      >
        <text :class="index === currentIndex ? 'seg-text is-active' : 'seg-text'">{{ opt }}</text>
      </view>
    </view>
  </scroll-view>
</template>

<style lang="scss" scoped>
.scroll-segment {
  width: 100%;
  white-space: nowrap;
}
.seg-track {
  display: inline-flex;
  flex-direction: row;
  background: rgba(255, 255, 255, 0.06);
  border: 2rpx solid rgba(255, 255, 255, 0.1);
  border-radius: 999rpx;
  padding: 8rpx;
}
.seg-item {
  flex-shrink: 0;
  height: 68rpx;
  padding: 0 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  transition: background 0.15s ease-out;
}
.seg-item.is-active {
  background: linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%);
}
.seg-text {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.75);
  transition: color 0.15s ease-out;
}
.seg-text.is-active {
  color: $color-action-text;
  font-weight: 400;
}
</style>
