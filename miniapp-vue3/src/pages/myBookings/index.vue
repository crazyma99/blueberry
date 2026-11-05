<script setup lang="ts">
// T9 到店预约 MVP：我的预约页——状态筛选 + 列表 + 取消（二次确认）+ 下拉刷新 + 触底加载。微信专属页。
// 未登录／登录失效：空态提供「去登录」入口（复用 LoginPopup + createPhoneLoginFlow，登录成功后自动加载列表）。
// 预约保证金（2026-11-05 §10 冻结契约）：卡片展示保证金状态（待支付倒计时＋「继续支付」／已支付／退还中／已退还／已扣除）；
//   取消前拉 cancel-preview，确认框写明「将扣除 ¥x，退还 ¥y」或「保证金 ¥x 将原路退回」；无保证金的预约保持原文案与原流程。
//   支付结果一律以服务端状态为准（见 application/booking-deposit-pay）；倒计时归零自动刷新为已取消，不得再继续支付。
import { computed, onUnmounted, ref, watch } from "vue";
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
import {
  createCancelBookingUseCase,
  createCancelPreviewUseCase,
  createContinuePayUseCase,
  createMyBookingsUseCase,
} from "../../application/booking-flow";
import { createDepositPayFlow, type DepositPayOutcome } from "../../application/booking-deposit-pay";
import { createWeixinPayments } from "../../platform/weixin/payments";
import { createMyBookingsViewModel } from "../../composables/use-my-bookings";
import { describeBookingStatus, isCancellableStatus, type BookingStatus } from "../../domain/booking";
import {
  MAX_PAY_HOLD_MINUTES,
  cancelConfirmText,
  cancelDoneText,
  describeDepositLine,
  describeDepositStatus,
  expireAtMs,
  formatCountdown,
  remainingPaySeconds,
} from "../../domain/booking-deposit";
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
const previewUc = createCancelPreviewUseCase({ bookings: bookingRepo });
const continuePayUc = createContinuePayUseCase({ bookings: bookingRepo });
const depositPayFlow = createDepositPayFlow({ bookings: bookingRepo, payments: createWeixinPayments() });
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
  { value: "awaiting_payment", label: "待支付" },
  { value: "pending", label: "待确认" },
  { value: "confirmed", label: "已确认" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "已取消" },
  { value: "expired", label: "已过期" },
  { value: "no_show", label: "已爽约" },
];

/**
 * 「待支付」「已爽约」只属于预约保证金：门店均未开启保证金的用户不应看到任何支付语义的标签（与改动前一致）。
 * 渲染条件：当前已加载的预约里出现过带保证金（deposit != null）的记录（一旦出现即保持，避免切筛选时标签闪烁），或用户正位于该标签。
 */
const DEPOSIT_ONLY_TABS: ReadonlySet<BookingStatus> = new Set<BookingStatus>(["awaiting_payment", "no_show"]);
const depositSeen = ref(false);
watch(
  () => vm.items.value.some((b) => b.deposit != null),
  (has) => {
    if (has) depositSeen.value = true;
  },
  { immediate: true },
);
const visibleTabs = computed(() =>
  FILTER_TABS.filter(
    (t) => t.value === "" || !DEPOSIT_ONLY_TABS.has(t.value) || depositSeen.value || t.value === vm.status.value,
  ),
);

const ready = ref(false);
const firstShow = ref(true);
/** 页面已卸载：此后的异步收尾（reload / scheduleTick / 支付流收尾）一律直接返回，不再挂计时器、不再发请求、不再写状态 */
let disposed = false;
/** 登录门：只认弹窗交互登录的 full 会话（静默换票不算已登录）；未登录不请求、给"请先登录"空态 */
const loggedIn = ref(false);

function refreshLoginState(): void {
  loggedIn.value = isFullSession(versioned.loadSession());
}

/** 需要登录：本地无 full 会话，或请求遇 401（会话已失效） */
const needLogin = computed(() => !loggedIn.value || vm.authExpired.value);

