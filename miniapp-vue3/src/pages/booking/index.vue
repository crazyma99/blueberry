<script setup lang="ts">
// T9 到店预约 MVP：预约页（门店名 + 14 天日期条 + 时段网格 + 表单 + 提交）。微信专属页（pages.json #ifdef MP-WEIXIN 注册，
// 抖音/小红书不注册——同 AI 六页口径，2026-09-17 主人拍板的"仅微信注册"惯例）。
// 产品规则（主人已确认）：可约窗口=今天起 14 天（含今天）；人数用步进器 1..20（domain/booking GUEST_COUNT_MIN/MAX）；
//   档期容量＝席位＝可预约的总人数（2026-11 主人口径）：人数上限 = min(20, 所选档期 remaining)，由 domain/booking maxGuestCountForSlot 计算；
// 提交需已登录（未登录先走现有登录弹窗，复用 login-flow）。
// 预约保证金（2026-11-05 §10 冻结契约）：进入页面拉 booking-config；门店开启保证金时在提交区上方展示「预约保证金 ¥xx」＋规则摘要，
//   **勾选同意后方可提交**；提交 = 订阅授权（点击手势内）→ 创建预约 → 拉起微信支付 → 以服务端状态为准确认到账（编排见 application/booking-deposit-submit）。
//   未开启保证金的门店：页面与流程与此前完全一致（无保证金文案、无授权弹窗、无支付）。对用户一律称「预约保证金」。
// 入参：shopId（必填）、shopName（可选，缺失时用 shops 仓储按 id 查一次兜底）。
import { computed, onUnmounted, ref, watch } from "vue";
import { onLoad } from "@dcloudio/uni-app";
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
import { createVersionedStorage } from "../../infrastructure/storage/versioned";
import { createHttpClient } from "../../infrastructure/http/client";
import { createWxAuthRepository } from "../../infrastructure/repositories/wx-auth";
import { createShopRepository } from "../../infrastructure/repositories/shops";
import { createBookingRepository, type BookingConfig, type SlotView } from "../../infrastructure/repositories/bookings";
import {
  createLoadBookingConfigUseCase,
  createLoadSlotsUseCase,
  createSubmitBookingUseCase,
  type SubmitBookingResult,
} from "../../application/booking-flow";
import { createDepositPayFlow } from "../../application/booking-deposit-pay";
import { createDepositSubmitFlow } from "../../application/booking-deposit-submit";
import { createWeixinPayments } from "../../platform/weixin/payments";
import { requestSubscribe } from "../../platform/weixin/capabilities";
import { createUserInfoStore } from "../../application/user-info-store";
import { createPhoneLoginFlow } from "../../application/login-flow";
import { toast as nativeToast, showLoading, hideLoading } from "../../platform/uni/feedback";
import { hapticTap } from "../../application/haptics";
import {
  GUEST_COUNT_MAX,
  GUEST_COUNT_MIN,
  buildDateWindow,
  clampGuestCount,
  describeSlotAvailability,
  maxGuestCountForSlot,
  type DateWindowDay,
} from "../../domain/booking";
import { describePaidResult, describeUnpaidResult, formatFen, summarizeDepositRule } from "../../domain/booking-deposit";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import LoginPopup from "../../components/LoginPopup/LoginPopup.vue";
import BaseFeedback from "../../ui/BaseFeedback.vue";
import SkeletonBlock from "../../components/SkeletonBlock/SkeletonBlock.vue";

