<script setup lang="ts">
// T8（Phase 3）AI 试衣主流程页——旧端 aiTryOn/index.uvue（1176 行）忠实移植与装配。
// 旧端映射（行号）：
//  · 模板 1-131：CustomNavBar（分享落地改标题/兜底返回路由 :232-236）→ AiTemplatePicker（提示条/主图 swiper/缩略条折叠/体型/年龄）
//    → 照片区（AppPhotoPicker :56-64）→ BottomActionBar 生成按钮（付费态 ¥价格 :72-85；普通态＋「限时免费 N 次」角标 :87-103）
//    → LoginPopup / ProfilePopup（复用 P2-18 组件）
//  · 生命周期：onLoad 解析 options（:219-270：shopId/albumId=random/category/subCategory/style decode/gender/share_from/
//    templateId/brandId）→（随机相册先解析）loadTemplates；onShow 开防截屏＋监听 login-required＋已登录查次数（:271-287）；
//    onHide 关防截屏（:288-294）；**onUnload 也必须关**（:295-299，旧端教训：redirectTo/reLaunch 只触发 onUnload，残留致全端无法截屏）
//  · 业务语义：模板双入口（albub 精确 vs travel 店铺维度＋相册空列表回退本店全部并提示，:357-398）、
//    选图→10MB 上限→质量检测→上传（:430-530）、提交守卫与 4001 处理（:531-628，见 application/ai-tryon-submit）、
//    次数与定价（:629-643）、充值（**改用 T9a 共享 payment-coordinator，页面零自建轮询**）。
// 有意偏差（已声明）：①主题保持旧端**深色页底**（`#160F04`，与 BottomActionBar 同口径）；②登录/资料弹窗复用新端组件与
// login-flow（旧端直连 auth.uts/loginFlow.uts）；③充值轮询由 coordinator 承担（T9a 冻结：idle→creatingOrder→…→succeeded，
// 终态释放门闩；超时≠作废，回传 outTradeNo 可用 resume 恢复）；④2026-09-17 主人拍板：抖音侧不注册本页（pages.json `#ifdef MP-WEIXIN`）。
import { computed, ref } from "vue";
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import { PROFILE } from "../../generated/profile.config";
import { tokens } from "../../generated/tokens";
import { systemClock } from "../../ports/clock";
import { detectUiPlatform } from "../../ui/ui-platform";
import { isPlatform, type Platform } from "../../ports/context";
import { createUniTransport } from "../../platform/uni/transport";
import { createUniStorage } from "../../platform/uni/storage";
import { createUniLoginCode } from "../../platform/uni/login";
import { createUniPhotoChooser } from "../../platform/uni/chooser";
import { createUniUpload } from "../../platform/uni/upload";
import { createCaptureGuard, requestTaskNotify } from "../../platform/weixin/capabilities";
import { createWeixinPhotoCheck } from "../../platform/weixin/photo-check";
import { createWeixinPayments } from "../../platform/weixin/payments";
import { createAuthCoordinator } from "../../application/auth-coordinator";
import { createSilentIdentityExchange } from "../../application/silent-login";
import { createContextFactory } from "../../application/request-context";
import { createVersionedStorage } from "../../infrastructure/storage/versioned";
import { createHttpClient } from "../../infrastructure/http/client";
import { createAiRepository } from "../../infrastructure/repositories/ai";
import { createCreditRepository } from "../../infrastructure/repositories/credits";
import { createWxAuthRepository } from "../../infrastructure/repositories/wx-auth";
import { createUserInfoStore } from "../../application/user-info-store";
import { createPhoneLoginFlow } from "../../application/login-flow";
import { createPageConfigContent, type FooterContent } from "../../application/page-config-content";
import { createPageConfigRepository } from "../../infrastructure/repositories/page-config";
import { createPaymentCoordinator } from "../../application/payment-coordinator";
import { PayGuard } from "../../domain/payment-state";
import {
  buildUploadHeaders,
  createAiPhotoUploader,
  PHOTO_SIZE_LIMIT_BYTES,
} from "../../application/ai-photo-upload";
import { createTryOnSubmitter, loadCreditInfo } from "../../application/ai-tryon-submit";
import { createAlbumRepository } from "../../infrastructure/repositories/albums";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import AiTemplatePicker from "../../components/AiTemplatePicker/AiTemplatePicker.vue";
import AppPhotoPicker from "../../components/AppPhotoPicker/AppPhotoPicker.vue";
import BottomActionBar from "../../components/BottomActionBar/BottomActionBar.vue";
import LoginPopup from "../../components/LoginPopup/LoginPopup.vue";
import ProfilePopup from "../../components/ProfilePopup/ProfilePopup.vue";

