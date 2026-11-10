<script setup lang="ts">
// 商家工作台（issue #14 · M1）：只放功能入口（预约管理 / 档期管理）；**不做**首页概览/统计（主人拍板）。
// 入口按登录响应里的 permissions 显隐（体验层；安全边界仍是后端 permCheck + merchant_scope）。
// 未登录/会话失效 ⇒ 「请从商家专属入口登录」。退出登录只清本地（后端无 logout）。
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import PageFooter from "../../components/PageFooter/PageFooter.vue";
import { useMerchantFooter } from "../composables/use-merchant-footer";
import MerchantNeedLogin from "../components/MerchantNeedLogin.vue";
import { getMerchantRuntime } from "../application/merchant-runtime";
import { hapticTap } from "../../application/haptics";
import { visibleEntries, type MerchantEntry, type MerchantProfile } from "../domain/merchant-auth";
import { MERCHANT_LOGIN_URL } from "../../domain/merchant-entry";

const rt = getMerchantRuntime();
const footer = useMerchantFooter();
const profile = ref<MerchantProfile | null>(null);
const loggedIn = ref(false);

function refresh(): void {
  const s = rt.getState();
  loggedIn.value = s.loggedIn;
  profile.value = s.profile;
}
refresh();
onShow(refresh);

const entries = computed<MerchantEntry[]>(() => visibleEntries(profile.value));
const greeting = computed(() => {
  const p = profile.value;
  if (p == null) return "";
  return p.displayName !== "" ? p.displayName : p.username;
});

function goEntry(e: MerchantEntry): void {
  hapticTap();
  if (typeof uni !== "undefined" && typeof uni.navigateTo === "function") uni.navigateTo({ url: e.url });
}

function onLogout(): void {
  hapticTap();
  rt.logout();
  if (typeof uni !== "undefined" && typeof uni.reLaunch === "function") uni.reLaunch({ url: MERCHANT_LOGIN_URL });
}
</script>

<template>
  <view class="container">
    <CustomNavBar title="商家工作台" transparent />
    <MerchantNeedLogin v-if="!loggedIn" />
    <view v-else class="body">
      <view class="hello">
        <text class="hello-name">{{ greeting }}</text>
        <text class="hello-sub">欢迎使用商家工作台</text>
      </view>
      <view v-if="entries.length === 0" class="empty">
        <text class="empty-text">当前账号暂无可用功能，请联系管理员分配权限</text>
      </view>
      <view v-for="e in entries" :key="e.key" class="entry" hover-class="press-dim" @click="goEntry(e)">
        <view class="entry-main">
          <text class="entry-title">{{ e.title }}</text>
          <text class="entry-desc">{{ e.desc }}</text>
        </view>
        <text class="entry-arrow">›</text>
      </view>
      <view class="logout" hover-class="press-dim" @click="onLogout">
        <text class="logout-text">退出登录</text>
      </view>
    </view>
    <PageFooter main-line="" :support-line="footer.supportLine.value" variant="bottomdesc" />
  </view>
</template>

<style lang="scss" scoped>
.container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: $color-page;
}
.body {
  padding: 0 $space-md $space-lg;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.hello {
  display: flex;
  flex-direction: column;
  padding: $space-md 8rpx;
}
.hello-name {
  font-size: $font-size-title;
  color: $color-action;
}
.hello-sub {
  margin-top: 8rpx;
  font-size: $font-size-caption;
  color: $color-text-secondary;
}
.empty {
  padding: 120rpx $space-lg;
  display: flex;
  justify-content: center;
}
.empty-text {
  font-size: $font-size-caption;
  color: $color-text-muted;
  text-align: center;
}
.entry {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: $space-md;
  border-radius: 20rpx;
  background: rgba(241, 205, 145, 0.06);
  border: 2rpx solid rgba(241, 205, 145, 0.12);
}
.entry-main {
  display: flex;
  flex-direction: column;
}
.entry-title {
  font-size: $font-size-sub-title;
  color: $color-action;
}
.entry-desc {
  margin-top: 8rpx;
  font-size: $font-size-caption;
  color: $color-text-secondary;
}
.entry-arrow {
  font-size: $font-size-title;
  color: $color-text-secondary;
}
.logout {
  margin-top: $space-lg;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  border: 2rpx solid $color-border;
}
.logout-text {
  font-size: $font-size-body;
  color: $color-text-secondary;
}
</style>
