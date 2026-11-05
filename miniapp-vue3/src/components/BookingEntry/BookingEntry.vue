<script setup lang="ts">
// 到店预约 MVP：首页店铺卡片「到店预约」入口（独立小组件，承载唯一的 #ifdef MP-WEIXIN——
// 宿主页 pages/index/index.vue 需保持零条件编译，见 tests/unit/t86-service-promise-flag.spec.ts 守卫；
// 抖音/小红书不注册 pages/booking ⇒ 入口在两端亦不渲染，无功能缺口，登记见 scripts/scan-platform-usage.mjs
// COMPAT_DECLARATIONS「src/components/BookingEntry/BookingEntry.vue｜MP-WEIXIN」）。
// 跳转也收进本组件的 `#ifdef MP-WEIXIN` 脚本块：抖音/小红书产物不含 /pages/booking/index 字面量（宿主页保持零条件编译、零预约痕迹）。
// 仍 emit click 供宿主观测（宿主无需处理）。
const props = defineProps<{
  shopId?: number;
  shopName?: string;
}>();

const emit = defineEmits<{ (e: "click"): void }>();

function onTap(): void {
  emit("click");
  // #ifdef MP-WEIXIN
  const id = props.shopId;
  if (id == null) return;
  const name = typeof props.shopName === "string" ? props.shopName : "";
  if (typeof uni !== "undefined" && typeof uni.navigateTo === "function") {
    uni.navigateTo({ url: "/pages/booking/index?shopId=" + String(id) + "&shopName=" + encodeURIComponent(name) });
  }
  // #endif
}
</script>

<template>
  <!-- #ifdef MP-WEIXIN -->
  <view class="booking-entry" hover-class="press-dim" @click.stop="onTap">
    <text class="booking-entry-text">到店预约</text>
  </view>
  <!-- #endif -->
</template>

<style lang="scss" scoped>
/* 文字居中：几何上确定（2026-11 热修 H1，主人真机反馈「文字不在按钮正中」）。
   旧写法根因：容器无固定高度/行高，高度由「父 view 默认 16px 字号的 strut 行盒 + padding」决定，
   内层 20rpx 行内 text 按基线对齐 ⇒ 文字相对胶囊垂直方向偏离几何中心，且偏移量随字体度量而变；
   另 letter-spacing:1rpx 会在末字右侧多留空白，使字形整体偏左。
   新写法：容器 flex 居中三件套 + 固定 height（border-box，含 2×1rpx 描边）；
   文字 height 与 line-height 同值 = 容器内框高，行盒恰好占满内框，不再依赖默认行高/strut；
   取消 letter-spacing（不依赖各端对「末字尾随间距」的处理差异，比 margin/text-indent 补偿更稳）。
   高度 44rpx：与旧写法在桌面 Chromium 的实测渲染高度一致（点击热区不缩小）；
   横向 padding 18rpx 补回取消字间距损失的 4rpx 宽度，胶囊总宽与旧版持平（≈118rpx）。 */
.booking-entry {
  position: absolute;
  top: 10rpx;
  right: 10rpx;
  z-index: 2;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  height: 44rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  background: rgba(22, 15, 4, 0.72);
  border: 1rpx solid rgba(241, 205, 145, 0.6);
}
.booking-entry-text {
  flex-shrink: 0;
  height: 42rpx;
  font-size: 20rpx;
  line-height: 42rpx;
  white-space: nowrap;
  color: $color-action;
}
</style>
