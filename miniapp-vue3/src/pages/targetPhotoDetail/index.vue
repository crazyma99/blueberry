<script setup lang="ts">
// T6 客片详情页（P2-11 最后一页）：详情图渐进加载（首图原图、其余 750 WebP 缩略，旧端 :68-72）
// ＋价格/套餐（:46-53）＋点赞（getLikeStatus 单 id 合并 :246-250 ＋ use-like 乐观更新）。
// 加载态＝骨架屏 1:1 镜像真实布局（旧端 :13-35），且详情+点赞就绪后预加载前 3 张详情图再收起（旧端 :232-237）。
// 非 shareToken 作品页（P2-11 边界）；BottomActionBar（AI 试衣按钮＋内置版权 footer）已随 2026-09-19 主人反馈补齐
// ——AI 按钮仅微信渲染（AI 页不进抖音 Profile），版权栏全平台。
import { computed, ref } from "vue";
import { onLoad, onShareAppMessage } from "@dcloudio/uni-app";
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
import { createAlbumRepository, type AlbumDetail } from "../../infrastructure/repositories/albums";
import { createLikeRepository } from "../../infrastructure/repositories/likes";
import { createLikeToggler, type LikeableItem } from "../../composables/use-like";
import { parseDetailParams } from "../../application/route-params";
import { progressivePhotoSrc } from "../../application/image";
import { preloadImages } from "../../platform/uni/image-preload";
import { formatCount } from "../../application/format";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
// 2026-09-21 主人：本页也要下拉刷新 ⇒ 指示器＋刷新内核走共享实现（5 页同源）
import PullRefreshIndicator from "../../components/PullRefreshIndicator/PullRefreshIndicator.vue";
import { createPullRefresh } from "../../composables/use-pull-refresh";
import SkeletonBlock from "../../components/SkeletonBlock/SkeletonBlock.vue";
import BaseFeedback from "../../ui/BaseFeedback.vue";
import BottomActionBar from "../../components/BottomActionBar/BottomActionBar.vue";
import { createPageConfigRepository } from "../../infrastructure/repositories/page-config";
import { createBrandRepository } from "../../infrastructure/repositories/brands";
import { createShareCardResolver, DEFAULT_SHARE_CARDS, type ShareCard } from "../../application/share-card";
import { createPageConfigContent, type FooterContent } from "../../application/page-config-content";
import { hapticTap } from "../../application/haptics";
import { navigateTo } from "../../platform/uni/feedback";

