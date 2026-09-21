<script setup lang="ts">
// T7 首批（P2-17）：价目表 tab 页——店铺网格（复用 PhotoGrid）＋品牌切换检测重载＋tab 同步。
// 旧端事实（priceHomePage/index.uvue）：onLoad 只跑一次（tab 常驻内存）；onShow 检测品牌变化重载且先置
// loading=true 骨架重现（:45-54）；列表封面出 600 WebP 缩略（:59-65）；店铺点击 →
// priceList?idx&shopName&priceImage（:74-77，shopName 用 shop.shopName 而非 displayName，:76）；
// demo 点击 → priceList?from=banner&idx（:79-82）；CustomNavBar transparent＋PRICE LIST/价目表 标题（:3,15-16）；
// 样式已收敛 PhotoGrid（:106）。
// priceList 页与 getPackages 仓储属 P2-17 后半（下轮），导航先忠实接线。
// 有意偏差（已声明）：①ServiceContact（旧 :19）/AppFooter beian（旧 :20）已由 P2-21 接入（内容经 page-config 用例
// props 注入，等价旧端 mounted 自取数）；tabbar-safe-spacer（旧 :23）2026-09-19 补齐、仅微信端渲染（自定义 tabbar 仅微信；抖音原生 tab 不占页面区域）；②错误态 toast→内联错误+重试（与 index/demoDetail 装配一致）；
// ③id 空守卫（旧端会拼出 idx=undefined，新端防御性 return）。
import { computed, ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
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
import { createShopRepository, type ShopBrief } from "../../infrastructure/repositories/shops";
import { cosThumb } from "../../application/image";
import { syncTabBarSelected } from "../../application/tabbar";
import PhotoGrid from "../../components/PhotoGrid/PhotoGrid.vue";
import type { PhotoGridShop } from "../../components/PhotoGrid/PhotoGrid.vue";
import SkeletonBlock from "../../components/SkeletonBlock/SkeletonBlock.vue";
import BaseButton from "../../ui/BaseButton.vue";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
// 2026-09-21 主人：本页也要下拉刷新 ⇒ 指示器＋刷新内核走共享实现（5 页同源）
import PullRefreshIndicator from "../../components/PullRefreshIndicator/PullRefreshIndicator.vue";
import { createPullRefresh } from "../../composables/use-pull-refresh";
import ServiceContact from "../../components/ServiceContact/ServiceContact.vue";
import PageFooter from "../../components/PageFooter/PageFooter.vue";
import { createPageConfigRepository } from "../../infrastructure/repositories/page-config";
import {
  createPageConfigContent,
  type FooterContent,
  type ContactContent,
  SERVICE_LIST_DEFAULT,
  SLOGAN_DEFAULT,
  COOP_PHONE_DEFAULT,
} from "../../application/page-config-content";

// —— 装配（同 index/demoDetail）——
const detected = detectUiPlatform();
const platform: Platform = isPlatform(detected) ? detected : "mp-weixin";
// 自定义 tabbar 仅微信端 ⇒ 底部占位仅微信需要（抖音原生 tab 不占页面区域，2026-09-19 主人反馈）
const isMpWeixin = platform === "mp-weixin";
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
const shopRepo = createShopRepository({ client });
// P2-21：服务保障/联系我们＋页脚内容经用例取数（组件纯 props，不再 mounted 自请求）
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

// —— 页面状态 ——
type PriceShop = PhotoGridShop & { priceImage?: string; shopName?: string };

const ready = ref(false);
const shops = ref<ShopBrief[]>([]);
const error = ref<string | null>(null);
const lastBrandId = ref<string | null>(null);
// P2-21：服务保障/联系我们（旧 :19 ServiceContact）＋页脚（旧 :20 beian AppFooter）
const footer = ref<FooterContent>({ mainLine: "", supportLine: "" });
// 初值＝本地兜底（旧端组件即时用 data 默认值渲染再异步更新，CR 🟡5：避免请求返回前整块空白）
const contact = ref<ContactContent>({
  list: [...SERVICE_LIST_DEFAULT],
  slogan: SLOGAN_DEFAULT,
  qrSrc: PROFILE.contactQrSrc,
  phone: PROFILE.contactPhoneText,
  coopPhone: COOP_PHONE_DEFAULT,
});

async function loadStaticContent(): Promise<void> {
  footer.value = await pageContent.loadFooter(ctxFactory.next());
  contact.value = await pageContent.loadContact(ctxFactory.next());
}

// 封面 600 缩略在展示层做（旧端 loadShops 内改写对象；新端保持 repo DTO 原样——语义等价）
const gridShops = computed<PriceShop[]>(() =>
  shops.value.map((s) => ({
    id: typeof s.id === "number" ? s.id : undefined,
    homeImage: typeof s.homeImage === "string" ? cosThumb(s.homeImage, 600) : undefined,
    displayName: typeof s.displayName === "string" ? s.displayName : undefined,
    displayNameEn: typeof s.displayNameEn === "string" ? s.displayNameEn : undefined,
    priceImage: typeof s.priceImage === "string" ? s.priceImage : undefined,
    // shopName 是导航串专用字段（旧端 api.uts ShopInfo 中与 displayName 并列独立字段）；
    // priceList 二级页用它拼导航标题「${shopName}价目表」——不得用 displayName 替代
    shopName: typeof s.shopName === "string" ? s.shopName : undefined,
  })),
);

async function loadShops(): Promise<void> {
  error.value = null;
  const r = await shopRepo.getShops(ctxFactory.next());
  if (r.ok) {
    shops.value = r.value;
  } else {
    // 旧端为 toast「门店加载失败，请重试」；新端统一内联错误态＋重试（与 index/demoDetail 一致）
    error.value = "门店加载失败，请重试";
  }
  ready.value = true;
}

// —— 下拉刷新（2026-09-21 主人：价目表 tab 要下拉刷新）——
// 重载门店（PhotoGrid 数据源）+ 页脚/联系信息（口径同首页）。
// ⚠️ 下拉不重置品牌基线：品牌切换由 onShow 基线检测负责（旧端 priceHomePage 同序，避免把新品牌当旧品牌）
const { refreshing, indicatorTop } = createPullRefresh({
  label: "priceHomePage",
  refresh: () => Promise.all([loadShops(), loadStaticContent()]),
  hasCustomNav: true,
});

onLoad(() => {
  void loadShops();
  void loadStaticContent();
  lastBrandId.value = versioned.loadBrandId();
});

onShow(() => {
  // ①tab 选中同步（本页下标 1）②品牌切换后重载：否则仍显示上一品牌门店（旧端 :49-52）
  syncTabBarSelected(1);
  const brandId = versioned.loadBrandId();
  if (brandId !== lastBrandId.value) {
    lastBrandId.value = brandId;
    // 旧端 :52 重载前先置 loading=true（骨架重现，避免上一品牌门店在新数据返回前可见）
    ready.value = false;
    void loadShops();
  }
});

function onShopClick(shop: PriceShop): void {
  if (shop.id == null) return;
  // 旧端 :74-77 原样拼接（shopName 可含中文，旧端未编码——微信实测可用，保持忠实）；
  // 字段必须用 shopName（旧端 :76 shop.shopName，导航标题专用），不得用 displayName 替代
  if (typeof uni !== "undefined" && typeof uni.navigateTo === "function") {
    uni.navigateTo({
      url:
        "/pages/priceList/index?from=banner&idx=" + shop.id + "&shopName=" + shop.shopName + "&priceImage=" + shop.priceImage,
    });
  }
}

function onDemoClick(idx: number): void {
  if (typeof uni !== "undefined" && typeof uni.navigateTo === "function") {
    uni.navigateTo({ url: "/pages/priceList/index?from=banner&idx=" + idx });
  }
}
</script>

<template>
  <view class="container">
    <!-- 下拉刷新指示器：共享组件（`hasCustomNav: true` ⇒ 落在自绘导航栏下沿之下、让开原生三点指示带） -->
    <PullRefreshIndicator :show="refreshing" :top="indicatorTop" />
    <CustomNavBar transparent />
    <view v-if="!ready" class="sk-wrap">
      <view class="sk-title">
        <SkeletonBlock width="46%" height="48rpx" radius="8rpx" />
      </view>
      <view class="sk-subtitle">
        <SkeletonBlock width="30%" height="36rpx" radius="8rpx" />
      </view>
      <view class="sk-row">
        <!-- 2026-09-17：同上（微信 wxss 不支持 `*`）——`.sk-row > *` 改「包裹 view + .sk-cell」 -->
        <view class="sk-cell">
          <SkeletonBlock height="226rpx" radius="12rpx" />
        </view>
        <view class="sk-cell">
          <SkeletonBlock height="226rpx" radius="12rpx" />
        </view>
      </view>
    </view>
    <template v-else>
      <view class="divideTit">PRICE LIST</view>
      <view class="demoPhotoTit font-noto-serif">价目表</view>
      <PhotoGrid :shop-list="gridShops" @shop-click="onShopClick" @demo-click="onDemoClick" />
      <!-- P2-21：服务保障/联系我们（旧 :19）＋页脚（旧 :20）——内容经用例注入 -->
      <ServiceContact
        :list="contact.list"
        :slogan="contact.slogan"
        :qr-src="contact.qrSrc"
        :phone="contact.phone"
        :coop-phone="contact.coopPhone"
      />
      <!-- 页脚：PageFooter 共享组件（原 :205-207 beian 块收敛——beian 变体、无包裹无分隔线） -->
      <PageFooter :main-line="footer.mainLine" :support-line="footer.supportLine" variant="beian" :with-divide="false" :wrapped="false" />
      <view v-if="error !== null" class="page-error">
        <text class="page-error-text">{{ error }}</text>
        <BaseButton label="重试" @click="loadShops" />
      </view>
    </template>
    <!-- 自定义底部 tabbar 占位（旧 :23；全局类在 App.vue：116rpx + 安全区），仅微信端渲染
         （抖音原生 tab 不占页面区域）——避免页脚贴底 tab -->
    <view v-if="isMpWeixin" class="tabbar-safe-spacer"></view>
  </view>
</template>

<style lang="scss" scoped>
.container {
  min-height: 100vh;
  background: $color-page;
}
.sk-wrap {
  padding: 40rpx 8rpx 0;
}
.sk-title {
  display: flex;
  justify-content: center;
  margin-top: 40rpx;
}
.sk-subtitle {
  display: flex;
  justify-content: center;
  margin-top: 16rpx;
}
.sk-row {
  display: flex;
  gap: 8rpx;
  margin-top: 16rpx;
}
.sk-cell {
  flex: 1;
}
/* 标题（旧端 :95-105 divideTit/demoPhotoTit 忠实移植；金色 30% 派生同 PhotoGrid 注释口径） */
.divideTit {
  text-align: center;
  font-size: $font-size-caption;
  color: rgba(241, 205, 145, 0.3);
}
.demoPhotoTit {
  margin-top: 16rpx;
  font-size: $font-size-sub-title;
  color: $color-action;
  text-align: center;
}
.page-error {
  margin: 40rpx 16rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}
.page-error-text {
  font-size: $font-size-body;
  color: $color-text-secondary;
}
</style>
