<script setup lang="ts">
// T9b（Phase 3.3）AI 推荐结果页——旧端 pages/aiRecommendResult/index.uvue（334 行）忠实移植。
//
// 旧端映射（行号）：
//  · 模板 1-75：CustomNavBar「AI推荐结果」:3 → 分析卡片 :5-28（性别 :9-11／人群 :13-15／脸型 :17-19／体型 :21-23
//    ＋ styleKeywords 标签行 :25-27；整卡 `v-if="analysis"`）→ 推荐列表 :31-64（每卡＝预览图容器 :39-51
//    「骨架图 → 缩略图 @load 收骨架 → 无 previewUrl 走『暂无预览』占位」＋信息区 :53-62
//    「styleName、`finalScore > 0` 才显示的分数 :56、reason :58、查看模板 :60」）→ 底部占位 :67 → 版权 footer :70-73
//  · 逻辑：onLoad :91-118（options.shopId；options.data **先 decodeURIComponent 再 JSON.parse**，取
//    `parsed.analysis`／`parsed.recommendations`；**先落列表再打骨架标记**——CR 🟡：脏数据异常不应导致整列丢失；
//    由 `analysis.gender` 归一出 male/female 供后续试衣跳转 :107-112；解析异常 → console.error ＋ toast :113-116）
//    previewThumb :121-123（cosThumb 400）／onPreviewLoad :126-131／onViewTemplateClick :133-144
//    （albumId>0 → targetPhotoDetail?idx&type=shopId&liked=false&style；否则 toast）／onPreviewClick :147-152
//    （跳 aiTryOn?style&gender&shopId——旧端模板**未绑定**该方法，为保真与「试衣跳转参数」口径原样保留，见偏差⑤）
//  · 样式 157-334 逐值对应（换算口径见「偏差清单」）
//
// 验收落实（本批 P3-16～P3-20）：
//  · **P3-18**：本页**只**渲染 `shouldShowScore(item)` 为真的分数，取值经 `normalizeFinalScore`
//    （number 且 > 0 才显示；缺失/null/0/负数/字符串/NaN 一律不显示），**绝不用原始 `score` 凑分**。
//    旧 api.uts:788-797 的 `AiRecommendation` 只声明了 `score`、**漏了 `finalScore`**——属旧类型漏字段，
//    本页按现行后端 DTO 显式收 `finalScore`（兼容后端 snake_case `final_score`），不照搬旧类型。
//  · **P3-19**：①「暂无同性样例」标签**不再存在**——旧端 57fe085「fix(aiRecommend): 移除『暂无同性样例』标签」
//    已删除 `.rec-gender-tag` 及其 `!rec.genderMatched` 渲染点，本页**有意不恢复**（`genderMatched` 既不读也不渲染）；
//    ②缩略图时序与旧端同序：先骨架 → `@load` 收骨架 → 无 `previewUrl` 走「暂无预览」占位（旧端无 `@error` 分支，
//    本页同样不加，保持时序一致）；③「查看模板」跳转参数逐字保留；④等待页文案/操作见 aiRecommendLoading 页头。
//  · **P3-20（旧响应覆盖）**：本页**零请求、零轮询**，载荷在 onLoad 内**同步**解析一次 ⇒ 不存在
//    「旧响应回写新状态」的路径；`onPreviewLoad` 另加下标越界守卫（旧端 :126-131 已有同义判断），
//    防止脏 idx 把 `previewLoaded` 写到别的卡片上。
//
// 偏差清单（有意，逐条）：
//  ①主题：旧端 `.page{background: var(--color-bg)}`＝深色 `#160F04` ⇒ 本页沿用**深色页底 `#160f04`**
//    （与 `BottomActionBar` 同口径，AI 批次页面统一）。
//  ②防截屏：旧端推荐三页**从未**启用 capture guard；本批按父会话指令与 `pages/aiTryOn*` 同纪律统一启用
//    （onShow enable／onHide＋onUnload disable，`onUnload` 兜住 redirectTo/reLaunch 只触发 onUnload 的残留路径）。
//  ③token：旧 `--font-size-body`(24rpx)／`--font-size-body-plus`(28rpx)／`--font-size-body-lg`(26rpx)／
//    `--font-size-body-sm`(22rpx) **一律写旧值字面量**（**勿映射** `tokens.semantic.fontSizeBody`=32rpx，档位不符）；
//    派生透明度色（白 5%/10%/15%、金 10%/6%）按旧端字面 rgba 保留；`--font-display` 新端无对应 token ⇒ 写
//    `'NotoSerifSC-Bold', serif` 字面值；`--spacing-lg`(32rpx)／`--spacing-sm`(20rpx)／`--radius-sm`(16rpx)／
//    `--radius-xs`(8rpx)／`--radius-container`(24rpx) 按 App.uvue 旧值字面量。
//  ④旧端 `<AppFooter />` 无 props（组件内 mounted 自取 OPS copyright）；新端 AppFooter 为纯 props 组件
//    ⇒ 改由用例 `pageContent.loadFooter(ctx)` 取数后 props 注入（口径同本批已迁页面）。
//  ⑤`onPreviewClick`（跳试衣）旧端定义但模板未绑定，本页保留方法但同样不绑定，注释标明出处与参数口径。
//  ⑥健壮性：`analysis` 缺失字段渲染空串（旧端直接插值）；`analysis.styleKeywords` 非数组时按空数组处理
//    （旧端 `.length` 会抛）；不改可见行为。
import { computed, ref } from "vue";
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import { PROFILE } from "../../generated/profile.config";
import { detectUiPlatform } from "../../ui/ui-platform";
import { isPlatform, type Platform } from "../../ports/context";
import { createUniTransport } from "../../platform/uni/transport";
import { createUniStorage } from "../../platform/uni/storage";
import { createUniLoginCode } from "../../platform/uni/login";
import { navigateTo, toast } from "../../platform/uni/feedback";
import { createCaptureGuard } from "../../platform/weixin/capabilities";
import { createAuthCoordinator } from "../../application/auth-coordinator";
import { createSilentIdentityExchange } from "../../application/silent-login";
import { createContextFactory } from "../../application/request-context";
import { createVersionedStorage } from "../../infrastructure/storage/versioned";
import { createHttpClient } from "../../infrastructure/http/client";
import { createWxAuthRepository } from "../../infrastructure/repositories/wx-auth";
import { createPageConfigContent, type FooterContent } from "../../application/page-config-content";
import { createPageConfigRepository } from "../../infrastructure/repositories/page-config";
import { cosThumb } from "../../application/image";
import { normalizeFinalScore, shouldShowScore } from "../../application/ai-recommend-flow";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import PageFooter from "../../components/PageFooter/PageFooter.vue";

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
    loginCode: createUniLoginCode(),
    platform,
    profileKey: PROFILE.profileKey,
  }),
  storage: uniStorage,
});
const client = createHttpClient({ transport, authCoordinator });
const wxAuth = createWxAuthRepository({ client });
const ctxFactory = createContextFactory({
  platform,
  environment: env,
  profileKey: PROFILE.profileKey,
  appCode: PROFILE.appCode,
  getBrandId: () => versioned.loadBrandId(),
});
const captureGuard = createCaptureGuard();
const pageContent = createPageConfigContent({
  pageConfig: createPageConfigRepository({ client }),
  profile: {
    copyrightText: PROFILE.copyrightText,
    contactQrSrc: PROFILE.contactQrSrc,
    contactPhoneText: PROFILE.contactPhoneText,
  },
});

