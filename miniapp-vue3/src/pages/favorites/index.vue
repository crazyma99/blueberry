<script setup lang="ts">
// T7 P2-19：我的收藏页——收藏列表＋搜索（旧端 favorites/index.uvue 425 行忠实移植）。
// ⭐ 红线（phases P2-19）：收藏列表默认一次性获取全部（loadData 进入即 noMore=true，旧 :141-142 注释明言
// 「收藏列表接口一次性返回全部数据，不分页」）；分页仅存在于搜索模式（handleSearch/loadMore，旧 :161-223）。
// 别在迁移里偷偷引入默认分页。
// 旧端事实：CustomNavBar manual-back+slot 搜索框（:4-19，goBack 搜索有值先清空再返回，:126-134）；
// 骨架 4 卡（:22-26）；空态双文案（搜索/无收藏，:31-34）；列表卡 coverThumb 600＋formatAlbumTitle＋
// formatCount＋like 图标（:45-58）；点击 → targetPhotoDetail 携 idx/liked/type(shopId)（:240-247，
// 缺 type 或 liked 详情接口会 400）；onShow firstShow 跳过一次后刷新（搜索态重搜/否则重拉，:108-120）；
// 搜索双形态响应收窄 getSearchItems/getSearchTotal（数组或 {list,total}，:225-234）。
// 有意偏差（已声明）：①AppFooter 已由 P2-21 接入（旧 :75；内容经 page-config 用例注入）；
// ②主题：2026-09-19 撤回迁移期亮色、恢复旧端深色（colorPage=#160F04 墨黑＋金文 #F1CD91），
// 空态/骨架等亮色残留值已按旧端还原（白 50%/30%、骨架白 8%）；
// ③sk-animate 闪烁动画未带（共享 SkeletonBlock 口径）；④卡片 fade-in 入场动画未带（旧 :46，属全局样式批次，
// preflight:485 已登记 T6 同族缺口）；⑤搜索框 placeholder-style 已按旧 :12 还原（金色 70% 字面量，
// 抖音 TTSS 不支持 CSS 变量故不写 var()）；
// ⑥抖音端导航已对齐微信（2026-09-19 主人拍板）：pages.json 各页 navigationStyle custom 全平台生效，
// CustomNavBar 抖音不再渲染空，slot 搜索框随之恢复。
import { ref } from "vue";
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
import {
  createFavoriteRepository,
  type FavoriteAlbum,
  type SearchPageResult,
} from "../../infrastructure/repositories/favorites";
import { cosThumb } from "../../application/image";
import { formatAlbumTitle } from "../../domain/album-title";
import { formatCount } from "../../application/format";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import PageFooter from "../../components/PageFooter/PageFooter.vue";
import { createPageConfigRepository } from "../../infrastructure/repositories/page-config";
import { createPageConfigContent, type FooterContent } from "../../application/page-config-content";

// —— 装配（同 index/demoDetail/priceList/mine）——
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
const favRepo = createFavoriteRepository({ client });
// P2-21：页脚内容经用例取数（AppFooter 纯 props）
const pageContent = createPageConfigContent({
  pageConfig: createPageConfigRepository({ client }),
  profile: {
    copyrightText: PROFILE.copyrightText,
    contactQrSrc: PROFILE.contactQrSrc,
    contactPhoneText: PROFILE.contactPhoneText,
  },
});
const ctxFactory = createContextFactory({
  platform,
  environment: env,
  profileKey: PROFILE.profileKey,
  appCode: PROFILE.appCode,
  getBrandId: () => versioned.loadBrandId(),
});

// —— 页面状态（旧端 :87-101）——
const loading = ref(true);
const loadingMore = ref(false);
const searchKeyword = ref("");
const favoriteList = ref<FavoriteAlbum[]>([]);
const isEmpty = ref(false);
const page = ref(1);
const pageSize = 10;
const noMore = ref(false);
const isSearching = ref(false);
// P2-21 页脚（用例内已合并 OPS→Profile→本地兜底）
const footer = ref<FooterContent>({ mainLine: "", supportLine: "" });

async function loadFooter(): Promise<void> {
  footer.value = await pageContent.loadFooter(ctxFactory.next());
}
// 首次显示由 onLoad 触发 loadData，onShow 跳过一次（旧端 :98-100/:108-113）
const firstShow = ref(true);

