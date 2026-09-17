<script setup lang="ts">
// T7 后半（P2-17）：价目表二级页——店铺价目大图＋套餐条目（仅展示，2026-09-11 主人指示：价目表二级页渲染，
// 店铺级 banner 同批废弃，旧端主内容注释 :10/:81 明言）。
// 旧端事实（priceList/index.uvue）：onLoad 解析 idx/priceImage/shopName（decodeURIComponent 容错，:60-68/:70-77）；
// navTitle＝shopName ? `${shopName}价目表` : '蓝梅价目表'（:65）；priceImage 空时兜底 id==='1' ?
// '/static/honghe-price.png' : '/static/iconpark/price.svg'（:78-80）；
// getPackages(id)（:82-93）：code===200 且有数据才渲染套餐区；失败静默（仅 console.error，无错误 UI）；
// 模板：骨架（sk-banner 384rpx＋sk-block 600rpx，:5-8）→ 价目大图 widthFix（:12）→
// 套餐卡（1:1 头图/名称/detail 两行截断/¥ 价格，:15-38）→ divide＋AppFooter（:40-41）。
// 有意偏差（已声明）：①AppFooter 未移植——组件属后续批次 not_started（同 priceHomePage 声明口径）；
// ②失败静默忠实保留（不引入 index/demoDetail 的内联错误+重试——本页主内容为价目大图，套餐为辅）。
// ⚠️ 兜底资产 /static/honghe-price.png 在旧端仓库亦不存在（2026-09-17 静态盘点实测，旧端同为死引用），保持同引用不修正。
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
import { createAuthCoordinator } from "../../application/auth-coordinator";
import { createContextFactory } from "../../application/request-context";
import { createVersionedStorage } from "../../infrastructure/storage/versioned";
import { createHttpClient } from "../../infrastructure/http/client";
import {
  createPackageRepository,
  type ShopPackageInfo,
} from "../../infrastructure/repositories/packages";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import SkeletonBlock from "../../components/SkeletonBlock/SkeletonBlock.vue";

// —— 装配（同 index/demoDetail/priceHomePage）——
const detected = detectUiPlatform();
const platform: Platform = isPlatform(detected) ? detected : "mp-weixin";
const env = PROFILE.environment;
const transport = createUniTransport({ baseUrl: PROFILE.apiBases[env] });
const uniStorage = createUniStorage();
const versioned = createVersionedStorage({ backend: uniStorage, platform, profileKey: PROFILE.profileKey });
const authCoordinator = createAuthCoordinator({
  exchangeIdentity: async () => ({ ok: false, reason: "wx-login-pending-T7" }),
  storage: uniStorage,
  clock: systemClock,
});
const client = createHttpClient({ transport, authCoordinator });
const packageRepo = createPackageRepository({ client });
const ctxFactory = createContextFactory({
  platform,
  environment: env,
  profileKey: PROFILE.profileKey,
  appCode: PROFILE.appCode,
  getBrandId: () => versioned.loadBrandId(),
});

// —— 页面状态 ——
const loading = ref(true);
const navTitle = ref("");
const priceImage = ref("");
const packages = ref<ShopPackageInfo[]>([]);

// 旧端 :70-77 decodeRouteValue：decodeURIComponent 容错（非法编码保持原样不阻断）
function decodeRouteValue(value: string): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// 旧端 :78-80 兜底图（honghe-price.png 旧端仓库同缺，保持死引用一致）
function getFallbackPriceImage(id: string): string {
  return id === "1" ? "/static/honghe-price.png" : "/static/iconpark/price.svg";
}

const pkgPrice = computed(() => (p: ShopPackageInfo) => (typeof p.price === "number" || typeof p.price === "string" ? p.price : ""));

onLoad((query) => {
  const q = (query ?? {}) as Record<string, unknown>;
  const id = typeof q.idx === "string" ? q.idx : "";
  const priceImageParam = decodeRouteValue(typeof q.priceImage === "string" ? q.priceImage : "");
  const shopName = decodeRouteValue(typeof q.shopName === "string" ? q.shopName : "");
  navTitle.value = shopName ? `${shopName}价目表` : "蓝梅价目表";
  priceImage.value = priceImageParam || getFallbackPriceImage(id);
  void loadPackages(id);
});

