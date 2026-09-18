<script setup lang="ts">
// T8（Phase 3）AI 试衣结果页——旧端 aiTryOnResult/index.uvue（1348 行）忠实移植与装配。
//
// 旧端映射（行号）：
//  · 模板 1-134：CustomNavBar（标题「正在生成」→「AI试衣结果」:3/:155/:404）→ 首查轻加载 :6-10
//    → 等待态面板 :13-28（Tips :16-19 ＋ GenerationProgress :20；只读分享落地轻提示 :23-26）
//    → 等待态双按钮 :31-34（逛逛其他客片 / 查看生成队列）→ 成功态 :37-93（骨架图 :41-48、真图淡入 :49-56、
//    全屏水印 :59-61、只读「我也要试」:64-68、付费价格按钮 :71-77、保存按钮＋限免角标 :79-87、分享/朋友圈 :88-91）
//    → 失败态 :96-115（只读 :99、≥3 次 :101、默认 :102、重试 :103-106、「我也要试」:107-109、返回 :110-113）
//    → 页脚 :118-125 → 分享准备中遮罩 :128-132
//  · 生命周期：onLoad :256-287（解析 options＋brandId 恢复＋scene1154 判定 → 只读落地/首查/空 taskId 失败）；
//    onShow :290-305（开防截屏＋showShareMenu＋已登录查下载权益）；onHide :306-309（关防截屏）；
//    onUnload :310-316（停轮询＋关防截屏）；onShareAppMessage :317-320；onShareTimeline :321-331
//  · 业务内核（**页面零自建轮询／零自建支付轮询**）：
//    - `application/ai-result-flow.ts` `createResultPoller`（旧 :417-511 内核化）：立即首查（skipFirstPoll 防背靠背双请求）
//      ＋自适应间隔 8s/3s/2.5s（bug #12）＋180s 超时＋空 taskId 零请求即失败（bug #8）＋业务确定失败即停
//      ＋网络抖动容忍 3 次（CR 🟡）＋completed 先 progressDone 再切页（260ms＝RESULT_COMPLETED_DELAY_MS，旧 :475-479）
//    - `loadTaskEntitlement`（旧 :841-856）＋`canSaveOriginal`（旧 :71-87 三个 v-if 的合取）＋`saveBadgeText`（旧 :85 逐字）
//    - `application/payment-coordinator.ts` `recharge/resume`（旧 :887-972 的「下单 → 拉起 → 轮询到账 → **权益确认**」
//      整段**已删除**，改由共享协调器承担；页面只消费终态）
//    - `application/ai-share-routing.ts`：`resolveShareEntry`（旧 :256-274）／`loadSharedTaskOnce`（旧 :618-657，只拉一次
//      不轮询不重试不要求登录）／`buildSharePath`（旧 :551-559）／`buildShareQuery`（旧 :538-548，朋友圈单页模式）
//  · 验收账（miniapp-vue3/docs/migration/t8-ai-tryon-plan.md §7，父会话指派本页三条）：
//    - **P3-10**：onHide/onUnload 一律 `stopPolling()`；**每代次新建 poller 实例**（`pollGeneration` 守卫丢弃旧代次回调，
//      切品牌/重进/重试后的旧响应绝不回写覆盖新状态）；onShow 若因 onHide 停表且任务仍在等待 → 按任务状态恢复轮询
//    - **P3-11**：水印层仅覆盖**预览**（付费保存/下载的是原图 URL，绝不含水印）；永久买断＝服务端 `taskBought`；
//      **共享支付确认后只保存一次**（`resumeSaveAfterCredit` 先清后调 ＋ `isSaving` 二次防重入）；
//      **匿名分享落地不得获得付费下载能力**（shareReadOnly 模板只渲染「我也要试」，`saveToAlbum` 首行再兜底拦截）
//    - **P3-13**：好友直达（buildSharePath）／朋友圈单页模式（buildShareQuery 带 taskId＋shareToken，修 bug #8）／
//      scene1154 不跳页（改「前往小程序」引导）／分享封面网络 JPG（cosThumbJpg，bug #11）＋失败兜底
import { computed, ref } from "vue";
import { onHide, onLoad, onShareAppMessage, onShareTimeline, onShow, onUnload } from "@dcloudio/uni-app";
import { PROFILE } from "../../generated/profile.config";
import { tokens } from "../../generated/tokens";
import { systemClock } from "../../ports/clock";
import { detectUiPlatform } from "../../ui/ui-platform";
import { isPlatform, type Platform } from "../../ports/context";
import { createUniTransport } from "../../platform/uni/transport";
import { createUniStorage } from "../../platform/uni/storage";
import { createUniLoginCode } from "../../platform/uni/login";
import { createAlbumSaver } from "../../platform/uni/album-save";
import { toast, showLoading, hideLoading, showModal } from "../../platform/uni/feedback";
import { createCaptureGuard } from "../../platform/weixin/capabilities";
import { createWeixinPayments } from "../../platform/weixin/payments";
import { createAuthCoordinator } from "../../application/auth-coordinator";
import { createSilentIdentityExchange } from "../../application/silent-login";
import { createContextFactory } from "../../application/request-context";
import { createVersionedStorage } from "../../infrastructure/storage/versioned";
import { createHttpClient } from "../../infrastructure/http/client";
import { createWxAuthRepository } from "../../infrastructure/repositories/wx-auth";
import { createAiRepository } from "../../infrastructure/repositories/ai";
import { createAiResultRepository, type AiResultTask } from "../../infrastructure/repositories/ai-result";
import { createCreditRepository } from "../../infrastructure/repositories/credits";
import { createShopRepository } from "../../infrastructure/repositories/shops";
import {
  createPageConfigContent,
  FOOTER_WAITING_MAIN,
  FOOTER_WAITING_SUPPORT,
  type FooterContent,
} from "../../application/page-config-content";
import { createPageConfigRepository } from "../../infrastructure/repositories/page-config";
import { createPaymentCoordinator } from "../../application/payment-coordinator";
import { PayGuard } from "../../domain/payment-state";
import {
  canSaveOriginal,
  createResultPoller,
  loadTaskEntitlement,
  RESULT_COMPLETED_DELAY_MS,
  saveBadgeText,
  type ResultPollState,
} from "../../application/ai-result-flow";
import { cosThumb } from "../../application/image";
import { cosThumbJpg } from "../../application/image-share";
import { preloadImage } from "../../platform/uni/image-preload";
import {
  buildSharePath,
  buildShareQuery,
  loadSharedTaskOnce,
  resolveShareEntry,
} from "../../application/ai-share-routing";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import GenerationProgress from "../../components/GenerationProgress/GenerationProgress.vue";
import PageFooter from "../../components/PageFooter/PageFooter.vue";
import LoadingBlock from "../../components/LoadingBlock/LoadingBlock.vue";
import { useFakeProgress } from "../../composables/use-fake-progress";