onLoad(() => {
  void loadData();
  void loadFooter();
});

onShow(() => {
  if (firstShow.value) {
    firstShow.value = false;
    return;
  }
  // 从客片详情页返回：搜索态重搜，非搜索态重拉收藏列表（旧端 :114-119）
  if (isSearching.value && searchKeyword.value.trim() !== "") {
    void handleSearch();
  } else {
    void loadData();
  }
});

// 旧端 :126-134：搜索框有值先清空搜索并重载列表，否则 navigateBack
function goBack(): void {
  if (searchKeyword.value.trim()) {
    searchKeyword.value = "";
    void loadData();
    return;
  }
  if (typeof uni !== "undefined" && typeof uni.navigateBack === "function") {
    uni.navigateBack();
  }
}

// 收藏列表：一次性全部（红线：进入即视为已到底，旧端 :136-159）
async function loadData(): Promise<void> {
  try {
    loading.value = true;
    page.value = 1;
    isSearching.value = false;
    noMore.value = true; // 旧端 :141-142：接口一次性返回全部，无需分页 UI

    const res = await favRepo.getFavoriteList(ctxFactory.next());
    if (res.ok && res.value != null) {
      favoriteList.value = res.value;
      isEmpty.value = favoriteList.value.length === 0;
    } else {
      favoriteList.value = [];
      isEmpty.value = true;
    }
  } catch (err) {
    console.error("[favorites] 加载收藏列表失败:", err);
    toast("内容加载失败，请下拉重试");
    isEmpty.value = true;
  } finally {
    loading.value = false;
  }
}

// 搜索：唯一启用分页的路径（旧端 :161-195）
async function handleSearch(): Promise<void> {
  const keyword = searchKeyword.value.trim();
  if (!keyword) {
    await loadData();
    return;
  }
  try {
    loading.value = true;
    page.value = 1;
    noMore.value = false;
    isSearching.value = true;

    const res = await favRepo.searchAlbums(ctxFactory.next(), { keyword, page: 1, size: pageSize });
    if (res.ok && res.value != null) {
      const dataList = getSearchItems(res.value);
      const total = getSearchTotal(res.value, dataList.length);
      const totalPages = Math.ceil(total / pageSize);
      favoriteList.value = dataList;
      isEmpty.value = favoriteList.value.length === 0;
      if (1 >= totalPages || dataList.length < pageSize) {
        noMore.value = true;
      }
    } else {
      favoriteList.value = [];
      isEmpty.value = true;
    }
  } catch (err) {
    console.error("[favorites] 搜索失败:", err);
    toast("搜索出错了，请稍后再试");
    isEmpty.value = true;
  } finally {
    loading.value = false;
  }
}

// 加载更多（仅搜索模式，旧端 :197-223）
async function loadMore(): Promise<void> {
  if (noMore.value || loadingMore.value) return;
  if (!isSearching.value) return;
  try {
    loadingMore.value = true;
    const nextPage = page.value + 1;
    const res = await favRepo.searchAlbums(ctxFactory.next(), {
      keyword: searchKeyword.value.trim(),
      page: nextPage,
      size: pageSize,
    });
    if (res.ok && res.value != null) {
      const dataList = getSearchItems(res.value);
      const total = getSearchTotal(res.value, favoriteList.value.length + dataList.length);
      const totalPages = Math.ceil(total / pageSize);
      favoriteList.value = favoriteList.value.concat(dataList);
      page.value = nextPage;
      if (nextPage >= totalPages || dataList.length < pageSize) {
        noMore.value = true;
      }
    } else {
      noMore.value = true;
    }
  } catch (err) {
    console.error("[favorites] 加载更多失败:", err);
    toast("加载更多失败，请重试");
  } finally {
    loadingMore.value = false;
  }
}

// 搜索响应双形态收窄（旧端 :225-234）
function getSearchItems(data: SearchPageResult | FavoriteAlbum[]): FavoriteAlbum[] {
  if (Array.isArray(data)) return data;
  if (data != null && Array.isArray(data.list)) return data.list;
  return [];
}
function getSearchTotal(data: SearchPageResult | FavoriteAlbum[], fallback: number): number {
  if (!Array.isArray(data) && data != null && data.total != null) return Number(data.total);
  return fallback;
}

