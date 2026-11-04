<script setup lang="ts">
// T9 到店预约 MVP：我的预约页——状态筛选 + 列表 + 取消（二次确认）+ 下拉刷新 + 触底加载。微信专属页。
// 未登录／登录失效：空态提供「去登录」入口（复用 LoginPopup + createPhoneLoginFlow，登录成功后自动加载列表）。
import { computed, ref } from "vue";
import { onLoad, onReachBottom, onShow } from "@dcloudio/uni-app";
import { PROFILE } from "../../generated/profile.config";
import { resolveRuntimeEnvironment } from "../../platform/uni/runtime-env";
import { detectUiPlatform } from "../../ui/ui-platform";
import { isPlatform } from "../../ports/context";
import type { Platform } from "../../ports/context";
import { createUniTransport } from "../../platform/uni/transport";
import { createUniStorage } from "../../platform/uni/storage";
import { createUniLoginCode } from "../../platform/uni/login";
import { createAuthCoordinator } from "../../application/auth-coordinator";
import { createSilentIdentityExchange } from "../../application/silent-login";
import { createContextFactory } from "../../application/request-context";
import { createVersionedStorage, isFullSession } from "../../infrastructure/storage/versioned";
import { createHttpClient } from "../../infrastructure/http/client";
import { createWxAuthRepository } from "../../infrastructure/repositories/wx-auth";
import { createBookingRepository, type BookingView } from "../../infrastructure/repositories/bookings";
import { createCancelBookingUseCase, createMyBookingsUseCase } from "../../application/booking-flow";
import { createMyBookingsViewModel } from "../../composables/use-my-bookings";
import { describeBookingStatus, isCancellableStatus, type BookingStatus } from "../../domain/booking";
import { createUserInfoStore } from "../../application/user-info-store";
import { createPhoneLoginFlow } from "../../application/login-flow";
import { toast as nativeToast, showLoading, hideLoading } from "../../platform/uni/feedback";
import { hapticTap } from "../../application/haptics";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import LoginPopup from "../../components/LoginPopup/LoginPopup.vue";
import BaseFeedback from "../../ui/BaseFeedback.vue";
import BaseDialog from "../../ui/BaseDialog.vue";
import SkeletonBlock from "../../components/SkeletonBlock/SkeletonBlock.vue";
// 2026-09-21 主人：多页要下拉刷新 ⇒ 指示器＋刷新内核走共享实现（5 页同源，本页沿用同一纪律）
import PullRefreshIndicator from "../../components/PullRefreshIndicator/PullRefreshIndicator.vue";
import { createPullRefresh } from "../../composables/use-pull-refresh";

// —— 装配（同 favorites/mine）——
const detected = detectUiPlatform();
const platform: Platform = isPlatform(detected) ? detected : "mp-weixin";
const env = resolveRuntimeEnvironment(PROFILE.environment);
const transport = createUniTransport({ baseUrl: PROFILE.apiBases[env] });
const uniStorage = createUniStorage();
const versioned = createVersionedStorage({ backend: uniStorage, platform, profileKey: PROFILE.profileKey });
const authCoordinator = createAuthCoordinator({
  exchangeIdentity: createSilentIdentityExchange({
    getWxAuth: () => wxAuth,
    loginCode: createUniLoginCode({ platform }),
    platform,
    profileKey: PROFILE.profileKey,
  }),
  storage: uniStorage,
});
const client = createHttpClient({ transport, authCoordinator });
const wxAuth = createWxAuthRepository({ client, platform });
const bookingRepo = createBookingRepository({ client });
const ctxFactory = createContextFactory({
  platform,
  environment: env,
  profileKey: PROFILE.profileKey,
  appCode: PROFILE.appCode,
  getBrandId: () => versioned.loadBrandId(),
});
const listUc = createMyBookingsUseCase({ bookings: bookingRepo });
const cancelUc = createCancelBookingUseCase({ bookings: bookingRepo });
const vm = createMyBookingsViewModel({ list: listUc, cancel: cancelUc });
const userStore = createUserInfoStore({ backend: uniStorage });
const phoneLoginFlow = createPhoneLoginFlow({
  wxAuth,
  authCoordinator,
  userStore,
  context: () => ctxFactory.next(),
  platform,
  profileKey: PROFILE.profileKey,
});
const userAgreementName = `《${PROFILE.miniAppName} 用户协议》`;
const privacyPolicyName = `《${PROFILE.miniAppName} 隐私政策》`;

