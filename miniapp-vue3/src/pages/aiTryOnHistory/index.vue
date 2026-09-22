<script setup lang="ts">
// T8（Phase 3）AI 试衣记录页——旧端 aiTryOnHistory/index.uvue（344 行）忠实移植。
// 旧端事实：CustomNavBar「AI试衣记录」（:4）；骨架 4 卡（:7-11）→ 2026-09-21 起与「相册列表」同款 6 卡；空态「暂无内容/还没有 AI 试衣记录哦」（:16-19）；
// 卡片 coverThumb 400（completed 用 result_image_url，否则 template_image_url，:158-164）；
// 状态遮罩 pending/processing＝「生成中」（含 dotPulse 动画，:37-42/:322-334）、failed＝「生成失败」（:44-48）；
// 底部 style_name（缺省「AI 试衣」）＋created_at 格式化为 MM-DD HH:mm（:171-187）；点击 → aiTryOnResult?taskId（:143-156，
// completed 与 pending/processing 均跳转继续轮询，failed 仅 toast）；onShow 首跳过一次后刷新（:98-105，
// **已有数据时静默刷新**——旧 bug #7：从结果页返回骨架整页闪，:111-114）；openid 取本地用户信息，缺失则空态（:116-122）。
// ⚠️ 平台：抖音侧 AI 6 页**不注册**（2026-09-17 主人拍板）⇒ pages.json 中本页条目以 `#ifdef MP-WEIXIN` 包裹。
// 有意偏差（已声明）：①主题：2026-09-19 撤回迁移期亮色、恢复旧端深色（colorPage=#160F04，同旧 --color-bg）；
// 空态文案仍取 colorTextSecondary（深色下=金 70%，与旧白 50%／30% 观感接近）；骨架/照片占位底已按旧端还原白 8%/6%；
// ②font-noto-serif/harmony 全局类未定义（沿用既有口径）；③AppFooter 由 P2-21 的纯 props 组件接入（内容经 page-config 用例）。
import { computed, ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import { PROFILE } from "../../generated/profile.config";
import { detectUiPlatform } from "../../ui/ui-platform";
import { isPlatform } from "../../ports/context";
import type { Platform } from "../../ports/context";
import { createUniTransport } from "../../platform/uni/transport";
import { createUniStorage } from "../../platform/uni/storage";
import { createUniLoginCode } from "../../platform/uni/login";
import { toast } from "../../platform/uni/feedback";
import { createAuthCoordinator } from "../../application/auth-coordinator";
import { createSilentIdentityExchange } from "../../application/silent-login";
import { createContextFactory } from "../../application/request-context";
import { createVersionedStorage } from "../../infrastructure/storage/versioned";
import { createHttpClient } from "../../infrastructure/http/client";
import { createWxAuthRepository } from "../../infrastructure/repositories/wx-auth";
import { createAiRepository, type AiTaskListItem } from "../../infrastructure/repositories/ai";
import { createUserInfoStore } from "../../application/user-info-store";
import { createPageConfigRepository } from "../../infrastructure/repositories/page-config";
import { createPageConfigContent, type FooterContent } from "../../application/page-config-content";
import { cosThumb } from "../../application/image";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
// 2026-09-21 主人：本页也要下拉刷新 ⇒ 指示器＋刷新内核走共享实现（5 页同源）
import PullRefreshIndicator from "../../components/PullRefreshIndicator/PullRefreshIndicator.vue";
import { createPullRefresh } from "../../composables/use-pull-refresh";
import PageFooter from "../../components/PageFooter/PageFooter.vue";

// —— 装配（同 mine/favorites）——
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
    loginCode: createUniLoginCode({ platform }),
    platform,
    profileKey: PROFILE.profileKey,
  }),
  storage: uniStorage,
});
const client = createHttpClient({ transport, authCoordinator });
const wxAuth = createWxAuthRepository({ client, platform });
const aiRepo = createAiRepository({ client });
const ctxFactory = createContextFactory({
  platform,
  environment: env,
  profileKey: PROFILE.profileKey,
  appCode: PROFILE.appCode,
  getBrandId: () => versioned.loadBrandId(),
});
const pageContent = createPageConfigContent({
  pageConfig: createPageConfigRepository({ client }),
  profile: {
    copyrightText: PROFILE.copyrightText,
    contactQrSrc: PROFILE.contactQrSrc,
    contactPhoneText: PROFILE.contactPhoneText,
  },
});

// —— 页面状态（旧端 :84-92）——
const loading = ref(true);
const taskList = ref<AiTaskListItem[]>([]);
const isEmpty = ref(false);
const footer = ref<FooterContent>({ mainLine: "", supportLine: "" });
// 首次进入 onLoad 已加载，onShow 跳过（旧 :89-90/:98-101）
const firstShow = ref(true);

const hasData = computed(() => taskList.value.length > 0);

onLoad(() => {
  void loadData();
  void loadFooter();
});

onShow(() => {
  if (firstShow.value) {
    firstShow.value = false;
    return;
  }
  void loadData(); // 从结果页返回刷新（状态可能已更新）
});