// 旧端 :240-247：必须携带 type(shopId) 与 liked，否则详情接口 400
function handleItemClick(item: FavoriteAlbum): void {
  if (typeof uni === "undefined" || typeof uni.navigateTo !== "function") return;
  const raw = item as unknown as Record<string, unknown>;
  const shopId = raw.shopId != null ? raw.shopId : "";
  const liked = raw.liked != null ? raw.liked : true;
  uni.navigateTo({
    url: `/pages/targetPhotoDetail/index?idx=${item.id}&liked=${liked}&type=${shopId}`,
  });
}

function coverThumb(url: string): string {
  return cosThumb(url, 600);
}
</script>

<template>
  <view class="container">
    <CustomNavBar :manual-back="true" @back="goBack">
      <view :class="platform === 'mp-toutiao' ? 'search-bar-wrap search-bar-wrap-tt' : 'search-bar-wrap'">
        <view class="search-bar-nav">
          <image class="search-icon-small" src="/static/iconpark/search.svg" mode="aspectFit"></image>
          <input
            class="search-input-nav"
            type="text"
            placeholder="搜索收藏内容"
            placeholder-style="color: rgba(241, 205, 145, 0.7)"
            v-model="searchKeyword"
            confirm-type="search"
            @confirm="handleSearch"
          />
        </view>
      </view>
    </CustomNavBar>

    <view v-if="loading" class="sk-wrap main-content">
      <view class="sk-row">
        <view v-for="i in 4" :key="i" class="sk-photo-item"></view>
      </view>
    </view>

    <view v-else class="content main-content">
      <view v-if="isEmpty" class="empty-state">
        <view class="empty-title">暂无内容</view>
        <view class="empty-desc">{{ searchKeyword ? "换个搜索关键词试试吧" : "还没有收藏任何内容哦" }}</view>
      </view>

      <view v-else class="photolistContainer">
        <view
          v-for="(item, index) in favoriteList"
          :key="index"
          class="photoItem-wrap"
          hover-class="press-dim"
          @click="handleItemClick(item)"
        >
          <view class="photoItem">
            <image :src="coverThumb(item.coverImageUrl)" class="photo" mode="aspectFill" lazy-load />
            <view class="mask">
              <view class="desc">
                <view class="photoName font-noto-serif">{{ formatAlbumTitle(item.title) }}</view>
                <view class="desc-row">
                  <view class="collect">
                    <image class="heart" mode="aspectFit" src="/static/iconpark/like-filled.svg"></image>
                    <text class="stat-count">{{ formatCount(item.likeCount) }}</text>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 加载更多（仅搜索模式启用分页——非搜索模式接口一次性返回全部，旧端 :62-69） -->
      <view v-if="isSearching && !isEmpty && !noMore" class="load-more" hover-class="press-dim" @click="loadMore">
        <text class="load-more-text">{{ loadingMore ? "加载中..." : "加载更多" }}</text>
      </view>
      <view v-if="isSearching && noMore && favoriteList.length > 0" class="load-more">
        <text class="load-more-text">已经到底了</text>
      </view>
    </view>

    <!-- 页脚：PageFooter 共享组件（原 :319-325 page-footer > divide + copyright 块收敛；样式随之入组件） -->
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
/* 自定义导航栏内搜索框（旧端 :277-305） */
.search-bar-wrap {
  /* 2026-09-19 主人指示：盛满导航栏剩余区域——slot 已做胶囊/返回避让，wrap 填满即不撞胶囊；
     旧端「width:65%」建立在旧 slot 无避让的满宽上，照抄会在新 slot 里再缩一圈（与 demoDetail 同步改） */
  flex: 1;
  min-width: 0;
  margin: 0 20rpx;
  box-sizing: border-box;
  border: 1rpx solid rgba(241, 205, 145, 0.3);
  border-radius: 32rpx;
}
/* 抖音端顶距（2026-09-19 主人指示：距系统导航栏 10px=20rpx）——抖音 slot 内联在系统栏下方（#17 口径）贴顶；
   微信端同一 wrap 在自绘导航栏 44px 行内垂直居中不需要顶距，故平台修饰类仅抖音挂载（与 demoDetail 同款） */