// —— 页面状态（旧端 data :83-90 逐字段对应）——
/** 推荐卡片：原始 DTO 字段原样保留，另补 `finalScore`（P3-18 显式收口）与 `previewLoaded`（骨架时序） */
interface RecommendCard {
  /** 展示用最终分：**仅 `normalizeFinalScore` 非 null 才渲染**（旧端 :56 `finalScore > 0`） */
  finalScore: number | null;
  previewUrl: string;
  previewLoaded: boolean;
  styleName: string;
  reason: string;
  /** 对应客片 id（旧 api.uts:795-796 `albumId`）：>0 时「查看模板」跳客片详情 */
  albumId: number;
  [key: string]: unknown;
}

const analysis = ref<Record<string, unknown> | null>(null);
const recommendations = ref<RecommendCard[]>([]);
const gender = ref(""); // male | female（旧 :87/:107-112，供试衣跳转带参）
const shopId = ref("");
const footer = ref<FooterContent>({ mainLine: "", supportLine: "" });

// —— computed（旧端 :25-27 / :56）——
// 风格关键词标签行：仅非空数组渲染（旧端 `analysis.styleKeywords.length > 0`）
const keywordList = computed<string[]>(() => {
  const raw = analysis.value?.styleKeywords;
  return Array.isArray(raw) ? raw.map((k) => String(k)) : [];
});