// —— 装配（同 index/demoDetail）——
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
const likeRepo = createLikeRepository({ client });
const ctxFactory = createContextFactory({
  platform,
  environment: env,
  profileKey: PROFILE.profileKey,
  appCode: PROFILE.appCode,
  getBrandId: () => versioned.loadBrandId(),
});
const liker = createLikeToggler({ likes: likeRepo });
// 2026-09-21：`/api/page-config` 单一仓储实例（页脚内容 + 分享卡片共用，同 index 口径）
const pageConfigRepo = createPageConfigRepository({ client });
// 页脚用例（口径同 demoDetail/favorites：BottomActionBar 内置 AppFooter 为纯 props 组件，两行文案须由页面用例注入）
const pageContent = createPageConfigContent({
  pageConfig: pageConfigRepo,
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

// 分享卡片（2026-09-21 主人：客片详情分享卡片迁移遗漏 ⇒ 补迁；旧端 targetPhotoDetail.uvue:164-170/:206）
const shareCards = createShareCardResolver({
  pageConfig: pageConfigRepo,
  brands: createBrandRepository({ client }),
  getBrandId: () => versioned.loadBrandId() ?? "",
});
const shareCard = ref<ShareCard>({ ...DEFAULT_SHARE_CARDS.targetPhotoDetail });
async function loadShareCard(): Promise<void> {
  shareCard.value = await shareCards.resolve("targetPhotoDetail", ctxFactory.next());
}

// —— 页面状态 ——
interface DetailImage {
  imageUrl?: string;
}
const ready = ref(false);
const detail = ref<AlbumDetail | null>(null);
const error = ref<string | null>(null);
const albumId = ref("");
const shopId = ref("");
// AI 试衣跳转参数（旧端 onLoad 暂存 category/subCategory/style，goToAiTryOn :426-433 透传）
const category = ref("");
const subCategory = ref("");
const styleText = ref("");
const likeState = ref<LikeableItem | null>(null);
const feedbackRef = ref<InstanceType<typeof BaseFeedback> | null>(null);

const images = computed<DetailImage[]>(() => {
  const list = detail.value != null ? (detail.value.images as DetailImage[] | undefined) : undefined;
  return Array.isArray(list) ? list : [];
});

// 渐进加载规则已提取至 application/image.ts 的 progressivePhotoSrc（P2-13 可测化）
const photoSrc = progressivePhotoSrc;

async function init(id: string, type: string): Promise<void> {
  albumId.value = id;
  shopId.value = type;
  error.value = null;
  const rd = await albumRepo.getAlbumDetail(ctxFactory.next(), { params: { albumId: id, type } });
  if (!rd.ok) {
    error.value = "加载失败";
    ready.value = true;
    return;
  }
  detail.value = rd.value;
  // liked 批量接口按单 id 查询合并（旧端 :246-250）
  const rl = await likeRepo.getLikeStatus(ctxFactory.next(), id);
  if (rl.ok && rl.value.length > 0) {
    const s = rl.value[0];
    likeState.value = { id: s.albumId, liked: s.liked, likeCount: s.likeCount };
  } else {
    likeState.value = { id: Number(id), liked: false, likeCount: rd.value.likeCount ?? 0 };
  }
  // 预加载前几张详情图（最多前3张，与渲染口径一致：首图原图、其余 750 缩略），就绪后再收起骨架屏（旧端 :232-237）
  const urls = images.value
    .slice(0, 3)
    .map((img, idx) => photoSrc(img.imageUrl, idx))
    .filter((u) => u !== "");
  await preloadImages(urls, 2500);
  void loadShareCard(); // 旧端 targetPhotoDetail:206（详情就绪后解析分享卡片）
  ready.value = true;
}

// —— 下拉刷新（2026-09-21 主人：客片详情页要下拉刷新）——
// 重载「详情 + 点赞态 + 前 3 张预加载（同 init）+ 页脚文案」（独立 CR 🟡10：页脚口径与首页/价目表/AI记录页对齐）。
// ⚠️ init 内的 `preloadImages(urls, 2500)` 是 `Promise.race` 超时上限 ⇒ 弱网首次可能多停至 2.5s（如实登记，不假装无等待）。
const { refreshing, indicatorTop } = createPullRefresh({
  label: "targetPhotoDetail",
  refresh: () => Promise.all([init(albumId.value, shopId.value), loadFooter()]), // init 内已含 loadShareCard
  hasCustomNav: true,
});

async function onToggleLike(): Promise<void> {
  if (likeState.value == null) return;
  const outcome = await liker.toggle(ctxFactory.next(), likeState.value);
  if (outcome === "rolled-back") {
    feedbackRef.value?.show("操作失败，请重试");
  }
}

function onRetry(): void {
  if (albumId.value !== "") void init(albumId.value, shopId.value);
}

// 旧端 goToAiTryOn :426-433：hapticTap＋五参数跳转（albumId/shopId/category/subCategory/style，style 重新编码）；
// AI 六页仅微信注册（2026-09-17 主人拍板）⇒ 按钮模板侧平台门控，此处不再做平台守卫（按钮不渲染即不可达）
function goToAiTryOn(): void {
  hapticTap();
  navigateTo(
    `/pages/aiTryOn/index?albumId=${albumId.value}&shopId=${shopId.value}&category=${category.value}&subCategory=${subCategory.value}&style=${encodeURIComponent(styleText.value)}`,
  );
}

// 右上角胶囊菜单「转发」（旧端 targetPhotoDetail.uvue:164-170 逐字：`?idx=<albumId>&type=<shopId>`）
onShareAppMessage(() => ({
  title: shareCard.value.title,
  path: `/pages/targetPhotoDetail/index?idx=${albumId.value}&type=${shopId.value}`,
  imageUrl: shareCard.value.imageUrl,
}));

onLoad((options) => {
  const p = parseDetailParams((options ?? {}) as Record<string, unknown>);
  if (p == null) return; // 缺 idx 安全失败：停留加载态
  category.value = p.category;
  subCategory.value = p.subCategory;
  styleText.value = p.style;
  void init(p.albumId, p.shopId);
  void loadFooter();
});
</script>

<template>
  <view class="container">
    <!-- 下拉刷新指示器：共享组件（`hasCustomNav: true` ⇒ 落在自绘导航栏下沿之下、让开原生三点指示带） -->
    <PullRefreshIndicator :show="refreshing" :top="indicatorTop" />
    <!-- 顶栏：CustomNavBar slot 放标题组（旧端 :4-11 nav-center 还原） -->
    <CustomNavBar title="">
      <view class="nav-center">
        <view class="title-group">
          <view class="cn font-noto-serif">客片欣赏</view>
          <view class="en">DETAILS</view>
        </view>
        <image src="/static/category-title-line.png" class="line" mode="aspectFill" />
      </view>
    </CustomNavBar>

    <!-- 骨架屏：与真实页面 1:1 镜像（旧端 :13-35 还原）——容器复用本页真实类 .meta/.title-first/.info-row/.info-left/.photo-wrap，
         骨架块几何按旧端逐值（标题 52%×46rpx／云朵位 122×40rpx／价格 58%×32／套餐 76%×32／收藏圆 56rpx／图 500rpx×2 间距 8rpx） -->
    <view v-if="!ready" class="sk-container" style="padding: 0;">
      <view class="meta">
        <view class="title-first">
          <SkeletonBlock width="52%" height="46rpx" radius="8rpx" />
          <SkeletonBlock width="122rpx" height="40rpx" radius="6rpx" />
        </view>
        <view style="height: 16rpx;"></view>
        <view class="info-row">
          <view class="info-left">
            <SkeletonBlock width="58%" height="32rpx" radius="6rpx" />
            <view style="height: 12rpx;"></view>
            <SkeletonBlock width="76%" height="32rpx" radius="6rpx" />
          </view>
          <SkeletonBlock width="56rpx" height="56rpx" radius="50%" />
        </view>
      </view>
      <view class="photo-wrap">
        <SkeletonBlock height="500rpx" radius="0" />
        <view style="height: 8rpx;"></view>
        <SkeletonBlock height="500rpx" radius="0" />
      </view>
    </view>

    <template v-else-if="detail !== null">
      <!-- 头部描述块在图片区之上（旧端 :38-66；初版误置图后，2026-09-19 还原） -->
      <view class="meta">
        <view class="title-first">
          <view class="title font-noto-serif">{{ detail.title }}</view>
          <image src="/static/cloud.png" class="cloud" mode="aspectFill" />
        </view>
        <view class="info-row">
          <view class="info-left">
            <!-- 旧端 :46-54 两行均无条件渲染（空值显示为「服务价格：」「套餐内容：」标签行）；
                 初版加的 v-if 空值守卫系迁移期自主偏差（未登记），2026-09-19 主人实测「抖音没展示套餐内容」后还原——
                 实测接口对空套餐返回 packageDesc:""（如 trial 相册 463），旧端该行仍展示标签 -->
            <view class="price">
              <image src="/static/prize-icon.png" class="icon" mode="aspectFill" />
              <view>服务价格：</view>
              <view class="count txt">{{ detail.price }}</view>
            </view>
            <view class="package">
              <image src="/static/desc-icon.png" class="icon" mode="aspectFill" />
              <view class="txt">套餐内容：{{ detail.packageDesc }}</view>
            </view>
          </view>
          <view class="collect" hover-class="press-dim" @click="onToggleLike">
            <image
              class="heart"
              :src="likeState != null && likeState.liked ? '/static/iconpark/like-filled.svg' : '/static/iconpark/like.svg'"
              mode="aspectFit"
            />
            <text class="like-num">{{ formatCount(likeState != null ? likeState.likeCount || 0 : 0) }}</text>
          </view>
        </view>
      </view>
      <view class="photo-wrap">
        <image
          v-for="(item, index) in images"
          :key="index"
          class="photo"
          :src="photoSrc(item.imageUrl, index)"
          lazy-load
          mode="widthFix"
        />
      </view>
      <!-- 底部固定栏（旧端 :77-90 还原）：版权 footer 组件内置全平台渲染（本次主人反馈「底部没有描述文案」即此）；
           AI 试衣按钮组走 slot——AI 六页仅微信注册（2026-09-17 主人拍板）⇒ 按钮微信端门控渲染，抖音仅留版权栏 -->
      <BottomActionBar :footer-main-line="footer.mainLine" :footer-support-line="footer.supportLine">
        <view v-if="platform === 'mp-weixin' && detail.tryonDisabled !== true" class="ai-tryon-btn">
          <image src="/static/btn-left-icon.png" class="btn-icon" mode="aspectFill" />
          <view class="btn-primary" hover-class="press-dim" @click="goToAiTryOn">
            <view>生成</view>
            <image src="/static/aitry-text.png" class="text" mode="aspectFill" />
            <view>效果</view>
          </view>
          <image src="/static/btn-right-icon.png" class="btn-icon" mode="aspectFill" />
        </view>
      </BottomActionBar>
      <!-- 底部占位：覆盖固定栏高度（按钮组+版权footer，旧端 :605-608 爸爸确认 200rpx） -->
      <view class="ai-tryon-spacer"></view>
    </template>

    <view v-else class="detail-error">
      <text>{{ error != null ? error : "加载失败" }}</text>
      <view class="retry-btn" @click="onRetry">重试</view>
    </view>

    <BaseFeedback ref="feedbackRef" />
  </view>
</template>

<style lang="scss" scoped>
.container {
  min-height: 100vh;
  background: $color-page;
}
/* 自定义导航栏标题组（旧端 :453-480） */
.nav-center {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 28rpx; /* 旧 var(--spacing-md) */
}
.title-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 标题组不压缩：右侧线条图让位，文字永不折行 */
  flex-shrink: 0;
}
.cn {
  font-size: 34rpx; /* 旧 var(--font-size-slogan) */
  font-weight: 400;
  color: #F1CD91; /* 旧 var(--color-primary) */
  white-space: nowrap;
}
.en {
  font-size: 20rpx; /* 旧 var(--font-size-body-xs) */
  font-weight: 400;
  color: rgba(241, 205, 145, 0.7); /* 旧 var(--color-primary-70) */
  letter-spacing: 2rpx;
  white-space: nowrap;
}
.line {
  /* 自适应占满剩余区域（胶囊避让后 slot 收窄时先缩它，不挤标题）；不超出旧端定稿 300rpx */
  flex: 1;
  min-width: 0;
  max-width: 300rpx;
  height: 18rpx;
}
/* 头部描述块（旧端 :481-580 逐值还原） */
.meta {
  margin: 24rpx 18rpx 24rpx; /* 旧 .title */
}
.title-first {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}
.title {
  font-size: 46rpx; /* 旧 var(--font-size-display-xl) */
  font-weight: 400;
  background: linear-gradient(180deg, #F1CD91 20%, #B28A56 79.81%); /* 旧 var(--color-primary)→var(--color-primary-deep) */
  /* 文字渐变：背景裁剪到文字区域 + 文字透明，露出渐变 */
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.cloud {
  width: 122rpx;
  height: 40rpx;
}
.info-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 10rpx; /* 旧 var(--spacing-xs) */
}
.info-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.txt {
  flex: 1;
  min-width: 0;
}
.price {
  margin-top: 12rpx;
  font-size: 26rpx; /* 旧 var(--font-size-body-lg) */
  color: rgba(241, 205, 145, 0.7); /* 旧 var(--color-primary-70) */
  display: flex;
  flex-direction: row;
  line-height: 38rpx;
}
.icon {
  width: 38rpx;
  height: 38rpx;
  margin-right: 12rpx;
}
.package {
  margin-top: 12rpx;
  font-size: 26rpx; /* 旧 var(--font-size-body-lg) */
  color: rgba(241, 205, 145, 0.7);
  display: flex;
  flex-direction: row;
  line-height: 38rpx;
}
.collect {
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 旧 .collect：图标缩小后热区补回（左右 6rpx、上下 5rpx） */
  padding: 5rpx 6rpx;
}
.heart {
  width: 36rpx;
  height: 30rpx;
}
.like-num {
  font-size: 20rpx; /* 旧 var(--font-size-body-xs) */
  color: rgba(241, 205, 145, 0.7);
  margin-top: 4rpx;
}
.photo-wrap {
  width: 100%;
  padding: 0 8rpx;
  box-sizing: border-box;
}
.photo {
  width: 100%;
  margin-bottom: 8rpx; /* 旧端 :586 图间距，迁移时遗漏（2026-09-19 补） */
  display: block;
}
/* 按钮组行（旧端 :589-603）：items-end 底部对齐、水平居中；btn-primary 金色药丸为 App.vue 全局类 */
.ai-tryon-btn {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  justify-content: center;
}
.ai-tryon-btn .btn-icon {
  width: 104rpx;
  height: 86rpx;
}
.ai-tryon-btn .text {
  width: 118rpx;
  height: 34rpx;
}
/* 底部占位：固定栏高度（按钮组+版权footer，旧端 :605-608 爸爸确认 200rpx） */
.ai-tryon-spacer {
  height: 200rpx;
}
.detail-error {
  margin: 80rpx 16rpx;
  text-align: center;
  font-size: $font-size-body;
  color: $color-text-secondary;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}
.retry-btn {
  padding: 12rpx 40rpx;
  border-radius: 999rpx;
  background: $color-action;
  color: $color-action-text;
  font-size: $font-size-caption;
}
</style>
