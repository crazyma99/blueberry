<script setup lang="ts">
// T9b（Phase 3.3）AI 推荐入口页——旧端 pages/aiRecommend/index.uvue（665 行）忠实移植。
//
// 旧端映射（行号）：
//  · 模板 1-74：CustomNavBar「AI智能推荐」:3 → 描述文案 :5-7 → 上传框（组件化 AppPhotoPicker :10-16）
//    → 底部占位 :19 → BottomActionBar :22-47（付费态价格按钮 :24-33；普通态按钮＋「限时免费 N 次」角标 :35-46）
//    → LoginPopup :50-61 → ProfilePopup :64-72
//  · 生命周期：onLoad :134-139（options.shopId → resolveShopIfNeeded 店铺兜底）；onShow :162-177
//    （监听 `login-required` 401 事件＋`consumeLoginExpired()` 兑底＋已登录且店铺已知时查推荐余额）；
//    onHide :178-183（作废到账轮询会话＋复位支付门闩）
//  · 业务：choosePhoto :185-201（1 张/压缩/相册或相机；>10MB 提示）→ checkAndAcceptPhoto :204-225
//    （照片质量检测，未通过 showModal；通过后只置预览，**上传留到点击按钮时**）→ handleStartAnalysis :227-276
//    （顺序守卫：空图 → 上传中 → 未登录拉登录 → 余额未知先补查 → **付费模式且无次数直接拉起支付** →
//      已上传过直接跳等待页 → 上传 → 跳转）；navigateToLoading :278-282；loadCreditInfo :287-299；
//    handleRecharge :303-351；pollRechargeStatus :356-394；resumeAnalyzeIfNeeded :398-407；
//    登录弹窗族 :410-492；头像昵称 :495-550
//  · 样式 555-665 逐值（换算口径见「偏差清单」）
//
// 验收落实（本批 P3-16～P3-20）：
//  · **P3-16**：本页**零推荐请求**（推荐 POST 只在等待页发起一次）⇒ 无重复扣费路径；上传走共享
//    `application/ai-photo-upload`（`/api/aiface/upload`），**页面无 `uni.request`**。
//  · **P3-17**：充值一律走共享 `payment-coordinator.recharge(ctx,{shopId,credits:1,feature:"recommend",operationId})`
//    （**旧端自建 `pollRechargeStatus` 2.5s×48 次整段删除**，页面零自建到账轮询）；**paid 且余额同时满足后
//    只续跑一次**（`resumeAnalyzeAfterCredit` 一次性标记，`resumeAnalyzeIfNeeded` 内**先清后调**，续跑前
//    再拉一次余额双确认，未到账只提示**绝不自动二次拉起支付**）；取消/超时/下单失败/登录过期都有明确入口。
//  · **P3-18**：本页不接触推荐 DTO；结果分展示口径见 aiRecommendResult 页头。
//  · **P3-19**：入口开关逻辑与旧端逐条一致（含「付费模式且已知无剩余次数：直接拉起支付，省一次必败请求」）；
//    缩略图/等待页文案不涉及本页。
//  · **P3-20（可测场景）**：连点＝`uploading` + `isPaying` 双闸（同 op 复用同一支付过程）；
//    401＝`uploader` 返回 `authExpired`／`creditRepo` 返回 `AUTH_EXPIRED` 时拉起登录弹窗；
//    弱网＝上传/查询失败静默保持原按钮可重试；**离页**＝onUnload 清 `resumeAnalyzeAfterCredit`，
//    已销毁页面不会被协调器的迟到终态再次拉起分析。
//
// 偏差清单（有意，逐条）：
//  ①主题：旧端 `.page{background: var(--color-bg)}`＝深色 `#160F04`；本页沿用**深色页底 `#160f04`**（AI 批次统一口径）。
//  ②401：旧端 `uni.$on('login-required')`＋`consumeLoginExpired()` 全局事件兜底**未移植**——新端 client 无事件总线
//    （401 → `AUTH_EXPIRED` 给调用方，口径同已迁 mine 页偏差①）⇒ 本页在**每个调用点显式处理**：
//    上传 401 → 拉登录弹窗；余额查询 401 → 拉登录弹窗。
//  ③到账轮询：旧端 `pollRechargeStatus`（含 `payPollToken` 会话标记、`payGuard.toConfirming()`）整段删除，
//    改由共享协调器承担（P3-17）；页面仅保留 `isPaying` 防连点标志；`onHide` 旧端「作废轮询＋复位门闩」
//    在新端体现为 `isPaying=false`（协调器在终态释放自身门闩，超时≠订单作废）。
//  ④防截屏：旧端推荐三页从未启用 capture guard；本批按父会话指令与 `pages/aiTryOn*` 同纪律统一启用。
//  ⑤头像昵称提交：按**旧端本页语义**走真实 `PUT /api/wx/userinfo`（乐观合并＋失败 toast），未沿用参考页
//    aiTryOn 的「仅本地保存」简化版（那属该页的有意偏差）。
//  ⑥登录成功后的余额查询：旧端 :481 无条件 `loadCreditInfo()`；本页保留（首次查询后端会惰性发放免费次数）。
//  ⑦旧端 `closeLoginPopup` 内的 `rejectAllPending()`／`rejectAllPendingUploads()`（拒绝挂起的 401 请求）
//    在新端无对应物（client 不挂起请求）⇒ 仅关闭弹窗。
//  ⑧token：旧 `--font-size-body-plus`(28rpx)／`--font-size-body-xs`(20rpx) 写旧值字面量（**勿映射**
//    `tokens.semantic.fontSizeBody`=32rpx）；金色 `#F1CD91` → `tokens.semantic.colorAction`；金色面上的墨色
//    `#160F04` → `tokens.semantic.colorActionText`；`--spacing-sm`(20rpx)／`--spacing-lg`(32rpx)／
//    `--radius-xl`(44rpx)／`--radius-sm`(8rpx) 按 App.uvue 旧值字面量。
import { computed, ref } from "vue";
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import { PROFILE } from "../../generated/profile.config";
import { detectUiPlatform } from "../../ui/ui-platform";
import { isPlatform, type Platform } from "../../ports/context";
import { createUniTransport } from "../../platform/uni/transport";
import { createUniStorage } from "../../platform/uni/storage";
import { createUniLoginCode } from "../../platform/uni/login";
import { createUniPhotoChooser } from "../../platform/uni/chooser";
import { createUniUpload } from "../../platform/uni/upload";
import { toast as nativeToast, showLoading as nativeShowLoading, hideLoading as nativeHideLoading, showModal, navigateTo } from "../../platform/uni/feedback";
import { createCaptureGuard } from "../../platform/weixin/capabilities";
import { createWeixinPhotoCheck } from "../../platform/weixin/photo-check";
import { createWeixinPayments } from "../../platform/weixin/payments";
import { createAuthCoordinator } from "../../application/auth-coordinator";
import { createSilentIdentityExchange } from "../../application/silent-login";
import { createContextFactory } from "../../application/request-context";
import { createVersionedStorage } from "../../infrastructure/storage/versioned";
import { createHttpClient } from "../../infrastructure/http/client";
import { createCreditRepository } from "../../infrastructure/repositories/credits";
import { createShopRepository } from "../../infrastructure/repositories/shops";
import { createUserInfoRepository } from "../../infrastructure/repositories/user-info";
import { createWxAuthRepository } from "../../infrastructure/repositories/wx-auth";
import { createUserInfoStore } from "../../application/user-info-store";
import { createPhoneLoginFlow, toLocalUser } from "../../application/login-flow";
import { createPageConfigContent, type FooterContent } from "../../application/page-config-content";
import { createPageConfigRepository } from "../../infrastructure/repositories/page-config";
import { createPaymentCoordinator } from "../../application/payment-coordinator";
import { PayGuard } from "../../domain/payment-state";
import {
  buildUploadHeaders,
  createAiPhotoUploader,
  PHOTO_SIZE_LIMIT_BYTES,
} from "../../application/ai-photo-upload";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import AppPhotoPicker from "../../components/AppPhotoPicker/AppPhotoPicker.vue";
import BottomActionBar from "../../components/BottomActionBar/BottomActionBar.vue";
import BaseFeedback from "../../ui/BaseFeedback.vue";
import BaseLoadingPopup from "../../ui/BaseLoadingPopup.vue";
import LoginPopup from "../../components/LoginPopup/LoginPopup.vue";
import ProfilePopup from "../../components/ProfilePopup/ProfilePopup.vue";