const feedbackRef = ref<InstanceType<typeof BaseFeedback> | null>(null);
function toast(text: string, icon?: "success" | "none"): void {
  const f = feedbackRef.value;
  if (f != null) {
    f.show(text, icon as never);
    return;
  }
  nativeToast(text, icon as never);
}
const dialogRef = ref<InstanceType<typeof BaseDialog> | null>(null);

// —— 状态筛选（含"全部"） ——
interface FilterTab {
  value: BookingStatus | "";
  label: string;
}
const FILTER_TABS: FilterTab[] = [
  { value: "", label: "全部" },
  { value: "pending", label: "待确认" },
  { value: "confirmed", label: "已确认" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "已取消" },
  { value: "expired", label: "已过期" },
];

const ready = ref(false);
const firstShow = ref(true);
/** 登录门：只认弹窗交互登录的 full 会话（静默换票不算已登录）；未登录不请求、给"请先登录"空态 */
const loggedIn = ref(false);

function refreshLoginState(): void {
  loggedIn.value = isFullSession(versioned.loadSession());
}

/** 需要登录：本地无 full 会话，或请求遇 401（会话已失效） */
const needLogin = computed(() => !loggedIn.value || vm.authExpired.value);

async function reload(): Promise<void> {
  refreshLoginState();
  if (!loggedIn.value) return;
  const r = await vm.loadFirst(ctxFactory.next());
  // 列表非空时失败只保留旧列表（不出空态）⇒ 另行 toast；401 交给「去登录」态，不再 toast
  if (!r.ok && vm.items.value.length > 0 && !vm.authExpired.value) toast(r.message);
}

// —— 登录（空态「去登录」入口；与预约页同一套弹窗＋手机号登录流程）——
const showLoginPopup = ref(false);
const loginAgreementChecked = ref(false);
function onLoginTap(): void {
  hapticTap();
  openLoginPopup();
}
function onRetryTap(): void {
  hapticTap();
  void reload();
}
function openLoginPopup(): void {
  showLoginPopup.value = true;
  void phoneLoginFlow.prefetchLoginCode();
}
function closeLoginPopup(): void {
  showLoginPopup.value = false;
  loginAgreementChecked.value = false;
}
function toggleLoginAgreement(): void {
  loginAgreementChecked.value = !loginAgreementChecked.value;
}
function showLoginAgreementToast(): void {
  toast("请先阅读并同意用户协议与隐私政策");
}
function openUserAgreement(): void {
  if (typeof uni !== "undefined" && typeof uni.navigateTo === "function") uni.navigateTo({ url: "/pages/policies/user" });
}
function openPrivacyPolicy(): void {
  if (typeof uni !== "undefined" && typeof uni.navigateTo === "function") uni.navigateTo({ url: "/pages/policies/privacy" });
}
/** 登录进行中标志：防止授权按钮连点并发跑两次登录 */
let phoneLoginBusy = false;
async function onGetPhoneNumber(e: unknown): Promise<void> {
  if (phoneLoginBusy) return;
  if (!loginAgreementChecked.value) {
    showLoginAgreementToast();
    return;
  }
  const detail = ((e as { detail?: Record<string, unknown> })?.detail ?? {}) as { errMsg?: string; code?: string };
  if (detail.errMsg != null && detail.errMsg !== "getPhoneNumber:ok") {
    toast(detail.errMsg.includes("deny") || detail.errMsg.includes("cancel") ? "已取消授权" : "授权失败，请重试");
    return;
  }
  if (!detail.code) {
    toast("获取手机号失败，请检查小程序认证状态");
    return;
  }
  phoneLoginBusy = true;
  showLoading("登录中...");
  let result: Awaited<ReturnType<typeof phoneLoginFlow.runPhoneLogin>>;
  try {
    result = await phoneLoginFlow.runPhoneLogin(detail.code);
  } finally {
    hideLoading();
    phoneLoginBusy = false;
  }
  if (!result.ok) {
    toast(result.errorKind === "login" ? "获取登录凭证失败，请重试" : result.errorMsg || "登录失败");
    return;
  }
  showLoginPopup.value = false;
  loginAgreementChecked.value = false;
  toast("登录成功", "success");
  await reload(); // 登录成功后自动加载列表
}

async function initialLoad(): Promise<void> {
  await reload();
  ready.value = true;
}