// —— 装配（顺序与 pages/aiTryOn/index.vue 完全同口径）——
const detected = detectUiPlatform();
const platform: Platform = isPlatform(detected) ? detected : "mp-weixin";
const env = PROFILE.environment;
const transport = createUniTransport({ baseUrl: PROFILE.apiBases[env] });
const uniStorage = createUniStorage();
const versioned = createVersionedStorage({ backend: uniStorage, platform, profileKey: PROFILE.profileKey });
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
const aiResultRepo = createAiResultRepository({ client });
const creditRepo = createCreditRepository({ client });
const shopRepo = createShopRepository({ client });
const ctxFactory = createContextFactory({
  platform,
  environment: env,
  profileKey: PROFILE.profileKey,
  appCode: PROFILE.appCode,
  getBrandId: () => versioned.loadBrandId(),
});
const captureGuard = createCaptureGuard();
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

// —— 页面状态（旧端 data :148-185 逐字段对应；计时器/轮询/到账轮询字段已交内核，不再在页面持有）——
const taskId = ref("");
const shareReadOnly = ref(false); // 分享落地只读模式（B 用户匿名看 A 的作品）
const shareToken = ref("");
const isTimelinePage = ref(false); // 朋友圈单页模式（scene 1154，禁跳页）
const taskErrorMessage = ref(""); // 失败文案（后端 error_message，仅记 console，不向用户泄露）
const navTitle = ref("正在生成");
const status = ref<"pending" | "processing" | "completed" | "failed">("processing");
const initializing = ref(false); // 首查中（列表→结果页不闪伪进度，主人指示）
const resultImageUrl = ref("");
const failCount = ref(0);
const progressDone = ref(false); // 任务完成置真 → 伪进度走满 100%
const elapsedSeconds = ref(0); // 等待时长（内核每秒回调；伪进度与自适应间隔共用）
const imageLoaded = ref(false);
const imageUseOriginal = ref(false); // 缩略图异常时回退原图（防白屏）
const imageErrored = ref(false); // 图片彻底失败：骨架图不再无限转圈
const shopId = ref("");
const isSaving = ref(false); // 保存流程防重入（扣费+下载保存期间拦重复点击）
const creditBalance = ref(-1); // 下载池剩余次数，-1 = 未查询到
const priceFenPerCredit = ref(0); // 单次价格（分），0 = 未开通付费购买
const taskBought = ref(false); // 该任务是否已永久买断
const creditLoaded = ref(false); // 是否已成功查询到余额
const isPaying = ref(false);
const resumeSaveAfterCredit = ref(false); // 4001 充值到账后自动重试保存（一次性）
const shareCardImage = ref("");
const shareCardReady = ref(false);
const sharePreparing = ref(false);
const styleName = ref("");
const shopName = ref("");
const albumId = ref("");
const templateId = ref(0);
const footerIdle = ref<FooterContent>({ mainLine: "", supportLine: "" });
const footerWaiting = ref<FooterContent>({ mainLine: "", supportLine: "" });

// 等待态 footer 文案（旧 :189-194；其余状态走 OPS/Profile 版权链，故两套预取一次，模板按状态取用）
// FOOTER_WAITING_MAIN/FOOTER_WAITING_SUPPORT 已下沉 application/page-config-content（原与 aiRecommendLoading 逐字重复）

// —— computed（旧端 :187-254）——
const footerLines = computed<FooterContent>(() =>
  status.value === "processing" && !initializing.value ? footerWaiting.value : footerIdle.value,
);
// 展示用图片：原图是 Ark 全尺寸 JPEG（数 MB），统一走 COS 数据万象缩略图；原图 URL 仅用于保存/下载/分享（旧 :197-200）
const resultDisplayUrl = computed<string>(() =>
  imageUseOriginal.value ? resultImageUrl.value : cosThumb(resultImageUrl.value, 1080),
);
// 付费模式：已查询到余额且商户配置了单次价格（旧 :201-204）
const isPaidMode = computed<boolean>(() => creditLoaded.value && priceFenPerCredit.value > 0);
// 图片区全屏水印文案：蓝梅AI + 商家名 + 固定提示（商家名缺失退化，旧 :205-211）
const watermarkText = computed<string>(() =>
  shopName.value !== ""
    ? `蓝梅AI · ${shopName.value} · AI试衣效果 仅供预览`
    : "蓝梅AI · AI试衣效果 仅供预览",
);
// 生成等待伪进度：28s 走满 99%，完成时 progressDone → 100（旧 :212-247，已抽共享 composable；时长/图标/文案为本页定稿参数）
const { progressPercent, currentProgressStep, progressIcons, progressSteps } = useFakeProgress(28, {
  elapsedSeconds,
  progressDone,
  // 四步节点图标（旧 :227-235）
  icons: [
    "/static/iconpark/face-scan.svg",
    "/static/iconpark/eyes.svg",
    "/static/iconpark/puzzle.svg",
    "/static/iconpark/picture.svg",
  ],
  // 四步动态文案（旧 :236-247，逐字）
  steps: {
    base: ["分析照片面部细节", "分析五官类型", "正在匹配面部", "生成试衣图像"],
    done: ["照片面部细节分析完毕", "五官类型分析完毕", "面部匹配完成", "试衣图像生成完毕"],
  },
});
// 单次价格文案（分 → 元，整元去小数；旧 :248-254）
const priceText = computed<string>(() => {
  const fen = priceFenPerCredit.value;
  if (fen <= 0) return "0";
  if (fen % 100 === 0) return `${fen / 100}`;
  return (fen / 100).toFixed(2);
});
// 保存按钮角标（旧 :85 逐字，内核 saveBadgeText）
const saveBadge = computed<string>(() => saveBadgeText({ taskBought: taskBought.value, balance: creditBalance.value }));

// —— 生命周期（旧端 :256-331）——
onLoad((options?: Record<string, unknown>) => {
  const entry = resolveShareEntry(options ?? {});
  taskId.value = entry.taskId;
  shopId.value = entry.shopId;
  shareToken.value = entry.shareToken;
  shareReadOnly.value = entry.shareReadOnly;
  isTimelinePage.value = entry.isTimelinePage;
  // 恢复品牌上下文（分享链接携带，保证只读查询与「我也要试」同品牌；旧 :264-267）
  if (entry.brandId !== "") versioned.saveBrandId(entry.brandId);
  void loadFooterPair();
  if (shareReadOnly.value) {
    // 只读落地：拉取一次即止，不轮询、不重试、不要求登录（initializing 防首帧闪伪提示）
    navTitle.value = "AI试衣作品";
    initializing.value = true;
    void loadSharedTask();
  } else if (taskId.value !== "") {
    // 首查：静默查询一次，已完成任务直达结果（不闪伪进度），进行中才进等待页
    initializing.value = true;
    void queryInitialTask();
  } else {
    status.value = "failed";
  }
});

onShow(() => {
  captureGuard.enable(); // 旧 :291-292
  openShareMenu(); // 旧 :293-300（右上角菜单开放朋友圈分享）
  // P3-10：onHide 停表后回到页面 → 按任务状态恢复轮询（任务本体由后端继续生成）
  if (resumePollingOnShow) {
    resumePollingOnShow = false;
    if (!shareReadOnly.value && status.value === "processing" && taskId.value !== "") startPolling();
  }
  // 查询下载次数余额（需登录；未登录保持原按钮，避免进页即拉起登录；旧 :301-304）
  if (isLoggedIn()) void loadCreditInfo();
});

