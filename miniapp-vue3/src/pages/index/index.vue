<script setup lang="ts">
// T6 首页（P2-11 三页接入第一批）：轮播＋店铺网格＋品牌馆入口＋骨架/错误态。
// 数据流：use-home VM（并行容错）；开关经 brand-hub controller（在飞去重）；上下文经 request-context 工厂。
// 旧端行为事实：品牌馆浮钮开关驱动默认关（OPS 配置）；banner 点击 300ms 节流＋空链不响应（index:557-560）；
// demo 卡点击 → /pages/demoDetail/index?from=banner&idx=N（index:578-582）；店铺点击 → demoDetail?idx=店铺id。
// 替换原模板 Hello 页；探针样页仍注册于 pages/_probe/wot-sample（devtools 直达，P1-08 不入生产包）。
import { computed, onMounted, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { PROFILE } from "../../generated/profile.config";
import { detectUiPlatform } from "../../ui/ui-platform";
import { isPlatform } from "../../ports/context";
import type { Platform } from "../../ports/context";
import { systemClock } from "../../ports/clock";
import { tokens } from "../../generated/tokens";
import { createUniTransport } from "../../platform/uni/transport";
import { createUniStorage } from "../../platform/uni/storage";
import { createAuthCoordinator } from "../../application/auth-coordinator";
import { createBrandHubGate } from "../../application/brand-hub-gate";
import { createContextFactory } from "../../application/request-context";
import { createVersionedStorage } from "../../infrastructure/storage/versioned";
import { createHttpClient } from "../../infrastructure/http/client";
import { createCarouselRepository, type CarouselItem } from "../../infrastructure/repositories/carousels";
import { createShopRepository } from "../../infrastructure/repositories/shops";
import { createPageConfigRepository } from "../../infrastructure/repositories/page-config";
import { createHomeViewModel } from "../../composables/use-home";
import { syncTabBarSelected } from "../../application/tabbar";
import PhotoGrid from "../../components/PhotoGrid/PhotoGrid.vue";
import type { PhotoGridShop } from "../../components/PhotoGrid/PhotoGrid.vue";
import SkeletonBlock from "../../components/SkeletonBlock/SkeletonBlock.vue";
import BaseButton from "../../ui/BaseButton.vue";

// —— 装配（构建期平台折叠＋运行时兜底；非闭集值回落微信＝开发期默认）——
const detected = detectUiPlatform();
const platform: Platform = isPlatform(detected) ? detected : "mp-weixin";
const env = PROFILE.environment;
const transport = createUniTransport({ baseUrl: PROFILE.apiBases[env] });
const uniStorage = createUniStorage();
const versioned = createVersionedStorage({ backend: uniStorage, platform, profileKey: PROFILE.profileKey });
const authCoordinator = createAuthCoordinator({
  // 微信登录换票链路随 T7 登录页接入（P2-08 授权桥已就位）；占位不假装成功
  exchangeIdentity: async () => ({ ok: false, reason: "wx-login-pending-T7" }),
  storage: uniStorage,
  clock: systemClock,
});
const client = createHttpClient({ transport, authCoordinator });
const brandHub = createBrandHubGate({
  // ⭐ P2-20：与品牌馆页自守卫共用同一 page-config 仓储（旧端 pageConfig.uts 公共工具同义）——
  // 入口显隐与页内自守卫不得各写一套 /api/page-config 解析
  pageConfig: createPageConfigRepository({ client }),
});
const ctxFactory = createContextFactory({
  platform,
  environment: env,
  profileKey: PROFILE.profileKey,
  appCode: PROFILE.appCode,
  getBrandId: () => versioned.loadBrandId(),
});
const vm = createHomeViewModel({
  carousels: createCarouselRepository({ client }),
  shops: createShopRepository({ client }),
  brandHub,
});

// —— 页面状态 ——
const ready = ref(false);
const brandHubOn = ref(false); // controller.enabled 非响应式，刷新后拷贝入 ref
const statusBarHeight = ref(20);
try {
  if (typeof uni !== "undefined" && typeof uni.getSystemInfoSync === "function") {
    const info = uni.getSystemInfoSync() as { statusBarHeight?: number };
    if (info.statusBarHeight != null) statusBarHeight.value = info.statusBarHeight;
  }
} catch {
  // 容器异常保持默认
}
// 轮播高度：旧端随首图宽高比自适应（兜底 794rpx）；自适应属 P2-13 样页视觉项，此处固定兜底值
const heroHeight = "794rpx";

const banners = computed<CarouselItem[]>(() => vm.carousels.value);
const shops = computed<PhotoGridShop[]>(() => vm.shops.value as unknown as PhotoGridShop[]);

async function init(): Promise<void> {
  const context = ctxFactory.next();
  await Promise.all([vm.load(context), vm.refreshBrandHub(context)]);
  brandHubOn.value = brandHub.enabled;
  ready.value = true;
}

let lastBannerClickAt = 0;
function onBannerClick(item: CarouselItem): void {
  const raw = item != null ? item.linkUrl : null;
  const linkUrl = typeof raw === "string" ? raw.trim() : "";
  if (linkUrl === "") return; // 无跳转链接：不响应（旧端 :558-560）
  const now = Date.now();
  if (now - lastBannerClickAt < 300) return; // 300ms 节流（旧端防重复）
  lastBannerClickAt = now;
  if (!linkUrl.startsWith("/")) return; // 仅站内路径
  if (typeof uni !== "undefined" && typeof uni.navigateTo === "function") uni.navigateTo({ url: linkUrl });
}

function onShopClick(shop: PhotoGridShop): void {
  const id = (shop as { id?: unknown }).id;
  if (id == null) return;
  if (typeof uni !== "undefined" && typeof uni.navigateTo === "function") {
    uni.navigateTo({ url: "/pages/demoDetail/index?idx=" + String(id) });
  }
}

function onDemoClick(idx: number): void {
  if (typeof uni !== "undefined" && typeof uni.navigateTo === "function") {
    uni.navigateTo({ url: "/pages/demoDetail/index?from=banner&idx=" + idx });
  }
}

function goBrandHub(): void {
  // 品牌馆页属 T7（B2 批次）；开关默认关，实际渲染以 OPS 配置为准
  if (typeof uni !== "undefined" && typeof uni.navigateTo === "function") {
    uni.navigateTo({ url: "/pages/brandHub/index" });
  }
}

// 品牌基线：onShow 检测品牌变化后重载（旧端 index:218-232）。
// ⭐ P2-20 CR 🔴1：品牌馆页切品牌后 switchTab 回首页，首页 factory 从不 bump ⇒ 必须在此检测并重载，
// 否则用户看到的是旧品牌数据（仅冷启动生效）。
let lastBrandId: string | null = versioned.loadBrandId();

onShow(() => {
  // P2-12：自定义 tabBar 选中态由页面 onShow 同步（唯一必然触发的入口）
  syncTabBarSelected(0);
  const brandId = versioned.loadBrandId();
  if (brandId !== lastBrandId) {
    lastBrandId = brandId;
    // 作废在飞旧品牌响应（本页 scope 代次）＋隐藏旧入口开关＋回到骨架后重载（旧端同序）
    ctxFactory.bumpScope();
    brandHubOn.value = false;
    ready.value = false;
    void init();
  }
});

onMounted(() => {
  void init();
});
</script>

<template>
  <view class="container">
    <!-- 品牌馆入口：圆形悬浮左上角，开关驱动默认不渲染（旧端 index:4-8 语义） -->
    <view
      v-if="brandHubOn"
      class="home-btn"
      :style="{ top: statusBarHeight + 8 + 'px' }"
      @click="goBrandHub"
    >
      <image class="home-btn-icon" src="/static/iconpark/shop.svg" mode="aspectFit" />
    </view>

    <!-- 骨架屏：hero 通栏 → 客片欣赏标题 → 店铺卡片区（旧端 :9-14 间距基线） -->
    <view v-if="!ready" class="sk-container">
      <SkeletonBlock height="794rpx" radius="0" />
      <view class="sk-title">
        <SkeletonBlock width="46%" height="48rpx" radius="8rpx" />
      </view>
      <view class="sk-grid">
        <SkeletonBlock height="226rpx" radius="12rpx" />
        <SkeletonBlock height="226rpx" radius="12rpx" />
      </view>
    </view>

    <template v-else>
      <swiper
        v-if="banners.length > 0"
        class="hero"
        autoplay
        circular
        :interval="3000"
        :duration="500"
        :style="{ height: heroHeight }"
      >
        <swiper-item v-for="(item, idx) in banners" :key="item.id ?? idx" @click="onBannerClick(item)">
          <image class="hero-img" :src="item.imageUrl" mode="aspectFill" />
        </swiper-item>
      </swiper>

      <view class="shop-section">
        <view class="shop-section-title">
          <text>客片欣赏</text>
        </view>
        <PhotoGrid :shop-list="shops" @shop-click="onShopClick" @demo-click="onDemoClick" />
      </view>

      <view v-if="vm.error.value !== null" class="home-error">
        <text class="home-error-text">{{ vm.error.value }}</text>
        <BaseButton label="重试" @click="init" />
      </view>
    </template>
  </view>
</template>

<style scoped>
.container {
  min-height: 100vh;
  background: v-bind("tokens.semantic.colorPage");
}
.home-btn {
  position: fixed;
  left: 16rpx;
  z-index: 999;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.home-btn-icon {
  width: 40rpx;
  height: 40rpx;
}
.sk-container {
  padding: 0;
}
.sk-title {
  margin: 40rpx 16rpx 0;
}
.sk-grid {
  margin: 24rpx 8rpx 0;
  display: flex;
  gap: 8rpx;
}
.sk-grid > * {
  flex: 1;
}
.hero {
  width: 100%;
}
.hero-img {
  width: 100%;
  height: 100%;
}
.shop-section-title {
  margin: 40rpx 16rpx 0;
  font-size: v-bind("tokens.semantic.fontSizeSubTitle");
  color: v-bind("tokens.semantic.colorTextStrong");
}
.home-error {
  margin: 40rpx 16rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}
.home-error-text {
  font-size: v-bind("tokens.semantic.fontSizeBody");
  color: v-bind("tokens.semantic.colorTextSecondary");
}
</style>
