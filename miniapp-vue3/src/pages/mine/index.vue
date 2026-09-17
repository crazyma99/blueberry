<script setup lang="ts">
// B2/T7 占位页（P2-12 3Tab 复刻所需注册）：我的页随 T7 批次完整迁移；
// 当前仅承担 tabBar 路由与选中态同步（parity.md 记 not_started，不伪装完成度）。
import { onShow } from "@dcloudio/uni-app";
import { syncTabBarSelected } from "../../application/tabbar";
import { tokens } from "../../generated/tokens";

onShow(() => {
  syncTabBarSelected(2);
});
</script>

<template>
  <view class="placeholder-page">
    <text class="placeholder-title">我的</text>
    <text class="placeholder-note">本页随 T7 批次迁移接入</text>
  </view>
</template>

<style scoped>
.placeholder-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  background: v-bind("tokens.semantic.colorPage");
}
.placeholder-title {
  font-size: v-bind("tokens.semantic.fontSizeTitle");
  color: v-bind("tokens.semantic.colorTextStrong");
}
.placeholder-note {
  font-size: v-bind("tokens.semantic.fontSizeCaption");
  color: v-bind("tokens.semantic.colorTextMuted");
}
</style>