// —— 装配 ——
const detected = detectUiPlatform();
const platform: Platform = isPlatform(detected) ? detected : "mp-weixin";
const env = PROFILE.environment;
const transport = createUniTransport({ baseUrl: PROFILE.apiBases[env] });
const uniStorage = createUniStorage();
const versioned = createVersionedStorage({ backend: uniStorage, platform, profileKey: PROFILE.profileKey });
const userStore = createUserInfoStore({ backend: uniStorage });
const authCoordinator = createAuthCoordinator({
  exchangeIdentity: createSilentIdentityExchange({
    // P2-03 provider：uni.login 取 code → POST /api/wx/login 换票 → Session；wxAuth 惰性取用（装配顺序 client→wxAuth→coordinator）
    getWxAuth: () => wxAuth,
    loginCode: createUniLoginCode(),
    platform,
    profileKey: PROFILE.profileKey,
  }),
  storage: uniStorage,
  clock: systemClock,
});
const client = createHttpClient({ transport, authCoordinator });
const wxAuth = createWxAuthRepository({ client });
const aiRepo = createAiRepository({ client });
const creditRepo = createCreditRepository({ client });
const albumRepo = createAlbumRepository({ client });
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
const submitter = createTryOnSubmitter({ ai: aiRepo, nextContext: () => ctxFactory.next() });
const coordinator = createPaymentCoordinator({
  credits: creditRepo,
  payments: createWeixinPayments(),
  gate: new PayGuard(),
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

// —— 页面状态（旧端 data :150-193 逐字段对应）——
const shopId = ref("");
const albumId = ref("");
const needRandomAlbum = ref(false);
const style = ref("");
const gender = ref("");
const shareFrom = ref("");
const shareTemplateId = ref(0);
const navTitle = ref("AI试衣");
const backFallbackUrl = ref("");
const templates = ref<Array<{ id?: number; imageUrl?: string; tryonDisabled?: boolean }>>([]);
const currentTemplateIndex = ref(0);
const bodyType = ref("slim"); // slim | medium | fat
const ageRange = ref("10岁及以下");
const ageOptions = ["10岁及以下", "11-18岁", "19-30岁", "31-45岁", "46-60岁", "60岁以上"];
const ageIndex = ref(0);
const photoPath = ref("");
const photoPreviewUrl = ref("");
const uploadedFilename = ref("");
const isUploading = ref(false);
const isSubmitting = ref(false);
const showLoginPopup = ref(false);
const loginAgreementChecked = ref(false);
const showProfilePopup = ref(false);
const profileAvatarUrl = ref("");
const profileNickname = ref("");
const creditBalance = ref(-1); // -1 = 未查询到
const priceFenPerCredit = ref(0);
const creditLoaded = ref(false);
const isPaying = ref(false);
const resumeGenerateAfterCredit = ref(false);
const isLoggedIn = ref(false);
const footer = ref<FooterContent>({ mainLine: "", supportLine: "" });

// —— computed（旧端 :196-218）——
const isPaidMode = computed(() => creditLoaded.value && priceFenPerCredit.value > 0);
const priceText = computed(() => {
  const fen = priceFenPerCredit.value;
  if (fen <= 0) return "0";
  if (fen % 100 === 0) return `${fen / 100}`;
  return (fen / 100).toFixed(2);
});
const bodyIndex = computed(() => (bodyType.value === "medium" ? 1 : bodyType.value === "fat" ? 2 : 0));
const bodyTypeText = computed(() => (bodyType.value === "medium" ? "微胖" : bodyType.value === "fat" ? "胖" : "瘦"));
const canGenerate = computed(() => uploadedFilename.value !== "" && !isUploading.value);

// —— 生命周期（旧端 :219-299）——
onLoad((options?: Record<string, unknown>) => {
  const opts = options ?? {};
  if (opts.shopId != null) shopId.value = String(opts.shopId);
  if (opts.albumId != null) {
    if (String(opts.albumId) === "random") needRandomAlbum.value = true;
    else albumId.value = String(opts.albumId);
  }
  const sub = opts.subCategory ?? opts.sub_category;
  if (sub != null) {
    // 旧端仅读取，不参与模板过滤（保持忠实：保留字段以备后续）
    void String(sub);
  }
  if (opts.style != null) style.value = safeDecode(String(opts.style));
  if (opts.gender != null) gender.value = String(opts.gender);
  if (opts.share_from != null) shareFrom.value = String(opts.share_from);
  if (opts.templateId != null) shareTemplateId.value = parseInt(String(opts.templateId), 10) || 0;
  if (opts.brandId != null && String(opts.brandId) !== "") versioned.saveBrandId(String(opts.brandId));
  if (shareFrom.value !== "") {
    navTitle.value = "相册探索更多AI试衣";
    backFallbackUrl.value = "/pages/index/index"; // 旧端 bug #9：分享冷启动栈深=1，兜底回首页 tab
  }
  void loadFooter();
  if (needRandomAlbum.value) {
    void resolveRandomAlbum().then(() => loadTemplates());
  } else {
    void loadTemplates();
  }
});

onShow(() => {
  captureGuard.enable(); // 旧端 :272-273
  updateLoginState();
  if (isLoggedIn.value) void refreshCreditInfo(); // 未登录保持原按钮，避免进页即拉登录
});

onHide(() => {
  captureGuard.disable();
});

onUnload(() => {
  captureGuard.disable(); // 旧端 :295-299：redirectTo/reLaunch 只触发 onUnload
});

// —— 模板加载（旧端 :341-398）——
async function resolveRandomAlbum(): Promise<void> {
  if (shopId.value === "") return;
  try {
    const res = await albumRepo.getAlbumList(ctxFactory.next(), { shopId: shopId.value, page: "1", size: "50" });
    if (!res.ok) return;
    const albums = res.value?.albums ?? [];
    const pool = albums.filter((a) => a != null && a.tryonDisabled !== true);
    if (pool.length > 0) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      albumId.value = String(pick.id);
    }
  } catch (err) {
    console.error("[aiTryOn] 随机相册解析失败", err);
  }
}

async function loadTemplates(): Promise<void> {
  try {
    // 相册入口：按 shop_id＋album_id 精确取该相册客片图作模板（不叠加 style/category，防滤空）
    // 其他入口：店铺维度过滤（category travel＋style/gender）并补 shop_id 防跨店
    const params: Record<string, string> = {};
    if (albumId.value !== "") {
      params.shop_id = shopId.value;
      params.album_id = albumId.value;
    } else {
      params.category = "travel";
      if (shopId.value !== "") params.shop_id = shopId.value;
      if (style.value !== "") params.style = style.value;
      if (gender.value !== "") params.gender = gender.value;
    }
    const res = await aiRepo.getTemplates(ctxFactory.next(), params);
    if (!res.ok || res.value == null) {
      toast("模板加载失败，请重试");
      return;
    }
    const list = (res.value ?? []) as unknown as Array<{ id?: number; imageUrl?: string; tryonDisabled?: boolean }>;
    // 相册级匹配兜底（2026-09-11）：该相册试衣过滤后无可用照片 → 回退本店全部模板并提示
    if (albumId.value !== "" && list.length === 0) {
      albumId.value = "";
      toast("该相册暂无可试衣客片，已展示本店全部模板");
      void loadTemplates();
      return;
    }
    templates.value = list;
    // 分享落地：按 templateId 预选（找不到则静默保持默认第一套）
    if (shareTemplateId.value > 0) {
      for (let i = 0; i < templates.value.length; i++) {
        if (templates.value[i]?.id === shareTemplateId.value) {
          currentTemplateIndex.value = i;
          break;
        }
      }
    }
  } catch (err) {
    console.error("[aiTryOn] 加载模板失败:", err);
    toast("模板加载失败，请重试");
  }
}

async function loadFooter(): Promise<void> {
  footer.value = await pageContent.loadFooter(ctxFactory.next());
}

// —— 选择区回调（旧端 :399-429）——
function onSwiperChange(index: number): void {
  currentTemplateIndex.value = index;
}
function selectTemplate(index: number): void {
  currentTemplateIndex.value = index;
}
function onBodyChange(index: number): void {
  const types = ["slim", "medium", "fat"];
  bodyType.value = types[index] ?? "slim";
}
function selectAge(value: number | string): void {
  const index = typeof value === "number" ? value : parseInt(value, 10) || 0;
  ageIndex.value = index;
  ageRange.value = ageOptions[index] ?? ageOptions[0];
}

// —— 选图 → 检测 → 上传（旧端 :430-530）——
async function choosePhoto(): Promise<void> {
  if (isUploading.value) return;
  if (!isLoggedIn.value) {
    showLoginPopup.value = true; // 上传前先查登录态
    return;
  }
  const picked = await chooser.choose();
  if (picked == null) return; // 取消/容器失败静默
  if (picked.size > PHOTO_SIZE_LIMIT_BYTES) {
    toast("照片大小不能超过10MB");
    return;
  }
  showLoading("照片检测中...");
  let check = { ok: true, reason: "" };
  try {
    check = await photoCheck.check(picked.path);
  } catch (err) {
    console.error("[aiTryOn] 照片检测异常（放行）:", err);
  }
  hideLoading();
  if (!check.ok) {
    showModal("照片未通过检测", `${check.reason}，请重新上传`);
    return;
  }
  photoPath.value = picked.path;
  photoPreviewUrl.value = picked.path;
  await uploadSelectedPhoto();
}

async function uploadSelectedPhoto(): Promise<void> {
  if (photoPath.value === "") return;
  isUploading.value = true;
  uploadedFilename.value = "";
  showLoading("上传中...");
  try {
    const res = await uploader.upload(photoPath.value);
    if (res.ok) {
      uploadedFilename.value = res.filename;
    } else {
      uploadedFilename.value = "";
      toast(res.message);
      if (res.authExpired === true) showLoginPopup.value = true; // 401 → 拉登录（不静默成功）
    }
  } catch (err) {
    console.error("照片上传失败:", err);
    uploadedFilename.value = "";
    toast("照片上传失败，请重新选择");
  } finally {
    isUploading.value = false;
    hideLoading();
  }
}

// —— 提交（旧端 :531-628；业务在 application/ai-tryon-submit）——
function handleGenerate(): void {
  // 订阅授权先弹，等其关闭再提交（与支付弹窗串行）
  void requestTaskNotify(["a-9CzBoRFvtp9mZbhsJ08opS4f_Owt1bdwQDouVkPs0"]).finally(() => {
    void runSubmitFlow();
  });
}

async function runSubmitFlow(): Promise<void> {
  const out = await submitter.submit({
    uploadedFilename: uploadedFilename.value,
    photoPath: photoPath.value,
    isUploading: isUploading.value,
    isSubmitting: isSubmitting.value,
    isLoggedIn: isLoggedIn.value,
    shopId: shopId.value,
    templates: templates.value,
    currentTemplateIndex: currentTemplateIndex.value,
    isPaidMode: isPaidMode.value,
    creditBalance: creditBalance.value,
    bodyTypeText: bodyTypeText.value,
    ageRange: ageRange.value,
    openid: userStore.load()?.openid ?? "",
  });

  switch (out.kind) {
    case "ignored":
      return;
    case "need-login":
      showLoginPopup.value = true;
      return;
    case "toast":
      toast(out.message);
      return;
    case "need-recharge":
      creditBalance.value = 0;
      resumeGenerateAfterCredit.value = true; // 到账后自动继续生成
      await handleRecharge();
      return;
    case "submitted":
      creditBalance.value = out.balanceAfter;
      if (typeof uni !== "undefined" && typeof uni.navigateTo === "function") {
        uni.navigateTo({ url: `/pages/aiTryOnResult/index?taskId=${out.taskId}&shopId=${out.shopId}` });
      }
      return;
  }
}

// —— 次数与支付（旧端 :629-737；轮询改交共享 coordinator）——
async function refreshCreditInfo(): Promise<void> {
  const info = await loadCreditInfo({ credits: creditRepo, context: ctxFactory.next() }, { shopId: shopId.value });
  if (info == null) return; // 失败静默，保持原按钮
  creditBalance.value = info.balance;
  priceFenPerCredit.value = info.priceFenPerCredit;
  creditLoaded.value = true;
}

async function handleRecharge(): Promise<void> {
  if (isPaying.value) return;
  isPaying.value = true;
  showLoading("发起支付...");
  try {
    const shopIdNum = parseInt(shopId.value, 10) || 0;
    const out = await coordinator.recharge(ctxFactory.next(), {
      shopId: shopIdNum,
      credits: 1,
      operationId: `tryon-${shopIdNum}`, // 同 op 重入复用同一在飞过程（不建第二笔订单）
    });
    if (out.ok) {
      toast("支付成功", "success");
      await refreshCreditInfo();
      if (resumeGenerateAfterCredit.value) {
        resumeGenerateAfterCredit.value = false;
        await runSubmitFlow();
      }
      return;
    }
    if (out.phase === "cancelled") return; // 用户取消：静默
    if (out.reason === "unsupported") {
      toast("当前端暂不支持支付");
      return;
    }
    if (out.reason === "timeout") {
      // 超时≠订单作废：提示稍后查看（后续可按 outTradeNo 走 coordinator.resume 恢复）
      toast("支付确认中，请稍后在试衣记录查看");
      return;
    }
    toast("支付失败，请重试");
  } finally {
    hideLoading();
    isPaying.value = false;
  }
}

// —— 登录/资料弹窗（复用 P2-18 组件与 login-flow，口径同 mine 页）——
function updateLoginState(): void {
  isLoggedIn.value = versioned.loadSession() != null;
  const info = userStore.load();
  profileAvatarUrl.value = info?.avatarUrl ?? "";
  profileNickname.value = info?.nickname ?? "";
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
async function onGetPhoneNumber(e: unknown): Promise<void> {
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
  showLoading("登录中...");
  const result = await phoneLoginFlow.runPhoneLogin(detail.code);
  hideLoading();
  if (!result.ok) {
    toast(result.errorKind === "login" ? "获取登录凭证失败，请重试" : result.errorMsg || "登录失败");
    return;
  }
  showLoginPopup.value = false;
  updateLoginState();
  if (result.phoneHasFullProfile) {
    toast("登录成功", "success");
    if (creditLoaded.value === false) void refreshCreditInfo();
  } else {
    showProfilePopup.value = true;
  }
}
function onProfileNicknameInput(value: string): void {
  profileNickname.value = value;
}
function onChooseAvatar(event: unknown): void {
  // 组件 emit 载荷为 unknown（旧端为 chooseAvatar 事件对象/字符串两种形态）⇒ 兼容取值
  const url =
    typeof event === "string"
      ? event
      : (event as { detail?: { avatarUrl?: string } } | undefined)?.detail?.avatarUrl;
  if (url != null && url !== "") profileAvatarUrl.value = url;
}
function submitProfile(): void {
  const info = userStore.load();
  userStore.save({
    openid: info?.openid ?? null,
    avatarUrl: profileAvatarUrl.value,
    nickname: profileNickname.value,
    phone: info?.phone ?? null,
  } as Parameters<typeof userStore.save>[0]);
  showProfilePopup.value = false;
  toast("保存成功", "success");
}
function skipProfile(): void {
  showProfilePopup.value = false;
}

// —— 小工具 ——
function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
function toast(title: string, icon: "none" | "success" = "none"): void {
  if (typeof uni !== "undefined" && typeof uni.showToast === "function") uni.showToast({ title, icon });
}
function showLoading(title: string): void {
  if (typeof uni !== "undefined" && typeof uni.showLoading === "function") uni.showLoading({ title, mask: true });
}
function hideLoading(): void {
  if (typeof uni !== "undefined" && typeof uni.hideLoading === "function") uni.hideLoading();
}
function showModal(title: string, content: string): void {
  if (typeof uni !== "undefined" && typeof uni.showModal === "function") {
    uni.showModal({ title, content, showCancel: false, confirmText: "知道了" });
  }
}
</script>

<template>
  <view class="page">
    <CustomNavBar :title="navTitle" :back-fallback-url="backFallbackUrl" />

    <AiTemplatePicker
      :templates="templates"
      :current-index="currentTemplateIndex"
      :body-index="bodyIndex"
      :age-options="ageOptions"
      :age-index="ageIndex"
      @change="onSwiperChange"
      @select="selectTemplate"
      @body-change="onBodyChange"
      @age-change="selectAge"
    />

    <!-- 照片上传（旧端 :56-64；组件只转发点击，业务在本页） -->
    <view class="section">
      <text class="section-label">上传你的照片：</text>
      <AppPhotoPicker :photo-url="photoPreviewUrl" :busy="isUploading" @click="choosePhoto" />
    </view>

    <view class="bottom-spacer"></view>

    <BottomActionBar :footer-main-line="footer.mainLine" :footer-support-line="footer.supportLine">
      <!-- 付费模式且无剩余次数：价格按钮（旧端 :72-85） -->
      <view v-if="isPaidMode && creditBalance <= 0" class="gen-btn-wrap">
        <image src="/static/btn-left-icon.png" class="gen-btn-icon" mode="aspectFill"></image>
        <view :class="canGenerate ? 'generate-btn' : 'generate-btn generate-btn-disabled'" hover-class="press-dim" @click="handleGenerate">
          <text class="generate-btn-ai">¥{{ priceText }}</text>
          <text class="generate-btn-text"> 马上生成 </text>
          <image src="/static/aitry-text.png" class="generate-btn-ai-img" mode="aspectFill"></image>
          <text class="generate-btn-text"> 效果</text>
        </view>
        <image src="/static/btn-right-icon.png" class="gen-btn-icon" mode="aspectFill"></image>
      </view>
      <!-- 非付费模式或有限免次数（旧端 :87-103） -->
      <view v-else class="gen-btn-wrap">
        <image src="/static/btn-left-icon.png" class="gen-btn-icon" mode="aspectFill"></image>
        <view :class="canGenerate ? 'generate-btn' : 'generate-btn generate-btn-disabled'" hover-class="press-dim" @click="handleGenerate">
          <text class="generate-btn-text">生成 </text>
          <image src="/static/aitry-text.png" class="generate-btn-ai-img" mode="aspectFill"></image>
          <text class="generate-btn-text"> 效果</text>
        </view>
        <image src="/static/btn-right-icon.png" class="gen-btn-icon" mode="aspectFill"></image>
        <!-- 角标最后渲染，避免被右侧 icon 盖住（旧端 :99-102） -->
        <view v-if="isPaidMode && creditBalance > 0" class="gen-btn-badge">
          <text class="gen-btn-badge-text">限时免费 {{ creditBalance }} 次</text>
        </view>
      </view>
    </BottomActionBar>

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

    <ProfilePopup
      v-if="showProfilePopup"
      :avatar-url="profileAvatarUrl"
      :nickname="profileNickname"
      @choose-avatar="onChooseAvatar"
      @update-nickname="onProfileNicknameInput"
      @submit="submitProfile"
      @skip="skipProfile"
    />
  </view>
</template>

<style scoped>
/* 旧端 :1-…：深色页底（--color-bg=#160F04）；与 BottomActionBar 同口径（页头已声明） */
.page {
  background: #160f04;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
}
.bottom-spacer {
  height: 260rpx;
}
/* 选择区（旧端 .section/.section-label） */
.section {
  padding: 24rpx 40rpx;
}
.section-label {
  font-size: 28rpx; /* 旧 --font-size-body-plus=28rpx */
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 20rpx;
  display: block;
}
/* 生成按钮（旧端 :40-103 的 gen-btn 系列样式逐值） */
.gen-btn-wrap {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding-top: 20rpx; /* 旧 --spacing-sm=20rpx */
}
.gen-btn-icon {
  width: 104rpx;
  height: 86rpx;
}
.generate-btn {
  height: 88rpx;
  border-radius: 44rpx; /* 旧 --radius-xl */
  padding: 0 40rpx;
  gap: 12rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f1cd91 0%, #fff3c6 100%); /* 旧 --gradient-btn-primary */
}
.generate-btn-disabled {
  opacity: 0.4;
}
.generate-btn-ai {
  font-size: 32rpx;
  color: #160f04; /* 旧 color-bg（金色面上墨色） */
  font-weight: 400;
}
.generate-btn-text {
  font-size: 32rpx;
  color: #160f04;
  font-weight: 400;
}
.generate-btn-ai-img {
  width: 118rpx;
  height: 34rpx;
}
.gen-btn-badge {
  position: absolute;
  top: 20rpx;
  right: 104rpx;
  transform: translate(40%, -50%);
  z-index: 10;
  background: #ff3b30;
  border-radius: 8rpx; /* 旧 --radius-sm */
  padding: 4rpx 12rpx;
}
.gen-btn-badge-text {
  font-size: 20rpx; /* 旧 --font-size-body-xs=20rpx */
  color: #ffffff;
}
.press-dim {
  opacity: 0.82;
}
</style>
