<script setup lang="ts">
// T8 S2：AI 试衣「模板与身形/年龄选择」区块（旧端 aiTryOn/index.uvue 模板 1–54 行忠实移植）。
// 拆为独立组件的原因：新端按「组件纯展示、数据与业务留页面」的既有口径（同 P2-21），便于单测与后续 S3/S4 装配。
// 旧端事实：提示条「左右横向滑动支持切换模板」（:5-7）；主 swiper circular＋current 联动（:11-21，change→
// e.detail.current，:399-401）；缩略图横滑条可折叠（默认展开，箭头 down.svg 旋转，:24-38/:404-407）、
// 点击缩略图直达（:409-411）；体型 AppSegment(['瘦','微胖','胖'])＋年龄 AppSelector(ageOptions)（:41-54）。
// 缩略图尺寸：主图 cosThumb 750、缩略 cosThumb 200（旧 :302-309）。
// 主题口径：本区块随 aiTryOn 页保持旧端**深色底**（与 BottomActionBar 同口径；页面装配时声明底色决策）。
// 有意偏差（已声明）：①cosThumb 复用新端 application/image（语义等价）；②旧端 --color-surface/--color-primary-30/-70
// 等派生色按 rgba 字面值＋注释；③无请求、无生命周期（纯展示，选择结果经事件抛给页面）。
import { ref } from "vue";
import { cosThumb } from "../../application/image";
import AppSegment from "../AppSegment/AppSegment.vue";
import AppSelector from "../AppSelector/AppSelector.vue";

export interface AiTemplateItem {
  id?: number;
  imageUrl?: string;
}

const props = withDefaults(
  defineProps<{
    templates?: AiTemplateItem[];
    currentIndex?: number;
    bodyIndex?: number;
    ageOptions?: string[];
    ageIndex?: number;
  }>(),
  { templates: () => [], currentIndex: 0, bodyIndex: 0, ageOptions: () => [], ageIndex: 0 },
);

const emit = defineEmits<{
  (e: "change", index: number): void;
  (e: "select", index: number): void;
  (e: "toggle-strip"): void;
  (e: "body-change", index: number): void;
  /** 年龄：透传 AppSelector 的原生 picker 值（mp-weixin 下可能为字符串下标，旧端 selectAge 兼容两形态） */
  (e: "age-change", index: number | string): void;
}>();

// 缩略条折叠（旧端 :404-407：默认展开）
const thumbCollapsed = ref(false);

function onSwiperChange(e: unknown): void {
  const current = (e as { detail?: { current?: unknown } } | undefined)?.detail?.current;
  emit("change", typeof current === "number" ? current : 0);
}
function toggleThumbStrip(): void {
  thumbCollapsed.value = !thumbCollapsed.value;
  emit("toggle-strip");
}
function tplThumb(url: string | undefined): string {
  return cosThumb(url ?? "", 750);
}
function thThumb(url: string | undefined): string {
  return cosThumb(url ?? "", 200);
}
</script>