// —— 装配（顺序与 pages/aiTryOn/index.vue、pages/aiTryOnResult/index.vue 完全同口径）——
const detected = detectUiPlatform();
const platform: Platform = isPlatform(detected) ? detected : "mp-weixin";

// —— 反馈通道统一（2026-09-23 B2；主人「选项一，都应该改」）——
// 加载态：微信端走门面弹层（Token 化）；抖音端（AI 六页不注册，理论不进入）仍走原生，避免「两套 loading 同时出现」。
// 轻提示：优先门面 wot Toast，门面未就绪时回落原生。**调用点（22 处 toast ＋ 4/6 处 loading）零改动**。
const loadingPopupVisible = ref(false);
const loadingPopupText = ref("");
function showLoading(text: string): void {
  if (detected === "mp-toutiao") {
    nativeShowLoading(text);
    return;
  }
  loadingPopupText.value = text;
  loadingPopupVisible.value = true;
}
function hideLoading(): void {
  if (detected === "mp-toutiao") {
    nativeHideLoading();
    return;
  }
  loadingPopupVisible.value = false;
}
const feedbackRef = ref<InstanceType<typeof BaseFeedback> | null>(null);
function toast(text: string, icon?: "success" | "error" | "none" | "loading"): void {
  const f = feedbackRef.value;
  if (f != null) {
    f.show(text, icon as never);
    return;
  }
  nativeToast(text, icon as never);
}
const env = PROFILE.environment;
const transport = createUniTransport({ baseUrl: PROFILE.apiBases[env] });
const uniStorage = createUniStorage();
const versioned = createVersionedStorage({ backend: uniStorage, platform, profileKey: PROFILE.profileKey });
const userStore = createUserInfoStore({ backend: uniStorage });
const authCoordinator = createAuthCoordinator({
  exchangeIdentity: createSilentIdentityExchange({
    // P2-03 provider：uni.login 取 code → POST /api/wx/login 换票 → Session；wxAuth 惰性取用（装配顺序 client→wxAuth→coordinator）
    getWxAuth: () => wxAuth,
    loginCode: createUniLoginCode({ platform }),
    platform,
    profileKey: PROFILE.profileKey,
  }),
  storage: uniStorage,
});
const client = createHttpClient({ transport, authCoordinator });
const wxAuth = createWxAuthRepository({ client, platform });
const creditRepo = createCreditRepository({ client });
const shopRepo = createShopRepository({ client });
const userInfoRepo = createUserInfoRepository({ client });
const phoneLoginFlow = createPhoneLoginFlow({
  wxAuth,
  authCoordinator,
  userStore,
  context: () => ctxFactory.next(),
  platform,
  profileKey: PROFILE.profileKey,
});
const ctxFactory = createContextFactory({
  platform,
  environment: env,
  profileKey: PROFILE.profileKey,
  appCode: PROFILE.appCode,
  getBrandId: () => versioned.loadBrandId(),
});
const chooser = createUniPhotoChooser();
const uploader = createAiPhotoUploader({
  upload: createUniUpload(),
  baseUrl: PROFILE.apiBases[env],
  headers: () =>
    buildUploadHeaders({
      token: versioned.loadSession()?.token ?? null,
      brandId: versioned.loadBrandId(),
      appCode: PROFILE.appCode,
    }),
});
const photoCheck = createWeixinPhotoCheck();
const captureGuard = createCaptureGuard();
const coordinator = createPaymentCoordinator({
  credits: creditRepo,
  payments: createWeixinPayments(),
  gate: new PayGuard(),
  // 旧端 pollRechargeStatus(:361) 口径还原：进入到账确认轮询挂「确认到账中...」，离开即摘（2026-09-19 主人指示 loading 与原版一致）
  onPhase: (p) => (p === "confirmingEntitlement" ? showLoading("确认到账中...") : hideLoading()),
});
const pageContent = createPageConfigContent({
  pageConfig: createPageConfigRepository({ client }),
  profile: {
    copyrightText: PROFILE.copyrightText,
    contactQrSrc: PROFILE.contactQrSrc,
    contactPhoneText: PROFILE.contactPhoneText,
  },
});

