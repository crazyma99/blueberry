<script setup lang="ts">
// T9b（Phase 3.3）AI 推荐等待页——旧端 pages/aiRecommendLoading/index.uvue（395 行）忠实移植。
//
// 旧端映射（行号）：
//  · 模板 1-38：CustomNavBar「AI分析中」:3 → **等待态** :5-11（只有步骤条 `GenerationProgress`＋百分比，
//    2026-09-14 主人指示**不要**标题栏下 Tips、**不要**底部双按钮）→ **失败态** :14-26（绝对定位深色遮罩：
//    「AI分析失败，请重试」＋重试＋返回）→ 页脚 :29-36（第一行 AI 生成提示／第二行技术支持，其余状态回落版权行）
//  · 生命周期：onLoad :62-70（options.filename／shopId；**filename 为空直接 failed，不发请求**）；
//    onUnload :71-73 → stopAll()（清计时器＋成功转场定时器＋作废到账轮询代次）
//  · computed :74-118：footer 两行文案（仅等待态覆盖）／伪进度 `elapsedSeconds/10` 封顶 99（progressDone→100）／
//    当前步骤（<20→0／<45→1／<75→2／else 3）／四步图标（face-scan・eyes・plan・list-success）／四步动态文案
//  · methods :119-300：startAnalysis :120-137（每秒计时，≥180s 展示失败）／callRecommend :139-178
//    （**同步扣费接口：只调一次，不可轮询重发**；成功→progressDone→260ms 后 redirectTo 结果页；
//      **4001 → 拉起充值支付，到账后自动重新分析**；其他业务错误 → failed＋toast；网络异常 → failed 不自动重发）／
//    stopAll :180-192／handleRecharge :194-245（下单→拉起微信支付→轮询到账→重新分析）／
//    handleRetry :291-293／handleBack :295-298
//  · 样式 304-395 逐值（换算口径见「偏差清单」）
//
// 验收落实（本批 P3-16～P3-20）：
//  · **P3-16（同步 180 秒请求合同）**：请求一律走内核 `createRecommendRunner(...).run(...)` ——
//    ①**单次 POST**（内核 `inFlight` 同 `operationId` 复用同一 Promise）；②**等待页绝不用重复 POST 当轮询**
//    （本页除 `startAnalysis` 外无任何再次请求路径，伪进度只由本地计时器推进）；③**超时（180s，页面计时器与
//    内核 `RECOMMEND_REQUEST_TIMEOUT_MS` 同值）只切 failed 态，绝不自动重发/再扣第二次**，重发必须由用户
//    显式点「重试」；④**页面零 `uni.request`**，仓储已含 180s 超时＋`replayPolicy:"never"`。
//    ⚠️ T9b CR 登记：**超时后用户点「重试」会复用同一在飞 Promise**（同 `operationId`）⇒ 该在飞请求迟到成功时按当前代次回写并转场结果页
//  · **P3-17（复用共享支付/登录/上传 + 只续跑一次 + 恢复入口）**：充值走共享
//    `payment-coordinator.recharge(ctx,{shopId,credits:1,feature:"recommend",operationId})`（**页面零自建到账轮询**，
//    `confirm()` 内建「订单 paid **且** 权益（recommend 池 balance>0）同时满足」双条件）；到账后
//    **只续跑一次**（`resumeAfterCredit` 一次性标记，**先清后调**）；取消/超时/下单失败/网络异常一律
//    `status="failed"` ⇒ 界面给出**明确恢复入口**（「重试」重发一次 / 「返回」离开）。
//  · **P3-18（DTO 显式含 finalScore）**：本页把内核归一结果与原始载荷一并转交结果页，**逐条显式写入
//    `finalScore`**（缺失→null，兼容 `final_score`），**绝不用原始 `score` 凑分**；结果页只按
//    `shouldShowScore` 决定是否显示。
//  · **P3-19（等待页文案与操作）**：四步文案/图标与旧端逐字；页脚两行逐字；成功转场前 `progressDone`
//    让进度走满 100%（旧端 :148-149），260ms 后才 `redirectTo`（旧端 :153-157）。
//  · **P3-20（旧响应覆盖）**：`runGeneration` 请求代次守卫——`stopAll()`（离页/重试/超时/成功）即递增代次，
//    在飞响应回来时 `gen !== runGeneration` ⇒ **直接丢弃，绝不回写**新状态；`redirectTimer` 亦在 `stopAll`
//    中清除（旧端 CR 🟡「成功后 260ms 内离页仍被强拉」同源修复）。
//
// 偏差清单（有意，逐条）：
//  ①主题：旧端 `.page{background: var(--color-bg)}`＝深色 `#160F04`；失败态遮罩内联 `var(--color-bg)` 同样
//    落为字面值 `#160f04`（新端 App.vue 未定义 `--color-bg`，照抄变量会失效成透明）。**深色口径同 AI 批次**。
//  ②到账轮询：旧端页面自建 `pollRechargeStatus`（2.5s×48 次、`payPollToken` 作废、双条件判定）**整段删除**，
//    改由共享 `payment-coordinator` 承担（P3-17；其 `confirm()` 为有限轮询，超时≠订单作废）；
//    页面只消费 `{ok,phase,reason,credits,outTradeNo}` 终态。
//  ③防截屏：旧端推荐三页从未启用 capture guard；本批按父会话指令与 `pages/aiTryOn*` 同纪律统一启用
//    （onShow enable／onHide＋onUnload disable）。
//  ④载荷转交：旧端 `JSON.stringify(res.data)` 直接把后端 `{analysis, recommendations}` 交给结果页；
//    新端内核 `run()` 只回归一后的列表 ⇒ 本页以仓储适配器**留一份原始载荷**（`lastRawPayload`），
//    转交时 `{...原始, analysis, recommendations: 逐条补 finalScore}`，保证 `analysis` 卡片不丢（见函数注释）。
//  ⑤401：旧端由 http 层 `uni.$emit('login-required')` 全局事件挂起等待登录；新端 client 无事件总线，
//    401 直接返回 `AUTH_EXPIRED` ⇒ 本页按「失效即 failed + toast「登录已过期，请返回重新登录」」处理
//    （口径同已迁 mine 页偏差①），恢复入口＝返回上一页重新登录后重进。
//  ⑥token：旧 `--font-size-body-plus`(28rpx)／`--font-size-caption-md`(18rpx) 写旧值字面量（**勿映射**
//    `tokens.semantic.fontSizeBody`=32rpx）；`--spacing-24`(24rpx)／`--spacing-lg`(32rpx)／`--radius-2xl`(48rpx)
//    按 App.uvue 旧值字面量；`--color-primary-50`→`rgba(241,205,145,0.5)`（派生透明度用字面 rgba）。
import { computed, ref } from "vue";
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import { PROFILE } from "../../generated/profile.config";
import { detectUiPlatform } from "../../ui/ui-platform";
import { isPlatform, type Platform } from "../../ports/context";
import { createUniTransport } from "../../platform/uni/transport";
import { createUniStorage } from "../../platform/uni/storage";
import { createUniLoginCode } from "../../platform/uni/login";
import { toast, showLoading, hideLoading } from "../../platform/uni/feedback";
import { createCaptureGuard } from "../../platform/weixin/capabilities";
import { createWeixinPayments } from "../../platform/weixin/payments";
import { createAuthCoordinator } from "../../application/auth-coordinator";
import { createSilentIdentityExchange } from "../../application/silent-login";
import { createContextFactory } from "../../application/request-context";
import { createVersionedStorage } from "../../infrastructure/storage/versioned";
import { createHttpClient } from "../../infrastructure/http/client";
import { createAiRepository } from "../../infrastructure/repositories/ai";
import { createCreditRepository } from "../../infrastructure/repositories/credits";
import { createWxAuthRepository } from "../../infrastructure/repositories/wx-auth";
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
  createRecommendRunner,
  normalizeFinalScore,
  type RecommendItem,
} from "../../application/ai-recommend-flow";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import GenerationProgress from "../../components/GenerationProgress/GenerationProgress.vue";
import PageFooter from "../../components/PageFooter/PageFooter.vue";
import { useFakeProgress } from "../../composables/use-fake-progress";