onHide(() => {
  captureGuard.disable(); // 旧 :306-309
  // P3-10：隐藏即停表（旧端不停表，见偏差④）；重进由 onShow 恢复
  if (!shareReadOnly.value && status.value === "processing" && taskId.value !== "") {
    resumePollingOnShow = true;
    stopPolling();
  }
});

onUnload(() => {
  stopPolling(); // 旧 :311
  resumeSaveAfterCredit.value = false; // 到账后不再对已销毁页面回写/保存（旧 :313 以 payPollToken 作废轮询同义）
  captureGuard.disable(); // 旧 :315（redirectTo/reLaunch 只触发 onUnload，残留会污染全局）
});

onShareAppMessage(async () => ensureShareCard()); // 旧 :317-320（点分享才准备封面，Promise 返回微信等待 resolve）

onShareTimeline(() => ({
  // 旧 :321-331：bug #11 → 朋友圈卡片固定用「网络可达 JPG」缩略图（WebP/本地临时文件偶发不显示图）
  title: buildShareTitle(),
  query: currentShareQuery(),
  imageUrl:
    resultImageUrl.value !== ""
      ? cosThumbJpg(resultImageUrl.value, 500)
      : shareCardReady.value && shareCardImage.value !== ""
        ? shareCardImage.value
        : "",
}));

// —— 分享菜单（旧 :293-300 的内联条件编译调用；容器安全：无 wx/无该 API 一律静默）——
function openShareMenu(): void {
  try {
    const wxLike = (globalThis as { wx?: { showShareMenu?: (o: { menus: string[] }) => void } }).wx;
    if (wxLike == null || typeof wxLike.showShareMenu !== "function") return;
    wxLike.showShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
  } catch {
    // 低版本/开发者工具不支持时静默忽略
  }
}

// —— 轮询（内核 createResultPoller；旧 :417-511）——
// P3-10：每代次新建 poller 实例 —— 旧代次在飞响应经 gen 守卫丢弃，绝不回写覆盖新状态；旧代次计时器即刻 stop()
let poller: ReturnType<typeof createResultPoller> | null = null;
let pollGeneration = 0;
let lastSnapshot: AiResultTask | null = null;
let completionScheduled = false;
let resumePollingOnShow = false;

function startPolling(skipFirstPoll = false): void {
  status.value = "processing";
  taskErrorMessage.value = "";
  progressDone.value = false;
  completionScheduled = false;
  lastSnapshot = null;
  const gen = ++pollGeneration;
  poller?.stop();
  poller = createResultPoller({
    getResult: async (context, id) => {
      const res = await aiResultRepo.getResult(context, id);
      // completed 时内核只回传状态，不回传正文 → 在此留存最近一次快照供 applyCompleted 使用（旧 :474-477）
      // ⚠️ T8 CR 🟡P1：**必须过代次守卫**——旧代次迟到的响应不得污染快照（否则 260ms 完成窗口内可能用旧快照渲染）
      if (gen === pollGeneration && res.ok && res.value != null) lastSnapshot = res.value;
      return res;
    },
    nextContext: () => ctxFactory.next(),
    onState: (s: ResultPollState) => {
      if (gen !== pollGeneration) return; // 代次守卫（P3-10）
      applyPollState(s);
    },
  });
  // 立即查询一次（首查已刚查过则跳过，避免背靠背双请求——CR 🟡）
  poller.start(taskId.value, { skipFirstPoll });
}

function stopPolling(): void {
  pollGeneration += 1; // 作废在飞代次（其回调被守卫丢弃）
  poller?.stop();
}

function applyPollState(s: ResultPollState): void {
  // 内核 pending/processing 均属等待态（旧端 startPolling 起手即 processing，:418）→ pending 归一为 processing
  status.value = s.status === "pending" ? "processing" : s.status;
  elapsedSeconds.value = s.elapsedSeconds;
  progressDone.value = s.progressDone;
  if (s.status === "failed") {
    taskErrorMessage.value = s.errorMessage;
    console.error("[aiTryOnResult] 任务查询/生成失败:", s.errorMessage);
  }
  if (s.progressDone && !completionScheduled) {
    // 主人指示：任务已结束不得仍停中间步骤 → 进度走满 100% 再切结果页（旧 :472-479，260ms）
    completionScheduled = true;
    const gen = pollGeneration;
    setTimeout(() => {
      if (gen !== pollGeneration) return; // 代次守卫（P3-10）
      if (lastSnapshot != null) applyCompleted(lastSnapshot);
    }, RESULT_COMPLETED_DELAY_MS);
  }
}

// 首查（旧 :365-393）：静默查询一次——已完成直达结果（不闪伪进度），进行中才进等待页
async function queryInitialTask(): Promise<void> {
  if (taskId.value === "") {
    initializing.value = false;
    status.value = "failed";
    return;
  }
  try {
    const res = await aiResultRepo.getResult(ctxFactory.next(), taskId.value);
    if (res.ok && res.value != null) {
      const data = res.value;
      if (data.status === "completed") {
        applyCompleted(data);
      } else if (data.status === "failed") {
        status.value = "failed";
        taskErrorMessage.value = data.error_message ?? "";
      } else {
        startPolling(true); // pending / processing → 等待页（首查刚查过，跳过一次即时轮询）
      }
    } else {
      status.value = "failed";
      taskErrorMessage.value =
        !res.ok && typeof res.error.message === "string" && res.error.message !== "" ? res.error.message : "任务查询失败";
    }
  } catch (err) {
    console.error("[aiTryOnResult] 首查失败:", err);
    status.value = "failed";
  } finally {
    initializing.value = false;
  }
}

// 完成态赋值（首查直达 ＋ 轮询完成共用；旧 :396-416）
function applyCompleted(data: AiResultTask): void {
  imageLoaded.value = false;
  imageUseOriginal.value = false;
  imageErrored.value = false;
  resultImageUrl.value = data.result_image_url != null ? data.result_image_url : "";
  warmResultImage(); // 预热：进度 100% / 骨架图期间并行下载缩略图
  status.value = "completed";
  navTitle.value = "AI试衣结果";
  styleName.value = data.style_name ?? "";
  shopName.value = data.shop_name ?? "";
  if (data.share_token != null && data.share_token !== "") shareToken.value = data.share_token;
  if (shopId.value === "" && (data.shop_id ?? 0) > 0) shopId.value = String(data.shop_id);
  if ((data.album_id ?? 0) > 0) albumId.value = String(data.album_id);
  templateId.value = data.template_id != null ? data.template_id : 0;
}

// —— 分享落地只读模式（bug #8）：匿名查看他人作品，只拉一次（旧 :616-657，内核 loadSharedTaskOnce）——
async function loadSharedTask(): Promise<void> {
  try {
    const out = await loadSharedTaskOnce({ ai: aiRepo, context: ctxFactory.next() }, shareToken.value);
    if (out.kind === "completed") {
      taskId.value = out.taskId;
      templateId.value = out.templateId;
      styleName.value = out.styleName;
      shopName.value = out.shopName;
      if (out.shopId !== "") shopId.value = out.shopId;
      albumId.value = out.albumId;
      resultImageUrl.value = out.resultImageUrl;
      status.value = "completed";
      imageLoaded.value = false;
      imageUseOriginal.value = false;
      imageErrored.value = false;
      warmResultImage();
    } else if (out.kind === "failed") {
      status.value = "failed";
      taskErrorMessage.value = out.errorMessage;
    } else {
      // pending/processing：作品生成中，仅展示进度态（不轮询、不重试）
      status.value = "processing";
    }
  } catch (err) {
    console.error("[aiTryOnResult] 分享落地只读查询失败:", err);
    status.value = "failed";
  } finally {
    initializing.value = false;
  }
}