// —— 装配（同 demoDetail/mine：容器安全回落；登录占位不假装成功）——
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
const shopRepo = createShopRepository({ client });
const bookingRepo = createBookingRepository({ client });
const ctxFactory = createContextFactory({
  platform,
  environment: env,
  profileKey: PROFILE.profileKey,
  appCode: PROFILE.appCode,
  getBrandId: () => versioned.loadBrandId(),
});
const loadSlotsUc = createLoadSlotsUseCase({ bookings: bookingRepo });
const userStore = createUserInfoStore({ backend: uniStorage });
const phoneLoginFlow = createPhoneLoginFlow({
  wxAuth,
  authCoordinator,
  userStore,
  context: () => ctxFactory.next(),
  platform,
  profileKey: PROFILE.profileKey,
});
const submitUc = createSubmitBookingUseCase({
  bookings: bookingRepo,
  loadSession: () => versioned.loadSession(),
  context: () => ctxFactory.next(),
});
const loadConfigUc = createLoadBookingConfigUseCase({ bookings: bookingRepo });
// 预约保证金提交编排：订阅授权 → 创建 → 支付 → 轮询服务端状态（支付回调不作依据）
const depositPayFlow = createDepositPayFlow({ bookings: bookingRepo, payments: createWeixinPayments() });
const depositSubmit = createDepositSubmitFlow({
  submitUc,
  payFlow: depositPayFlow,
  subscribe: requestSubscribe,
  context: () => ctxFactory.next(),
});

function openLoginPopup(): void {
  showLoginPopup.value = true;
  void phoneLoginFlow.prefetchLoginCode();
}

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

// —— 页面状态 ——
const ready = ref(false);
const shopId = ref(0);
const shopName = ref("");
const dateWindow = ref<DateWindowDay[]>(buildDateWindow());
const selectedDateIndex = ref(0);
const slots = ref<SlotView[]>([]);
const slotsLoading = ref(false);
const slotsError = ref<string | null>(null);
const selectedSlotId = ref<number | null>(null);

const customerName = ref("");
const customerPhone = ref("");
const guestCount = ref(2);
const remark = ref("");
const submitting = ref(false);

const showLoginPopup = ref(false);
const loginAgreementChecked = ref(false);
/** 未登录提交时挂起"提交"动作；登录成功后自动补发一次（口径同 demoDetail 点赞登录门的 pending 补发） */
const pendingSubmit = ref(false);

const submitSuccess = ref(false);
const submittedBookingId = ref<number | null>(null);
/** 结果页文案：默认＝既有免保证金预约成功态；保证金流程按结果覆盖（已支付／已保留待支付／确认中／已关闭） */
const resultTitle = ref("预约已提交");
const resultDesc = ref("预约已提交，等待门店确认。可在「我的预约」查看进度");
const resultCta = ref("查看我的预约");

// —— 预约保证金配置（booking-config）——
const config = ref<BookingConfig | null>(null);
const configLoading = ref(false);
/** 配置拉取失败文案：fail-closed——拿不到配置不允许提交（避免在可能需要保证金的门店跳过规则明示）。
 *  自动重试期间保持 null（静默），重试用尽后才置位并出现「重试」入口 */
const configError = ref<string | null>(null);
/** 页面已销毁：此后配置重试不再发请求；支付流收尾不再写状态 */
let disposed = false;
let configRetryTimer: ReturnType<typeof setTimeout> | null = null;
/** 配置拉取失败后的静默自动重试退避（至多 2 次）：瞬时的网络抖动/限流不应让所有门店（含未开启保证金的）无法提交 */
const CONFIG_RETRY_DELAYS_MS = [600, 1500];
onUnmounted(() => {
  disposed = true;
  if (configRetryTimer != null) clearTimeout(configRetryTimer);
  configRetryTimer = null;
});
const depositAgreed = ref(false);
const depositEnabled = computed(() => config.value?.deposit.enabled === true);
const depositAmountText = computed(() => formatFen(config.value?.deposit.amountFen ?? 0));
const depositRuleLines = computed(() => (config.value != null ? summarizeDepositRule(config.value.deposit) : []));
const depositHoldText = computed(() => {
  const m = config.value?.payHoldMinutes ?? 0;
  return m > 0 ? "提交后请在 " + m + " 分钟内完成支付，超时预约将自动取消" : "提交后请尽快完成支付，超时预约将自动取消";
});
const submitLabel = computed(() => (depositEnabled.value ? "提交并支付保证金 " + depositAmountText.value : "提交预约"));