// 协议名（旧端 legal.uts:2-3；miniAppName 随 Profile）
const userAgreementName = `《${PROFILE.miniAppName} 用户协议》`;
const privacyPolicyName = `《${PROFILE.miniAppName} 隐私政策》`;

// —— 页面状态（旧端 data :92-116 逐字段对应；到账轮询字段已交共享 coordinator，不再在页面持有）——
const shopId = ref("");
const photoPath = ref("");
const photoPreviewUrl = ref("");
const uploadedFilename = ref("");
const uploading = ref(false);
// 登录弹窗
const showLoginPopup = ref(false);
const loginAgreementChecked = ref(false);
// 头像昵称弹窗
const showProfilePopup = ref(false);
const profileAvatarUrl = ref("");
const profileNickname = ref("");
// 推荐次数 / 支付
const creditBalance = ref(-1); // 剩余推荐次数，-1 = 未查询到
const priceFenPerCredit = ref(0); // 推荐单次价格（分），0 = 未开通付费购买（非付费模式）
const creditLoaded = ref(false); // 是否已成功查询到推荐余额
const isPaying = ref(false); // 支付流程进行中（旧端 payGuard.isBusy() 的页面侧等价物，防连点）
const resumeAnalyzeAfterCredit = ref(false); // 支付成功后自动继续分析（一次性标记）
const footer = ref<FooterContent>({ mainLine: "", supportLine: "" });