// —— 生命周期（旧端 :91-118；无 onShow/onHide/onUnload，防截屏为本批统一纪律见偏差②）——
onLoad((options?: Record<string, unknown>) => {
  shopId.value = options?.shopId != null ? String(options.shopId) : "";
  const raw = options?.data != null ? String(options.data) : "";
  if (raw !== "") {
    try {
      const parsed = JSON.parse(safeDecode(raw)) as {
        analysis?: Record<string, unknown> | null;
        recommendations?: unknown;
      } | null;
      analysis.value = parsed?.analysis ?? null;
      const rawRecs = parsed?.recommendations;
      const recs: unknown[] = Array.isArray(rawRecs) ? (rawRecs as unknown[]) : [];
      // 先落列表再打骨架标记（CR 🟡：脏数据异常不应导致整列丢失；旧端 :99-105 同序）
      recommendations.value = recs.map((item) => normalizeCard(item));
      for (let i = 0; i < recommendations.value.length; i++) recommendations.value[i].previewLoaded = false;
      // 记录用户性别用于后续模板筛选（旧端 :106-112）
      const g = String(analysis.value?.gender ?? "").toLowerCase();
      if (g === "男" || g === "male") {
        gender.value = "male";
      } else if (g === "女" || g === "female") {
        gender.value = "female";
      }
    } catch (err) {
      console.error("[aiRecommendResult] 解析推荐结果失败:", err);
      toast("结果解析失败，请重试");
    }
  }
  void loadFooter();
});

onShow(() => {
  captureGuard.enable();
});

onHide(() => {
  captureGuard.disable();
});

onUnload(() => {
  captureGuard.disable(); // redirectTo/reLaunch 只触发 onUnload，残留会污染全局
});

// —— 载荷归一（旧端 :96-105；P3-18 显式收口 finalScore）——
function normalizeCard(item: unknown): RecommendCard {
  const obj = (item ?? {}) as Record<string, unknown>;
  const card: RecommendCard = {
    // 后端现行 DTO 为 `finalScore`；兼容 snake_case `final_score`。**不用原始 `score` 凑分**（P3-18）
    finalScore: normalizeFinalScore(obj.finalScore ?? obj.final_score),
    previewUrl: typeof obj.previewUrl === "string" ? obj.previewUrl : "",
    previewLoaded: false,
    styleName: typeof obj.styleName === "string" ? obj.styleName : "",
    reason: typeof obj.reason === "string" ? obj.reason : "",
    albumId: typeof obj.albumId === "number" ? obj.albumId : 0,
  };
  // 其余字段（templateIds / genderMatched / score…）原样保留，避免展示层丢字段
  for (const key of Object.keys(obj)) {
    if (!(key in card)) card[key] = obj[key];
  }
  return card;
}

// —— 展示辅助 ——
/** 分析卡取值（旧端直接插值 analysis.xxx；缺失渲染空串，见偏差⑥） */
function analysisText(field: "gender" | "estimatedAge" | "faceShape" | "bodyType"): string {
  const value = analysis.value?.[field];
  return value == null ? "" : String(value);
}
/** P3-18 显示条件：`shouldShowScore`（内核内部即 `normalizeFinalScore(...) != null`） */
function showScore(item: RecommendCard): boolean {
  return shouldShowScore(item);
}
/** P3-18 展示值：`{{ finalScore }}分`（旧端 :56 逐字，取归一后的分立值） */
function scoreText(item: RecommendCard): string {
  const score = normalizeFinalScore(item.finalScore);
  return score == null ? "" : `${score}分`;
}
// 列表预览图统一走 COS 万象缩略图（400px）：原图直出会拖慢整屏卡片渲染（旧端 :120-123 逐字）
function previewThumb(url: string): string {
  return cosThumb(url, 400);
}
// 单卡预览图加载完成 → 收掉骨架图（旧端 :125-131；下标越界守卫）
function onPreviewLoad(idx: number): void {
  const list = recommendations.value;
  if (idx >= 0 && idx < list.length) {
    list[idx].previewLoaded = true;
  }
}
// 点击「查看模板」：有 albumId 跳客片详情页，否则 toast 提示（旧端 :132-144 逐字，含跳转参数口径）
function onViewTemplateClick(rec: RecommendCard): void {
  const albumId = rec.albumId ?? 0;
  if (albumId > 0) {
    // 详情接口要求携带 type=shopId，style 供「我也要拍」带回试衣页
    const style = encodeURIComponent(rec.styleName ?? "");
    navigateTo(`/pages/targetPhotoDetail/index?idx=${albumId}&type=${shopId.value}&liked=false&style=${style}`);
  } else {
    toast("查询不到对应样片稍后再试");
  }
}
// 点击封面图：跳转 AI 试衣模板列表（shopId 供试衣提交与支付使用；旧端 :146-152）
// ⚠️ 旧端模板未把本方法绑到任何元素上（无 @click）——为保真与「试衣跳转参数」口径**保留但不绑定**（偏差⑤）
function onPreviewClick(rec: RecommendCard): void {
  const style = encodeURIComponent(rec.styleName ?? "");
  navigateTo(`/pages/aiTryOn/index?style=${style}&gender=${gender.value}&shopId=${shopId.value}`);
}