// —— 装配（顺序与 pages/aiTryOn/index.vue、pages/aiTryOnResult/index.vue 完全同口径）——
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
    loginCode: createUniLoginCode({ platform }),
    platform,
    profileKey: PROFILE.profileKey,
  }),
  storage: uniStorage,
});
const client = createHttpClient({ transport, authCoordinator });
const wxAuth = createWxAuthRepository({ client, platform });
const aiRepo = createAiRepository({ client });
const creditRepo = createCreditRepository({ client });
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
  // 旧端 pollRechargeStatus(:255) 口径还原：进入到账确认轮询挂「确认到账中...」，离开即摘（2026-09-19 主人指示 loading 与原版一致）
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

// —— 等待态页脚覆盖文案（旧端 :76-81 逐字）——
// FOOTER_WAITING_MAIN/FOOTER_WAITING_SUPPORT 已下沉 application/page-config-content（原与 aiTryOnResult 逐字重复）

/** 页面计时器口径（旧端 :128-132）＝内核 `RECOMMEND_REQUEST_TIMEOUT_MS`(180000ms)/1000 */
const RECOMMEND_UI_TIMEOUT_SECONDS = 180;
/** 成功转场延迟（旧端 :153-157 `setTimeout(..., 260)`） */
const RESULT_REDIRECT_DELAY_MS = 260;