const selectedDate = computed(() => dateWindow.value[selectedDateIndex.value]?.date ?? "");
const selectedSlot = computed(() => slots.value.find((s) => s.slotId === selectedSlotId.value) ?? null);
/** 当前可选人数上限（席位口径：min(20, 所选档期剩余席位)）；未选档期时为 20，由服务端兜底校验 */
const guestMax = computed(() => maxGuestCountForSlot(selectedSlot.value));
// 上限变化（换档期／刷新档期后剩余席位变少）时，当前人数超限则自动收敛到上限
watch(guestMax, (max) => {
  if (guestCount.value > max) guestCount.value = clampGuestCount(guestCount.value, max);
});

/** 请求序号：连续切日期时只应用**最新一次**请求的响应；旧响应晚到既不覆盖时段、也不改 slotsLoading */
let slotsSeq = 0;
/** @param keepSelection 提交被服务端拒绝后的刷新：保留原选中档期（刷新后仍可约才保留），用户可直接下调人数重提，不必重选 */
async function loadSlotsForSelectedDate(keepSelection = false): Promise<void> {
  if (shopId.value <= 0 || selectedDate.value === "") return;
  const mySeq = ++slotsSeq;
  slotsLoading.value = true;
  slotsError.value = null;
  const keepId = keepSelection ? selectedSlotId.value : null;
  if (keepId == null) selectedSlotId.value = null;
  const r = await loadSlotsUc.load(ctxFactory.next(), shopId.value, selectedDate.value);
  if (mySeq !== slotsSeq) return;
  slotsLoading.value = false;
  if (!r.ok) {
    slots.value = [];
    selectedSlotId.value = null;
    slotsError.value = r.message;
    return;
  }
  slots.value = r.value.slots ?? [];
  if (keepId != null && selectedSlotId.value === keepId) {
    const hit = slots.value.find((s) => s.slotId === keepId);
    if (hit == null || !describeSlotAvailability(hit).clickable) selectedSlotId.value = null; // 已约满／已过时：取消选中，让用户重选
  }
}

function onRetrySlots(): void {
  hapticTap();
  void loadSlotsForSelectedDate();
}

function onPickDate(index: number): void {
  if (index === selectedDateIndex.value) return;
  selectedDateIndex.value = index;
  void loadSlotsForSelectedDate();
}

function onPickSlot(slot: SlotView): void {
  const info = describeSlotAvailability(slot);
  if (!info.clickable) return;
  selectedSlotId.value = slot.slotId;
  // 席位口径：当前人数超过该档期剩余席位 ⇒ 立即收敛并轻提示（watch 兜底处理刷新场景，不弹提示以免盖住服务端文案）
  const max = maxGuestCountForSlot(slot);
  if (guestCount.value > max) {
    guestCount.value = clampGuestCount(guestCount.value, max);
    toast("该时段仅剩 " + max + " 席，已调整为 " + max + " 人");
  }
}

function slotMeta(slot: SlotView): { clickable: boolean; badge: string } {
  return describeSlotAvailability(slot);
}

function stepGuestCount(delta: number): void {
  const next = guestCount.value + delta;
  if (next < GUEST_COUNT_MIN || next > GUEST_COUNT_MAX) return;
  if (next > guestMax.value) {
    toast("该时段仅剩 " + guestMax.value + " 席"); // next<=20 且 >guestMax ⇒ 上限来自档期剩余席位
    return;
  }
  guestCount.value = next;
}

async function loadShopNameFallback(): Promise<void> {
  if (shopName.value !== "" || shopId.value <= 0) return;
  const r = await shopRepo.getShops(ctxFactory.next());
  if (!r.ok) return;
  const hit = r.value.find((s) => Number((s as Record<string, unknown>).id) === shopId.value);
  const name = hit != null ? (hit as Record<string, unknown>).displayName : null;
  if (typeof name === "string" && name !== "") shopName.value = name;
}

onLoad((options) => {
  const raw = (options ?? {}) as Record<string, unknown>;
  const idStr = typeof raw.shopId === "string" ? raw.shopId : String(raw.shopId ?? "");
  const id = Number(idStr);
  shopId.value = Number.isFinite(id) && id > 0 ? id : 0;
  shopName.value = typeof raw.shopName === "string" ? safeDecodeURIComponent(raw.shopName) : "";
  void initialLoad();
});

/** 非法编码保持原样、不阻断进入（同 webview/priceList 口径） */
function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