onLoad(() => {
  void initialLoad();
});

onShow(() => {
  if (firstShow.value) {
    firstShow.value = false;
    return;
  }
  // 从预约页/详情返回：静默刷新当前筛选（不回落骨架，避免整页闪——同 aiTryOnHistory onShow 口径）
  void reload();
});

onReachBottom(() => {
  if (needLogin.value) return;
  void vm.loadMore(ctxFactory.next());
});

function retryLoadMore(): void {
  if (needLogin.value) return;
  void vm.loadMore(ctxFactory.next());
}

const { refreshing, indicatorTop } = createPullRefresh({
  label: "myBookings",
  refresh: () => reload(),
  hasCustomNav: true,
});

function onPickFilter(tab: FilterTab): void {
  if (tab.value === vm.status.value) return;
  if (needLogin.value) {
    vm.status.value = tab.value;
    return;
  }
  // 切换筛选失败＝旧列表已清，页面展示「加载失败 / 重试」空态，无需 toast
  void vm.loadFirst(ctxFactory.next(), tab.value);
}

function statusLabel(status: string) {
  return describeBookingStatus(status);
}

function canCancel(booking: BookingView): boolean {
  return isCancellableStatus(booking.status);
}

const cancelTargetId = ref<number | null>(null);

async function onCancelTap(booking: BookingView): Promise<void> {
  // 占位标志必须在弹出确认框**之前**同步置位：确认框打开期间再点别的卡片的「取消预约」直接忽略，防止叠两个确认框
  if (!canCancel(booking) || vm.cancellingId.value != null || cancelTargetId.value != null) return;
  cancelTargetId.value = booking.id;
  const result = await dialogRef.value?.confirm({
    title: "取消预约",
    msg: "确认取消本次到店预约吗？",
  });
  if (result !== "confirm") {
    cancelTargetId.value = null;
    return;
  }
  const r = await vm.cancelBooking(ctxFactory.next(), booking.id);
  cancelTargetId.value = null;
  if (r.ok) {
    toast("已取消预约", "success");
  } else {
    toast(r.message);
  }
}
</script>

<template>
  <view class="container">
    <PullRefreshIndicator :show="refreshing" :top="indicatorTop" />
    <CustomNavBar title="我的预约" transparent />

    <view class="filter-row">
      <view
        v-for="tab in FILTER_TABS"
        :key="tab.value"
        :class="tab.value === vm.status.value ? 'filter-item is-active' : 'filter-item'"
        hover-class="press-dim"
        @click="onPickFilter(tab)"
      >
        <text class="filter-text">{{ tab.label }}</text>
      </view>
    </view>

    <view v-if="!ready" class="sk-wrap">
      <SkeletonBlock v-for="i in 3" :key="i" width="100%" height="160rpx" radius="16rpx" />
    </view>

    <view v-else-if="needLogin" class="empty-state">
      <view class="empty-title">请先登录</view>
      <view class="empty-desc">登录后可查看您的预约记录</view>
      <view class="empty-action"><view class="btn-primary login-btn" hover-class="press-dim" @click="onLoginTap"><text>去登录</text></view></view>
    </view>

    <view v-else-if="vm.error.value !== null && vm.items.value.length === 0" class="empty-state">
      <view class="empty-title">加载失败</view>
      <view class="empty-desc">{{ vm.error.value }}</view>
      <view class="empty-action"><view class="btn-secondary retry-btn" hover-class="press-dim" @click="onRetryTap"><text>重试</text></view></view>
    </view>

    <view v-else-if="vm.items.value.length === 0" class="empty-state">
      <view class="empty-title">暂无预约记录</view>
      <view class="empty-desc">去门店页选一个喜欢的时段预约吧</view>
    </view>

    <view v-else class="list">
      <view v-for="item in vm.items.value" :key="item.id" class="card">
        <view class="card-top">
          <text class="card-shop font-noto-serif">{{ item.shopName }}</text>
          <text :class="'card-status card-status-' + statusLabel(item.status).tone">{{ statusLabel(item.status).label }}</text>
        </view>
        <view class="card-row">
          <text class="card-row-label">到店时间</text>
          <text class="card-row-value">{{ item.date }} {{ item.startTime }}-{{ item.endTime }}</text>
        </view>
        <view class="card-row">
          <text class="card-row-label">预约人</text>
          <text class="card-row-value">{{ item.customerName }} · {{ item.customerPhone }}</text>
        </view>
        <view class="card-row">
          <text class="card-row-label">到店人数</text>
          <text class="card-row-value">{{ item.guestCount }} 人</text>
        </view>
        <view v-if="item.remark" class="card-row">
          <text class="card-row-label">备注</text>
          <text class="card-row-value">{{ item.remark }}</text>
        </view>
        <view v-if="canCancel(item)" class="card-actions">
          <view
            class="cancel-btn"
            hover-class="press-dim"
            @click="onCancelTap(item)"
          >
            <text class="cancel-btn-text">{{ vm.cancellingId.value === item.id ? "取消中..." : "取消预约" }}</text>
          </view>
        </view>
      </view>

      <view v-if="vm.loadingMore.value" class="load-more">
        <text class="load-more-text">加载中...</text>
      </view>
      <view v-else-if="vm.loadMoreError.value !== null" class="load-more" hover-class="press-dim" @click="retryLoadMore">
        <text class="load-more-text">加载失败，点击重试</text>
      </view>
      <view v-else-if="vm.noMore.value && vm.items.value.length > 0" class="load-more">
        <text class="load-more-text">已经到底了</text>
      </view>
    </view>

    <LoginPopup
      v-if="showLoginPopup"
      :agreement-checked="loginAgreementChecked"
      :user-agreement-name="userAgreementName"
      :privacy-policy-name="privacyPolicyName"
      @close="closeLoginPopup"
      @toggle-agreement="toggleLoginAgreement"
      @show-toast="showLoginAgreementToast"
      @open-user="openUserAgreement"
      @open-privacy="openPrivacyPolicy"
      @get-phone="onGetPhoneNumber"
    />
    <BaseFeedback ref="feedbackRef" />
    <BaseDialog ref="dialogRef" />
  </view>