// —— 下拉刷新（2026-09-21 主人：AI 试衣记录页要下拉刷新）——
// 重载任务列表 + 页脚文案（口径同首页：下拉即取最新 OPS 配置）
const { refreshing, indicatorTop } = createPullRefresh({
  label: "aiTryOnHistory",
  refresh: () => Promise.all([loadData(), loadFooter()]),
  hasCustomNav: true,
});

async function loadFooter(): Promise<void> {
  footer.value = await pageContent.loadFooter(ctxFactory.next());
}

async function loadData(): Promise<void> {
  try {
    // 旧 :111-114（bug #7 修复）：已有数据时静默刷新，不整页骨架闪烁
    if (taskList.value.length === 0) loading.value = true;

    const info = userStore.load();
    const openid = info != null && info.openid != null ? info.openid : "";
    if (openid === "") {
      taskList.value = [];
      isEmpty.value = true;
      return;
    }

    const res = await aiRepo.getTasks(ctxFactory.next(), openid);
    // aiface 成功码 0/200 由 client isBusinessSuccess 统一判定
    if (res.ok && res.value != null) {
      taskList.value = res.value;
      isEmpty.value = taskList.value.length === 0;
    } else {
      // ⚠️ 仓储/client 只返回 Result 从不抛（同 brandHub CR 🔴2 教训）：失败提示必须走此分支，不能只写在 catch
      taskList.value = [];
      isEmpty.value = true;
      toast("加载失败");
    }
  } catch (err) {
    console.error("加载 AI 试衣记录失败:", err);
    toast("加载失败");
    isEmpty.value = true;
  } finally {
    loading.value = false;
  }
}

// 旧 :143-156：completed 与 pending/processing 均跳结果页（继续轮询），failed 仅提示
function handleItemClick(item: AiTaskListItem): void {
  if (typeof uni === "undefined" || typeof uni.navigateTo !== "function") return;
  if (item.status === "completed" || item.status === "pending" || item.status === "processing") {
    uni.navigateTo({ url: `/pages/aiTryOnResult/index?taskId=${item.id}` });
  } else if (item.status === "failed") {
    toast("该记录生成失败");
  }
}

// 旧 :158-164：封面 400 缩略（completed 用结果图，否则模板图）
function getCoverUrl(item: AiTaskListItem): string {
  if (item.status === "completed" && item.result_image_url != null && item.result_image_url !== "") {
    return cosThumb(item.result_image_url, 400);
  }
  return cosThumb(item.template_image_url, 400);
}

function isProcessing(status: string): boolean {
  return status === "pending" || status === "processing";
}