type ConfigLoadOutcome = { ok: true } | { ok: false; message: string };
/** 在飞的配置请求（去重：初始加载／自动重试／提交时重取共用同一个请求，不并发） */
let configInflight: Promise<ConfigLoadOutcome> | null = null;
function fetchConfig(): Promise<ConfigLoadOutcome> {
  if (configInflight != null) return configInflight;
  configLoading.value = true;
  configInflight = (async (): Promise<ConfigLoadOutcome> => {
    try {
      const r = await loadConfigUc.load(ctxFactory.next(), shopId.value);
      if (r.ok) {
        config.value = r.value;
        configError.value = null;
        return { ok: true };
      }
      config.value = null;
      return { ok: false, message: r.message };
    } finally {
      configLoading.value = false;
      configInflight = null;
    }
  })();
  return configInflight;
}

/** 首次加载 + 失败后静默自动重试（600ms／1500ms 两次）；重试用尽仍失败才展示错误卡片与「重试」入口（fail-closed 保持不变） */
async function loadConfig(attempt = 0): Promise<void> {
  if (shopId.value <= 0 || disposed) return;
  const r = await fetchConfig();
  if (r.ok || disposed) return;
  if (attempt < CONFIG_RETRY_DELAYS_MS.length) {
    configRetryTimer = setTimeout(() => {
      configRetryTimer = null;
      if (disposed || config.value != null) return;
      void loadConfig(attempt + 1);
    }, CONFIG_RETRY_DELAYS_MS[attempt]);
    return;
  }
  configError.value = r.message;
}

function onRetryConfig(): void {
  hapticTap();
  configError.value = null;
  void loadConfig(CONFIG_RETRY_DELAYS_MS.length); // 手动重试：单次请求，失败则立刻回到错误卡片（不再叠加自动重试）
}

function toggleDepositAgree(): void {
  depositAgreed.value = !depositAgreed.value;
}

async function initialLoad(): Promise<void> {
  // 缺 shopId：无法定位门店，停在空态由用户返回（不发任何请求）
  if (shopId.value > 0) await Promise.all([loadShopNameFallback(), loadSlotsForSelectedDate(), loadConfig()]);
  ready.value = true;
}

function goBack(): void {
  if (typeof uni !== "undefined" && typeof uni.navigateBack === "function") uni.navigateBack();
}

// —— 提交 ——
/** 提交按钮点击：触感反馈（原 BaseButton 门面自带，换原生 view 后在页面补）→ 提交；提交中忙态直接忽略 */
function onSubmitTap(): void {
  if (submitting.value) return;
  hapticTap();
  void doSubmit();
}

/**
 * @param resumed 登录成功后自动补发（已脱离点击手势：wx.requestSubscribeMessage 必然被微信拒绝）⇒ 不再请求订阅授权，避免白白报错；
 *                支付与其余流程不变。
 */