</template>

<style lang="scss" scoped>
.container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: $color-page;
}
.filter-row {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 12rpx;
  padding: 24rpx;
}
.filter-item {
  padding: 10rpx 24rpx;
  border-radius: 999rpx;
  background: rgba(241, 205, 145, 0.06);
  border: 2rpx solid rgba(241, 205, 145, 0.12);
}
.filter-item.is-active {
  background: rgba(241, 205, 145, 0.18);
  border-color: $color-action;
}
.filter-text {
  font-size: $font-size-caption;
  color: $color-text-secondary;
}
.filter-item.is-active .filter-text {
  color: $color-action;
}
.sk-wrap {
  padding: 0 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 200rpx 32rpx;
}
.empty-title {
  font-size: $font-size-sub-title;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 16rpx;
}
.empty-desc {
  font-size: $font-size-caption;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
}
.empty-action {
  margin-top: 24rpx;
  display: flex;
  justify-content: center;
}
.list {
  padding: 0 24rpx 32rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.card {
  border-radius: 20rpx;
  background: rgba(241, 205, 145, 0.06);
  border: 2rpx solid rgba(241, 205, 145, 0.12);
  padding: 24rpx;
}
.card-top {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}
.card-shop {
  font-size: $font-size-body;
  color: $color-action;
}
.card-status {
  font-size: $font-size-caption;
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
}
.card-status-action {
  color: $color-action;
  background: rgba(241, 205, 145, 0.15);
}
.card-status-muted {
  color: $color-text-secondary;
  background: rgba(255, 255, 255, 0.06);
}
.card-status-danger {
  color: #ff6b6b;
  background: rgba(255, 107, 107, 0.12);
}
.card-row {
  display: flex;
  flex-direction: row;
  margin-top: 8rpx;
}
.card-row-label {
  width: 140rpx;
  flex-shrink: 0;
  font-size: $font-size-caption;
  color: $color-text-secondary;
}
.card-row-value {
  flex: 1;
  font-size: $font-size-caption;
  color: $color-text-primary;
}
.card-actions {
  margin-top: 20rpx;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
}
.cancel-btn {
  padding: 10rpx 32rpx;
  border-radius: 999rpx;
  border: 2rpx solid rgba(255, 107, 107, 0.45);
}
.cancel-btn-text {
  font-size: $font-size-caption;
  color: #ff6b6b;
}
.load-more {
  padding: 24rpx 0;
  text-align: center;
}
.load-more-text {
  font-size: $font-size-caption;
  color: rgba(241, 205, 145, 0.4);
}
</style>
