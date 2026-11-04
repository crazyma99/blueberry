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
.booking-entry {
  position: absolute;
  top: 10rpx;
  right: 10rpx;
  z-index: 2;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(22, 15, 4, 0.72);
  border: 1rpx solid rgba(241, 205, 145, 0.6);
}
.booking-entry-text {
  font-size: 20rpx;
  color: #F1CD91;
  letter-spacing: 1rpx;
}
</style>