// —— computed（旧端 :117-133）——
// 付费模式：已查询到推荐余额且商户配置了单次价格
const isPaidMode = computed<boolean>(() => creditLoaded.value && priceFenPerCredit.value > 0);
// 单次价格文案（分 → 元，整元去小数）
const priceText = computed<string>(() => {
  const fen = priceFenPerCredit.value;
  if (fen <= 0) return "0";
  if (fen % 100 === 0) return `${fen / 100}`;
  return (fen / 100).toFixed(2);
});
// 按钮可用条件（旧端内联表达式 `photoPreviewUrl !== '' && !payBusy`）：空图或支付流程中置灰
const canStart = computed<boolean>(() => photoPreviewUrl.value !== "" && !isPaying.value);

// —— 生命周期（旧端 :134-183）——
onLoad((options?: Record<string, unknown>) => {
  shopId.value = options?.shopId != null ? String(options.shopId) : "";
  // 入口未带 shopId（如首页 banner 直达）时兜底解析默认店铺，保证余额查询 / AI 分析 / 充值都有店铺上下文
  void resolveShopIfNeeded();
  void loadFooter();
});

onShow(() => {
  captureGuard.enable();
  // 查询推荐次数余额（需登录；未登录时保持原按钮，避免进页即拉起登录）
  // 店铺已兜底解析后才查询，避免无店铺上下文查不到免费次数（旧端 :172-176）
  if (isLoggedIn() && shopId.value !== "") void loadCreditInfo();
});

onHide(() => {
  captureGuard.disable();
  // 旧端 :178-183：作废到账轮询会话并复位支付门闩，回到页面可再次操作
  isPaying.value = false;
  // T9b CR 🟡2：隐藏态也必须关闭「到账后自动续跑」一次性标记（对齐旧端 :177-183 的 payPollToken++/guard.end() 语义）——
  // 否则页面隐藏未销毁时，协调器的迟到成功终态仍会 resumeAnalyzeIfNeeded → 可能非预期导航。
  resumeAnalyzeAfterCredit.value = false;
});

onUnload(() => {
  // 页面已销毁 ⇒ 迟到终态不得再拉起分析（旧端以 `payPollToken` 自增作废，新端清一次性标记）
  resumeAnalyzeAfterCredit.value = false;
  captureGuard.disable(); // redirectTo/reLaunch 只触发 onUnload，残留会污染全局
});

// —— 店铺兜底（旧端 :140-161）——
async function resolveShopIfNeeded(): Promise<void> {
  if (shopId.value !== "") {
    if (isLoggedIn()) void loadCreditInfo();
    return;
  }
  try {
    const res = await shopRepo.getShops(ctxFactory.next());
    if (res.ok && Array.isArray(res.value)) {
      for (const shop of res.value) {
        if (shop != null && shop.id != null) {
          shopId.value = String(shop.id);
          break;
        }
      }
    }
  } catch (err) {
    // 解析失败保持 shopId 为空，走后续失败提示，不阻塞页面
    console.error("[aiRecommend] 店铺兜底解析失败:", err);
  }
  // 店铺兜底完成后补查推荐余额（onShow 早于异步解析完成时由这里补）
  if (isLoggedIn()) void loadCreditInfo();
}