// —— 页面状态（旧端 data :48-60 逐字段对应；到账轮询字段已交共享 coordinator，不再在页面持有）——
const filename = ref("");
const shopId = ref("");
const status = ref<"processing" | "failed">("processing");
const elapsedSeconds = ref(0);
const progressDone = ref(false); // 任务完成时置真 → 伪进度走满 100%
const isPaying = ref(false); // 支付流程进行中（防连点；门闩由 coordinator 持有）
const footerIdle = ref<FooterContent>({ mainLine: "", supportLine: "" });
const footerProcessing = ref<FooterContent>({ mainLine: "", supportLine: "" });

// 非页面级瞬时状态（旧端 data 中的 timer/token 字段等价物）
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let redirectTimer: ReturnType<typeof setTimeout> | null = null;
/** P3-20：请求代次——`stopAll()` 即递增，在飞旧响应回来时按代次丢弃，绝不回写新状态 */
let runGeneration = 0;
/** 原始推荐载荷（现行 DTO `{analysis, recommendations}`）；内核只归一列表，`analysis` 由本变量带过页（偏差④） */
let lastRawPayload: Record<string, unknown> | null = null;
/** P3-17：到账后**只续跑一次**的一次性标记（先清后调） */
let resumeAfterCredit = false;

// —— 推荐请求（P3-16：内核承担**单次 POST** 与同 op 在飞复用；仓储已含 180s 超时＋never）——
const runner = createRecommendRunner({
  ai: {
    async getRecommend(context, params) {
      const res = await aiRepo.getRecommend(context, params);
      // 留原始载荷：结果页的分析卡需要 `analysis`（内核 `normalizeItems` 只产出列表，偏差④）
      if (res.ok && res.value != null) lastRawPayload = res.value;
      return res;
    },
  },
  nextContext: () => ctxFactory.next(),
});

// —— computed（旧端 :74-118）——
// 页脚两行：等待态走 AI 生成提示/技术支持，其余状态回落 OPS copyright / Profile 版权（旧端 :75-81）
const footer = computed<FooterContent>(() => (status.value === "processing" ? footerProcessing.value : footerIdle.value));
// 生成等待伪进度：10s 走满 99%，完成时 progressDone → 100（旧端 :82-117，已抽共享 composable；时长/图标/文案为本页定稿参数）
const { progressPercent, currentProgressStep, progressIcons, progressSteps } = useFakeProgress(10, {
  elapsedSeconds,
  progressDone,
  // 四步节点图标（旧端 :97-105 逐字：IconPark 语义图标；已完成节点由组件统一显示白勾）
  icons: [
    "/static/iconpark/face-scan.svg",
    "/static/iconpark/eyes.svg",
    "/static/iconpark/plan.svg",
    "/static/iconpark/list-success.svg",
  ],
  // 四步动态文案（推荐版 · 旧端 :106-117 逐字）
  steps: {
    base: ["分析照片面部细节", "分析五官类型", "生成推荐方案", "生成推荐结果"],
    done: ["照片面部细节分析完毕", "五官类型分析完毕", "推荐方案生成完毕", "推荐结果生成完毕"],
  },
});

// —— 生命周期（旧端 :62-73）——
onLoad((options?: Record<string, unknown>) => {
  filename.value = options?.filename != null ? String(options.filename) : "";
  shopId.value = options?.shopId != null ? String(options.shopId) : "";
  void loadFooterPair();
  if (filename.value !== "") {
    startAnalysis();
  } else {
    // 无 filename 直接失败（旧端 :67-69），不发请求、不扣费
    status.value = "failed";
  }
});

onShow(() => {
  captureGuard.enable();
});

