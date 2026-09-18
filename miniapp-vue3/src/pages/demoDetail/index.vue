<script setup lang="ts">
// T6 相册列表页（P2-11/13/14）：分类 tabs＋分页列表＋搜索＋点赞乐观更新。
// 旧端行为事实：列表参数 shopId＋child.query 透传（demoDetail:478-482）；搜索同接口加 keyword（:551-556）；
// liked 来自批量 getLikeStatus 合并（:613-619）；点赞乐观更新＋seq 守卫＋失败回滚（:660-693，use-like 移植）。
// 入参：idx=店铺id、from 来源标记（旧端 index:578-582）；缺 idx 安全失败停留空态。
import { computed, ref } from "vue";
import { onLoad, onReachBottom } from "@dcloudio/uni-app";
import { PROFILE } from "../../generated/profile.config";
import { detectUiPlatform } from "../../ui/ui-platform";
import { isPlatform } from "../../ports/context";
import type { Platform } from "../../ports/context";
import { tokens } from "../../generated/tokens";
import { createUniTransport } from "../../platform/uni/transport";
import { createUniStorage } from "../../platform/uni/storage";
import { createUniLoginCode } from "../../platform/uni/login";
import { createAuthCoordinator } from "../../application/auth-coordinator";
import { createSilentIdentityExchange } from "../../application/silent-login";
import { createContextFactory } from "../../application/request-context";
import { createVersionedStorage } from "../../infrastructure/storage/versioned";
import { createHttpClient } from "../../infrastructure/http/client";
import { createWxAuthRepository } from "../../infrastructure/repositories/wx-auth";
import { createAlbumRepository, type CategoryBrief } from "../../infrastructure/repositories/albums";
import { createLikeRepository } from "../../infrastructure/repositories/likes";
import { createAlbumListViewModel } from "../../composables/use-album-list";
import { createLikeToggler, type LikeableItem } from "../../composables/use-like";
import { parseListParams } from "../../application/route-params";
import { formatAlbumTitle } from "../../domain/album-title";
import { cosThumb } from "../../application/image";
import { formatCount } from "../../application/format";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import PageFooter from "../../components/PageFooter/PageFooter.vue";
import { createPageConfigRepository } from "../../infrastructure/repositories/page-config";
import { createPageConfigContent, type FooterContent } from "../../application/page-config-content";
import LoadingBlock from "../../components/LoadingBlock/LoadingBlock.vue";
import BaseFeedback from "../../ui/BaseFeedback.vue";
import type { AlbumBrief } from "../../infrastructure/repositories/albums";

// —— 装配（同 index：容器安全回落；登录占位不假装成功）——
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
const albumRepo = createAlbumRepository({ client });
// P2-21：页脚内容经用例取数（旧 demoDetail :184-187 divide＋bottomdesc AppFooter）
const pageContent = createPageConfigContent({
  pageConfig: createPageConfigRepository({ client }),
  profile: {
    copyrightText: PROFILE.copyrightText,
    contactQrSrc: PROFILE.contactQrSrc,
    contactPhoneText: PROFILE.contactPhoneText,
  },
});
const footer = ref<FooterContent>({ mainLine: "", supportLine: "" });
async function loadFooter(): Promise<void> {
  footer.value = await pageContent.loadFooter(ctxFactory.next());
}
const likeRepo = createLikeRepository({ client });
const ctxFactory = createContextFactory({
  platform,
  environment: env,
  profileKey: PROFILE.profileKey,
  appCode: PROFILE.appCode,
  getBrandId: () => versioned.loadBrandId(),
});
const listVM = createAlbumListViewModel({ albums: albumRepo });
const liker = createLikeToggler({ likes: likeRepo });

// —— 页面状态 ——
interface ChildTab {
  name?: string;
  query?: Record<string, string>;
}
type ListAlbum = AlbumBrief & LikeableItem;

const ready = ref(false);
const shopId = ref("");
const categories = ref<CategoryBrief[]>([]);
const selectedParent = ref(0);
const selectedChild = ref(0);
const keyword = ref("");
const searching = ref(false);
const feedbackRef = ref<InstanceType<typeof BaseFeedback> | null>(null);

const childTabs = computed<ChildTab[]>(() => {
  const parent = categories.value[selectedParent.value];
  const subs = parent != null ? (parent.subCategory as ChildTab[] | undefined) : undefined;
  return Array.isArray(subs) ? subs : [];
});
const albums = computed<ListAlbum[]>(() => listVM.items.value as ListAlbum[]);

function currentQuery(): Record<string, string> | null {
  const child = childTabs.value[selectedChild.value];
  if (child == null || child.query == null) return null;
  return child.query;
}

async function refreshLikeStatus(): Promise<void> {
  const ids = albums.value.map((a) => a.id);
  if (ids.length === 0) return;
  const r = await likeRepo.getLikeStatus(ctxFactory.next(), ids.join(","));
  if (!r.ok) return;
  for (const s of r.value) {
    const target = albums.value.find((p) => p.id === s.albumId);
    if (target != null) {
      target.liked = s.liked;
      target.likeCount = s.likeCount;
    }
  }
}