// —— 等待期跳转（旧 :513-525）——
function goBrowseAlbums(): void {
  if (typeof uni === "undefined" || typeof uni.navigateTo !== "function") return;
  if (shopId.value !== "") {
    uni.navigateTo({ url: "/pages/demoDetail/index?idx=" + shopId.value });
  } else {
    uni.navigateTo({ url: "/pages/demoDetail/index" });
  }
}
function goGenerationQueue(): void {
  if (typeof uni === "undefined" || typeof uni.navigateTo !== "function") return;
  uni.navigateTo({ url: "/pages/aiTryOnHistory/index" });
}

// —— 分享（旧 :527-614）——
function buildShareTitle(): string {
  const style = styleName.value !== "" ? styleName.value : "新中式";
  if (shopName.value !== "") {
    return `我也在蓝梅旅拍「${shopName.value}」AI 换装，试一下你「${style}」的样子`;
  }
  return `我也在蓝梅旅拍 AI 换装，试一下你「${style}」的样子`;
}
function currentSharePath(): string {
  return buildSharePath({
    templateId: templateId.value,
    shopId: shopId.value,
    albumId: albumId.value,
    brandId: versioned.loadBrandId(),
  });
}
function currentShareQuery(): string {
  // 单页模式打开的是「当前页（结果页）」⇒ 必须带 taskId＋shareToken（bug #8 根因修复）
  return buildShareQuery({
    templateId: templateId.value,
    shopId: shopId.value,
    albumId: albumId.value,
    brandId: versioned.loadBrandId(),
    taskId: taskId.value,
    shareToken: shareToken.value,
  });
}
// 点击分享才准备封面（旧 :561-590）；有意偏差②：端侧人脸居中卡片未迁移 → 直接走网络 JPG 兜底
function prepareShareCard(): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = () => {
      sharePreparing.value = false;
      resolve();
    };
    if (resultImageUrl.value === "" || shareCardReady.value) {
      done();
      return;
    }
    // 失败兜底（旧 catch 分支同口径）：非白名单域原样返回、空 URL 返回空串，绝不阻塞分享拉起
    shareCardImage.value = cosThumbJpg(resultImageUrl.value, 400);
    shareCardReady.value = true;
    done();
  });
}
async function ensureShareCard(): Promise<{ title: string; path: string; imageUrl: string }> {
  if (!shareCardReady.value && !sharePreparing.value) {
    sharePreparing.value = true;
    await prepareShareCard();
  }
  const img = shareCardImage.value !== "" ? shareCardImage.value : cosThumbJpg(resultImageUrl.value, 400);
  return { title: buildShareTitle(), path: currentSharePath(), imageUrl: img };
}
// 朋友圈按钮：微信单页模式只能由右上角菜单触发，按钮改为引导（旧 :606-614）
function guideShareTimeline(): void {
  showModal("分享到朋友圈", "请点击右上角「···」，选择「分享到朋友圈」");
}

// 只读模式 CTA「我也要试」：跳试衣页（单页模式禁跳页 → 引导「前往小程序」；旧 :659-677）
function tryThisOut(): void {
  if (isTimelinePage.value) {
    showModal("蓝梅旅拍", "请点击下方「前往小程序」，进入完整服务后即可上传照片体验 AI 试衣");
    return;
  }
  if (typeof uni === "undefined" || typeof uni.navigateTo !== "function") return;
  const params: string[] = [];
  if (shopId.value !== "") params.push("shopId=" + shopId.value);
  if (albumId.value !== "") params.push("albumId=" + albumId.value);
  if (templateId.value > 0) params.push("templateId=" + templateId.value);
  const brandId = versioned.loadBrandId();
  if (brandId !== "") params.push("brandId=" + brandId);
  uni.navigateTo({ url: "/pages/aiTryOn/index" + (params.length > 0 ? "?" + params.join("&") : "") });
}

// —— 失败重试 / 返回（旧 :679-694 / :974-992）——
function handleRetry(): void {
  // 空任务兜底：无 taskId 不进入轮询（bug #8：分享落地错位/链接缺参）
  if (taskId.value === "") {
    status.value = "failed";
    return;
  }
  failCount.value += 1;
  if (failCount.value >= 3) {
    status.value = "failed"; // 连续 3 次失败，不再重试
    return;
  }
  imageLoaded.value = false;
  startPolling(); // 重新启动轮询（立即查一次）
}
function handleBack(): void {
  stopPolling();
  // 朋友圈单页模式禁跳页：引导用左上角 ✕ 关闭（CR 🟡）
  if (isTimelinePage.value) {
    showModal("蓝梅旅拍", "请点击左上角「✕」关闭返回朋友圈");
    return;
  }
  // 分享冷启动栈深=1：navigateBack 会直接退出小程序 → 回首页（行业最佳实践）
  const depth = typeof getCurrentPages === "function" ? getCurrentPages().length : 0;
  if (depth > 1) {
    if (typeof uni !== "undefined" && typeof uni.navigateBack === "function") uni.navigateBack();
  } else if (typeof uni !== "undefined" && typeof uni.reLaunch === "function") {
    uni.reLaunch({ url: "/pages/index/index" });
  }
}

// —— 结果图加载（旧 :696-722）——
function onImageLoad(): void {
  imageLoaded.value = true;
}
function onImageError(): void {
  // 优先换一条 URL（缩略图 → 原图）重试；非本站域时 cosThumb 原样返回、换 URL 不生效 → 直接判失败
  const thumb = cosThumb(resultImageUrl.value, 1080);
  if (!imageUseOriginal.value && resultImageUrl.value !== "" && thumb !== resultImageUrl.value) {
    imageUseOriginal.value = true;
    return;
  }
  imageErrored.value = true;
}
function retryImage(): void {
  if (!imageErrored.value) return;
  imageErrored.value = false;
  imageLoaded.value = false;
  imageUseOriginal.value = !imageUseOriginal.value;
}
function warmResultImage(): void {
  if (resultImageUrl.value === "") return;
  const url = cosThumb(resultImageUrl.value, 1080);
  if (url === "") return;
  void preloadImage(url);
}