async function reload(): Promise<void> {
  if (disposed) return;
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
/** 正在拉取取消预览的预约 id（按钮显示「查询中...」，防重复点击） */
const previewingId = ref<number | null>(null);
/** 正在继续支付的预约 id（支付面板＋轮询期间占位：防重复点击、期间不允许取消） */
const payingId = ref<number | null>(null);

async function onCancelTap(booking: BookingView): Promise<void> {
  // 占位标志必须在弹出确认框**之前**同步置位：确认框打开期间再点别的卡片的「取消预约」直接忽略，防止叠两个确认框
  if (!canCancel(booking) || vm.cancellingId.value != null || cancelTargetId.value != null || payingId.value != null) return;
  cancelTargetId.value = booking.id;
  try {
    let msg = "确认取消本次到店预约吗？";
    if (booking.deposit != null) {
      if (booking.status === "awaiting_payment") {
        // 待支付：保证金尚未付款，取消只释放名额，无资金动作。
        // 不写「刚完成支付则原路退回」：服务端关单时发现已支付会拒绝取消并保留预约（不会退款），该半句与真实行为相反
        msg += "保证金尚未支付，取消不会产生扣款";
      } else {
        // 已付保证金：取消前向服务端要结算预览（金额只信服务端）。拿不到预览＝fail-closed，不让用户在不知道扣款结果时取消
        previewingId.value = booking.id;
        const p = await previewUc.preview(ctxFactory.next(), booking.id);
        previewingId.value = null;
        if (!p.ok) {
          if (p.authExpired === true) vm.authExpired.value = true;
          toast(p.message);
          return;
        }
        msg += cancelConfirmText(p.value);
      }
    }
    const result = await dialogRef.value?.confirm({ title: "取消预约", msg });
    if (result !== "confirm") return;
    const r = await vm.cancelBooking(ctxFactory.next(), booking.id);
    if (r.ok) {
      // 预览与实际取消之间可能跨过迟取消边界：以取消响应里的结算结果为准提示（过去时；无保证金／无结算信息 ⇒ 原文案「已取消预约」）
      const d = vm.lastCancelled.value?.deposit ?? null;
      toast(
        d != null ? cancelDoneText({ refundFen: d.refundFen, forfeitFen: d.forfeitFen, reason: d.settleReason }) : "已取消预约",
        "success",
      );
    } else {
      toast(r.message);
    }
  } finally {
    previewingId.value = null;
    cancelTargetId.value = null;
  }
}

// —— 预约保证金：状态展示 / 倒计时 / 继续支付 ——
/** 当前时刻（毫秒）：倒计时每秒刷新；仅在存在待支付预约时才起计时器 */
const nowMs = ref(Date.now());
let tickTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * 倒计时归零后的退避刷新：服务端关单由定时任务完成（≤1 分钟周期），归零瞬间服务端多半还没关 ⇒ 不能只刷一次。
 * 每条预约最多按此偏移（距归零时刻的毫秒）刷新 5 次，之后不再自动请求（用户仍可下拉刷新）。
 */
const EXPIRY_REFRESH_OFFSETS_MS = [0, 5_000, 20_000, 45_000, 75_000];
/** 预约 id → 已触发的归零刷新次数 */
const expiryRefreshCount = new Map<number, number>();
/** 预约 id → 继续支付冷却截止时间（毫秒）：支付结果为「确认中」(timeout) 后短暂禁用，避免用户在结果未知时重复支付 */
const payCooldownUntil = ref<Record<number, number>>({});
const PAY_COOLDOWN_MS = 15_000;
/**
 * 预约 id → 退避刷新用尽后服务端**仍**返回待支付：说明本机倒计时与服务端不一致（典型＝设备时钟偏快），此时放开「继续支付」，
 * 由服务端 payBooking 的错误裁决（服务端过期会拒绝；微信订单自身也有 time_expire）——放开不增加资金风险。
 */
const payUnlocked = ref<Record<number, true>>({});

function isAwaitingPay(b: BookingView): boolean {
  return b.status === "awaiting_payment" && b.deposit != null && b.deposit.status === "pending";
}
/** 本地剩余秒数；取 min(本地剩余, 契约保留期上界 30 分钟)：设备时钟偏慢时不向用户夸大剩余时间 */
function payRemaining(b: BookingView): number {
  return b.deposit != null ? remainingPaySeconds(b.deposit.payExpireTime, nowMs.value, MAX_PAY_HOLD_MINUTES * 60) : 0;
}
/** 契约保证 pending 必带截止时间；缺失（防御）时无法倒计时，交给服务端裁决（不堵死用户） */
function hasExpiry(b: BookingView): boolean {
  return b.deposit != null && b.deposit.payExpireTime !== "";
}
function inCooldown(b: BookingView): boolean {
  return (payCooldownUntil.value[b.id] ?? 0) > nowMs.value;
}
/** 可继续支付：待支付、不在「结果确认中」冷却内，且 ①倒计时未归零 ②缺截止时间（交服务端裁决）③退避刷新用尽后服务端仍报待支付（本机时钟与服务端不一致，交服务端裁决）。
 *  倒计时归零但仍有刷新配额时不得点（等刷新为已取消）。 */
function canPay(b: BookingView): boolean {
  if (!isAwaitingPay(b) || inCooldown(b)) return false;
  return !hasExpiry(b) || payRemaining(b) > 0 || payUnlocked.value[b.id] === true;
}
function depositText(b: BookingView): string {
  return describeDepositLine(b.deposit);
}
function depositTone(b: BookingView): string {
  return b.deposit != null ? describeDepositStatus(b.deposit.status).tone : "muted";
}
function showCountdown(b: BookingView): boolean {
  return isAwaitingPay(b) && hasExpiry(b);
}
function countdownText(b: BookingView): string {
  if (inCooldown(b)) return "支付结果确认中，请稍候";
  const sec = payRemaining(b);
  if (sec > 0) return "支付剩余 " + formatCountdown(sec);
  // 刷新用尽后服务端仍是待支付：不再说「正在更新状态」，提示可直接尝试，是否超时以支付时的提示为准
  return payUnlocked.value[b.id] === true ? "如需支付请点「继续支付」，若已超时会有提示" : "支付已超时，正在更新状态";
}

/** 需要继续走秒表：存在倒计时未归零的待支付、或处于冷却中（冷却结束要补一次刷新）、或归零后仍有刷新配额的待支付 */
function needsTick(): boolean {
  return vm.items.value.some(
    (b) =>
      isAwaitingPay(b) &&
      (inCooldown(b) ||
        (hasExpiry(b) && (payRemaining(b) > 0 || (expiryRefreshCount.get(b.id) ?? 0) < EXPIRY_REFRESH_OFFSETS_MS.length))),
  );
}
function scheduleTick(): void {
  if (disposed || tickTimer != null) return;
  tickTimer = setTimeout(() => {
    tickTimer = null;
    if (disposed) return;
    nowMs.value = Date.now();
    let refresh = false;
    // 「支付结果确认中」冷却结束：补一次刷新（面板兜底超时后用户可能已付款，卡片不应一直停在待支付）
    const cd = payCooldownUntil.value;
    const ended = Object.keys(cd)
      .map(Number)
      .filter((id) => cd[id] <= nowMs.value);
    if (ended.length > 0) {
      const next = { ...cd };
      for (const id of ended) delete next[id];
      payCooldownUntil.value = next;
      refresh = true;
    }
    // 倒计时归零：按退避偏移刷新，让服务端关单后的「已取消」状态落到列表
    const exhausted: number[] = [];
    for (const b of vm.items.value) {
      if (!isAwaitingPay(b) || !hasExpiry(b) || payRemaining(b) > 0) continue;
      const n = expiryRefreshCount.get(b.id) ?? 0;
      if (n >= EXPIRY_REFRESH_OFFSETS_MS.length) continue;
      const overdueMs = Date.now() - (b.deposit != null ? expireAtMs(b.deposit.payExpireTime) : 0);
      if (overdueMs >= EXPIRY_REFRESH_OFFSETS_MS[n]) {
        expiryRefreshCount.set(b.id, n + 1);
        refresh = true;
        if (n + 1 >= EXPIRY_REFRESH_OFFSETS_MS.length) exhausted.push(b.id);
      }
    }
    if (refresh) {
      void reload().then(() => {
        if (disposed || exhausted.length === 0) return;
        // 最后一次退避刷新已回来：仍待支付的 ⇒ 放开「继续支付」（本机时钟与服务端不一致，由服务端裁决）；已被关单的 canPay 仍为 false
        const next = { ...payUnlocked.value };
        for (const id of exhausted) next[id] = true;
        payUnlocked.value = next;
      });
    }
    if (needsTick()) scheduleTick();
  }, 1000);
}
watch(
  () => vm.items.value,
  () => {
    nowMs.value = Date.now();
    if (needsTick()) scheduleTick();
  },
);
onUnmounted(() => {
  disposed = true;
  if (tickTimer != null) clearTimeout(tickTimer);
  tickTimer = null;
});

function payOutcomeToast(o: DepositPayOutcome): void {
  if (o.ok) {
    toast("支付成功", "success");
    return;
  }
  switch (o.reason) {
    case "cancelled":
      toast("已取消支付，预约仍保留，可继续支付");
      return;
    case "timeout":
      toast("支付结果确认中，请稍后下拉刷新查看，请勿重复支付");
      return;
    case "closed":
      toast("预约已关闭，如已扣款将原路退回");
      return;
    case "unsupported":
      toast("当前环境暂不支持支付");
      return;
    case "authExpired":
      vm.authExpired.value = true;
      toast("登录已失效，请重新登录");
      return;
    case "busy":
      return;
    default:
      toast("支付未完成，预约仍保留，可继续支付");
  }
}

async function onPayTap(booking: BookingView): Promise<void> {
  // 防重复：支付/取消流程在飞、确认框打开期间一律忽略；归零后的卡片不可点
  if (payingId.value != null || vm.cancellingId.value != null || cancelTargetId.value != null) return;
  if (!canPay(booking)) return;
  hapticTap();
  payingId.value = booking.id;
  try {
    const r = await continuePayUc.pay(ctxFactory.next(), booking.id);
    if (disposed) return; // 页面已卸载：不再 toast／发请求／写状态
    if (!r.ok) {
      if (r.authExpired === true) vm.authExpired.value = true;
      toast(r.message);
      void reload(); // 过期／状态不符：以服务端为准刷新
      return;
    }
    if (r.value.pay == null) {
      toast("暂时无法发起支付，请稍后重试");
      void reload();
      return;
    }
    const outcome = await depositPayFlow.payAndConfirm(ctxFactory.next(), { bookingId: booking.id, pay: r.value.pay });
    if (disposed) return;
    payOutcomeToast(outcome);
    if (!outcome.ok && outcome.reason === "timeout") {
      // 结果未知：短暂冷却，期间卡片显示「支付结果确认中」且不可再点继续支付；冷却结束时 scheduleTick 会补一次刷新
      nowMs.value = Date.now();
      payCooldownUntil.value = { ...payCooldownUntil.value, [booking.id]: nowMs.value + PAY_COOLDOWN_MS };
      scheduleTick();
    }
    if (!(!outcome.ok && outcome.reason === "busy")) await reload();
  } catch {
    if (!disposed) toast("支付未完成，请稍后重试");
  } finally {
    payingId.value = null;
  }
}
</script>

<template>
  <view class="container">
    <PullRefreshIndicator :show="refreshing" :top="indicatorTop" />
    <CustomNavBar title="我的预约" transparent />

    <view class="filter-row">
      <view
        v-for="tab in visibleTabs"
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
        <view v-if="item.deposit" class="card-row">
          <text :class="'card-row-value deposit-value deposit-value-' + depositTone(item)">{{ depositText(item) }}</text>
        </view>
        <view v-if="showCountdown(item)" class="card-row">
          <text class="card-row-value deposit-countdown">{{ countdownText(item) }}</text>
        </view>
        <view v-if="canCancel(item) || canPay(item)" class="card-actions">
          <view
            v-if="canPay(item)"
            class="btn-primary pay-btn"
            hover-class="press-dim"
            @click="onPayTap(item)"
          >
            <text>{{ payingId === item.id ? "支付中..." : "继续支付" }}</text>
          </view>
          <view
            v-if="canCancel(item)"
            class="cancel-btn"
            hover-class="press-dim"
            @click="onCancelTap(item)"
          >
            <text class="cancel-btn-text">{{ vm.cancellingId.value === item.id ? "取消中..." : previewingId === item.id ? "查询中..." : "取消预约" }}</text>
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
  align-items: center;
  gap: 16rpx;
}
/* 保证金行：色阶沿用状态 tone（action 金／muted 弱化／danger 警示） */
.deposit-value-action {
  color: $color-action;
}
.deposit-value-muted {
  color: $color-text-secondary;
}
.deposit-value-danger {
  color: #ff6b6b;
}
.deposit-countdown {
  color: $color-action;
}
/* 「继续支付」复用全局 .btn-primary 外观，仅收窄尺寸以与同排「取消预约」胶囊对齐 */
.pay-btn {
  padding: 10rpx 32rpx;
  font-size: $font-size-caption;
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