async function doSubmit(resumed = false): Promise<void> {
  if (submitting.value) return;
  if (selectedSlotId.value == null) {
    toast("请先选择到店时段");
    return;
  }
  let cfg = config.value;
  if (cfg == null) {
    // 配置没拿到（初始加载及自动重试都失败）：不 fail-open，但也不让一次瞬时失败阻断所有门店——点击提交时先重取一次。
    //   · 重取成功且未开启保证金 ⇒ 继续走**无保证金的原提交流程**（此时已脱离点击手势，但未开启保证金本来就不弹订阅授权，行为同旧版）；
    //   · 重取成功且已开启 ⇒ 展示规则卡片并提示勾选，**不直接提交**（用户尚未看过规则）；
    //   · 重取也失败 ⇒ 才拦截并提示重试（错误卡片＋「重试」入口）。
    submitting.value = true;
    let r: ConfigLoadOutcome;
    try {
      r = await fetchConfig();
    } finally {
      submitting.value = false;
    }
    if (disposed) return;
    if (!r.ok) {
      configError.value = r.message;
      toast(r.message !== "" ? r.message : "预约规则加载失败，请重试");
      return;
    }
    cfg = config.value;
    if (cfg == null) return;
    if (cfg.deposit.enabled) {
      depositAgreed.value = false; // 规则刚展示出来，之前的勾选（若有）不算数
      toast("请先阅读预约保证金规则，勾选同意后再提交");
      return;
    }
    if (selectedSlotId.value == null) {
      toast("请先选择到店时段");
      return;
    }
    resumed = true; // 已不在点击手势内：未开启保证金不请求订阅授权（本来也不请求）
  }
  if (cfg.deposit.enabled && !depositAgreed.value) {
    toast("请先阅读并勾选同意预约保证金规则");
    return;
  }
  submitting.value = true;
  try {
    // 注意：此处到 depositSubmit.submit 的同步调用链内**不得出现 await**：订阅授权（wx.requestSubscribeMessage）必须在点击手势的同步调用栈内触发
    const outcome = await depositSubmit.submit(
      {
        shopId: shopId.value,
        slotId: selectedSlotId.value,
        date: selectedDate.value,
        customerName: String(customerName.value ?? ""),
        customerPhone: String(customerPhone.value ?? ""),
        guestCount: guestCount.value,
        remark: remark.value,
      },
      {
        depositEnabled: cfg.deposit.enabled,
        agreed: depositAgreed.value,
        templates: resumed ? { result: "", done: "" } : cfg.subscribeTemplates,
        payHoldMinutes: cfg.payHoldMinutes,
        agreedAmountFen: cfg.deposit.amountFen,
      },
    );
    // 页面已销毁（用户在支付流程中离开）：不再写结果页状态、不弹别的页面上的 toast；支付结果以「我的预约」为准
    if (disposed) return;
    switch (outcome.kind) {
      case "blocked":
        toast("请先阅读并勾选同意预约保证金规则");
        return;
      case "failed":
        handleSubmitFailure(outcome.result);
        return;
      case "created":
        showResult(outcome.booking.id);
        return;
      case "paid": {
        const t = describePaidResult(outcome.booking.deposit?.amountFen ?? cfg.deposit.amountFen);
        showResult(outcome.booking.id, t.title, t.desc);
        return;
      }
      case "unpaid": {
        if (outcome.reason === "busy") return; // 已有支付在飞：忽略重复触发
        if (outcome.reason === "authExpired") toast("登录已失效，请重新登录");
        const t = describeUnpaidResult(outcome.reason, outcome.retainMinutes);
        showResult(outcome.booking.id, t.title, t.desc, outcome.reason === "closed" ? "查看我的预约" : "去我的预约");
        if (outcome.reason === "closed") void loadSlotsForSelectedDate(); // 档期已释放，刷新余量
        return;
      }
    }
  } finally {
    submitting.value = false;
  }
}

/** 展示结果页（创建成功／保证金已支付／已保留待支付／确认中／已关闭）；默认值＝既有免保证金预约成功态 */
function showResult(bookingId: number, title = "预约已提交", desc = "预约已提交，等待门店确认。可在「我的预约」查看进度", cta = "查看我的预约"): void {
  submitSuccess.value = true;
  submittedBookingId.value = bookingId;
  resultTitle.value = title;
  resultDesc.value = desc;
  resultCta.value = cta;
}

/** 创建前失败（校验／未登录／会话失效／业务失败）：沿用既有分支，行为与保证金改造前一致 */
function handleSubmitFailure(r: Exclude<SubmitBookingResult, { ok: true }>): void {
  if (r.kind === "validation") {
    toast(r.error.message);
    return;
  }
  if (r.kind === "login-required") {
    pendingSubmit.value = true;
    openLoginPopup();
    return;
  }
  if (r.kind === "auth-expired") {
    // 服务端 401（会话失效，client 已清会话）：提示中文原因并沿用既有登录弹窗，登录成功后自动补发本次提交
    toast(r.message);
    pendingSubmit.value = true;
    openLoginPopup();
    return;
  }
  // kind === "business"：服务端中文可读原因，直接展示（如"该时段已约满"/"您已预约该时段"/"未完成预约已达上限(5条)"）
  toast(r.message);
  // 服务端判定约满/不可约时，当前时段快照可能已过期——重拉一次时段，避免用户对着错误的余量再次提交
  void loadSlotsForSelectedDate(true);
}