async function reloadList(): Promise<void> {
  const query = currentQuery();
  if (query == null) {
    // 旧端 :473-476：无有效子分类 → 空列表＋noMore
    listVM.items.value = [];
    listVM.noMore.value = true;
    return;
  }
  listVM.noMore.value = false;
  const params: { shopId: string; categoryQuery: Record<string, string>; keyword?: string } = {
    shopId: shopId.value,
    categoryQuery: query,
  };
  if (searching.value && keyword.value.trim() !== "") params.keyword = keyword.value.trim();
  await listVM.loadFirst(ctxFactory.next(), params);
  void loadFooter();
  await refreshLikeStatus();
}

async function init(id: string): Promise<void> {
  shopId.value = id;
  const rc = await albumRepo.getCategories(ctxFactory.next(), id);
  if (rc.ok) categories.value = rc.value;
  selectedParent.value = 0;
  selectedChild.value = 0;
  await reloadList();
  ready.value = true;
}

function changeTab(idx: number, level: "parent" | "child"): void {
  if (level === "parent") {
    selectedParent.value = idx;
    selectedChild.value = 0;
  } else {
    selectedChild.value = idx;
  }
  void reloadList();
}

function onSearch(): void {
  searching.value = true;
  void reloadList();
}
function onClearSearch(): void {
  searching.value = false;
  keyword.value = "";
  void reloadList();
}

async function onToggleLike(item: ListAlbum): Promise<void> {
  const outcome = await liker.toggle(ctxFactory.next(), item);
  if (outcome === "rolled-back") {
    feedbackRef.value?.show("操作失败，请重试");
  }
}

function goAiRecommend(): void {
  // AI 推荐属 B4 批次（T9b）；入口先忠实渲染，目标页随 B4 注册
  if (typeof uni !== "undefined" && typeof uni.navigateTo === "function") {
    uni.navigateTo({ url: "/pages/aiRecommend/index?shopId=" + shopId.value });
  }
}

onLoad((options) => {
  const p = parseListParams((options ?? {}) as Record<string, unknown>);
  if (p == null) return; // 缺 idx 安全失败：停留空态
  void init(p.shopId);
});

onReachBottom(() => {
  if (!ready.value || searching.value) return;
  const query = currentQuery();
  if (query == null) return;
  void listVM.loadMore(ctxFactory.next(), { shopId: shopId.value, categoryQuery: query });
});
</script>