// —— 保存到相册（旧 :724-790；扣费＝先授权后扣费，避免扣费后保存失败浪费次数）——
async function saveToAlbum(): Promise<void> {
  // P3-11：匿名只读落地不得获得付费下载能力（模板已隐藏入口，此处兜底拦截）
  if (shareReadOnly.value) return;
  if (resultImageUrl.value === "") {
    toast("图片地址为空");
    return;
  }
  if (isSaving.value) return;
  // 付费模式且已知无剩余次数且未买断：直接拉起支付，省一次必败请求（已买断永久免费保存）
  // ⭐T8 CR 🟡P1：此处**接线内核 `canSaveOriginal`**（旧 :71-87 三个 v-if 的合取，单一事实源＋已有 t39 单测），
  // 取代原先「台账声称已消费、代码却内联等价条件」的不实——语义不变：非付费∨余额>0∨已买断 三者之一即可保存。
  const savedByEntitlement = canSaveOriginal({
    isPaidMode: isPaidMode.value,
    balance: creditBalance.value,
    taskBought: taskBought.value,
  });
  if (!savedByEntitlement) {
    resumeSaveAfterCredit.value = true;
    void handleRecharge();
    return;
  }
  const authed = await albumSaver.ensureAuth();
  if (!authed) return;
  isSaving.value = true;
  // 扣下载次数池 1 次并取签名下载 URL；4001 → 拉起充值支付，到账后自动重试保存
  const downloadUrl = await chargeDownloadCredit();
  if (downloadUrl === "") {
    isSaving.value = false;
    return;
  }
  try {
    showLoading("保存中...");
    // 用扣费接口返回的 5 分钟签名 URL 下载（超时需重新走扣费接口获取）
    await albumSaver.saveFromUrl(downloadUrl);
    hideLoading();
    isSaving.value = false;
    toast("已保存到相册", "success");
  } catch (err) {
    console.error("[aiTryOnResult] 保存到相册失败:", err);
    hideLoading();
    isSaving.value = false;
    toast("保存失败，请重试");
  }
}

// ⭐G2 复核 🟡①：相册管线（授权/下载/保存，旧 :792-822）已下沉 `platform/uni/album-save.ts`，
// 页面只表达业务意图（先授权→再扣费→再保存），此处为端口实例：
const albumSaver = createAlbumSaver();


// —— 店铺与下载权益（旧 :824-856）——
// 获取店铺 ID：页面参数缺失时（历史记录入口）取首个启用店铺兜底，返回 0 表示无可用店铺
async function ensureShopId(): Promise<number> {
  let shopIdNum = parseInt(shopId.value, 10) || 0;
  if (shopIdNum > 0) return shopIdNum;
  try {
    const res = await shopRepo.getShops(ctxFactory.next());
    if (res.ok && Array.isArray(res.value) && res.value.length > 0) {
      const first = res.value[0] as { id?: unknown } | null;
      if (first != null && typeof first.id === "number") {
        shopIdNum = first.id;
        shopId.value = String(shopIdNum);
      }
    }
  } catch (err) {
    console.error("[aiTryOnResult] 获取店铺列表失败:", err);
  }
  return shopIdNum;
}
// 查询下载次数余额、单次定价与买断态（失败静默，保持原按钮；旧 :841-856）
async function loadCreditInfo(): Promise<void> {
  try {
    const shopIdNum = await ensureShopId();
    const info = await loadTaskEntitlement(
      { credits: creditRepo, context: ctxFactory.next() },
      { shopId: shopIdNum > 0 ? String(shopIdNum) : "", taskId: taskId.value },
    );
    if (info == null) return;
    creditBalance.value = info.balance;
    priceFenPerCredit.value = info.priceFenPerCredit;
    taskBought.value = info.taskBought;
    creditLoaded.value = true;
  } catch (err) {
    console.error("[aiTryOnResult] 查询下载余额失败:", err);
  }
}

// 下载池扣费（旧 :858-884）：成功返回 5 分钟签名 URL；4001 拉起共享支付协调器；其他错误提示后中断（返回空串）
async function chargeDownloadCredit(): Promise<string> {
  try {
    const res = await aiResultRepo.downloadResult(ctxFactory.next(), taskId.value);
    if (res.ok && res.value != null) {
      // 扣费成功，本地余额同步 -1（角标实时刷新）
      if (isPaidMode.value && creditBalance.value > 0) creditBalance.value = creditBalance.value - 1;
      // T8 CR 🟡P3 说明：此处本地置位仅为即时 UI 反馈；**到账/重进后一律以服务端权益回读为准**
      // （下方 handleRecharge 成功分支与 loadTaskEntitlement 会重读 `taskBought`），故不存在「仅本地即解锁」的静态竞态。
      taskBought.value = true;
      return res.value.url;
    }
    if (!res.ok && res.error.kind === "INSUFFICIENT_CREDITS") {
      // 下载次数不足：刷新本地余额为 0（按钮切换为价格态）并拉起支付，到账后自动重试保存
      creditBalance.value = 0;
      resumeSaveAfterCredit.value = true;
      void handleRecharge();
      return "";
    }
    const message =
      !res.ok && typeof res.error.message === "string" && res.error.message !== "" ? res.error.message : "扣费失败，请重试";
    toast(message);
    return "";
  } catch (err) {
    console.error("[aiTryOnResult] 下载扣费请求失败:", err);
    toast("网络异常，请重试");
    return "";
  }
}

// 4001 下载次数不足：共享支付协调器（下单 → 拉起 → 轮询到账 → **权益确认**）；旧端自建到账轮询已删除（偏差③）
async function handleRecharge(): Promise<void> {
  if (isPaying.value) return;
  isPaying.value = true;
  toast("下载次数不足，请完成支付");
  try {
    const shopIdNum = await ensureShopId();
    if (shopIdNum <= 0) {
      toast("缺少店铺信息，请稍后重试");
      return;
    }
    const taskIdNum = parseInt(taskId.value, 10) || 0;
    const out = await coordinator.recharge(ctxFactory.next(), {
      shopId: shopIdNum,
      credits: 1,
      feature: "download",
      taskId: taskIdNum,
      // 同 op 重入复用同一在飞过程（P3-03），不创建第二笔订单
      operationId: `tryon-download-${taskIdNum}-${shopIdNum}`,
    });
    if (out.ok) {
      toast("支付成功，该结果已永久解锁");
      // 到账后按服务端口径刷新权益（买断 + 余额），再自动重试保存
      const info = await loadTaskEntitlement(
        { credits: creditRepo, context: ctxFactory.next() },
        { shopId: String(shopIdNum), taskId: taskId.value },
      );
      if (info != null) {
        creditBalance.value = info.balance;
        priceFenPerCredit.value = info.priceFenPerCredit;
        taskBought.value = info.taskBought;
        creditLoaded.value = true;
      }
      // P3-11：确认后**只保存一次** —— 标志先清后调，二次回调不会重复保存
      if (resumeSaveAfterCredit.value) {
        resumeSaveAfterCredit.value = false;
        await saveToAlbum();
      }
      return;
    }
    if (out.phase === "cancelled") {
      resumeSaveAfterCredit.value = false;
      toast("已取消支付");
      return;
    }
    if (out.reason === "unsupported") {
      toast("当前端暂不支持支付");
      return;
    }
    if (out.reason === "timeout") {
      // 超时≠订单作废：回传 outTradeNo，后续可用 coordinator.resume 按后端状态恢复（P3-04）
      toast("到账确认超时，请重试");
      return;
    }
    toast("支付失败，请重试");
  } catch (err) {
    console.error("[aiTryOnResult] 创建下载充值订单失败:", err);
    toast("下单失败，请重试");
  } finally {
    // 支付门闩由协调器在终态释放；本标志仅用于页面防重复点击
    isPaying.value = false;
  }
}