// —— 选图 → 检测（旧端 :185-225；**上传留到点击按钮时**，与旧端一致）——
async function choosePhoto(): Promise<void> {
  if (uploading.value) return;
  const picked = await chooser.choose(); // count 1 / sizeType compressed / album+camera（旧端 :187-190）
  if (picked == null) return; // 取消/容器失败静默
  if (picked.size > PHOTO_SIZE_LIMIT_BYTES) {
    toast("照片大小不能超过10MB"); // 旧端 :193-196
    return;
  }
  await checkAndAcceptPhoto(picked.path);
}

// 照片质量拦截：未通过时弹窗告知重新上传（旧端 :204-225）
async function checkAndAcceptPhoto(filePath: string): Promise<void> {
  showLoading("照片检测中...");
  let check = { ok: true, reason: "" };
  try {
    check = await photoCheck.check(filePath);
  } catch (err) {
    console.error("[aiRecommend] 照片检测异常（放行）:", err);
  }
  hideLoading();
  if (!check.ok) {
    showModal("照片未通过检测", `${check.reason}，请重新上传`);
    return;
  }
  photoPath.value = filePath;
  photoPreviewUrl.value = filePath;
  uploadedFilename.value = ""; // 换图后必须重新上传
}

// —— 开始分析（旧端 :227-282）——
async function handleStartAnalysis(): Promise<void> {
  if (photoPreviewUrl.value === "") {
    toast("请先上传照片");
    return;
  }
  if (uploading.value) return;

  // 上传前检查登录态，未登录先拉起登录弹窗（旧端 :234-238）
  if (!isLoggedIn()) {
    showLoginPopup.value = true;
    return;
  }

  // 点击时余额未知（此前查询失败/刚登录）→ 先补查后端免费次数与单次定价，再决定免费 or 付费（旧端 :240-243）
  if (!creditLoaded.value) {
    await loadCreditInfo();
  }

  // 付费模式且已知无剩余次数：直接拉起支付（金额取后端配置的单次价格），省一次必败请求（旧端 :245-249）
  if (isPaidMode.value && creditBalance.value <= 0) {
    void handleRecharge();
    return;
  }

  // 如果已经上传过，直接跳转（旧端 :251-255）
  if (uploadedFilename.value !== "") {
    navigateToLoading();
    return;
  }

  uploading.value = true;
  try {
    const res = await uploader.upload(photoPath.value);
    if (res.ok) {
      uploadedFilename.value = res.filename;
      uploading.value = false;
      navigateToLoading();
    } else {
      uploading.value = false;
      toast(res.message || "上传失败，请重试");
      // 401：拉起登录弹窗（旧端由全局 http 层事件处理，见偏差②）
      if (res.authExpired === true) showLoginPopup.value = true;
    }
  } catch (err) {
    uploading.value = false;
    console.error("[aiRecommend] 上传失败:", err);
    toast("上传失败，请重试");
  }
}

// 跳转等待页（旧端 :278-282 逐字：filename 需 encodeURIComponent，shopId 原样）
function navigateToLoading(): void {
  navigateTo(
    `/pages/aiRecommendLoading/index?filename=${encodeURIComponent(uploadedFilename.value)}&shopId=${shopId.value}`,
  );
}

// ========== 推荐次数 / 支付（旧端 :284-407）==========

// 查询推荐次数余额与单次定价（失败时静默，保持原按钮；旧端 :287-299）
async function loadCreditInfo(): Promise<void> {
  try {
    const shopIdNum = parseInt(shopId.value, 10) || 0;
    const res = await creditRepo.getBalance(ctxFactory.next(), {
      shopId: shopIdNum > 0 ? shopIdNum : undefined,
      feature: "recommend",
    });
    if (!res.ok) {
      // 登录态失效：显式拉起登录弹窗（旧端走全局事件，见偏差②）
      if (res.error.kind === "AUTH_EXPIRED") showLoginPopup.value = true;
      return;
    }
    creditBalance.value = res.value.balance;
    priceFenPerCredit.value = res.value.priceFenPerCredit;
    creditLoaded.value = true;
  } catch (err) {
    console.error("[aiRecommend] 查询推荐次数失败:", err);
  }
}