// 旧 :171-187：MM-DD HH:mm（无法解析原样返回）
function formatTime(input: string): string {
  if (input == null || input === "") return "";
  const normalized = input.replace(" ", "T");
  const ts = Date.parse(normalized);
  if (isNaN(ts)) return input;
  const d = new Date(ts);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
</script>

<template>
  <view class="container">
    <!-- 下拉刷新指示器：共享组件（`hasCustomNav: true` ⇒ 落在自绘导航栏下沿之下、让开原生三点指示带） -->
    <PullRefreshIndicator :show="refreshing" :top="indicatorTop" />
    <CustomNavBar title="AI试衣记录" />

    <!-- 骨架屏：与「相册列表」（demoDetail）同款（sk-row sk-grid + 6 灰格 482rpx/8rpx） -->
    <view v-if="loading" class="sk-wrap main-content">
      <view class="sk-row sk-grid">
        <view v-for="i in 6" :key="i" class="sk-photo-item"></view>
      </view>
    </view>

    <view v-else class="content main-content">
      <view v-if="isEmpty" class="empty-state">
        <view class="empty-title">暂无内容</view>
        <view class="empty-desc">还没有 AI 试衣记录哦</view>
      </view>

      <!-- 列表网格与卡片**对齐「相册列表」（demoDetail）标准**（2026-09-21 主人：「AI试衣列表的 Grid 与卡片样式以相册列表为标准统一」）：
           外描边卡（1rpx 金 30%）＋内圈圆角（13rpx）＋底部渐变蒙层（55%→85%）＋左下描述区（20rpx）＋金标题（26rpx 衬线，单行省略）；
           AI 专属内容仅「状态遮罩」（生成中／生成失败）保留，配色同步改为品牌金系。 -->
      <view v-else class="album-grid">
        <view v-for="(item, index) in taskList" :key="index" class="album-card">
          <view class="album-inner">
            <image :src="getCoverUrl(item)" class="album-cover" mode="aspectFill" lazy-load />

            <view v-if="isProcessing(item.status)" class="status-overlay">
              <view class="status-badge processing">
                <view class="loading-dot"></view>
                <text class="status-text">生成中</text>
              </view>
            </view>
            <view v-else-if="item.status === 'failed'" class="status-overlay">
              <view class="status-badge failed">
                <text class="status-text">生成失败</text>
              </view>
            </view>

            <view class="album-mask" hover-class="press-dim" @click="handleItemClick(item)">
              <view class="album-desc">
                <text class="album-title font-noto-serif">{{ item.style_name || "AI 试衣" }}</text>
                <text class="album-time">{{ formatTime(item.created_at) }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 页脚：PageFooter 共享组件（原 :220-225 page-footer > divide + copyright 块收敛；样式随之入组件） -->
    <PageFooter :main-line="footer.mainLine" :support-line="footer.supportLine" variant="copyright" />
  </view>
</template>

<style lang="scss" scoped>
.container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: $color-page;
}
.main-content {
  flex: 1;
}
.content {
  /* 🔴R2（独立 CR）：横向 padding 归零——旧端 8rpx 是配「362rpx×2＋间隙」的老数学（旧端 :211-213），
     本轮网格改用相册标准的 `calc((100% - 16rpx)/2)` 后 8rpx 属重复扣减 ⇒ 有效左右内边距变 32rpx（标准 24rpx）、卡窄 8rpx。
     仅保留纵向底部间距。 */
  padding: 0 0 32rpx;
}
/* 骨架（旧 sk-photo-item 2 列 4 卡；几何同旧：362×482、卡距 8rpx） */
.sk-wrap {
  padding: 32rpx; /* 与「相册列表」同值（独立 CR 🟡①：原 16rpx 0 ⇒ 骨架贴屏边） */
}
.sk-row {
  display: flex;
  flex-direction: row;
  align-items: center;
}
.sk-grid {
  flex-wrap: wrap;
  margin-top: 20rpx;
}
.sk-photo-item {
  /* 与「相册列表」同值 */
  width: calc(50% - 16rpx);
  height: 482rpx;
  margin: 8rpx;
  border-radius: 8rpx;
  background: rgba(255, 255, 255, 0.08);
}
/* 空状态（旧 :218-233；文字色取正文次级色，已于页头声明） */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 200rpx 32rpx;
}
.empty-title {
  font-size: 32rpx;
  color: $color-text-secondary;
  margin-bottom: 16rpx;
}
.empty-desc {
  font-size: 24rpx;
  color: $color-text-secondary;
}
/* 卡片网格（旧 :236-250） */
/* ===== 网格与卡片：**逐值对齐「相册列表」（demoDetail）**（2026-09-21 主人指示；两侧同值由 t54 漂移守卫锁死） ===== */
.album-grid {
  padding: 24rpx 24rpx 0;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16rpx;
}
.album-card {
  /* 纯色描边外框；border-box 防 1rpx 描边使每行溢出换行（抖音实测） */
  width: calc((100% - 16rpx) / 2);
  box-sizing: border-box;
  border: 1rpx solid rgba(241, 205, 145, 0.3);
  border-radius: 14rpx;
}
.album-inner {
  /* 内圈圆角 = 外圈 14rpx − 1rpx 描边，两段圆弧同心 */
  width: 100%;
  height: 460rpx;
  position: relative;
  border-radius: 13rpx;
  overflow: hidden;
}
.album-cover {
  width: 100%;
  height: 100%;
}
.album-mask {
  /* 底部渐变蒙层，标题/时间都在蒙层上 */
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, 0.45) 75%, rgba(0, 0, 0, 0.85) 100%);
}
.album-desc {
  position: absolute;
  left: 20rpx;
  right: 20rpx;
  bottom: 20rpx;
  display: flex;
  flex-direction: column;
}
.album-title {
  font-size: 26rpx;
  font-weight: 400;
  color: #F1CD91;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.album-time {
  /* 次级行排版对齐相册卡片的 `.like-row`（上间距 10rpx／字号 24rpx／金） */
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #F1CD91;
}
.status-overlay {
  /* 几何随「相册标准」卡片（460rpx／内圈 13rpx 同心）；AI 专属状态层 */
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  border-radius: 13rpx;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  /* 🔴R1（独立 CR）：状态层是蒙层的兄弟且在上层 ⇒ 真机命中测试取它、事件只沿祖先冒泡，
     而点击面在 `.album-mask` 上 ⇒「生成中/生成失败」卡真机点不动（旧端点击在卡片根，故可点）。
     置 `pointer-events: none` 让手势穿透到蒙层（本仓先例：brandHub:199 / mine:467）。 */
  pointer-events: none;
}
.status-badge {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 12rpx 24rpx;
  border-radius: 32rpx;
  border: 1rpx solid rgba(241, 205, 145, 0.3); /* 与相册卡片描边同色（品牌金 30%） */
}
.status-badge.processing {
  background: rgba(243, 217, 172, 0.18);
}
.status-badge.failed {
  background: rgba(221, 82, 77, 0.25);
  border-color: rgba(221, 82, 77, 0.5);
}
.status-text {
  font-size: 24rpx;
  color: #F1CD91; /* 品牌金（与相册卡片文字同族） */
  font-weight: 400;
}
.loading-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #F1CD91; /* 品牌金（与相册卡片同色系） */
  margin-right: 10rpx; /* 旧 --spacing-xs=10rpx */
  animation: dotPulse 1s ease-in-out infinite;
}
@keyframes dotPulse {
  0% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
  100% { opacity: 0.3; transform: scale(0.8); }
}
</style>