function closeLoginPopup(): void {
  showLoginPopup.value = false;
  loginAgreementChecked.value = false;
  pendingSubmit.value = false;
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
  if (pendingSubmit.value) {
    pendingSubmit.value = false;
    void doSubmit(true); // 登录成功后自动补发挂起的提交（同 demoDetail 点赞登录门 pending 补发语义）
  }
}

function goMyBookings(): void {
  hapticTap();
  if (typeof uni !== "undefined" && typeof uni.redirectTo === "function") {
    uni.redirectTo({ url: "/pages/myBookings/index" });
  }
}
</script>

<template>
  <view class="container">
    <CustomNavBar :title="shopName !== '' ? shopName + ' · 到店预约' : '到店预约'" :manual-back="true" @back="goBack" />

    <view v-if="!ready" class="sk-wrap">
      <SkeletonBlock width="100%" height="88rpx" radius="16rpx" />
      <view class="sk-gap"></view>
      <SkeletonBlock width="100%" height="320rpx" radius="16rpx" />
    </view>

    <view v-else-if="shopId <= 0" class="empty-state">
      <view class="empty-title">门店信息缺失</view>
      <view class="empty-desc">请从门店页重新进入</view>
    </view>

    <template v-else-if="submitSuccess">
      <view class="success-wrap">
        <view class="success-title font-noto-serif">{{ resultTitle }}</view>
        <view class="success-desc">{{ resultDesc }}</view>
        <view class="btn-primary success-btn my-bookings-btn" hover-class="press-dim" @click="goMyBookings">
          <text>{{ resultCta }}</text>
        </view>
        <view class="success-back" hover-class="press-dim" @click="goBack">返回</view>
      </view>
    </template>

    <template v-else>
      <view class="section">
        <view class="section-title">选择日期</view>
        <scroll-view scroll-x class="date-row">
          <view
            v-for="(d, idx) in dateWindow"
            :key="d.date"
            :class="idx === selectedDateIndex ? 'date-cell is-active' : 'date-cell'"
            hover-class="press-dim"
            @click="onPickDate(idx)"
          >
            <text class="date-week">{{ d.weekLabel }}</text>
            <text class="date-label">{{ d.label }}</text>
          </view>
        </scroll-view>
      </view>

      <view class="section">
        <view class="section-title">选择时段</view>
        <view v-if="slotsLoading" class="slot-grid">
          <SkeletonBlock v-for="i in 6" :key="i" width="31%" height="96rpx" radius="12rpx" />
        </view>
        <view v-else-if="slotsError !== null" class="slot-error">
          <text class="slot-error-text">{{ slotsError }}</text>
          <view class="btn-secondary retry-btn" hover-class="press-dim" @click="onRetrySlots">
            <text>重试</text>
          </view>
        </view>
        <view v-else-if="slots.length === 0" class="slot-empty">当日暂无可约时段</view>
        <view v-else class="slot-grid">
          <view
            v-for="slot in slots"
            :key="slot.slotId"
            :class="[
              'slot-cell',
              slot.slotId === selectedSlotId ? 'is-active' : '',
              !slotMeta(slot).clickable ? 'is-disabled' : '',
            ]"
            hover-class="press-dim"
            @click="onPickSlot(slot)"
          >
            <text class="slot-time">{{ slot.startTime }}-{{ slot.endTime }}</text>
            <text class="slot-badge">{{ slotMeta(slot).badge }}</text>
          </view>
        </view>
      </view>

      <view class="section">
        <view class="section-title">预约信息</view>
        <view class="form-row">
          <text class="form-label">姓名</text>
          <input class="form-input" v-model="customerName" placeholder="请输入姓名" maxlength="32" />
        </view>
        <view class="form-row">
          <text class="form-label">手机号</text>
          <input class="form-input" v-model="customerPhone" type="number" placeholder="请输入手机号" maxlength="11" />
        </view>
        <view class="form-row">
          <text class="form-label">到店人数</text>
          <view class="stepper">
            <view class="stepper-btn" hover-class="press-dim" @click="stepGuestCount(-1)">
              <view class="bar-h"></view>
            </view>
            <text class="stepper-value">{{ guestCount }}</text>
            <view :class="guestCount >= guestMax ? 'stepper-btn is-disabled' : 'stepper-btn'" hover-class="press-dim" @click="stepGuestCount(1)">
              <view class="bar-h"></view>
              <view class="bar-v"></view>
            </view>
          </view>
        </view>
        <view class="form-row form-row-remark">
          <text class="form-label">备注</text>
          <textarea class="form-textarea" v-model="remark" placeholder="选填，如特殊需求" maxlength="255" />
        </view>
      </view>

      <!-- 预约保证金：仅门店开启时展示（金额＋规则摘要＋勾选同意）；未开启的门店这一块完全不渲染 -->
      <view v-if="depositEnabled" class="section deposit-card">
        <view class="deposit-head">
          <text class="deposit-title">预约保证金</text>
          <text class="deposit-amount">{{ depositAmountText }}</text>
        </view>
        <view v-for="(line, idx) in depositRuleLines" :key="idx" class="deposit-line">
          <text class="deposit-line-text">{{ line }}</text>
        </view>
        <view class="deposit-line">
          <text class="deposit-line-text">{{ depositHoldText }}</text>
        </view>
        <view class="deposit-agree" hover-class="press-dim" @click="toggleDepositAgree">
          <view :class="depositAgreed ? 'deposit-check is-checked' : 'deposit-check'">
            <view v-if="depositAgreed" class="deposit-mark"></view>
          </view>
          <text class="deposit-agree-text">我已阅读并同意以上预约保证金规则</text>
        </view>
      </view>
      <!-- 配置拉取失败（fail-closed）：不允许在未明示规则的情况下提交，给出重试入口 -->
      <view v-else-if="configError !== null" class="section deposit-card">
        <text class="deposit-line-text">{{ configError }}</text>
        <view class="btn-secondary config-retry-btn" hover-class="press-dim" @click="onRetryConfig">
          <text>重试</text>
        </view>
      </view>

      <view class="submit-bar">
        <view
          :class="submitting ? 'btn-primary submit-btn is-busy' : 'btn-primary submit-btn'"
          hover-class="press-dim"
          @click="onSubmitTap"
        >
          <text>{{ submitting ? "提交中..." : submitLabel }}</text>
        </view>
      </view>
    </template>

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
  </view>