// —— 登录态与页脚 ——
function isLoggedIn(): boolean {
  return versioned.loadSession() != null;
}
async function loadFooterPair(): Promise<void> {
  try {
    // 两套页脚一次预取：等待态走页面覆盖文案，其余状态回落 OPS copyright / Profile 版权（旧 :118-125 + AppFooter 语义）
    const [idle, waiting] = await Promise.all([
      pageContent.loadFooter(ctxFactory.next()),
      pageContent.loadFooter(ctxFactory.next(), {
        mainText: FOOTER_WAITING_MAIN,
        supportText: FOOTER_WAITING_SUPPORT,
      }),
    ]);
    footerIdle.value = idle;
    footerWaiting.value = waiting;
  } catch (err) {
    console.error("[aiTryOnResult] 加载页脚配置失败:", err);
  }
}

// ============ 偏差清单（有意偏差逐条；其余与旧端零偏差） ============
// ① 主题：页底保持旧端**深色** `#160F04`（= 旧 --color-bg），与 BottomActionBar 同口径（父会话红线，非亮色改造）。
// ② 分享封面：旧端先走端侧人脸居中卡片（utils/faceShareCard.uts `generateFaceCenteredCard`，仅 MP-WEIXIN），
//    失败才回退网络图；该模块本批未迁移 ⇒ **直接走网络 JPG**（cosThumbJpg 400；旧 catch 分支同口径，
//    且零本地临时文件，对 bug #11 的卡片兼容性更稳）。`prepareShareCard` 内一行即替换点，接回人脸卡片时只改此处。
// ③ 支付轮询：旧端 :935-972 页面自建到账轮询（2.5s×48 次＋payPollToken）**已删除**，改消费
//    `application/payment-coordinator.ts`（终态释放门闩；超时≠作废，可 resume）。旧 :890 的「到账后自动重试保存」
//    语义由 `resumeSaveAfterCredit` 保留，并按 P3-11 保证**只保存一次**。
// ④ onHide：旧端 :306-309 只关防截屏、**不停轮询**；新端按验收账 P3-10 在 onHide 停表，onShow 若任务仍等待则恢复
//    （startPolling 立即查一次，状态与后端对齐）。任务本体在后端继续生成，等待页文案「离开当前页也会继续生成」不冲突。
// ⑤ 空/缺失值口径：旧端 `this.x === ''` 一律判空；新端后端字段为可选 ⇒ 用 `?? ''` / `!= null` 收窄（同义，防 undefined）。
// ⑥ 店铺列表成功判定：旧 :830 严格 `code === 200`（会把 aiface 的 code 0 误判失败），新端按全站口径 `res.ok`
//    （client 已兼容 0/200），与 `ai-tryon-submit.loadCreditInfo` 的既定偏差同源。
// ⑦ 页面无登录弹窗：与旧端一致（本页不主动拉起登录；未登录时保存流程按 401/扣费失败提示收口）。
// ⑧ `openShareMenu`（旧 :293-300 内联 `wx.showShareMenu`）为容器安全守卫版内联实现：
//    `platform/weixin/capabilities.ts` 本批冻结（capabilities 仅 capture/notify），下次开启该文件时建议移入其内。
// ⑨ 未用类保留：旧样式 `:1006-1017`（.buy-photo-btn/.buy-photo-text）、:1126-1133（.elapsed-text/.browse-btn）、
//    :1342-1347（.share-preparing-text）在旧端模板中已无引用，本页按「忠实优先」原样保留并注明。
</script>

<template>
  <view class="page">
    <CustomNavBar :title="navTitle" back-fallback-url="/pages/index/index" />

    <!-- 首查中：从 AI试衣列表进入已完成任务时不展示伪进度（主人指示），仅短暂轻加载 -->
    <view v-if="initializing" class="center-content">
      <view class="loading-wrapper">
        <view class="loading-spinner"></view>
      </view>
    </view>

    <!-- 加载态（伪进度三步条 + Tips；底部双按钮固定于结果落地页同款位置） -->
    <view v-if="status === 'processing' && !initializing" class="center-content" :class="{ 'processing-pad': !shareReadOnly }">
      <view class="loading-wrapper">
        <view v-if="!shareReadOnly" class="gen-panel">
          <view class="gen-tips">
            <image class="gen-tips-icon" src="/static/iconpark/protect.svg" mode="aspectFit"></image>
            <text class="gen-tips-text">离开当前页也会继续生成，完成后将会通知您</text>
          </view>
          <GenerationProgress
            :steps="progressSteps"
            :icon-paths="progressIcons"
            :active-index="currentProgressStep"
            :percent="progressPercent"
          />
        </view>
        <!-- 只读分享落地：他人作品生成中，保持轻提示 -->
        <view v-else class="gen-panel">
          <view class="loading-spinner"></view>
          <text class="loading-tip">作品正在生成中，请稍后再来</text>
        </view>
      </view>
    </view>

    <!-- 底部双按钮（与结果落地页同构：页脚之上、文档流内居中，主人指示） -->
    <view v-if="status === 'processing' && !initializing && !shareReadOnly" class="gen-actions">
      <button class="gen-btn btn-secondary" hover-class="press-dim" @click="goBrowseAlbums">逛逛其他客片</button>
      <button class="gen-btn btn-secondary" hover-class="press-dim" @click="goGenerationQueue">查看生成队列</button>
    </view>

    <!-- 成功态 -->
    <view v-if="status === 'completed'" class="result-content">
      <view class="result-image-wrapper">
        <!-- 骨架图（主人指示时序：进度渲染到 100% → 展示图片骨架图 → 完全渲染结果图）：
             图片 onload 前占位，onload 后真图淡入并替换 -->
        <view
          v-if="!imageLoaded"
          class="result-skeleton"
          :class="{ 'result-skeleton-error': imageErrored }"
          @click="retryImage"
        >
          <text v-if="imageErrored" class="result-skeleton-hint">图片加载失败，点按重试</text>
        </view>
        <image
          class="result-image image-fade fade-in"
          :class="{ 'image-visible': imageLoaded }"
          :src="resultDisplayUrl"
          mode="widthFix"
          @load="onImageLoad"
          @error="onImageError"
        ></image>
        <!-- 图片区全屏水印（小程序内部/只读/单页模式统一，2026-09-14 主人指示）：
             仅视觉覆盖，付费保存下载的是原图 URL，绝不含水印 -->
        <view class="wm-layer">
          <view v-for="i in 24" :key="i" class="wm-item">{{ watermarkText }}</view>
        </view>
      </view>
      <!-- 分享落地只读：仅结果图 + 「我也要试」（bug #8 只读模式） -->
      <view v-if="shareReadOnly" class="action-bar">
        <view class="btn-primary" hover-class="press-dim" @click="tryThisOut">
          <text>我也要试</text>
        </view>
      </view>
      <view v-else class="action-bar">
        <!-- 付费模式且无剩余次数且未买断：价格按钮，点击直接拉起支付（已买断永久免费保存） -->
        <view v-if="isPaidMode && creditBalance <= 0 && !taskBought" class="save-btn-wrap">
          <view class="btn-primary" hover-class="press-dim" @click="saveToAlbum">
            <text>¥{{ priceText }}</text>
            <text> 保存到相册</text>
          </view>
        </view>
        <!-- 非付费模式或有剩余次数：原按钮，有次数时右上角展示角标 -->
        <view v-else class="save-btn-wrap">
          <view class="btn-primary" hover-class="press-dim" @click="saveToAlbum">
            <text>保存到相册</text>
          </view>
          <view v-if="isPaidMode && (creditBalance > 0 || taskBought)" class="save-btn-badge">
            <text class="save-btn-badge-text">{{ saveBadge }}</text>
          </view>
        </view>
        <button class="share-btn btn-secondary" open-type="share" hover-class="press-dim">分享</button>
        <button class="share-btn btn-secondary" @click="guideShareTimeline" hover-class="press-dim">
          <image class="moments-icon" src="/static/iconpark/share-three.svg" mode="aspectFit"></image>
        </button>
      </view>
    </view>

    <!-- 失败态 -->
    <view v-if="status === 'failed'" class="center-content">
      <view class="fail-wrapper">
        <!-- 分享落地只读：不显示重试，仅友好提示 + 「我也要试」 -->
        <text v-if="shareReadOnly" class="fail-text">该作品暂不可查看</text>
        <!-- 失败文案保持通用：后端 error_message 仅记 console 日志，避免向用户泄露内部错误（CR 🟡） -->
        <text v-else-if="failCount >= 3" class="fail-text">当前服务繁忙，请稍后再试</text>
        <text v-else class="fail-text">生成失败，请重试</text>
        <view v-if="!shareReadOnly && failCount < 3" class="retry-btn" hover-class="press-dim" @click="handleRetry">
          <text class="retry-btn-text">重试</text>
        </view>
        <view v-if="shareReadOnly" class="btn-primary" hover-class="press-dim" @click="tryThisOut">
          <text>我也要试</text>
        </view>
        <view class="back-btn-wrapper" hover-class="press-dim" @click="handleBack">
          <text class="back-btn-text">返回</text>
        </view>
      </view>
    </view>

    <!-- 底部 footer：第一行 AI 生成提示，第二行版权文字（复用版权 footer，跟随 OPS copyright 配置；
         PageFooter 共享组件收敛 page-footer > divide + bottomdesc 块——深色变体 + safe-area 内边距） -->
    <!-- 等待态（主人更正口径）：第一行 AI 生成提示、第二行技术支持；其余状态保持版权行 + 技术支持。
         单实例 + 动态 props（CR 🟡：避免 v-if/v-else 重建组件、重复拉取 OPS 版权配置） -->
    <PageFooter :main-line="footerLines.mainLine" :support-line="footerLines.supportLine" variant="bottomdesc-dark" safe-area />

    <!-- 分享准备中 loading（点击分享后生成封面期间展示） -->
    <view v-if="sharePreparing" class="share-preparing-mask">
      <view class="share-preparing-card">
        <LoadingBlock text="正在准备分享…" />
      </view>
    </view>
  </view>