// —— 页脚（旧端 :70-73 `<AppFooter />`；新端改用例取数＋props 注入，见偏差④）——
async function loadFooter(): Promise<void> {
  try {
    footer.value = await pageContent.loadFooter(ctxFactory.next());
  } catch (err) {
    console.error("[aiRecommendResult] 加载页脚配置失败:", err);
  }
}

// —— 小工具（容器安全：uni 一律 typeof 守卫）——
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
</script>

<template>
  <view class="page">
    <CustomNavBar title="AI推荐结果" />
    <!-- AI 分析结果卡片（旧端 :5-28） -->
    <view class="analysis-card" v-if="analysis">
      <text class="card-title">AI 分析结果</text>
      <view class="analysis-grid">
        <view class="analysis-item">
          <text class="analysis-label">性别</text>
          <text class="analysis-value">{{ analysisText("gender") }}</text>
        </view>
        <view class="analysis-item">
          <text class="analysis-label">人群</text>
          <text class="analysis-value">{{ analysisText("estimatedAge") }}</text>
        </view>
        <view class="analysis-item">
          <text class="analysis-label">脸型</text>
          <text class="analysis-value">{{ analysisText("faceShape") }}</text>
        </view>
        <view class="analysis-item">
          <text class="analysis-label">体型</text>
          <text class="analysis-value">{{ analysisText("bodyType") }}</text>
        </view>
      </view>
      <view class="keywords-row" v-if="keywordList.length > 0">
        <text class="keyword-tag" v-for="(kw, idx) in keywordList" :key="idx">{{ kw }}</text>
      </view>
    </view>

    <!-- 推荐风格列表（旧端 :31-64） -->
    <view class="recommend-section">
      <text class="section-title">推荐服饰风格</text>
      <view v-for="(rec, idx) in recommendations" :key="idx" class="rec-card">
        <!-- 预览图：先骨架图、图加载完成后完全渲染（旧端 :38-51，统一走缩略图） -->
        <view class="rec-preview-wrap">
          <view v-if="rec.previewUrl !== '' && !rec.previewLoaded" class="rec-preview-skeleton"></view>
          <image
            v-if="rec.previewUrl !== ''"
            class="rec-preview"
            :src="previewThumb(rec.previewUrl)"
            mode="aspectFill"
            @load="onPreviewLoad(idx)"
          ></image>
          <view v-else class="rec-preview rec-preview-placeholder">
            <text class="placeholder-text">暂无预览</text>
          </view>
        </view>
        <!-- 信息（旧端 :53-62） -->
        <view class="rec-info">
          <view class="rec-header">
            <text class="rec-name">{{ rec.styleName }}</text>
            <!-- P3-18：仅 finalScore 有效（>0）才显示，禁用原始 score 凑分 -->
            <text class="rec-score" v-if="showScore(rec)">{{ scoreText(rec) }}</text>
          </view>
          <text class="rec-reason">{{ rec.reason }}</text>
          <view class="rec-footer">
            <!-- P3-19①：「暂无同性样例」标签已由旧端 57fe085 移除，本页有意不恢复 -->
            <text class="rec-action" @click="onViewTemplateClick(rec)">查看模板</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部占位（旧端 :67） -->
    <view class="bottom-spacer"></view>

    <!-- 底部 Copyright（旧端 :70-73；PageFooter 共享组件收敛 page-footer > divide + bottomdesc 块，深色变体） -->
    <PageFooter :main-line="footer.mainLine" :support-line="footer.supportLine" variant="bottomdesc-dark" />
  </view>