async function loadPackages(shopId: string): Promise<void> {
  try {
    const r = await packageRepo.getPackages(ctxFactory.next(), shopId);
    // 旧端 :85-86：仅 200 且有数据才渲染；失败/空均静默（忠实保留，:88-89 仅 console.error）
    if (r.ok && r.value.length > 0) {
      packages.value = r.value;
    }
  } catch (err) {
    // 旧端 :89 catch 仅 console.error，不设错误态（忠实保留可观测性，CR 🟡2）
    console.error("[priceList] 获取套餐列表失败", err);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <view class="container">
    <CustomNavBar :title="navTitle" />
    <view v-if="loading" class="sk-wrap">
      <SkeletonBlock height="384rpx" radius="8rpx" />
      <view class="sk-block-gap">
        <SkeletonBlock height="600rpx" radius="8rpx" />
      </view>
    </view>
    <view v-else>
      <image class="price" :src="priceImage" mode="widthFix"></image>
      <view v-if="packages.length > 0" class="pkg-section">
        <view class="pkg-title-wrap">
          <text class="pkg-title font-noto-serif">套餐</text>
          <text class="pkg-sub">PACKAGE</text>
        </view>
        <view class="pkg-list">
          <view v-for="(pkg, i) in packages" :key="i" class="pkg-card">
            <view class="pkg-img-wrap">
              <image v-if="pkg.imageUrl" class="pkg-img" :src="pkg.imageUrl" mode="aspectFill"></image>
              <view v-else class="pkg-img pkg-img-empty">
                <text class="pkg-img-empty-text">套餐</text>
              </view>
            </view>
            <view class="pkg-info">
              <text class="pkg-name font-noto-serif">{{ pkg.name }}</text>
              <text v-if="pkg.detail" class="pkg-detail">{{ pkg.detail }}</text>
              <view class="pkg-price-row">
                <text class="pkg-price-symbol">¥</text>
                <text class="pkg-price">{{ pkgPrice(pkg) }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>
      <view class="divide"></view>
      <!-- AppFooter（旧 :41）未移植：组件属后续批次 not_started（页头已声明） -->
    </view>
  </view>
</template>

<style scoped>
.container {
  min-height: 100vh;
  background: v-bind("tokens.semantic.colorPage");
}
.sk-wrap {
  padding: 32rpx;
}
.sk-block-gap {
  margin-top: 32rpx;
}
.price {
  width: 734rpx;
  margin: 8rpx;
}
/* 套餐条目区（旧端 :109-205 忠实移植；金色派生 rgba 同 PhotoGrid 注释口径） */
.pkg-section {
  margin: 16rpx 28rpx 8rpx; /* 旧端 var(--spacing-md)=28rpx（token spaceMd=24rpx 精度不足，硬编码还原） */
}
.pkg-title-wrap {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 16rpx;
  margin-bottom: 16rpx;
}
.pkg-title {
  font-size: v-bind("tokens.semantic.fontSizeSubTitle");
  font-weight: 400;
  color: v-bind("tokens.semantic.colorAction");
  letter-spacing: 2rpx;
}
.pkg-sub {
  font-size: v-bind("tokens.semantic.fontSizeCaption");
  color: rgba(241, 205, 145, 0.3);
  letter-spacing: 2rpx;
}
.pkg-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.pkg-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 20rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.06);
  border: 1rpx solid rgba(255, 255, 255, 0.12);
}
.pkg-img-wrap {
  width: 160rpx;
  height: 160rpx;
  flex-shrink: 0;
  border-radius: 8rpx;
  overflow: hidden;
}
.pkg-img {
  width: 100%;
  height: 100%;
  display: block;
}
.pkg-img-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(241, 205, 145, 0.1);
}
.pkg-img-empty-text {
  font-size: v-bind("tokens.semantic.fontSizeCaption");
  color: rgba(241, 205, 145, 0.5);
  letter-spacing: 4rpx;
}
.pkg-info {
  flex: 1;
  min-width: 0;
  margin-left: 24rpx;
  display: flex;
  flex-direction: column;
}
.pkg-name {
  font-size: v-bind("tokens.semantic.fontSizeBody");
  color: v-bind("tokens.semantic.colorAction");
  letter-spacing: 1rpx;
}
.pkg-detail {
  margin-top: 8rpx;
  font-size: v-bind("tokens.semantic.fontSizeCaption");
  color: rgba(241, 205, 145, 0.7);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.pkg-price-row {
  margin-top: 12rpx;
  display: flex;
  flex-direction: row;
  align-items: baseline;
}
.pkg-price-symbol {
  font-size: v-bind("tokens.semantic.fontSizeCaption");
  color: v-bind("tokens.semantic.colorAction");
}
.pkg-price {
  font-size: v-bind("tokens.semantic.fontSizeBody"); /* 旧端 32rpx 精确还原（fontSizeSubTitle 36rpx 系统性偏大，CR 🟡1） */
  font-weight: 400;
  color: v-bind("tokens.semantic.colorAction");
  margin-left: 2rpx;
}
.divide {
  height: 2rpx;
  width: 100%;
  background: rgba(255, 255, 255, 0.15);
}
</style>