onHide(() => {
  captureGuard.disable();
});

onUnload(() => {
  stopAll(); // 旧端 :71-73
  resumeAfterCredit = false; // 到账后不再对已销毁页面回写/续跑（旧端以 payPollToken 自增作废到账轮询同义）
  captureGuard.disable(); // redirectTo/reLaunch 只触发 onUnload，残留会污染全局
});

// —— 分析流程（旧端 :120-178）——
function startAnalysis(): void {
  stopAll(); // 作废旧代次 + 清计时器/转场定时器
  status.value = "processing";
  elapsedSeconds.value = 0;
  progressDone.value = false;

  // 计时器：每秒更新已等待时间（旧端 :125-133）
  countdownTimer = setInterval(() => {
    elapsedSeconds.value += 1;
    // 超时 180 秒（3 分钟），展示失败；**绝不自动重发**（每次 POST 都会再扣一次推荐次数，P3-16）
    if (elapsedSeconds.value >= RECOMMEND_UI_TIMEOUT_SECONDS) {
      stopAll();
      status.value = "failed";
    }
  }, 1000);

  // 推荐接口为同步扣费接口（每次调用扣 1 次推荐余额），只调用一次，不可轮询重发（旧端 :135-136）
  void callRecommend();
}

async function callRecommend(): Promise<void> {
  const gen = ++runGeneration; // 本次请求代次（P3-20）
  const shopIdNum = parseInt(shopId.value, 10) || 0;
  let out: Awaited<ReturnType<typeof runner.run>>;
  try {
    out = await runner.run({
      userPhotoFilename: filename.value,
      shopId: shopIdNum,
      // 同 op 在飞复用同一 Promise：页面内连点/重入不会发起第二次 POST（P3-16）
      operationId: `recommend-${shopIdNum}-${filename.value}`,
    });
  } catch (err) {
    // 网络异常/超时：不自动重发（重发会再次扣费），展示失败由用户手动重试（旧端 :172-177）
    console.error("[aiRecommendLoading] AI推荐请求失败:", err);
    if (gen !== runGeneration) return; // 旧代次：丢弃
    stopAll();
    status.value = "failed";
    return;
  }
  // P3-20：离页/重试/超时后的旧响应一律丢弃，绝不回写新状态
  if (gen !== runGeneration) return;

  if (out.ok) {
    stopAll();
    // 任务结束不得仍停中间步骤 → 进度走满 100% 再跳结果页（旧端 :147-149）
    progressDone.value = true;
    const resultData = JSON.stringify(buildResultPayload(out.items));
    const shopIdSnapshot = shopId.value;
    // 转场定时器入账，stopAll 清除，防「成功后 260ms 内离页仍被强拉」（旧端 CR 🟡 :152-157）
    redirectTimer = setTimeout(() => {
      redirectTo(`/pages/aiRecommendResult/index?shopId=${shopIdSnapshot}&data=${encodeURIComponent(resultData)}`);
    }, RESULT_REDIRECT_DELAY_MS);
    return;
  }

  // 4001 = 推荐次数不足：拉起充值支付，到账后自动重新分析（旧端 :160-165）
  if (out.kind === "INSUFFICIENT_CREDITS") {
    stopAll();
    resumeAfterCredit = true; // P3-17：只续跑一次（先置标记，成功到账后先清后调）
    void handleRecharge();
    return;
  }

  // 其他失败（业务错误/网络/登录过期）：展示失败，由用户手动重试（旧端 :166-171）
  stopAll();
  status.value = "failed";
  if (out.kind === "AUTH_EXPIRED") {
    toast("登录已过期，请返回重新登录"); // 偏差⑤：新端无 login-required 事件总线，页面显式给出恢复入口
  } else if (out.kind === "BUSINESS" && out.message !== "") {
    // 旧端口径：**仅业务错误**带后端 message 提示；网络异常只落失败态（不额外 toast，避免双重噪音）
    toast(out.message);
  }
}