// 充值：共享支付协调器（下单 → 拉起微信支付 → 到账 → **权益双确认**）；旧端自建轮询整段删除（偏差③）
async function handleRecharge(): Promise<void> {
  if (isPaying.value) return; // 防连点（并发门闩在 coordinator 内，同 op 复用同一在飞过程）
  isPaying.value = true;
  // 支付由分析流程触发，到账后自动继续分析（旧端 :306-307）
  resumeAnalyzeAfterCredit.value = true;
  try {
    const shopIdNum = parseInt(shopId.value, 10) || 0;
    const out = await coordinator.recharge(ctxFactory.next(), {
      shopId: shopIdNum,
      credits: 1,
      feature: "recommend",
      // 同 op 重入复用同一在飞过程（P3-03），不创建第二笔订单
      operationId: `recommend-${shopIdNum}`,
    });
    if (out.ok) {
      // 到账＝订单 paid **且** recommend 池 balance>0（P3-05 双条件，由协调器 `confirm()` 保证）
      toast(`支付成功，${out.credits != null ? out.credits : 1} 次到账`); // 旧端 :375 逐字
      await resumeAnalyzeIfNeeded();
      return;
    }
    if (out.phase === "cancelled") {
      toast("已取消支付"); // 旧端 :339 逐字
      return;
    }
    if (out.reason === "unsupported") {
      toast("当前端暂不支持支付");
      return;
    }
    if (out.reason === "timeout") {
      // 超时≠订单作废（P3-04）：**绝不自动二次拉起支付**；提示用户稍后查看余额再试（旧端 :388 逐字）
      toast("到账确认超时，请稍后查看余额再试");
      return;
    }
    if (out.reason === "create-order-failed") {
      toast("下单失败，请重试"); // 旧端 :313／:349 逐字
      return;
    }
    toast("支付未完成，请重试"); // 旧端 :342 逐字
  } catch (err) {
    console.error("[aiRecommend] 创建充值订单失败:", err);
    toast("下单失败，请重试");
  } finally {
    // 支付门闩由协调器在终态释放；本标志仅用于页面防重复点击
    isPaying.value = false;
  }
}

// 支付到账后，自动继续之前被打断的分析（旧端 :398-407）。
// P3-17：**只续跑一次** —— 一次性标记**先清后调**；续跑前重拉余额双确认，
// 仍未到账只提示（"到账延迟"），**绝不自动二次拉起支付**（防二次弹窗/二次收费）。
async function resumeAnalyzeIfNeeded(): Promise<void> {
  if (!resumeAnalyzeAfterCredit.value) return;
  resumeAnalyzeAfterCredit.value = false;
  await loadCreditInfo();
  if (creditLoaded.value && creditBalance.value > 0) {
    void handleStartAnalysis();
  } else {
    toast("到账延迟，请稍候重新发起分析"); // 旧端 :405 逐字
  }
}

// ========== 登录弹窗（旧端 :410-492；复用 login-flow 与 P2-18 组件）==========
function closeLoginPopup(): void {
  showLoginPopup.value = false;
  loginAgreementChecked.value = false;
  // 旧端此处另 reject 所有挂起的 401 请求；新端 client 不挂起请求 ⇒ 无对应物（偏差⑦）
}
function toggleLoginAgreement(): void {
  loginAgreementChecked.value = !loginAgreementChecked.value;
}
function showLoginAgreementToast(): void {
  toast("请先同意用户协议和隐私政策"); // 旧端 :423 逐字
}
function openUserAgreement(): void {
  navigateTo("/pages/policies/user");
}
function openPrivacyPolicy(): void {
  navigateTo("/pages/policies/privacy");
}
// 手机号授权回调（旧端 :435-492）
async function onGetPhoneNumber(e: unknown): Promise<void> {
  if (!loginAgreementChecked.value) {
    showLoginAgreementToast();
    return;
  }
  const detail = ((e as { detail?: Record<string, unknown> })?.detail ?? {}) as { errMsg?: string; code?: string };
  // 用户拒绝授权
  if (detail.errMsg != null && detail.errMsg !== "getPhoneNumber:ok") {
    if (detail.errMsg.includes("deny") || detail.errMsg.includes("cancel")) {
      toast("已取消授权");
    } else {
      console.error("[aiRecommend] 手机号授权失败:", detail.errMsg);
      toast("授权失败，请重试");
    }
    closeLoginPopup();
    return;
  }
  const phoneCode = detail.code;
  if (!phoneCode) {
    console.error("[aiRecommend] 未获取到 phoneCode");
    toast("获取手机号失败，请检查小程序认证状态");
    closeLoginPopup();
    return;
  }
  try {
    showLoading("登录中...");
    const result = await phoneLoginFlow.runPhoneLogin(phoneCode);
    hideLoading();
    if (!result.ok) {
      toast(result.errorKind === "login" ? "获取登录凭证失败，请重试" : result.errorMsg || "登录失败");
      closeLoginPopup();
      return;
    }
    // 关闭手机号登录弹窗
    showLoginPopup.value = false;
    loginAgreementChecked.value = false;
    // 登录成功后查询推荐次数余额（首次查询后端会惰性发放免费次数；旧端 :480-481）
    void loadCreditInfo();
    if (result.phoneHasFullProfile) {
      toast("登录成功", "success");
    } else {
      openProfilePopup();
    }
  } catch (err) {
    hideLoading();
    console.error("[aiRecommend] 手机号登录失败:", err);
    toast("登录失败，请重试");
  }
}

