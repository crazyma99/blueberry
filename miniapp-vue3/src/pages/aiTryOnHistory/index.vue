<script setup lang="ts">
// T8（Phase 3）AI 试衣记录页——旧端 aiTryOnHistory/index.uvue（344 行）忠实移植。
// 旧端事实：CustomNavBar「AI试衣记录」（:4）；骨架 4 卡（:7-11）；空态「暂无内容/还没有 AI 试衣记录哦」（:16-19）；
// 卡片 coverThumb 400（completed 用 result_image_url，否则 template_image_url，:158-164）；
// 状态遮罩 pending/processing＝「生成中」（含 dotPulse 动画，:37-42/:322-334）、failed＝「生成失败」（:44-48）；
// 底部 style_name（缺省「AI 试衣」）＋created_at 格式化为 MM-DD HH:mm（:171-187）；点击 → aiTryOnResult?taskId（:143-156，
// completed 与 pending/processing 均跳转继续轮询，failed 仅 toast）；onShow 首跳过一次后刷新（:98-105，
// **已有数据时静默刷新**——旧 bug #7：从结果页返回骨架整页闪，:111-114）；openid 取本地用户信息，缺失则空态（:116-122）。
// ⚠️ 平台：抖音侧 AI 6 页**不注册**（2026-09-17 主人拍板）⇒ pages.json 中本页条目以 `#ifdef MP-WEIXIN` 包裹。
// 有意偏差（已声明）：①主题暗→亮（旧 --color-bg #160F04→colorPage 白）：空态文案改 colorTextSecondary（旧白 50%／30% 白底不可读）；
// ②font-noto-serif/harmony 全局类未定义（沿用既有口径）；③AppFooter 由 P2-21 的纯 props 组件接入（内容经 page-config 用例）。
import { computed, ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import { PROFILE } from "../../generated/profile.config";
import { detectUiPlatform } from "../../ui/ui-platform";
import { isPlatform } from "../../ports/context";
import type { Platform } from "../../ports/context";
import { systemClock } from "../../ports/clock";
import { tokens } from "../../generated/tokens";
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
import AppFooter from "../../components/AppFooter/AppFooter.vue";

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
    <CustomNavBar title="AI试衣记录" />

    <view v-if="loading" class="sk-wrap main-content">
      <view class="sk-row">
        <view v-for="i in 4" :key="i" class="sk-photo-item"></view>
      </view>
    </view>

    <view v-else class="content main-content">
      <view v-if="isEmpty" class="empty-state">
        <view class="empty-title">暂无内容</view>
        <view class="empty-desc">还没有 AI 试衣记录哦</view>
      </view>

      <view v-else class="photolistContainer">
        <view
          v-for="(item, index) in taskList"
          :key="index"
          class="photoItem"
          hover-class="press-dim"
          @click="handleItemClick(item)"
        >
          <image :src="getCoverUrl(item)" class="photo" mode="aspectFill" lazy-load />

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

          <view class="mask">
            <view class="desc">
              <view class="photoName">{{ item.style_name || "AI 试衣" }}</view>
              <view class="time">{{ formatTime(item.created_at) }}</view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view class="page-footer">
      <view class="divide"></view>
      <view class="copyright">
        <AppFooter :main-line="footer.mainLine" :support-line="footer.supportLine" />
      </view>
    </view>
  </view>
</template>

<style scoped>
.container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: v-bind("tokens.semantic.colorPage");
}
.main-content {
  flex: 1;
}
.page-footer {
  margin-top: auto;
}
.divide {
  height: 2rpx;
  width: 100%;
  background: rgba(255, 255, 255, 0.15);
}
.content {
  padding: 0 8rpx 32rpx; /* 旧 --spacing-lg=32rpx */
}
/* 骨架（旧 sk-photo-item 2 列 4 卡；几何同旧：362×482、卡距 8rpx） */
.sk-wrap {
  padding: 16rpx 0;
}
.sk-row {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
}
.sk-photo-item {
  width: 362rpx;
  height: 482rpx;
  margin: 0 8rpx 8rpx 0;
  border-radius: 8rpx; /* 旧 --radius-xs=8rpx */
  background: rgba(0, 0, 0, 0.06);
}
/* 空状态（旧 :218-233；白底可读性改用正文次级色，已于页头声明） */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 200rpx 32rpx;
}
.empty-title {
  font-size: 32rpx;
  color: v-bind("tokens.semantic.colorTextSecondary");
  margin-bottom: 16rpx;
}
.empty-desc {
  font-size: 24rpx;
  color: v-bind("tokens.semantic.colorTextSecondary");
}
/* 卡片网格（旧 :236-250） */
.photolistContainer {
  margin: 16rpx 0;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
}
.photoItem {
  width: 362rpx;
  height: 482rpx;
  margin: 0 8rpx 8rpx 0;
  position: relative;
}
.photoItem:nth-child(2n) {
  margin: 0 0 8rpx;
}
.photo {
  width: 100%;
  height: 100%;
  border-radius: 8rpx; /* 旧 --radius-xs */
  background: rgba(0, 0, 0, 0.06);
}
.mask {
  position: absolute;
  width: 362rpx;
  height: 482rpx;
  top: 0;
  left: 0;
  border-radius: 8rpx;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 60%, rgba(0, 0, 0, 0.4) 75%, rgba(0, 0, 0, 0.7) 89%, #000000 100%);
}
.desc {
  margin: 436rpx 16rpx 0;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}
.photoName {
  font-size: 28rpx; /* 旧 --font-size-body-plus=28rpx */
  font-weight: 400;
  color: #ffffff; /* 深色渐变蒙层上的白字（与旧端一致） */
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.time {
  font-size: 22rpx; /* 旧 --font-size-body-sm=22rpx */
  color: rgba(255, 255, 255, 0.6);
  margin-left: 12rpx;
}
/* 状态遮罩（旧 :289-334） */
.status-overlay {
  position: absolute;
  width: 362rpx;
  height: 482rpx;
  top: 0;
  left: 0;
  border-radius: 8rpx;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}
.status-badge {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 12rpx 24rpx;
  border-radius: 32rpx; /* 旧 --radius-lg=32rpx */
  border: 1rpx solid rgba(255, 255, 255, 0.25);
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
  color: #ffffff;
  font-weight: 400;
}
.loading-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #f3d9ac;
  margin-right: 10rpx; /* 旧 --spacing-xs=10rpx */
  animation: dotPulse 1s ease-in-out infinite;
}
@keyframes dotPulse {
  0% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
  100% { opacity: 0.3; transform: scale(0.8); }
}
/* 页脚包裹（旧 :337-343） */
.copyright {
  margin: 32rpx auto;
  font-size: 18rpx; /* 旧 --font-size-caption-md=18rpx */
  font-weight: 400;
  text-align: center;
}
</style>