function stopAll(): void {
  // P3-20：递增代次 → 在飞旧响应/旧定时器回调一律失效（无新 state 写入）
  runGeneration += 1;
  if (countdownTimer != null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  // 清除成功转场定时器（旧端 CR 🟡 :185-189：防离页仍被 redirectTo 强拉）
  if (redirectTimer != null) {
    clearTimeout(redirectTimer);
    redirectTimer = null;
  }
}

// —— 4001 推荐次数不足：共享支付协调器（下单 → 拉起 → 轮询到账 → **权益确认**）——
// 旧端自建 `pollRechargeStatus`（:247-289）已删除（偏差②）：页面零自建到账轮询，只消费终态。
async function handleRecharge(): Promise<void> {
  if (isPaying.value) return; // 页面级防连点（并发门闩在 coordinator 内）
  isPaying.value = true;
  toast("推荐次数不足，请完成支付"); // 旧端 :198 逐字
  try {
    const shopIdNum = parseInt(shopId.value, 10) || 0;
    if (shopIdNum <= 0) {
      status.value = "failed";
      resumeAfterCredit = false;
      toast("缺少店铺信息，请稍后重试");
      return;
    }
    const out = await coordinator.recharge(ctxFactory.next(), {
      shopId: shopIdNum,
      credits: 1,
      feature: "recommend",
      // 同 op 重入复用同一在飞过程（P3-03），不创建第二笔订单
      operationId: `recommend-${shopIdNum}`,
    });
    if (out.ok) {
      // 到账＝订单 paid **且** recommend 池 balance>0（P3-05 双条件，由协调器 `confirm()` 保证）
      toast(`支付成功，${out.credits != null ? out.credits : 1} 次到账`, "success");
      // P3-17：**只续跑一次** —— 标记先清后调，二次回调不会重复发起分析（重复 POST 会再扣费）
      if (resumeAfterCredit) {
        resumeAfterCredit = false;
        startAnalysis();
      }
      return;
    }
    // 以下失败分支一律落 failed 态 ⇒ 界面给出明确恢复入口（重试 / 返回），且不再自动扣费
    status.value = "failed";
    resumeAfterCredit = false;
    if (out.phase === "cancelled") {
      toast("已取消支付"); // 旧端 :231-232 逐字
      return;
    }
    if (out.reason === "unsupported") {
      toast("当前端暂不支持支付");
      return;
    }
    if (out.reason === "timeout") {
      // 超时≠订单作废（P3-04）：本页不自动续跑；用户可「重试」重新发起，或稍后返回重进
      toast("到账确认超时，请重试"); // 旧端 :283 逐字
      return;
    }
    if (out.reason === "create-order-failed") {
      toast("下单失败，请重试"); // 旧端 :205 逐字
      return;
    }
    toast("支付未完成，请重试"); // 旧端 :235 逐字
  } catch (err) {
    status.value = "failed";
    resumeAfterCredit = false;
    console.error("[aiRecommendLoading] 创建充值订单失败:", err);
    toast("下单失败，请重试"); // 旧端 :243 逐字
  } finally {
    // 支付门闩由协调器在终态释放；本标志仅用于页面防重复点击
    isPaying.value = false;
  }
}

// —— 重试 / 返回（旧端 :291-298）——
function handleRetry(): void {
  startAnalysis(); // 用户显式重试才再次发起 POST（P3-16：超时不得自动扣第二次）
}

function handleBack(): void {
  stopAll();
  if (typeof uni !== "undefined" && typeof uni.navigateBack === "function") uni.navigateBack();
}

// —— 结果载荷（P3-18：显式含 finalScore）——
/** 取推荐列表：现行 DTO `{analysis, recommendations}` → 兜底 `{data:[]}`（内核归一形状） */
function pickList(raw: Record<string, unknown>): unknown[] {
  const recs = raw.recommendations;
  if (Array.isArray(recs)) return recs as unknown[];
  const data = raw.data;
  if (Array.isArray(data)) return data as unknown[];
  return [];
}
/**
 * 转交结果页的载荷：**保留原始 DTO 全部字段**（`analysis` 等），并逐条**显式写入 `finalScore`**
 * （缺失/null/0/异常 → null；兼容后端 `final_score`）。**禁止用原始 `score` 凑分**（P3-18）。
 */
function buildResultPayload(items: RecommendItem[]): Record<string, unknown> {
  const base: Record<string, unknown> = lastRawPayload != null ? lastRawPayload : {};
  const rawList = pickList(base);
  const source: unknown[] = rawList.length > 0 ? rawList : items;
  const recommendations = source.map((item) => {
    const obj = (item ?? {}) as Record<string, unknown>;
    return { ...obj, finalScore: normalizeFinalScore(obj.finalScore ?? obj.final_score) };
  });
  return { ...base, analysis: base.analysis != null ? base.analysis : null, recommendations };
}

// —— 页脚（旧端 :28-36 单实例＋动态 props；新端两套预取一次后按状态取用，偏差④口径同 aiTryOnResult）——
async function loadFooterPair(): Promise<void> {
  try {
    const [idle, waiting] = await Promise.all([
      pageContent.loadFooter(ctxFactory.next()),
      pageContent.loadFooter(ctxFactory.next(), {
        mainText: FOOTER_WAITING_MAIN,
        supportText: FOOTER_WAITING_SUPPORT,
      }),
    ]);
    footerIdle.value = idle;
    footerProcessing.value = waiting;
  } catch (err) {
    console.error("[aiRecommendLoading] 加载页脚配置失败:", err);
  }
}

// —— 小工具（容器安全：uni 一律 typeof 守卫）——
function redirectTo(url: string): void {
  if (typeof uni !== "undefined" && typeof uni.redirectTo === "function") uni.redirectTo({ url });
}
</script>

<template>
  <view class="page">
    <CustomNavBar title="AI分析中" />
    <!-- 加载态（2026-09-14 主人指示：AI推荐等待页**不要**标题栏下的 Tips、**不要**底部双按钮，只保留步骤条进度 + 百分比 + footer） -->
    <view v-if="status === 'processing'" class="center-content processing-pad">
      <view class="loading-wrapper">
        <view class="gen-panel">
          <GenerationProgress
            :steps="progressSteps"
            :icon-paths="progressIcons"
            :active-index="currentProgressStep"
            :percent="progressPercent"
          />
        </view>
      </view>
    </view>

    <!-- 失败态（旧端 :14-26；深色遮罩＝旧 var(--color-bg) #160F04 字面值，见偏差①） -->
    <view v-if="status === 'failed'" class="center-content fail-overlay">
      <view class="fail-wrapper">
        <text class="fail-text">AI分析失败，请重试</text>
        <view class="retry-btn" hover-class="press-dim" @click="handleRetry">
          <text class="retry-btn-text">重试</text>
        </view>
        <view class="back-btn-wrapper" hover-class="press-dim" @click="handleBack">
          <text class="back-btn-text">返回</text>
        </view>
      </view>
    </view>

    <!-- 底部 footer：第一行 AI 生成提示，第二行版权文字（跟随 OPS copyright 配置；旧端 :28-36；
         PageFooter 共享组件收敛 page-footer > divide + bottomdesc 块——深色变体 + safe-area 内边距） -->
    <!-- 单实例 + 动态 props（旧端 CR 🟡：避免 v-if/v-else 重建组件、重复拉取 OPS 版权配置） -->
    <PageFooter :main-line="footer.mainLine" :support-line="footer.supportLine" variant="bottomdesc-dark" safe-area />
  </view>
</template>

<style scoped>
/* 旧端 :305-311：深色页底（--color-bg #160F04，偏差①） */
.page {
  background: #160f04;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 居中内容区域（旧端 :314-345 逐值） */
.center-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 64rpx;
}
/* 等待态：内容自顶部排布（无 Tips，进度条距标题栏 24rpx），左右留白收窄让进度模块更宽 */
.center-content.processing-pad {
  justify-content: flex-start;
  padding-top: 24rpx; /* 旧 --spacing-24 */
  padding-left: 24rpx;
  padding-right: 24rpx;
  padding-bottom: 32rpx; /* 旧 --spacing-lg */
}
.gen-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  /* 旧端 CR 🟡：必须 stretch，否则 GenerationProgress 宿主宽度是 fit-content，步骤条宽度会被最长步骤文案决定 */
  align-items: stretch;
}
.loading-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 旧端 CR 🟡：打断百分比宽度循环依赖，让内层面板宽度确定 */
  width: 100%;
}

/* 失败态深色遮罩（旧端 :14-26 内联 var(--color-bg) 字面值，见偏差①） */
.fail-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #160f04;
}

/* 失败态（旧端 :348-376 逐值） */
.fail-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.fail-text {
  font-size: 30rpx;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 48rpx;
  text-align: center;
}
.retry-btn {
  background: #fff; /* 旧 :360 同值——失败态重试按钮白底黑字为旧端原设计，非亮色残留（2026-09-19 核对） */
  border-radius: 48rpx; /* 旧 --radius-2xl */
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
  font-size: 28rpx; /* 旧 --font-size-body-plus=28rpx */
  color: rgba(241, 205, 145, 0.9); /* 旧端字面值（金 90%） */
}
</style>