// ========== 头像昵称（旧端 :494-550）==========
function openProfilePopup(): void {
  const info = userStore.load();
  profileAvatarUrl.value = info?.avatarUrl ?? "";
  profileNickname.value = info?.nickname ?? "";
  showProfilePopup.value = true;
}
function onProfileNicknameInput(value: string): void {
  profileNickname.value = value;
}
function onChooseAvatar(e: unknown): void {
  // 组件 emit 载荷为 unknown（旧端为 chooseAvatar 事件对象）⇒ 兼容取值
  const url = (e as { detail?: { avatarUrl?: string } } | undefined)?.detail?.avatarUrl;
  if (url) profileAvatarUrl.value = String(url);
}
// 提交头像昵称：非空合并 + PUT /api/wx/userinfo（旧端 :507-539 乐观写入语义）
async function submitProfile(): Promise<void> {
  const nickname = (profileNickname.value || "").trim();
  const avatarUrl = profileAvatarUrl.value || "";
  if (nickname === "" && avatarUrl === "") {
    skipProfile();
    return;
  }
  // 乐观写入：保证后端响应不带 avatarUrl 时本地仍立即展示
  userStore.merge({
    id: 0,
    openid: "",
    phone: null,
    nickname: nickname !== "" ? nickname : null,
    avatarUrl: avatarUrl !== "" ? avatarUrl : null,
  });
  try {
    showLoading("更新中...");
    const res = await userInfoRepo.updateUserInfo(ctxFactory.next(), {
      nickname: nickname !== "" ? nickname : undefined,
      avatarUrl: avatarUrl !== "" ? avatarUrl : undefined,
    });
    hideLoading();
    if (!res.ok) {
      toast(res.error.message !== "" ? res.error.message : "更新失败");
    } else if (res.value != null) {
      userStore.merge(toLocalUser(res.value as unknown as Record<string, unknown>));
    }
  } catch (err) {
    console.error("[aiRecommend] 更新头像昵称失败:", err);
    hideLoading();
    toast("更新失败，请重试");
  } finally {
    finishProfile();
  }
}
function skipProfile(): void {
  finishProfile();
}
function finishProfile(): void {
  showProfilePopup.value = false;
  profileAvatarUrl.value = "";
  profileNickname.value = "";
  toast("登录成功", "success");
}

// ========== 页脚（旧端 BottomActionBar 内置 AppFooter；新端 props 注入，口径同已迁页面）==========
async function loadFooter(): Promise<void> {
  try {
    footer.value = await pageContent.loadFooter(ctxFactory.next());
  } catch (err) {
    console.error("[aiRecommend] 加载页脚配置失败:", err);
  }
}

// —— 小工具 ——
function isLoggedIn(): boolean {
  return versioned.loadSession() != null;
}
</script>

