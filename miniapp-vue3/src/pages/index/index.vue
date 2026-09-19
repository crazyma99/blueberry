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
import { createUniTransport } from "../../platform/uni/transport";
import { createUniStorage } from "../../platform/uni/storage";
import { createUniLoginCode } from "../../platform/uni/login";
import { createAuthCoordinator } from "../../application/auth-coordinator";
import { createSilentIdentityExchange } from "../../application/silent-login";
import { createBrandHubGate } from "../../application/brand-hub-gate";
import { createContextFactory } from "../../application/request-context";
import { createVersionedStorage } from "../../infrastructure/storage/versioned";
import { createHttpClient } from "../../infrastructure/http/client";
import { createWxAuthRepository } from "../../infrastructure/repositories/wx-auth";
import { createCarouselRepository, type CarouselItem } from "../../infrastructure/repositories/carousels";
import { createShopRepository } from "../../infrastructure/repositories/shops";
import { createPageConfigRepository } from "../../infrastructure/repositories/page-config";
import { createHomeViewModel } from "../../composables/use-home";
import { syncTabBarSelected } from "../../application/tabbar";
// 2026-09-19：首页网格还原旧端 photo-grid/photo-card 结构（不再用 PhotoGrid 组件），类型沿用其接口
import type { PhotoGridShop } from "../../components/PhotoGrid/PhotoGrid.vue";
import ServiceContact from "../../components/ServiceContact/ServiceContact.vue";
import PageFooter from "../../components/PageFooter/PageFooter.vue";
import {
  createPageConfigContent,
  type FooterContent,
  type ContactContent,
  SERVICE_LIST_DEFAULT,
  SLOGAN_DEFAULT,
  COOP_PHONE_DEFAULT,
} from "../../application/page-config-content";
import SkeletonBlock from "../../components/SkeletonBlock/SkeletonBlock.vue";
import BaseButton from "../../ui/BaseButton.vue";