</template>

<style lang="scss" scoped>
.container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: $color-page;
  padding-bottom: 48rpx;
}
.sk-wrap {
  padding: 32rpx;
}
.sk-gap {
  height: 24rpx;
}
.section {
  margin: 24rpx 24rpx 0;
}
.section-title {
  font-size: $font-size-body;
  color: $color-text-secondary;
  margin-bottom: 16rpx;
}
.date-row {
  display: flex;
  flex-direction: row;
  white-space: nowrap;
}
.date-cell {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 108rpx;
  height: 108rpx;
  margin-right: 16rpx;
  border-radius: 16rpx;
  background: rgba(241, 205, 145, 0.06);
  border: 2rpx solid rgba(241, 205, 145, 0.12);
}
.date-cell.is-active {
  background: rgba(241, 205, 145, 0.18);
  border-color: $color-action;
}
.date-week {
  font-size: $font-size-caption;
  color: $color-text-secondary;
}
.date-label {
  margin-top: 6rpx;
  font-size: $font-size-body;
  color: $color-text-primary;
}
.slot-grid {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16rpx;
}
.slot-cell {
  width: calc((100% - 32rpx) / 3);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 96rpx;
  border-radius: 12rpx;
  background: rgba(241, 205, 145, 0.06);
  border: 2rpx solid rgba(241, 205, 145, 0.12);
}
.slot-cell.is-active {
  background: rgba(241, 205, 145, 0.18);
  border-color: $color-action;
}
.slot-cell.is-disabled {
  opacity: 0.4;
}
.slot-time {
  font-size: $font-size-body;
  color: $color-text-primary;
}
.slot-badge {
  margin-top: 4rpx;
  font-size: $font-size-caption;
  color: $color-text-secondary;
}
.slot-empty,
.slot-error {
  padding: 32rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  color: $color-text-secondary;
  font-size: $font-size-body;
}
.form-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  min-height: 92rpx;
  border-bottom: 1rpx solid rgba(255, 255, 255, 0.06);
}
.form-row-remark {
  align-items: flex-start;
  padding-top: 20rpx;
}
.form-label {
  width: 160rpx;
  flex-shrink: 0;
  font-size: $font-size-body;
  color: $color-text-secondary;
}
.form-input {
  flex: 1;
  font-family: 'HarmonyOS-Sans-SC';
  font-size: $font-size-body;
  color: $color-text-primary;
}
.form-textarea {
  flex: 1;
  min-height: 120rpx;
  font-family: 'HarmonyOS-Sans-SC';
  font-size: $font-size-body;
  color: $color-text-primary;
}
.stepper {
  display: flex;
  flex-direction: row;
  align-items: center;
}
.stepper-btn {
  position: relative;
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: rgba(241, 205, 145, 0.12);
}
/* 加减号用 CSS 绘制（不使用文字图标）：横条居中，竖条仅"加"按钮有 */
.stepper-btn.is-disabled {
  opacity: 0.4;
}
.bar-h,
.bar-v {
  position: absolute;
  left: 50%;
  top: 50%;
  background: $color-action;
  border-radius: 2rpx;
}
.bar-h {
  width: 24rpx;
  height: 4rpx;
  margin-left: -12rpx;
  margin-top: -2rpx;
}
.bar-v {
  width: 4rpx;
  height: 24rpx;
  margin-left: -2rpx;
  margin-top: -12rpx;
}
.stepper-value {
  width: 72rpx;
  text-align: center;
  font-size: $font-size-body;
  color: $color-text-primary;
}
.submit-bar {
  margin: 40rpx 24rpx 0;
}
/* 主/次按钮外观来自 App.vue 全局 .btn-primary / .btn-secondary；本页只管宽度与忙态（不新造颜色） */
.submit-btn,
.success-btn {
  width: 100%;
  box-sizing: border-box;
}
.btn-primary.is-busy {
  opacity: 0.6;
  pointer-events: none;
}
.retry-btn {
  box-sizing: border-box;
}
/* 预约保证金卡片：配色沿用页面既有 token（金描边卡片面），勾选框画法同 LoginPopup 协议勾选（平铺选择器，不嵌套） */
.deposit-card {
  padding: 24rpx;
  border-radius: 20rpx;
  background: rgba(241, 205, 145, 0.06);
  border: 2rpx solid rgba(241, 205, 145, 0.12);
}
.deposit-head {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}
.deposit-title {
  font-size: $font-size-body;
  color: $color-action;
}
.deposit-amount {
  font-size: $font-size-sub-title;
  color: $color-action;
}
.deposit-line {
  margin-top: 8rpx;
}
.deposit-line-text {
  font-size: $font-size-caption;
  color: $color-text-secondary;
  line-height: 1.5;
}
.deposit-agree {
  margin-top: 20rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
}
.deposit-check {
  width: 36rpx;
  height: 36rpx;
  margin-right: 16rpx;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2rpx solid rgba(255, 255, 255, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.deposit-check.is-checked {
  border-color: $color-action;
  background: linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%);
}
.deposit-mark {
  width: 18rpx;
  height: 10rpx;
  border-left: 4rpx solid $color-action-text;
  border-bottom: 4rpx solid $color-action-text;
  transform: rotate(-45deg) translate(1rpx, -2rpx);
}
.deposit-agree-text {
  flex: 1;
  font-size: $font-size-caption;
  color: $color-text-primary;
}
.config-retry-btn {
  margin-top: 16rpx;
  box-sizing: border-box;
}
.empty-state {
  flex: 1;
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
}
.success-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 48rpx;
  gap: 24rpx;
}
.success-title {
  font-size: $font-size-title;
  color: $color-action;
}
.success-desc {
  font-size: $font-size-body;
  color: $color-text-secondary;
  text-align: center;
  margin-bottom: 24rpx;
}
.success-back {
  margin-top: 16rpx;
  font-size: $font-size-body;
  color: $color-text-secondary;
}
</style>
