<script setup lang="ts">
// T6 客片详情页（P2-11 最后一页）：详情图渐进加载（首图原图、其余 750 WebP 缩略，旧端 :68-72）
// ＋价格/套餐（:46-53）＋点赞（getLikeStatus 单 id 合并 :246-250 ＋ use-like 乐观更新）。
// 非 shareToken 作品页（P2-11 边界）；BottomActionBar AI 试衣按钮属 B3（AI 页不进抖音 Profile），随 T8 迁移。
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { PROFILE } from "../../generated/profile.config";
import { detectUiPlatform } from "../../ui/ui-platform";
import { isPlatform } from "../../ports/context";
import type { Platform } from "../../ports/context";
import { systemClock } from "../../ports/clock";
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
import { createAlbumRepository, type AlbumDetail } from "../../infrastructure/repositories/albums";
import { createLikeRepository } from "../../infrastructure/repositories/likes";
import { createLikeToggler, type LikeableItem } from "../../composables/use-like";
import { parseDetailParams } from "../../application/route-params";
import { progressivePhotoSrc } from "../../application/image";
import { formatCount } from "../../application/format";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import LoadingBlock from "../../components/LoadingBlock/LoadingBlock.vue";
import BaseFeedback from "../../ui/BaseFeedback.vue";

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
    loginCode: createUniLoginCode(),
    platform,
    profileKey: PROFILE.profileKey,
  }),
  storage: uniStorage,
  clock: systemClock,
});
const client = createHttpClient({ transport, authCoordinator });
const wxAuth = createWxAuthRepository({ client });
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

// —— 页面状态 ——
interface DetailImage {
  imageUrl?: string;
}
const ready = ref(false);
const detail = ref<AlbumDetail | null>(null);
const error = ref<string | null>(null);
const albumId = ref("");
const shopId = ref("");
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
  ready.value = true;
}

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

onLoad((options) => {
  const p = parseDetailParams((options ?? {}) as Record<string, unknown>);
  if (p == null) return; // 缺 idx 安全失败：停留加载态
  void init(p.albumId, p.shopId);
});
</script>

<template>
  <view class="container">
    <CustomNavBar title="" />

    <view v-if="!ready" class="sk-wrap">
      <LoadingBlock text="加载中…" />
    </view>

    <template v-else-if="detail !== null">
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
      <view class="meta">
        <view class="title-row">
          <text class="title">{{ detail.title }}</text>
          <view class="like-row" @click="onToggleLike">
            <image
              class="like-icon"
              :src="likeState != null && likeState.liked ? '/static/iconpark/like-filled.svg' : '/static/iconpark/like.svg'"
              mode="aspectFit"
            />
            <text class="like-count">{{ formatCount(likeState != null ? likeState.likeCount || 0 : 0) }}</text>
          </view>
        </view>
        <view v-if="detail.price != null" class="price">{{ detail.price }}</view>
        <view v-if="detail.packageDesc != null && detail.packageDesc !== ''" class="pkg">套餐内容：{{ detail.packageDesc }}</view>
      </view>
    </template>

    <view v-else class="detail-error">
      <text>{{ error != null ? error : "加载失败" }}</text>
      <view class="retry-btn" @click="onRetry">重试</view>
    </view>

    <BaseFeedback ref="feedbackRef" />
  </view>
</template>

<style scoped>
.container {
  min-height: 100vh;
  background: v-bind("tokens.semantic.colorPage");
}
.sk-wrap {
  padding: 120rpx 0;
}
.photo-wrap {
  width: 100%;
}
.photo {
  width: 100%;
  display: block;
}
.meta {
  margin: 24rpx 16rpx 40rpx;
}
.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.title {
  flex: 1;
  min-width: 0;
  font-size: v-bind("tokens.semantic.fontSizeSubTitle");
  color: v-bind("tokens.semantic.colorTextStrong");
}
.like-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
}
.like-icon {
  width: 40rpx;
  height: 40rpx;
}
.like-count {
  font-size: v-bind("tokens.semantic.fontSizeCaption");
  color: v-bind("tokens.semantic.colorTextSecondary");
}
.price {
  margin-top: 12rpx;
  font-size: v-bind("tokens.semantic.fontSizeBody");
  color: v-bind("tokens.semantic.colorAction");
}
.pkg {
  margin-top: 8rpx;
  font-size: v-bind("tokens.semantic.fontSizeCaption");
  color: v-bind("tokens.semantic.colorTextSecondary");
}
.detail-error {
  margin: 80rpx 16rpx;
  text-align: center;
  font-size: v-bind("tokens.semantic.fontSizeBody");
  color: v-bind("tokens.semantic.colorTextSecondary");
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}
.retry-btn {
  padding: 12rpx 40rpx;
  border-radius: 999rpx;
  background: v-bind("tokens.semantic.colorAction");
  color: v-bind("tokens.semantic.colorActionText");
  font-size: v-bind("tokens.semantic.fontSizeCaption");
}
</style>