<template>
  <view class="page">
    <CustomNavBar title="AI智能推荐" />
    <!-- 描述文案（旧端 :4-7） -->
    <view class="desc-bar">
      <text class="desc-text">上传照片，AI为您推荐最合适的服饰风格</text>
    </view>

    <!-- 上传图片框（组件化 AppPhotoPicker；旧端 :9-16） -->
    <view class="section">
      <AppPhotoPicker :photo-url="photoPreviewUrl" :busy="uploading" @click="choosePhoto" />
    </view>

    <!-- 底部占位（旧端 :18-19） -->
    <view class="bottom-spacer"></view>

    <!-- 底部固定按钮（组件化 BottomActionBar：按钮组 slot + 内置版权 footer；旧端 :21-47） -->
    <BottomActionBar :footer-main-line="footer.mainLine" :footer-support-line="footer.supportLine">
      <!-- 付费模式且无剩余次数：价格按钮，点击引导充值，到账后自动继续分析（旧端 :23-33） -->
      <view v-if="isPaidMode && creditBalance <= 0" class="action-btn-wrap">
        <view
          :class="canStart ? 'action-btn' : 'action-btn action-btn-disabled'"
          hover-class="press-dim"
          @click="handleStartAnalysis"
        >
          <text class="action-btn-price">¥{{ priceText }}</text>
          <text class="action-btn-text"> 马上开启AI分析推荐</text>
        </view>
      </view>
      <!-- 非付费模式或有剩余次数：原按钮，有限免时右上角展示角标（旧端 :34-46） -->
      <view v-else class="action-btn-wrap">
        <view
          :class="canStart ? 'action-btn' : 'action-btn action-btn-disabled'"
          hover-class="press-dim"
          @click="handleStartAnalysis"
        >
          <text class="action-btn-text">{{ uploading ? "上传中..." : "开始AI分析推荐" }}</text>
        </view>
        <view v-if="isPaidMode && creditBalance > 0" class="action-btn-badge">
          <text class="action-btn-badge-text">限时免费 {{ creditBalance }} 次</text>
        </view>
      </view>
    </BottomActionBar>

    <!-- 登录弹窗（旧端 :49-61） -->
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

    <!-- 头像昵称授权弹窗（旧端 :63-72） -->
    <ProfilePopup
      v-if="showProfilePopup"
      :avatar-url="profileAvatarUrl"
      :nickname="profileNickname"
      @choose-avatar="onChooseAvatar"
      @update-nickname="onProfileNicknameInput"
      @submit="submitProfile"
      @skip="skipProfile"
    />

    <!-- 反馈通道门面（2026-09-23 B2）：受控加载弹层 ＋ wot Toast 挂载点 -->
    <BaseLoadingPopup :show="loadingPopupVisible" :text="loadingPopupText" />
    <BaseFeedback ref="feedbackRef" />
  </view>
</template>

<style lang="scss" scoped>
/* 旧端 :556-561：深色页底（--color-bg #160F04，偏差①） */
.page {
  background: #160f04;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* 描述文案（旧端 :564-574 逐值） */
.desc-bar {
  padding: 40rpx 32rpx 8rpx; /* 旧 --spacing-lg=32rpx */
  display: flex;
  align-items: center;
  justify-content: center;
}
.desc-text {
  font-size: 28rpx; /* 旧 --font-size-body-plus=28rpx（**勿映射 fontSizeBody=32rpx**） */
  color: rgba(241, 205, 145, 0.7); /* 旧 --color-primary-70（派生透明度用字面 rgba） */
  text-align: center;
}

/* 上传区（旧端 :577-579；内部虚线框样式由 AppPhotoPicker 组件承担） */
.section {
  padding: 24rpx 32rpx;
}

/* 底部占位（旧端 :614-616） */
.bottom-spacer {
  height: 260rpx;
}

/* 分析按钮 — 与AI试衣生成按钮一致的渐变背景（旧端 :619-641 逐值） */
.action-btn {
  width: 100%;
  height: 88rpx;
  border-radius: 44rpx; /* 旧 --radius-xl */
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  background: $color-action; /* 旧 var(--color-primary) #F1CD91 */
}
.action-btn-disabled {
  opacity: 0.4;
}
.action-btn-text {
  font-size: 32rpx;
  color: $color-action-text; /* 旧 --color-bg（金色面上墨色 #160F04） */
  font-weight: 400;
}
.action-btn-price {
  font-size: 32rpx;
  color: $color-action-text;
  font-weight: 400;
}

/* 分析按钮容器（预留 padding-top 承载角标，避免角标负偏移被裁剪；旧端 :644-649） */
.action-btn-wrap {
  position: relative;
  width: 100%;
  /* 左右边距：固定栏组件无横向 padding，此处补齐（旧 --spacing-sm 20rpx / --spacing-lg 32rpx） */
  padding: 20rpx 32rpx 0;
}
/* 限免角标（整体落在容器 padding 预留空间内，不用负偏移，避免被裁剪；旧端 :651-659） */
.action-btn-badge {
  position: absolute;
  top: 0rpx;
  right: 0rpx;
  z-index: 1;
  background: #ff3b30;
  border-radius: 8rpx; /* 旧 --radius-sm */
  padding: 4rpx 12rpx;
}
.action-btn-badge-text {
  font-size: 20rpx; /* 旧 --font-size-body-xs=20rpx */
  color: #fff;
}
</style>
