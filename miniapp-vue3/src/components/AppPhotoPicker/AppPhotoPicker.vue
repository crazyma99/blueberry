<script setup lang="ts">
// AppPhotoPicker — 照片选择器（组件化 · 品牌视觉：金色虚线框+氛围光）
// 旧端源：/home/majunhi/blueberry/src/components/AppPhotoPicker/AppPhotoPicker.uvue（116 行）
// 忠实移植：模板 :6-19；props :23-27；emits :28；方法 :29-33（转发点击）；样式 :37-116。
//
// 契约（与旧端逐字）：
//   props  photoUrl: string（默认 ''）／busy: boolean（默认 false）
//   emits  click —— **无载荷**（旧端 :31 `this.$emit(name)` 即 `$emit('click')`）
// 业务边界（旧端 :1-5 注释逐字保留）：**组件只转发点击**，选图/登录检查/上传全部留在页面 handler
//   （aiTryOn 旧 :62 `@click="choosePhoto"`）⇒ 本组件内不得出现 chooseImage/uploadFile/登录态判断。
// 纯展示组件：无 mounted/onMounted 取数、无 client/仓储/uni.request；交互只 emit。
// 容器安全：本组件不调用任何 uni/wx API（<image> 为模板内置组件，非 API 调用）。
//
// 与旧端的有意偏差：**零**（结构/样式/文案「点击上传你的照片 / 上传中...」逐行对应；
//   仅把 `methods.emit(name)` 改为直接调用 defineEmits 的 emit('click')，属内部命名）。
//
// token 映射（旧端 App.uvue 全局 CSS 变量 → 新端 tokens.ts / rgba 字面值，口径同本批既有组件）：
//   --color-primary #F1CD91   → v-bind("tokens.semantic.colorAction")（同值；+圈描边/文字、spinner 顶色）
//   --color-primary-70        → rgba(241, 205, 145, 0.7) 字面值（App.uvue:80，派生透明度色）
//   --radius-container 24rpx  → 硬编码 24rpx（App.uvue:100）
//   --font-size-body-sm 22rpx → 硬编码 22rpx（App.uvue:129；**注意** ≠ tokens.semantic.fontSizeCaption=26rpx 档）
//   其余派生透明度色（旧端即字面 rgba，非变量）：虚线框 .45／底色 .04／氛围光 .16→0／spinner 圈 .3 —— 均按旧端原值保留。
// hover-class="press-dim"：旧端 App.uvue 全局类（:139-141 opacity:.82），新端 App.vue 样式为空，
//   按 LoginPopup 既有口径在 scoped 内就地还原（见文末 .press-dim）。
import { tokens } from "../../generated/tokens";

withDefaults(
  defineProps<{
    photoUrl?: string;
    busy?: boolean;
  }>(),
  { photoUrl: "", busy: false },
);

const emit = defineEmits<{
  (e: "click"): void;
}>();
</script>

<template>
  <view class="app-photo-picker" hover-class="press-dim" @click="emit('click')">
    <view class="picker-aura"></view>
    <image v-if="photoUrl" class="picker-image" :src="photoUrl" mode="widthFix"></image>
    <view v-else class="picker-placeholder">
      <view class="picker-plus">+</view>
      <text class="picker-hint">点击上传你的照片</text>
    </view>
    <view v-if="busy" class="picker-mask">
      <view class="picker-loading"></view>
      <text class="picker-mask-text">上传中...</text>
    </view>
  </view>
</template>

<style scoped>
.app-photo-picker {
  position: relative;
  width: 100%;
  min-height: 320rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3rpx dashed rgba(241, 205, 145, 0.45); /* 旧端字面值（金色 45% 虚线框） */
  border-radius: 24rpx; /* 旧 --radius-container=24rpx（App.uvue:100） */
  background: rgba(241, 205, 145, 0.04); /* 旧端字面值（金色 4% 底） */
  overflow: hidden;
}
/* 金色氛围光 */
.picker-aura {
  position: absolute;
  top: -60rpx;
  left: 50%;
  width: 360rpx;
  height: 180rpx;
  margin-left: -180rpx;
  background: radial-gradient(ellipse 50% 50% at 50% 50%, rgba(241, 205, 145, 0.16), rgba(241, 205, 145, 0) 70%);
  pointer-events: none;
}
.picker-image {
  width: 100%;
  min-height: 320rpx;
}
.picker-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx 0;
}
.picker-plus {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  border: 3rpx solid v-bind("tokens.semantic.colorAction"); /* 旧 --color-primary #F1CD91 */
  color: v-bind("tokens.semantic.colorAction");
  font-size: 52rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20rpx;
}
.picker-hint {
  font-size: 22rpx; /* 旧 --font-size-body-sm=22rpx（App.uvue:129，非 tokens 26rpx 档） */
  color: rgba(241, 205, 145, 0.7); /* 旧 --color-primary-70（App.uvue:80） */
}
.picker-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.picker-loading {
  width: 48rpx;
  height: 48rpx;
  border: 4rpx solid rgba(241, 205, 145, 0.3); /* 旧端字面值（金色 30%） */
  border-top-color: v-bind("tokens.semantic.colorAction"); /* 旧 --color-primary #F1CD91 */
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16rpx;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.picker-mask-text {
  font-size: 22rpx; /* 旧 --font-size-body-sm=22rpx（App.uvue:129） */
  color: #fff;
}

/* 全局按压反馈（旧 App.uvue :139-141 就地还原，hover-class 引用） */
.press-dim {
  opacity: 0.82;
}
</style>
