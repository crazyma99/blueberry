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
    loginCode: createUniLoginCode({ platform }),
    platform,
    profileKey: PROFILE.profileKey,
  }),
  storage: uniStorage,
});
const client = createHttpClient({ transport, authCoordinator });
const wxAuth = createWxAuthRepository({ client, platform });
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
  // 旧端 handleSearch :515-524：空关键词退出搜索模式、恢复分类列表
  searching.value = keyword.value.trim() !== "";
  void reloadList();
}

// 旧端 goBack :389-411：搜索框有值先清空搜索恢复分类模式；否则栈深>1 navigateBack、栈深=1（分享冷启动）reLaunch 首页
function goBack(): void {
  if (keyword.value.trim() !== "") {
    keyword.value = "";
    searching.value = false;
    void reloadList();
    return;
  }
  if (typeof uni === "undefined") return;
  try {
    if (typeof getCurrentPages === "function" && getCurrentPages().length > 1) {
      if (typeof uni.navigateBack === "function") uni.navigateBack();
    } else if (typeof uni.reLaunch === "function") {
      uni.reLaunch({ url: "/pages/index/index" });
    }
  } catch {
    // 容器无页面栈 API 时静默
  }
}

// AI 试衣入口（旧端 goToAiTryOn :738-748 五参数口径：albumId/shopId/category/subCategory/style）；
// AI 六页仅微信注册（2026-09-17 主人拍板）⇒ 按钮模板侧平台门控，此处平台守卫双保险
function goAiTryOn(item: ListAlbum): void {
  if (platform !== "mp-weixin") return;
  if (typeof uni === "undefined" || typeof uni.navigateTo !== "function") return;
  const parent = categories.value[selectedParent.value];
  const child = childTabs.value[selectedChild.value];
  const category = parent?.parentName === "全部" ? "" : String(parent?.id ?? "");
  const subCategory = child?.name === "全部" ? "" : String(child?.query?.childId ?? "");
  const style = encodeURIComponent(item.title || "");
  uni.navigateTo({
    url: `/pages/aiTryOn/index?albumId=${item.id}&shopId=${shopId.value}&category=${category}&subCategory=${subCategory}&style=${style}`,
  });
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

// 客片点击 → 客片详情（旧端 gotoDetail :733-736 六参数口径：idx/liked/type=店铺id/category/subCategory/style）
function goDetail(item: ListAlbum): void {
  if (typeof uni === "undefined" || typeof uni.navigateTo !== "function") return;
  const parent = categories.value[selectedParent.value];
  const child = childTabs.value[selectedChild.value];
  const category = parent?.parentName === "全部" ? "" : String(parent?.id ?? "");
  const subCategory = child?.name === "全部" ? "" : String(child?.query?.childId ?? "");
  const style = encodeURIComponent(item.title || "");
  uni.navigateTo({
    url: `/pages/targetPhotoDetail/index?idx=${item.id}&liked=${item.liked}&type=${shopId.value}&category=${category}&subCategory=${subCategory}&style=${style}`,
  });
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
    <!-- 顶栏：搜索框回到 CustomNavBar slot（2026-09-19 主人指示「搜索框与原版微信一致：在导航栏里、
         无搜索按钮、输入框内置搜索 icon」），结构对齐旧端 :4-19 / 新端 favorites 同款；
         返回由页面处理搜索清空逻辑（manual-back，旧端 :389-411） -->
    <CustomNavBar title="" :manual-back="true" back-fallback-url="/pages/index/index" @back="goBack">
      <view :class="platform === 'mp-toutiao' ? 'search-bar-wrap search-bar-wrap-tt' : 'search-bar-wrap'">
        <view class="search-bar-nav">
          <image class="search-icon-small" src="/static/iconpark/search.svg" mode="aspectFit" />
          <input
            v-model="keyword"
            class="search-input-nav"
            type="text"
            placeholder="搜索客片"
            placeholder-style="color: rgba(241, 205, 145, 0.7)"
            confirm-type="search"
            @confirm="onSearch"
          />
        </view>
      </view>
    </CustomNavBar>

    <view v-if="!ready" class="sk-wrap">
      <LoadingBlock text="加载中…" />
    </view>

    <template v-else>
      <!-- 分类模式：AI 入口＋套系/子系 tabs（旧端 :98-135 结构） -->
      <view v-if="!searching && categories.length > 0">
        <!-- AI 六页仅微信注册（2026-09-17 主人拍板）：抖音端渲染该入口会跳未注册页、点击无反应 ⇒ 平台门控 -->
        <view v-if="platform === 'mp-weixin'" class="ai-recommend-banner" @click="goAiRecommend">
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

      <!-- 相册网格（旧端 photoItem 结构还原：描边外框＋内圈圆角＋渐变蒙层，标题/点赞在蒙层上；
           2026-09-19 修正初版「图下 meta」偏差＋补齐整卡点击跳详情） -->
      <view class="album-grid">
        <view v-for="item in albums" :key="item.id" class="album-card">
          <view class="album-inner">
            <!-- 封面走 COS 600 缩略（旧端 coverThumb=url→cosThumb 600，demoDetail:378-380） -->
            <image class="album-cover" :src="cosThumb(item.coverImageUrl, 600)" mode="aspectFill" lazy-load />
            <view class="album-mask" hover-class="press-dim" @click="goDetail(item)">
              <view class="album-desc">
                <!-- 左列：标题 + 点赞（右侧 AI 试衣按钮为兄弟节点、绝对定位垂直居中——旧端 :1091-1110 口径） -->
                <view class="desc-main">
                  <text class="album-title font-noto-serif">{{ formatAlbumTitle(item.title) }}</text>
                  <view class="like-row" hover-class="press-dim" @click.stop="onToggleLike(item)">
                    <image
                      class="like-icon"
                      :src="item.liked ? '/static/iconpark/like-filled.svg' : '/static/iconpark/like.svg'"
                      mode="aspectFit"
                    />
                    <text class="like-count">{{ formatCount(item.likeCount || 0) }}</text>
                  </view>
                  <!-- AI 试衣标签（旧端 :164-167 还原）：AI 页仅微信注册 ⇒ 平台门控；抖音渲染会跳未注册页 -->
                  <view
                    v-if="platform === 'mp-weixin' && item.tryonDisabled !== true"
                    class="desc-tryon"
                    hover-class="press-dim"
                    @click.stop="goAiTryOn(item)"
                  >
                    <image mode="aspectFit" class="ai-tryon-tag" src="/static/aitry-btn.png" />
                  </view>
                </view>
              </view>
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

<style lang="scss" scoped>
.container {
  min-height: 100vh;
  background: $color-page;
}
/* ===== 导航栏 slot 搜索框（旧端 :929-958 逐值还原，与 favorites :335-360 同款） =====
   纯色描边搜索框：外层 1rpx 描边圆环 + 内层渐变填充（渐变叠页面底色，挡住描边透出） */
.search-bar-wrap {
  /* 2026-09-19 主人指示：盛满导航栏剩余区域——CustomNavBar slot 已做胶囊/返回避让（paddingRight≈95px），
     wrap 填满 slot 即天然不撞胶囊；旧端「width:65%」建立在旧 slot 无避让的满宽上，照抄会在新 slot 里再缩一圈 */
  flex: 1;
  min-width: 0;
  margin: 0 20rpx; /* 旧 var(--spacing-sm)；右侧同步留白，抖音内联 slot 场景不贴屏边 */
  box-sizing: border-box;
  border: 1rpx solid rgba(241, 205, 145, 0.3); /* 旧 var(--color-primary-30) */
  border-radius: 32rpx; /* 旧 var(--radius-lg) */
}
/* 抖音端顶距（2026-09-19 主人指示：距系统导航栏 10px=20rpx）——抖音 slot 内联在系统栏下方贴顶；
   微信端同一 wrap 在自绘导航栏 44px 行内垂直居中不需要顶距，故平台修饰类仅抖音挂载（与 favorites 同款） */
.search-bar-wrap-tt {
  margin-top: 20rpx;
}
.search-bar-nav {
  display: flex;
  flex-direction: row;
  align-items: center;
  /* 内圈圆角 = 外圈 32rpx − 1rpx 描边，圆角处贴合 */
  border-radius: 31rpx;
  background: linear-gradient(99.85deg, rgba(241, 205, 145, 0.12) 0%, rgba(241, 205, 145, 0) 100%), $color-page;
  padding: 0 20rpx; /* 旧 var(--spacing-sm) */
  height: 64rpx;
}
.search-icon-small {
  width: 38rpx;
  height: 38rpx;
  flex-shrink: 0;
}
.search-input-nav {
  flex: 1;
  font-size: 26rpx; /* 旧 var(--font-size-body-lg) */
  color: $color-text-primary; /* 深色主题 = #F1CD91（旧 var(--color-primary)） */
  margin-left: 12rpx;
}
/* 列表加载失败的重试钮（旧端无同名件，新端错误态自用） */
.search-btn {
  padding: 0 24rpx;
  height: 64rpx;
  line-height: 64rpx;
  border-radius: 999rpx;
  background: $color-action;
  color: $color-action-text;
  font-size: $font-size-caption;
}
.sk-wrap {
  padding: 120rpx 0;
}
.ai-recommend-banner {
  position: relative;
  margin: 24rpx 20rpx; /* 旧 :1194 = 24rpx var(--spacing-sm) 24rpx（初版 16rpx 侧距/无下 margin 系偏差） */
  height: 178rpx; /* 旧 :1195 定高（初版背景图在流撑 160rpx＋内容 absolute 超高 ⇒ 底部被 overflow 裁断，主人实测） */
  border-radius: 24rpx; /* 旧 var(--radius-container)（App.uvue:100） */
  overflow: hidden;
}
.ai-recommend-bg {
  /* 旧 :1199-1205 绝对定位铺满容器 */
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
.ai-recommend-content {
  /* 旧 :1206-1213：相对定位高度 100%，纵横双向居中（初版 absolute inset:0＋左对齐 padding 系偏差） */
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.ai-recommend-title {
  font-size: 38rpx; /* 旧 var(--font-size-display)=38rpx（App.uvue:124；初版误取 sub-title 档） */
  font-weight: 400;
  color: $color-action-soft; /* 旧 :1217 实测 #FFF3C6 */
  letter-spacing: 4rpx; /* 旧 :1218 */
}
.ai-recommend-subtitle {
  margin-top: 16rpx; /* 旧 :1221（初版 8rpx） */
  font-size: 22rpx; /* 旧 var(--font-size-body-sm)=22rpx（App.uvue:129） */
  font-weight: 400;
  color: $color-action-soft; /* 旧 :1224 实测 #FFF3C6 */
  letter-spacing: 1rpx; /* 旧 :1225 */
}
.cat-title-row {
  margin: 32rpx 16rpx 0;
}
.cat-title {
  font-size: $font-size-sub-title;
  color: $color-text-strong;
}
.tabcontainer {
  /* 旧 :1011-1018：父/子 tab 各成一行、横向可滑（旧 overflow-x: scroll），不得换行折叠 */
  width: 100%;
  overflow-x: scroll;
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  padding: 0 24rpx;
  margin: 16rpx 0 0;
  box-sizing: border-box;
}
.tab-wrap {
  flex-shrink: 0;
  margin-right: 16rpx;
  border-radius: 64rpx; /* 旧 var(--radius-avatar) */
  padding: 2rpx;
  border: 1rpx solid $color-border; /* 旧 :1025 金 30% 描边（--color-primary-30），2026-09-19 还原 */
  box-sizing: border-box;
}
.choosed-wrap {
  background: $color-action;
}
.tab {
  display: flex;
  align-items: center;
  justify-content: center;
  /* 旧 :1033-1036：最小宽度 140rpx，左右 padding 24rpx，宽度由内容撑开 */
  min-width: 140rpx;
  padding: 0 24rpx;
  height: 54rpx;
  font-size: 24rpx; /* 旧 var(--font-size-body) */
  color: $color-text-primary;
  border-radius: 63rpx; /* 旧 :1041 内圈圆角 = 外圈 64rpx − 1rpx 描边 */
  box-sizing: border-box;
  /* 旧 :1042 内层填充 = 半透明金渐变 + 页面底色合成（抖音 TTSS 不支持 CSS 变量，底色用 $color-page） */
  background: linear-gradient(99.85deg, rgba(241, 205, 145, 0.12) 0%, rgba(241, 205, 145, 0) 100%), $color-page;
}
.choosed {
  color: $color-action-text;
  background: $color-action; /* 旧 :1049 选中态内层实金覆盖渐变 */
}
.album-grid {
  /* 旧 .photolistContainer :1051-1057 */
  padding: 24rpx 24rpx 0;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16rpx;
}
.album-card {
  /* 旧 .photoItem-wrap :1059-1065：纯色描边外框；border-box 防 1rpx 描边使每行溢出换行（抖音实测） */
  width: calc((100% - 16rpx) / 2);
  box-sizing: border-box;
  border: 1rpx solid rgba(241, 205, 145, 0.3); /* 旧 var(--color-primary-30) */
  border-radius: 14rpx; /* 旧 var(--radius-card) */
}
.album-inner {
  /* 旧 .photoItem :1066-1073：内圈圆角 = 外圈 14rpx − 1rpx 描边，两段圆弧同心 */
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
  /* 旧 .mask :1074-1080：底部渐变蒙层，标题/点赞都在蒙层上 */
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, 0.45) 75%, rgba(0, 0, 0, 0.85) 100%);
}
.album-desc {
  /* 旧 .desc :1081-1089 */
  position: absolute;
  left: 20rpx;
  right: 20rpx;
  bottom: 20rpx;
  display: flex;
  flex-direction: column;
}
.desc-main {
  /* 旧 .desc-main :1097-1102：右侧给 AI 按钮留固定占位（124rpx 按钮 + 16rpx 间隙），避免文字压按钮 */
  padding-right: 140rpx;
  box-sizing: border-box;
  min-width: 0;
}
.desc-tryon {
  /* 旧 :1103-1110：绝对定位锚定右侧，top:50% + translateY(-50%) 与左侧整块垂直居中
     （真机 flex 行布局会把 AI 按钮挤换行 ⇒ 几何上不可能换行的定位方案，照旧端） */
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
}
.ai-tryon-tag {
  /* 旧 :1186-1190 AI试衣标签 */
  width: 124rpx;
  height: 48rpx;
}
.album-title {
  /* 旧 .photoName :1129-1133＋单行省略 :1110-1115 */
  font-size: 26rpx; /* 旧 var(--font-size-body-lg) */
  font-weight: 400;
  color: #F1CD91; /* 旧 var(--color-primary) */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.like-row {
  /* 旧 .desc-row :1123-1128 标题与点赞间距 */
  margin-top: 10rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
}
.like-icon {
  width: 36rpx;
  height: 30rpx; /* 旧 .heart :1140-1144 实测 36×30 */
}
.like-count {
  margin-left: 10rpx; /* 旧 .stat-count :1120-1122（margin 而非 gap，兼容旧 WebView） */
  font-size: 24rpx; /* 旧 var(--font-size-body) */
  color: #F1CD91; /* 旧 var(--color-primary) */
}
.list-foot {
  padding: 24rpx 0;
  text-align: center;
  font-size: $font-size-caption;
  color: $color-text-muted;
}
.list-error,
.list-empty {
  margin: 40rpx 16rpx;
  text-align: center;
  font-size: $font-size-body;
  color: $color-text-secondary;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}
</style>