</template>

<style scoped>
/* 旧端 :158-163：深色页底（--color-bg=#160F04，偏差①） */
.page {
  background: #160f04;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* 分析卡片（旧端 :166-210 逐值） */
.analysis-card {
  margin: 24rpx 32rpx; /* 旧 --spacing-lg=32rpx */
  padding: 32rpx;
  border-radius: 16rpx; /* 旧 --radius-sm */
  background: rgba(255, 255, 255, 0.05);
}
.card-title {
  font-size: 32rpx; /* 旧端字面值（档位高于 --font-size-body-plus） */
  font-family: "NotoSerifSC-Bold", serif; /* 旧 --font-display */
  color: #fff;
  font-weight: 400;
  margin-bottom: 24rpx;
}
.analysis-grid {
  display: flex;
  flex-wrap: wrap;
}
.analysis-item {
  width: 50%;
  margin-bottom: 20rpx; /* 旧 --spacing-sm */
}
.analysis-label {
  font-size: 24rpx; /* 旧 --font-size-body=24rpx（**勿映射 fontSizeBody=32rpx**） */
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 8rpx;
}
.analysis-value {
  font-size: 28rpx; /* 旧 --font-size-body-plus=28rpx */
  color: rgba(255, 255, 255, 0.9);
}
.keywords-row {
  display: flex;
  flex-wrap: wrap;
  margin-top: 8rpx;
  flex-direction: row;
}
.keyword-tag {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.8);
  padding: 8rpx 24rpx;
  border-radius: 24rpx; /* 旧 --radius-container */
  background: rgba(255, 255, 255, 0.1);
  margin-right: 16rpx;
  margin-bottom: 12rpx;
}

/* 推荐列表（旧端 :213-314 逐值） */
.recommend-section {
  padding: 0 32rpx;
}
.section-title {
  font-size: 32rpx;
  font-family: "NotoSerifSC-Bold", serif; /* 旧 --font-display */
  color: #fff;
  font-weight: 400;
  margin-bottom: 24rpx;
}
.rec-card {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  margin-bottom: 24rpx;
  border-radius: 16rpx;
  padding: 20rpx 24rpx; /* 旧 --spacing-sm 24rpx */
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
  gap: 16rpx;
}
/* 预览图容器：固定 280rpx 方图，骨架图绝对覆盖（图加载完成后收掉） */
.rec-preview-wrap {
  position: relative;
  width: 280rpx;
  height: 280rpx;
  flex: none;
  border-radius: 8rpx; /* 旧 --radius-xs */
  overflow: hidden;
}
.rec-preview-skeleton {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  /* 旧 --color-primary-10 / --color-primary-06（金 10% / 6%，派生透明度一律字面 rgba） */
  background: linear-gradient(135deg, rgba(241, 205, 145, 0.1) 0%, rgba(241, 205, 145, 0.06) 100%);
  animation: skPulse 1.4s ease-in-out infinite;
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
.rec-preview {
  width: 100%;
  height: 100%;
}
.rec-preview-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.03);
}
.placeholder-text {
  font-size: 22rpx; /* 旧 --font-size-body-sm */
  color: rgba(255, 255, 255, 0.3);
}
.rec-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.rec-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.rec-name {
  font-size: 30rpx; /* 旧端字面值 */
  color: #fff;
  font-weight: 400;
}
.rec-score {
  font-size: 26rpx; /* 旧 --font-size-body-lg=26rpx */
  color: #f3d9ac; /* 旧端字面值（浅金，非 --color-primary） */
  font-weight: 400;
}
.rec-reason {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.5);
  line-height: 36rpx;
  margin-top: 8rpx;
}
.rec-footer {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-top: 12rpx;
}
/* 旧端 57fe085 删除的 `.rec-gender-tag`（font-size 22rpx / rgba(255,200,100,0.7)）**不恢复**（P3-19①） */
.rec-action {
  font-size: 24rpx;
  color: rgba(123, 172, 227, 0.9);
}

/* 底部（旧端 :317-333 逐值） */
.bottom-spacer {
  height: 120rpx;
}
</style>