<template>
  <view class="picker-block">
    <!-- 提示条（旧 :5-7） -->
    <view class="tip-bar">
      <text class="tip-text">左右横向滑动支持切换模板</text>
    </view>

    <!-- 主图轮播（旧 :11-21） -->
    <view class="swiper-wrap">
      <swiper class="template-swiper" :circular="true" :current="props.currentIndex" @change="onSwiperChange">
        <swiper-item v-for="(item, index) in props.templates" :key="index">
          <image class="template-img" :src="tplThumb(item.imageUrl)" mode="aspectFill"></image>
        </swiper-item>
      </swiper>
    </view>

    <!-- 缩略图横滑条（旧 :24-38） -->
    <view class="thumb-strip">
      <view class="thumb-strip-head" @click="toggleThumbStrip">
        <image
          class="thumb-strip-arrow"
          :class="thumbCollapsed ? '' : 'thumb-strip-arrow-up'"
          src="/static/iconpark/down.svg"
          mode="aspectFit"
        ></image>
        <text class="thumb-strip-label">模板快速选择（{{ props.templates.length }}）</text>
      </view>
      <scroll-view v-if="!thumbCollapsed" class="thumb-scroll" scroll-x :show-scrollbar="false">
        <view class="thumb-list">
          <view
            v-for="(item, index) in props.templates"
            :key="index"
            class="thumb-item"
            :class="index === props.currentIndex ? 'thumb-item-active' : ''"
            @click="emit('select', index)"
          >
            <image class="thumb-img" :src="thThumb(item.imageUrl)" mode="aspectFill" lazy-load></image>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 体型（旧 :41-48；AppSegment → 下标，页面映射 slim/medium/fat） -->
    <view class="section">
      <text class="section-label">选择您的体型：</text>
      <AppSegment :options="['瘦', '微胖', '胖']" :current-index="props.bodyIndex" @change="emit('body-change', $event)" />
    </view>

    <!-- 年龄（旧 :51-54；AppSelector → 下标或事件对象，页面按旧端兼容写法收） -->
    <view class="section">
      <text class="section-label">选择您的年龄：</text>
      <AppSelector :options="props.ageOptions" :value-index="props.ageIndex" @change="emit('age-change', $event)" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.picker-block {
  width: 100%;
}
/* 提示条（旧 :5-7）——深色底上的白 50%（与页面底色口径一致） */
.tip-bar {
  padding: 20rpx 0; /* 旧 --spacing-sm=20rpx */
  display: flex;
  align-items: center;
  justify-content: center;
}
.tip-text {
  font-size: 26rpx; /* 旧 --font-size-body-lg=26rpx（≠ tokens fontSizeBody 32rpx，硬编码还原） */
  color: rgba(255, 255, 255, 0.5);
}
.swiper-wrap {
  width: 100%;
  padding: 0 0 20rpx;
}
.template-swiper {
  width: 100%;
  height: 780rpx;
}
.template-img {
  width: 100%;
  height: 780rpx;
}
/* 缩略条（旧 :24-38 样式；--color-surface 深色面板按旧值近似，--color-primary-30=金 30%） */
.thumb-strip {
  margin: 20rpx 20rpx 24rpx;
  border: 1rpx solid rgba(241, 205, 145, 0.3);
  border-radius: 24rpx; /* 旧 --radius-container=24rpx */
  background: rgba(255, 255, 255, 0.04); /* 旧 --color-surface 近似（深色面板） */
  overflow: hidden;
}
.thumb-strip-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10rpx; /* 旧 --spacing-xs=10rpx */
  padding: 20rpx;
}
.thumb-strip-arrow {
  width: 32rpx;
  height: 32rpx;
  transition: transform 200ms ease;
}
/* 展开时箭头朝上（旧 :26 三元 class 语义） */
.thumb-strip-arrow-up {
  transform: rotate(180deg);
}
.thumb-strip-label {
  font-size: 24rpx; /* 旧 --font-size-body=24rpx */
  color: rgba(241, 205, 145, 0.7); /* 旧 --color-primary-70 */
}
.thumb-scroll {
  width: 100%;
  height: 132rpx;
  flex-direction: row;
}
.thumb-list {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
  padding: 4rpx 20rpx 20rpx; /* 旧 --spacing-2xs 近似 4rpx */
}
.thumb-item {
  width: 100rpx;
  height: 100rpx;
  flex-shrink: 0;
  border-radius: 8rpx; /* 旧 --radius-sm=8rpx */
  overflow: hidden;
  border: 3rpx solid transparent;
}
.thumb-item-active {
  border-color: $color-action; /* 选中态金描边（旧 :32 三元 class） */
}
.thumb-img {
  width: 100%;
  height: 100%;
}
/* 选择区（旧 :41-54） */
.section {
  padding: 24rpx 40rpx;
}
.section-label {
  font-size: 28rpx; /* 旧 --font-size-body-plus=28rpx */
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 20rpx;
  display: block;
}
</style>