// —— 装配（构建期平台折叠＋运行时兜底；非闭集值回落微信＝开发期默认）——
const detected = detectUiPlatform();
const platform: Platform = isPlatform(detected) ? detected : "mp-weixin";
// 自定义 tabbar 仅微信端（pages.json custom 条件编译）⇒ 底部占位仅微信需要；
// 抖音/其他端原生 tab 不占页面区域，占位会变成多余大空白（2026-09-19 主人反馈）
const isMpWeixin = platform === "mp-weixin";
const env = PROFILE.environment;
const transport = createUniTransport({ baseUrl: PROFILE.apiBases[env] });
const uniStorage = createUniStorage();
const versioned = createVersionedStorage({ backend: uniStorage, platform, profileKey: PROFILE.profileKey });
const authCoordinator = createAuthCoordinator({
  // 微信登录换票链路随 T7 登录页接入（P2-08 授权桥已就位）；占位不假装成功
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
// P2-21：服务保障/联系我们＋页脚（旧 index :109-113）内容经用例取数，组件纯 props
const pageContent = createPageConfigContent({
  pageConfig: createPageConfigRepository({ client }),
  profile: {
    copyrightText: PROFILE.copyrightText,
    contactQrSrc: PROFILE.contactQrSrc,
    contactPhoneText: PROFILE.contactPhoneText,
  },
});

// —— 页面状态 ——
const ready = ref(false);
const brandHubOn = ref(false); // controller.enabled 非响应式，刷新后拷贝入 ref
const footer = ref<FooterContent>({ mainLine: "", supportLine: "" });
// 初值＝本地兜底（旧端组件即时用默认值渲染再异步更新）
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

// —— 双层视差（旧端 index.uvue :181-185/:281-315 移植）——
// banner 上层图文 2 选 1：overlayType===2 → 全幅上层图；否则标题+副标题文字层
interface HeroBanner extends CarouselItem {
  overlayType?: number;
  overlayImage?: string;
  title?: string;
  subtitle?: string;
}
// 当前轮播索引 / 动效重播 tick（每次切换必递增）/ 渐隐标记 / 前景层当前项
const currentIndex = ref(0);
const fgTick = ref(0);
const fgHidden = ref(false);
const currentBanner = ref<HeroBanner>({});

// 前景层当前展示项（循环安全取模，无越界）
function updateCurrentBanner(): void {
  const list = banners.value;
  const n = list.length;
  if (n === 0) {
    currentBanner.value = {};
    return;
  }
  const i = ((currentIndex.value % n) + n) % n;
  currentBanner.value = (list[i] ?? {}) as HeroBanner;
}

// 轮播索引同步（手动/自动轮播都会触发）：两段式渐入渐出——
// ① 先置隐藏（旧内容淡出）② 220ms 后换内容重挂载（仍隐藏）③ 260ms 后取消隐藏（新内容淡入）
function onHeroChange(e: { detail?: { current?: number } }): void {
  currentIndex.value = e?.detail?.current ?? 0;
  fgHidden.value = true;
  setTimeout(() => {
    fgTick.value = fgTick.value + 1;
    updateCurrentBanner();
  }, 220);
  setTimeout(() => {
    fgHidden.value = false;
  }, 260);
}

// 背景层：只做渐隐渐显（当前页 opacity=1，其余 0.3），位移交给 swiper 原生滑动
function heroBgOpacity(index: number): string {
  const n = banners.value.length;
  if (n === 0) return "";
  let diff = index - currentIndex.value;
  if (diff > n / 2) diff -= n;
  if (diff < -n / 2) diff += n;
  return "opacity: " + (diff === 0 ? 1 : 0.3) + "; will-change: opacity;";
}
// 占位卡开关：JS 预计算，避免真机模板表达式求值差异（旧端 PhotoGrid 同款逻辑）
const showPlaceholder = computed(() => {
  const n = shops.value != null ? shops.value.length : 0;
  return n > 1 && n % 2 === 1;
});

async function init(): Promise<void> {
  const context = ctxFactory.next();
  await Promise.all([vm.load(context), vm.refreshBrandHub(context), loadStaticContent()]);
  brandHubOn.value = brandHub.enabled;
  // 双层视差：banners 就绪后刷新前景层当前项（旧端 :368-369）
  updateCurrentBanner();
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
  const id = shop.id;
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

    <!-- 骨架屏：hero 通栏 → 客片欣赏标题/副标题 → 店铺卡片区（旧端 :9-23 结构还原；
         卡片用 48% 宽 + space-between，不用 flex:1+gap——抖音端组件宿主尺寸计算会致两块重合，2026-09-19 实测反馈） -->
    <view v-if="!ready" class="sk-container">
      <SkeletonBlock height="794rpx" radius="0" />
      <view class="sk-title-wrap">
        <SkeletonBlock width="46%" height="48rpx" radius="8rpx" />
        <view class="sk-gap"></view>
        <SkeletonBlock width="26%" height="24rpx" radius="6rpx" />
      </view>
      <view class="sk-cards">
        <SkeletonBlock width="48%" height="320rpx" radius="12rpx" />
        <SkeletonBlock width="48%" height="320rpx" radius="12rpx" />
      </view>
    </view>

    <template v-else>
      <!-- 双层视差 hero：hero-wrap 相对定位 → 背景层 swiper（渐隐渐显）＋ hero-mask 渐变遮罩
           （轮播底部 50% 渐隐融入页面底色，店铺区透明底金色弧线切图视觉上与轮播尾部重合）
           ＋ hero-fg-layer 前景层（banner 上层图文 2 选 1，两段式渐入渐出）。旧端 index.uvue :28-57/:622-722 还原 -->
      <view v-if="banners.length > 0" class="hero-wrap">
        <swiper
          class="hero"
          autoplay
          circular
          :interval="3000"
          :duration="500"
          :style="{ height: heroHeight }"
          @change="onHeroChange"
        >
          <swiper-item v-for="(item, idx) in banners" :key="item.id ?? idx">
            <!-- 背景层：底层铺满容器，滑动时渐隐渐显（仅 opacity，不做位移） -->
            <image
              class="hero-img fade-in hero-bg-layer"
              :src="item.imageUrl"
              mode="aspectFill"
              :style="heroBgOpacity(idx)"
              @click="onBannerClick(item)"
            />
          </swiper-item>
        </swiper>
        <!-- Figma 渐变遮罩：图片底部渐隐融入页面背景（透明50% → #160F04 78.19%） -->
        <view class="hero-mask"></view>
        <!-- 前景层（顶层）：文字=bottom:0+height:25% 居中；图片=全幅 hero-fg-layer-full，与 bg 等高等宽严丝合缝覆盖 -->
        <view class="hero-fg-layer" :class="currentBanner.overlayType === 2 ? 'hero-fg-layer-full' : ''">
          <!-- 上层配置 2 选 1：上层图片 / 标题(NotoSerif)+副标题(HarmonyOS Sans)；
               :key=fgTick 每次切换重挂载；渐入渐出=两段式 opacity 过渡（先淡出旧、再淡入新） -->
          <view :key="fgTick" :class="fgHidden ? 'hero-fg-content hero-fg-hide' : 'hero-fg-content'">
            <image
              v-if="currentBanner.overlayType === 2 && currentBanner.overlayImage"
              class="hero-fg-image"
              :src="currentBanner.overlayImage"
              mode="aspectFill"
            />
            <view v-else-if="currentBanner.title" class="hero-fg-text">
              <text class="hero-fg-title font-noto-serif">{{ currentBanner.title }}</text>
              <text v-if="currentBanner.subtitle" class="hero-fg-subtitle">{{ currentBanner.subtitle }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 客片欣赏：shop-container-top.png 切图顶 + 内层三边线框 + photo-card 网格
           （旧端 index:59-113 结构还原。2026-09-19 修正：新端初版误用 PhotoGrid 旧组件，
           首页旧端早已改用 photo-grid/photo-card 设计，见旧端 :868 注释） -->
      <view class="shop-section">
        <view class="shop-content">
          <view class="shop-header-wrap">
            <image class="shop-top" src="/static/shop-container-top.png" mode="aspectFill" />
          </view>
          <view class="shop-container">
            <view class="shop-inner-line"></view>
            <view class="shop-header">
              <view class="shop-title-wrap">
                <text class="shop-title font-noto-serif">客片欣赏</text>
                <text class="shop-subtitle">COLLECTION</text>
              </view>
            </view>
            <view class="photo-grid">
              <view
                v-for="(shop, index) in shops"
                :key="index"
                :class="shops.length === 1 ? 'photo-card photo-card-full' : 'photo-card'"
                hover-class="press-dim"
                @click="onShopClick(shop)"
              >
                <!-- lazy-load 保留（deviations #12：仅改加载时机） -->
                <image class="photo-card-img fade-in" :src="shop.homeImage" mode="aspectFill" lazy-load />
                <view class="photo-card-mask"></view>
                <view class="photo-card-info">
                  <text class="photo-card-name font-noto-serif">{{ shop.displayName }}</text>
                  <text class="photo-card-sub">{{ shop.displayNameEn }}</text>
                </view>
              </view>
              <!-- 占位卡：店铺数为奇数(≥3)时补全网格，不可点击（旧端 :90-95） -->
              <view v-if="showPlaceholder" class="photo-card photo-card-placeholder">
                <view class="placeholder-content">
                  <text class="placeholder-title font-noto-serif">敬请期待</text>
                  <text class="placeholder-sub">COMING SOON</text>
                </view>
              </view>
              <!-- 无店铺 fallback：2 张 demo 图（旧端 :97-104） -->
              <view v-if="shops.length === 0" class="photo-card" hover-class="press-dim" @click="onDemoClick(1)">
                <image class="photo-card-img" src="/static/demo1.png" mode="aspectFill" />
              </view>
              <view v-if="shops.length === 0" class="photo-card" hover-class="press-dim" @click="onDemoClick(2)">
                <image class="photo-card-img" src="/static/demo2.png" mode="aspectFill" />
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- P2-21：服务保障/联系我们＋页脚（旧 index :109-113 ServiceContact＋page-footer/beian） -->
      <ServiceContact
        :list="contact.list"
        :slogan="contact.slogan"
        :qr-src="contact.qrSrc"
        :phone="contact.phone"
        :coop-phone="contact.coopPhone"
      />
      <!-- 页脚：PageFooter 共享组件（原 :249-253 page-footer > beian 块收敛——beian 变体、无分隔线） -->
      <PageFooter :main-line="footer.mainLine" :support-line="footer.supportLine" variant="beian" :with-divide="false" />

      <view v-if="vm.error.value !== null" class="home-error">
        <text class="home-error-text">{{ vm.error.value }}</text>
        <BaseButton label="重试" @click="init" />
      </view>
    </template>

    <!-- 自定义底部 tabbar 占位（旧端 index :140-141；全局类在 App.vue：116rpx + 安全区），
         仅微信端渲染（抖音原生 tab 不占页面区域）——避免页脚版权文案被底部 tab 遮住 -->
    <view v-if="isMpWeixin" class="tabbar-safe-spacer"></view>
  </view>
</template>

<style lang="scss" scoped>
.container {
  min-height: 100vh;
  background: $color-page;
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
/* 旧端 :13 标题区（与真实 shop-section 同间距：左右 var(--spacing-sm)=20rpx） */
.sk-title-wrap {
  margin: 40rpx 20rpx 0;
}
.sk-gap {
  height: 16rpx;
}
/* 旧端 :19 卡片区：space-between + 48% 宽两块（与真实 photo-grid 同间距） */
.sk-cards {
  margin: 28rpx 20rpx 0;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
}
.hero-wrap {
  position: relative;
  width: 100%;
}
.hero {
  width: 100%;
  overflow: hidden;
}
/* Figma 渐变遮罩：轮播底部渐隐融入页面背景（旧端 :631-641：高 50%、透明 20% → 底色 96%） */
.hero-mask {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 50%;
  background: linear-gradient(rgba(22, 15, 4, 0) 20%, $color-page 96%);
  pointer-events: none;
  z-index: 10;
}
.hero-img {
  width: 100%;
  height: 100%;
}
/* ===== 双层视差图层（旧端 index.uvue :647-722 逐值还原；var(--*) 字面量化） ===== */
/* 背景层：底层铺满容器；滑动渐隐渐显（仅 opacity 过渡，位移交给 swiper 原生滑动） */
.hero-bg-layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  transition: opacity 500ms ease;
  will-change: opacity;
}
/* 前景层：顶层，位于 hero-mask 之上；区域 bottom:0 + height:25%，文字在区域内水平垂直居中 */
.hero-fg-layer {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 25%;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  will-change: transform, opacity;
}
.hero-fg-content {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  /* 渐入渐出：仅透明度过渡（两段式：淡出旧→淡入新），不位移 */
  transition: opacity 220ms ease;
}
.hero-fg-hide {
  opacity: 0;
}
.hero-fg-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 0 48rpx;
}
.hero-fg-title {
  width: 100%;
  /* 旧 var(--font-display)＝NotoSerif：新端用全局 font-noto-serif 类（模板侧） */
  font-size: 44rpx;
  letter-spacing: 0.1em;
  color: #F1CD91; /* 旧 var(--color-primary) */
  text-align: center;
}
.hero-fg-subtitle {
  width: 100%;
  /* 旧 var(--font-body)＝HarmonyOS Sans＝新端全局默认字体 */
  font-size: 26rpx;
  letter-spacing: 0.2em;
  color: rgba(241, 205, 145, 0.7); /* 旧 var(--color-primary-70) */
  text-align: center;
}
/* 上层图片模式：前景层全幅覆盖（top:0 + height:100%），与背景图等高等宽 */
.hero-fg-layer-full {
  top: 0;
  bottom: auto;
  height: 100%;
}
.hero-fg-layer-full .hero-fg-content {
  height: 100%;
}
.hero-fg-image {
  width: 100%;
  height: 100%;
}
.shop-section {
  /* 旧端 index.uvue:727-869 逐值还原（var(--*) 已按 2026-09-19 抖音口径字面量化） */
  margin: 0 20rpx 40rpx; /* 旧 var(--spacing-sm) */
}
.shop-header-wrap {
  position: relative;
  width: 710rpx;
  height: 163rpx;
}
.shop-top {
  width: 100%;
  height: 100%;
  position: absolute;
}
.shop-header {
  position: absolute;
  /* 上移 60rpx 进入切图区：只动标题自身，容器边框线位置不受影响 */
  top: -60rpx;
  left: 20rpx;
  right: 20rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.shop-title-wrap {
  display: flex;
  flex-direction: column;
}
.shop-title {
  font-size: 38rpx; /* 旧 var(--font-size-display) */
  font-weight: 400;
  color: #F1CD91; /* 旧 var(--color-primary) */
}
.shop-subtitle {
  font-size: 14rpx; /* 旧 var(--font-size-caption) */
  color: rgba(241, 205, 145, 0.7); /* 旧 var(--color-primary-70) */
  font-weight: 400;
  letter-spacing: 4rpx;
}
.shop-container {
  position: relative;
  /* 允许标题上移溢出显示 */
  overflow: visible;
  /* 顶部 padding 为标题行留位（标题 absolute 不占流） */
  padding: 20rpx; /* 旧 var(--spacing-sm) */
}
/* 内边框线框：左/右/下三边线，顶部开口与切图拼接（旧端 :789-804） */
.shop-inner-line {
  position: absolute;
  top: 0;
  left: 0rpx;
  right: 5rpx;
  bottom: 0rpx;
  border-left: 2rpx solid rgba(255, 255, 221, 0.3); /* 旧 var(--color-border-soft) */
  border-right: 2rpx solid rgba(255, 255, 221, 0.3);
  border-bottom: 2rpx solid rgba(255, 255, 221, 0.3);
  border-bottom-left-radius: 24rpx;
  border-bottom-right-radius: 24rpx;
  pointer-events: none;
}
.photo-grid {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 20rpx; /* 旧 var(--spacing-sm) */
  margin-top: 20rpx;
}
.photo-card {
  position: relative;
  width: calc((100% - 20rpx) / 2);
  height: 182rpx;
  border-radius: 14rpx; /* 旧 var(--radius-card) */
  overflow: hidden;
  border: 1rpx solid rgba(243, 217, 172, 0.35);
  /* uvue 默认 border-box；vue3 mp 端须显式声明，否则 1rpx 描边使每行溢出换行（抖音实测占位卡掉行） */
  box-sizing: border-box;
}
.photo-card-full {
  width: 100%;
  /* 固定 16:9：750×9/16≈422rpx；图片 aspectFill 居中裁切不拉伸 */
  height: 422rpx;
}
.photo-card-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx dashed rgba(243, 217, 172, 0.35);
  background: rgba(255, 255, 255, 0.02);
}
.photo-card-placeholder .placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.photo-card-placeholder .placeholder-title {
  font-size: 26rpx; /* 旧 var(--font-size-body-lg) */
  font-weight: 400;
  color: rgba(241, 205, 145, 0.5); /* 旧 var(--color-primary-50) */
  letter-spacing: 2rpx;
}
.photo-card-placeholder .placeholder-sub {
  margin-top: 4rpx;
  font-size: 14rpx; /* 旧 var(--font-size-caption) */
  color: rgba(241, 205, 145, 0.3); /* 旧 var(--color-primary-30) */
  letter-spacing: 2rpx;
}
.photo-card-img {
  width: 100%;
  height: 100%;
  display: block;
}
.photo-card-mask {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 70%;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.75));
}
.photo-card-info {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 10rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.photo-card-name {
  font-size: 26rpx; /* 旧 var(--font-size-body-lg) */
  font-weight: 400;
  color: #F1CD91; /* 旧 var(--color-primary) */
}
.photo-card-sub {
  margin-top: 2rpx;
  font-size: 14rpx; /* 旧 var(--font-size-caption) */
  font-weight: 400;
  color: rgba(241, 205, 145, 0.7); /* 旧 var(--color-primary-70) */
}
.home-error {
  margin: 40rpx 16rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}
.home-error-text {
  font-size: $font-size-body;
  color: $color-text-secondary;
}
</style>