.search-bar-wrap-tt {
  margin-top: 20rpx;
}
.search-bar-nav {
  display: flex;
  flex-direction: row;
  align-items: center;
  background: linear-gradient(99.85deg, rgba(241, 205, 145, 0.12) 0%, rgba(241, 205, 145, 0) 100%);
  border-radius: 31rpx;
  padding: 0 20rpx; /* 旧端 --spacing-sm=20rpx（CR 🟡1 还原） */
  height: 64rpx;
}
.search-icon-small {
  width: 38rpx;
  height: 38rpx;
}
.search-input-nav {
  /* 2026-09-20：小程序 <input> 不继承 page 字体（同 demoDetail 修复） */
  font-family: 'HarmonyOS-Sans-SC';
  flex: 1;
  font-size: 26rpx; /* 旧端 --font-size-body-lg=26rpx（CR 🟡1 还原；28rpx 实为 body-plus） */
  color: $color-text-primary; /* 旧端金色（旧 :303 var(--color-primary)）；深色恢复后 $color-text-primary=#F1CD91 与旧值一致（2026-09-19） */
  margin-left: 12rpx;
}
.content {
  padding: 0 0 32rpx;
}
/* 骨架（旧端 sk-photo-item 2 列 4 卡；几何按旧端还原：sk-container padding=--spacing-lg 32rpx、
   卡高 482rpx、圆角 --radius-xs 8rpx、卡间距 margin 8rpx——CR 🟡2） */
.sk-wrap {
  padding: 32rpx;
}
.sk-row {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
}
.sk-photo-item {
  width: calc(50% - 16rpx);
  height: 482rpx;
  margin: 8rpx;
  border-radius: 8rpx;
  background: rgba(255, 255, 255, 0.08); /* 旧端全局 .sk-photo-item（App.uvue:299）；2026-09-19 深色还原（亮色期黑 6% 深底不可见） */
}
/* 空状态（旧端 :312-327） */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 200rpx 32rpx;
}
.empty-title {
  font-size: 32rpx;
  color: rgba(255, 255, 255, 0.5); /* 旧 :321；2026-09-19 深色还原（亮色期黑 50% 深底不可见） */
  margin-bottom: 16rpx;
}
.empty-desc {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.3); /* 旧 :326；2026-09-19 深色还原（亮色期黑 30% 深底不可见） */
}
/* 客片卡片（旧端 :330-405，与相册 list 页一致） */
.photolistContainer {
  padding: 24rpx 24rpx 0;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16rpx;
}
.photoItem-wrap {
  width: calc((100% - 16rpx) / 2);
  box-sizing: border-box;
  border: 1rpx solid rgba(241, 205, 145, 0.3);
  border-radius: 14rpx;
}
.photoItem {
  width: 100%;
  height: 460rpx;
  position: relative;
  border-radius: 13rpx;
  overflow: hidden;
}
.photo {
  width: 100%;
  height: 100%;
}
.mask {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, 0.45) 75%, rgba(0, 0, 0, 0.85) 100%);
}
.desc {
  position: absolute;
  left: 20rpx;
  right: 20rpx;
  bottom: 20rpx;
  display: flex;
  flex-direction: column;
}
.desc-row {
  /* 主人 2026-09-15 指示：标题与点赞模块之间加间距 */
  margin-top: 10rpx;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}
.photoName {
  font-size: 26rpx; /* 旧端 --font-size-body-lg（硬编码还原） */
  font-weight: 400;
  color: $color-action;
}
.collect {
  /* 主人 2026-09-15 指示：点赞图标与数量之间加间距（margin 而非 gap，兼容旧 WebView） */
  margin-left: 10rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  font-size: 24rpx;
  color: $color-action;
}
.heart {
  width: 36rpx;
  height: 30rpx;
  position: relative;
}
.stat-count {
  margin-left: 10rpx;
}
/* 加载更多（旧端 :408-415） */
.load-more {
  padding: 32rpx;
  text-align: center;
}
.load-more-text {
  font-size: 24rpx;
  color: rgba(241, 205, 145, 0.4);
}
</style>
