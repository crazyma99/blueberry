<script setup lang="ts">
// AppSegment — 分段控制器（组件化 · 品牌视觉：金色渐变胶囊选中态）
// 旧端源：/home/majunhi/blueberry/src/components/AppSegment/AppSegment.uvue（66 行）
// 忠实移植：模板 :6-18；props :23-26；emits :27；方法 :28-32；样式 :36-66。
//
// 契约（与旧端逐字）：
//   props  options: string[]（默认 []）／currentIndex: number（默认 0）
//   emits  change —— **载荷＝纯下标 number**（旧端 :30 `this.$emit('change', index)`）
//          消费方 aiTryOn.vue 旧 :417-419 `onBodyChange(index: number)` 直接 `types[index]` 取值，
//          不做 e.detail 解包 ⇒ 新端页面 handler 也必须按 number 收。
// 纯展示组件：无 mounted/onMounted 取数、无 client/仓储/uni.request；交互只 emit。
// 容器安全：本组件不使用任何 uni/wx API（唯一平台相关项是模板属性 hover-class，非 API）。
//
// 与旧端的有意偏差：**零**（结构/样式/文案/交互逐行对应；仅把 `methods.emit` 改名为 `onItemTap`，
// 因 <script setup> 中 `emit` 已是 defineEmits 返回的函数名，属内部命名，对外行为不变）。
//
// token 映射（旧端 App.uvue 全局 CSS 变量 → 新端 tokens.ts / 硬编码，口径同 BottomActionBarSecondary/LoginPopup）：
//   --gradient-btn-primary → 硬编码 linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%)（App.uvue:92 同值）
//   --color-bg #160F04     → v-bind("tokens.semantic.colorActionText")（同值 #160F04；此处语义＝金色胶囊上的墨色文字，语义相符）
//   --radius-full 999rpx   → 硬编码 999rpx（App.uvue:106；tokens.component.popupRadiusRpx=24rpx 为不同档位）
//   --font-size-body 24rpx → 硬编码 24rpx（App.uvue:128；**注意** ≠ tokens.semantic.fontSizeBody=32rpx 档，不可误映射）
// hover-class="press-dim"：旧端为 App.uvue 全局类（:139-141 opacity:.82），新端由 App.vue 全局样式
//   提供（与旧端逐字一致），本组件仅引用不定义（2026-09-18 删除迁移期 scoped 临时副本）。

withDefaults(
  defineProps<{
    options?: string[];
    currentIndex?: number;
  }>(),
  { options: () => [], currentIndex: 0 },
);

const emit = defineEmits<{
  (e: "change", index: number): void;
}>();

// 旧端 methods.emit（:28-32）：点击第 index 项即回传下标
function onItemTap(index: number): void {
  emit("change", index);
}
</script>

<template>
  <view class="app-segment">
    <view
      v-for="(opt, index) in options"
      :key="index"
      :class="index === currentIndex ? 'app-segment-item is-active' : 'app-segment-item'"
      hover-class="press-dim"
      @click="onItemTap(index)"
    >
      <text :class="index === currentIndex ? 'app-segment-text is-active' : 'app-segment-text'">{{ opt }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.app-segment {
  display: flex;
  flex-direction: row;
  background: rgba(255, 255, 255, 0.06);
  border: 2rpx solid rgba(255, 255, 255, 0.1);
  border-radius: 999rpx; /* 旧 --radius-full=999rpx（App.uvue:106） */
  padding: 8rpx;
}
.app-segment-item {
  flex: 1;
  height: 68rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx; /* 旧 --radius-full=999rpx */
  transition: background 0.15s ease-out;
}
.app-segment-item.is-active {
  /* 旧 --gradient-btn-primary（App.uvue:92 同值；tokens 无该渐变档） */
  background: linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%);
}
.app-segment-text {
  font-size: 24rpx; /* 旧 --font-size-body=24rpx（App.uvue:128，非 tokens 32rpx 档） */
  color: rgba(255, 255, 255, 0.75);
  transition: color 0.15s ease-out;
}
.app-segment-text.is-active {
  color: $color-action-text; /* 旧 --color-bg #160F04 同值 */
  font-weight: 400;
}
</style>