</template>

<style scoped>
/* 旧端 :997-1348 逐值移植；深色页底 #160F04（= 旧 --color-bg，见偏差①） */
.page {
  background: #160f04; /* 旧 var(--color-bg)；不映射 tokens.semantic.colorPage（新端为亮色底） */
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 购买照片按钮（旧 :1006-1017；旧端模板已无引用，按忠实优先保留） */
.buy-photo-btn {
  margin: 24rpx auto 0;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 999rpx; /* 旧 var(--radius-pill) */
  padding: 16rpx 48rpx;
  align-self: center;
}
.buy-photo-text {
  font-size: 28rpx; /* 旧 var(--font-size-body-plus)=28rpx */
  color: #fff;
}

/* 居中内容区域（加载态/失败态）（旧 :1019-1022 + :1088-1095） */
.center-content {
  position: relative;
}
.center-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 64rpx;
}
/* 生成等待体验：Tips / 进度面板 / 双按钮 */
.gen-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  /* CR 🟡 修复：必须 stretch，否则 GenerationProgress 组件宿主宽度是 fit-content，
     步骤条宽度会被「最长步骤文案」决定（只剩 2rpx 余量，改短文案就连线塌陷） */
  align-items: stretch;
}
.gen-tips {
  display: flex;
  flex-direction: row;
  align-items: center;
  /* 面板改 stretch 后，胶囊自身按内容收窄并居中 */
  align-self: center;
  /* 距标题栏（titlebar）24rpx（主人指示，用 token） */
  margin-top: 24rpx; /* 旧 var(--spacing-24) */
  padding: 14rpx 28rpx;
  border: 1rpx solid rgba(241, 205, 145, 0.5); /* 旧 var(--color-primary-50)，金色 50% 派生 */
  border-radius: 999rpx; /* 旧 var(--radius-full) */
  background: rgba(241, 205, 145, 0.06); /* 旧 var(--color-primary-06)，金色 6% 派生 */
  margin-bottom: 32rpx; /* 旧 var(--spacing-lg) */
}
.gen-tips-icon {
  width: 30rpx;
  height: 30rpx;
  margin-right: 12rpx;
}
.gen-tips-text {
  font-size: 22rpx; /* 旧 var(--font-size-body-sm)=22rpx（勿映射 fontSizeBody=32rpx） */
  color: v-bind("tokens.semantic.colorAction"); /* 旧 var(--color-primary) #F1CD91 */
}
.gen-actions {
  display: flex;
  flex-direction: row;
  justify-content: center;
  /* 双按钮改在文档流内（页脚之上，与结果落地页同构），不再固定定位 */
  /* CR 🟡：结果页按钮底距＝action-bar 24rpx ＋ result-content 8rpx = 32rpx，此处对齐 32rpx */
  padding: 0 24rpx 32rpx; /* 旧 var(--spacing-24) / var(--spacing-lg) */
}
/* CR 🔴：必须与 .center-content 联用提高特异性，否则被后定义的 .center-content padding 简写覆盖 */
.center-content.processing-pad {
  /* 等待态：内容自顶部排布（Tips 紧贴标题栏下 24rpx），左右留白收窄让进度模块更宽（主人指示） */
  justify-content: flex-start;
  padding-left: 24rpx;
  padding-right: 24rpx;
  padding-bottom: 32rpx;
}
/* 双按钮（button 组件，主人指示）：尺寸对齐结果落地页操作栏按钮（92rpx 高 / 32rpx 字 / 40rpx 内边距）；
   视觉（金描边+金字+金底、pill 圆角）由就地还原的 .btn-secondary 提供，此处只做尺寸覆盖 */
.gen-actions .gen-btn {
  height: 92rpx;
  min-width: 240rpx;
  padding: 0 40rpx;
  margin: 0 10rpx; /* 旧 var(--spacing-xs) */
  box-sizing: border-box;
  font-size: 32rpx;
  line-height: 1;
}
.gen-btn::after {
  border: none;
}
.gen-panel .loading-spinner {
  margin-bottom: 16rpx;
}