<template>
  <view class="container">
    <CustomNavBar title="">
      <view class="search-bar">
        <input
          v-model="keyword"
          class="search-input"
          type="text"
          placeholder="搜索客片"
          confirm-type="search"
          @confirm="onSearch"
        />
        <view class="search-btn" @click="onSearch">搜索</view>
        <view v-if="searching" class="search-btn search-clear" @click="onClearSearch">清除</view>
      </view>
    </CustomNavBar>

    <view v-if="!ready" class="sk-wrap">
      <LoadingBlock text="加载中…" />
    </view>

    <template v-else>
      <!-- 分类模式：AI 入口＋套系/子系 tabs（旧端 :98-135 结构） -->
      <view v-if="!searching && categories.length > 0">
        <view class="ai-recommend-banner" @click="goAiRecommend">
          <image class="ai-recommend-bg" src="/static/ai-recom-banner.png" mode="aspectFill" />
          <view class="ai-recommend-content">
            <text class="ai-recommend-title">AI智能推荐·拍照选服饰</text>
            <text class="ai-recommend-subtitle">上传照片，AI为您推荐最合适的服饰风格</text>
          </view>
        </view>
        <view class="cat-title-row"><text class="cat-title">套系与子系分类</text></view>
        <view class="tabcontainer">
          <view
            v-for="(item, idx) in categories"
            :key="item.id"
            :class="selectedParent === idx ? 'tab-wrap choosed-wrap' : 'tab-wrap'"
            @click="changeTab(idx, 'parent')"
          >
            <view :class="selectedParent === idx ? 'tab choosed' : 'tab'">{{ item.parentName }}</view>
          </view>
        </view>
        <view v-if="childTabs.length > 0" class="tabcontainer">
          <view
            v-for="(item, idx) in childTabs"
            :key="idx"
            :class="selectedChild === idx ? 'tab-wrap choosed-wrap' : 'tab-wrap'"
            @click="changeTab(idx, 'child')"
          >
            <view :class="selectedChild === idx ? 'tab choosed' : 'tab'">{{ item.name }}</view>
          </view>
        </view>
      </view>

      <!-- 相册网格 -->
      <view class="album-grid">
        <view v-for="item in albums" :key="item.id" class="album-card">
          <!-- 封面走 COS 600 缩略（旧端 coverThumb=url→cosThumb 600，demoDetail:378-380） -->
          <image class="album-cover" :src="cosThumb(item.coverImageUrl, 600)" mode="aspectFill" lazy-load />
          <view class="album-meta">
            <text class="album-title">{{ formatAlbumTitle(item.title) }}</text>
            <view class="like-row" @click="onToggleLike(item)">
              <image
                class="like-icon"
                :src="item.liked ? '/static/iconpark/like-filled.svg' : '/static/iconpark/like.svg'"
                mode="aspectFit"
              />
              <text class="like-count">{{ formatCount(item.likeCount || 0) }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="listVM.loading.value" class="list-foot"><LoadingBlock text="" /></view>
      <view v-else-if="listVM.noMore.value && albums.length > 0" class="list-foot"><text>没有更多了</text></view>
      <view v-if="listVM.error.value !== null" class="list-error">
        <text>{{ listVM.error.value }}</text>
        <view class="search-btn" @click="reloadList">重试</view>
      </view>
      <view v-if="albums.length === 0 && listVM.error.value === null" class="list-empty">
        <text>暂无客片</text>
      </view>
    </template>

    <!-- 页脚：PageFooter 共享组件（原 :292-298 page-footer > divide + bottomdesc 块收敛；样式随之入组件） -->
    <PageFooter :main-line="footer.mainLine" :support-line="footer.supportLine" />

    <BaseFeedback ref="feedbackRef" />
  </view>
</template>

<style scoped>
.container {
  min-height: 100vh;
  background: v-bind("tokens.semantic.colorPage");
}
.search-bar {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex: 1;
  min-width: 0;
}
.search-input {
  flex: 1;
  min-width: 0;
  height: 56rpx;
  padding: 0 20rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.08);
  font-size: v-bind("tokens.semantic.fontSizeBody");
  color: v-bind("tokens.semantic.colorTextPrimary");
}
.search-btn {
  padding: 0 20rpx;
  height: 56rpx;
  line-height: 56rpx;
  border-radius: 999rpx;
  background: v-bind("tokens.semantic.colorAction");
  color: v-bind("tokens.semantic.colorActionText");
  font-size: v-bind("tokens.semantic.fontSizeCaption");
}
.search-clear {
  background: v-bind("tokens.semantic.colorDivider");
  color: v-bind("tokens.semantic.colorTextSecondary");
}
.sk-wrap {
  padding: 120rpx 0;
}
.ai-recommend-banner {
  position: relative;
  margin: 24rpx 16rpx 0;
  border-radius: v-bind("tokens.component.popupRadiusRpx + 'rpx'");
  overflow: hidden;
}
.ai-recommend-bg {
  width: 100%;
  height: 160rpx;
}
.ai-recommend-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 32rpx;
}
.ai-recommend-title {
  font-size: v-bind("tokens.semantic.fontSizeSubTitle");
  color: v-bind("tokens.semantic.colorAction");
}
.ai-recommend-subtitle {
  margin-top: 8rpx;
  font-size: v-bind("tokens.semantic.fontSizeCaption");
  color: v-bind("tokens.semantic.colorTextSecondary");
}
.cat-title-row {
  margin: 32rpx 16rpx 0;
}
.cat-title {
  font-size: v-bind("tokens.semantic.fontSizeSubTitle");
  color: v-bind("tokens.semantic.colorTextStrong");
}
.tabcontainer {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin: 16rpx 16rpx 0;
}
.tab-wrap {
  border-radius: 999rpx;
  padding: 2rpx;
}
.choosed-wrap {
  background: v-bind("tokens.semantic.colorAction");
}
.tab {
  padding: 10rpx 28rpx;
  font-size: v-bind("tokens.semantic.fontSizeBody");
  color: v-bind("tokens.semantic.colorTextPrimary");
}
.choosed {
  color: v-bind("tokens.semantic.colorActionText");
}
.album-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin: 24rpx 16rpx 0;
}
.album-card {
  width: calc((100% - 16rpx) / 2);
  border-radius: v-bind("tokens.component.popupRadiusRpx + 'rpx'");
  overflow: hidden;
}
.album-cover {
  width: 100%;
  height: 320rpx;
}
.album-meta {
  padding: 12rpx 8rpx 16rpx;
}
.album-title {
  font-size: v-bind("tokens.semantic.fontSizeBody");
  color: v-bind("tokens.semantic.colorTextStrong");
}
.like-row {
  margin-top: 8rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.like-icon {
  width: 36rpx;
  height: 36rpx;
}
.like-count {
  font-size: v-bind("tokens.semantic.fontSizeCaption");
  color: v-bind("tokens.semantic.colorTextSecondary");
}
.list-foot {
  padding: 24rpx 0;
  text-align: center;
  font-size: v-bind("tokens.semantic.fontSizeCaption");
  color: v-bind("tokens.semantic.colorTextMuted");
}
.list-error,
.list-empty {
  margin: 40rpx 16rpx;
  text-align: center;
  font-size: v-bind("tokens.semantic.fontSizeBody");
  color: v-bind("tokens.semantic.colorTextSecondary");
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}
</style>
