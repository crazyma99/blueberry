<script setup lang="ts">
// 商家端「未登录」占位（issue #14）：未登录/会话失效访问任一商家页时显示。
// 文案口径（评审结论）：「请从商家专属入口登录」——商家端入口不在 C 端任何位置公开暴露（降低审核问询）；
// 提供「前往登录」按钮仅用于**会话过期后回登录页**（商家无 refresh，token 过期只能重登），不外链、不引导 C 端用户。
// 组件样式隔离（微信默认 isolated）⇒ 字体/按钮样式全部在本组件内声明。
import { hapticTap } from "../../application/haptics";
import { MERCHANT_LOGIN_URL } from "../../domain/merchant-entry";

withDefaults(defineProps<{ expired?: boolean }>(), { expired: false });

function goLogin(): void {
  hapticTap();
  if (typeof uni !== "undefined" && typeof uni.reLaunch === "function") uni.reLaunch({ url: MERCHANT_LOGIN_URL });
}
</script>

<template>
  <view class="mnl">
    <text class="mnl-title">{{ expired ? "登录已失效" : "请从商家专属入口登录" }}</text>
    <text class="mnl-desc">{{ expired ? "请重新登录后继续操作" : "请使用商家专属小程序码进入" }}</text>
    <view class="mnl-btn" hover-class="press-dim" @click="goLogin">
      <text class="mnl-btn-text">前往登录</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.mnl {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 200rpx $space-lg;
}
.mnl-title {
  font-size: $font-size-sub-title;
  color: $color-text-secondary;
  margin-bottom: $space-sm;
}
.mnl-desc {
  font-size: $font-size-caption;
  color: $color-text-muted;
  text-align: center;
}
.mnl-btn {
  margin-top: $space-lg;
  padding: 20rpx 64rpx;
  border-radius: 999rpx;
  border: 2rpx solid $color-border;
  background: rgba(241, 205, 145, 0.1);
}
.mnl-btn-text {
  font-size: $font-size-body;
  color: $color-action;
}
</style>
