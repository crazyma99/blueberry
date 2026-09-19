<script setup lang="ts">
// AppSelector — 通用下拉选择器（组件化 · 品牌视觉：深色面板+金色箭头+选中发光）
// 旧端源：/home/majunhi/blueberry/src/components/AppSelector/AppSelector.uvue（58 行）
// 忠实移植：模板 :6-13；props :18-21；emits :22；方法 :23-27（`$emit('change', e.detail.value)`）；样式 :31-58。
//
// 契约（与旧端逐字）：
//   props  options（旧端 `{ type: Array as any[], default: () => [] }`，未定元素类型；实际消费方 aiTryOn
//          旧 :169 `ageOptions: ['10岁及以下', …]` 为 string[] ⇒ 新端收窄为 string[] 并注释来源）
//          valueIndex: number（默认 0）
//   emits  change —— **载荷＝原生 picker change 事件的 `e.detail.value`（选项下标），不是事件对象本身**
//          （旧端 :25 `this.$emit('change', e.detail.value)`）。
//          ⚠️ 平台口径：旧端 uni-app x / uvue 下为 number；新端 mp-weixin 原生 `<picker mode="selector">`
//          bindchange 的 detail.value 可能为**字符串形态下标**。消费方 aiTryOn 旧 :423-428 `selectAge(e: any)`
//          已用 `(e != null && e.detail != null) ? e.detail.value : e` 兼容「直接下标 or 事件对象」两种形态，
//          **但对字符串下标不做 Number() 转换** ⇒ 新端页面接线时应按旧端同款写法兜底（`ageOptions[index]`
//          与 `:value` 对字符串下标均可正常工作，行为等价）。此处保持旧端原样透传，不自行加转换（禁「顺手优化」）。
// 纯展示组件：无 mounted/onMounted 取数、无 client/仓储/uni.request；交互只 emit。
// 容器安全：本组件不调用任何 uni/wx API（picker 为模板内置组件，非 API 调用）。
//
// 与旧端的有意偏差：**零**（模板/样式/文案「请选择」逐行对应；仅把 `methods.onChange` 内部实现原样搬入）。
//
// token 映射（旧端 App.uvue 全局 CSS 变量 → 新端 tokens.ts / 硬编码，口径同 BottomActionBarSecondary/LoginPopup）：
//   --color-primary #F1CD91 → v-bind("tokens.semantic.colorAction")（同值）
//   --radius-item 18rpx     → 硬编码 18rpx（App.uvue:98；tokens 无该档位）
//   --font-size-body 24rpx  → 硬编码 24rpx（App.uvue:128；**注意** ≠ tokens.semantic.fontSizeBody=32rpx 档）
//   color: #fff             → 硬编码 #fff（旧端即字面色值，非变量）
// hover-class="press-dim"：旧端 App.uvue 全局类（:139-141 opacity:.82），新端由 App.vue 全局样式
//   提供（与旧端逐字一致），本组件仅引用不定义（2026-09-18 删除迁移期 scoped 临时副本）。

withDefaults(
  defineProps<{
    options?: string[];
    valueIndex?: number;
  }>(),
  { options: () => [], valueIndex: 0 },
);

const emit = defineEmits<{
  (e: "change", index: number | string): void;
}>();

// 旧端 methods.onChange（:23-27）：透传原生 picker 事件的 detail.value
function onChange(e: { detail: { value: number | string } }): void {
  emit("change", e.detail.value);
}
</script>

<template>
  <picker mode="selector" :range="options" :value="valueIndex" @change="onChange">
    <view class="app-selector" hover-class="press-dim">
      <text class="app-selector-text">{{ options[valueIndex] || '请选择' }}</text>
      <view class="app-selector-arrow"></view>
    </view>
  </picker>
</template>

<style lang="scss" scoped>
.app-selector {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.06);
  border: 2rpx solid rgba(255, 255, 255, 0.12);
  border-radius: 18rpx; /* 旧 --radius-item=18rpx（App.uvue:98） */
  padding: 0 24rpx;
  height: 88rpx;
  box-sizing: border-box;
}
.app-selector-text {
  font-size: 24rpx; /* 旧 --font-size-body=24rpx（App.uvue:128，非 tokens 32rpx 档） */
  color: #fff;
}
/* 金色箭头（CSS 画） */
.app-selector-arrow {
  width: 16rpx;
  height: 16rpx;
  border-right: 3rpx solid $color-action; /* 旧 --color-primary #F1CD91 */
  border-bottom: 3rpx solid $color-action;
  transform: rotate(45deg) translateY(-3rpx);
  margin-left: 16rpx;
}
</style>