/* 加载态（旧 :1097-1133） */
.loading-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  /* CR 🟡 修复：打断百分比宽度循环依赖，让内层面板宽度确定 */
  width: 100%;
}
.loading-spinner {
  width: 80rpx;
  height: 80rpx;
  border: 6rpx solid rgba(255, 255, 255, 0.2);
  border-top-color: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  margin-bottom: 48rpx;
  /* 面板改 stretch 后，固定尺寸的 spinner 仍需自身居中 */
  align-self: center;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.loading-tip {
  font-size: 28rpx; /* 旧 var(--font-size-body-plus)=28rpx */
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
  line-height: 44rpx;
}
/* 旧 :1126-1133 的 .elapsed-text / .browse-btn 在旧端模板中已无引用，按忠实优先保留 */
.elapsed-text {
  font-size: 24rpx; /* 旧 var(--font-size-body)=24rpx */
  color: rgba(255, 255, 255, 0.4);
  margin-top: 24rpx;
}
.browse-btn {
  margin-top: 48rpx;
}

/* 成功态（旧 :1135-1269） */
.result-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8rpx;
}
.result-image-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  position: relative;
  /* CR 🟡：overflow 不放在 wrapper，避免裁切超出容器高度的竖图（原布局为居中溢出可见） */
}
/* 图片区全屏水印层：斜向平铺、低透明度，只覆盖预览，不改图片源文件 */
.wm-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-content: space-around;
  justify-content: space-around;
  z-index: 2;
  /* CR 🟡：裁剪只作用于水印层自身（旋转子项溢出裁剪），不裁图片 */
  overflow: hidden;
}
.wm-item {
  width: 33.33%;
  text-align: center;
  transform: rotate(-30deg);
  font-size: 20rpx; /* 旧 var(--font-size-body-xs)=20rpx */
  color: #ffffff;
  opacity: 0.16;
  font-weight: 400;
}
.result-image {
  width: 100%;
  border-radius: 16rpx; /* 旧 var(--radius-sm) */
}
/* 结果图骨架图：3:4 占位 + 金色微光呼吸（图片加载完成后由真图淡入替换） */
.result-skeleton {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  margin: auto;
  width: 100%;
  height: 1000rpx;
  /* CR 🟡：小屏（如 320×568）下 1000rpx 会溢出容器压到按钮，故以容器高度封顶 */
  max-height: 100%;
  border-radius: 16rpx; /* 旧 var(--radius-sm) */
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  /* 旧 var(--color-primary-10) → var(--color-primary-06)：金色 10% / 6% 派生 */
  background: linear-gradient(135deg, rgba(241, 205, 145, 0.1) 0%, rgba(241, 205, 145, 0.06) 100%);
  animation: skPulse 1.4s ease-in-out infinite;
}
.result-skeleton-error {
  animation: none;
  opacity: 1;
}
.result-skeleton-hint {
  font-size: 22rpx; /* 旧 var(--font-size-body-sm)=22rpx */
  color: rgba(241, 205, 145, 0.5); /* 旧 var(--color-primary-50) */
}
@keyframes skPulse {
  0% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.5;
  }
}
.image-fade {
  opacity: 0;
  transition: opacity 0.8s ease-in-out;
}
.image-visible {
  opacity: 1;
}
.action-bar {
  width: 100%;
  padding: 24rpx 0;
  display: flex;
  flex-direction: row;
  justify-content: center;
}
.save-btn-wrap {
  position: relative;
  padding-top: 20rpx; /* 旧 var(--spacing-sm) */
}
/* 限免角标（整体落在容器 padding 预留空间内，不用负偏移，避免被裁剪） */
.save-btn-badge {
  position: absolute;
  top: 0rpx;
  right: 0rpx;
  z-index: 1;
  background: #ff3b30;
  border-radius: 16rpx; /* 旧 var(--radius-sm) */
  padding: 4rpx 12rpx;
}
.save-btn-badge-text {
  font-size: 20rpx; /* 旧 var(--font-size-body-xs)=20rpx */
  color: #fff;
}
/* 操作栏按钮：view 与 button 原生差异抹平——统一高度 92rpx（button 原生表单组件自带默认样式，不能只靠类名对齐） */
.action-bar .btn-primary {
  height: 92rpx;
  box-sizing: border-box;
}
.action-bar .btn-primary text {
  color: v-bind("tokens.semantic.colorActionText"); /* 旧 var(--color-bg)，金色面上墨色 */
  font-size: 32rpx;
  line-height: 1.2;
}
.share-btn {
  margin: 20rpx 0 0 32rpx; /* 旧 var(--spacing-sm) / var(--spacing-lg) */
  min-width: 160rpx;
  height: 92rpx;
  line-height: 1;
  box-sizing: border-box;
}
.share-btn::after {
  border: none;
}
.moments-icon {
  width: 36rpx;
  height: 36rpx;
}

/* 失败态（旧 :1271-1300） */
.fail-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.fail-text {
  font-size: 30rpx; /* 旧端字面值（无 token 对应） */
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 48rpx;
  text-align: center;
}
.retry-btn {
  background: #fff;
  border-radius: 48rpx; /* 旧 var(--radius-2xl) */
  padding: 24rpx 80rpx;
  margin-bottom: 24rpx;
}
.retry-btn-text {
  font-size: 32rpx;
  color: #000;
  font-weight: 400;
}
.back-btn-wrapper {
  padding: 24rpx 80rpx;
}
.back-btn-text {
  font-size: 28rpx; /* 旧 var(--font-size-body-plus)=28rpx */
  color: rgba(241, 205, 145, 0.9); /* 旧 var(--color-primary) 90% 派生字面值 */
}

/* 底部页脚（旧 :1302-1318 .page-footer/.divide/.bottomdesc）已收敛入 PageFooter 共享组件（深色变体 + safe-area） */

/* 分享准备中 loading 遮罩（旧 :1320-1347） */
.share-preparing-mask {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.share-preparing-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48rpx 64rpx;
  background: rgba(22, 15, 4, 0.92); /* 旧 var(--color-bg) #160F04 的 92% 派生 */
  border-radius: 14rpx; /* 旧 var(--radius-card) */
}
/* 旧 :1342-1347 的 .share-preparing-text 在旧端模板中已无引用（改由 LoadingBlock 渲染），按忠实优先保留 */
.share-preparing-text {
  margin-top: 32rpx;
  font-size: 24rpx; /* 旧 var(--font-size-body)=24rpx */
  color: #fff;
  font-weight: 400;
}

/* ===== 旧端 App.uvue 全局类就地还原（.btn-primary 已由 App.vue 全局样式提供，2026-09-18 删除本页副本）===== */
/* 金色次要按钮统一类（旧 App.uvue :166-181） */
.btn-secondary {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  padding: 26rpx 40rpx;
  font-size: 32rpx;
  line-height: 1.2;
  font-weight: 400;
  color: v-bind("tokens.semantic.colorAction"); /* 旧 var(--color-primary) */
  background: rgba(241, 205, 145, 0.1); /* 旧 var(--color-primary-10)，金色 10% 派生 */
  border: 1rpx solid rgba(241, 205, 145, 0.5); /* 旧 var(--color-primary-50) */
  border-radius: 999rpx;
  transition: opacity 0.15s ease-out;
}
</style>
