<script setup lang="ts">
// T7 P2-20：品牌馆——中台入驻品牌列表＋进入切换品牌（旧端 brandHub/index.uvue 237 行忠实移植）。
// 进入路径：首页左上角圆形品牌 logo 悬浮按钮（首页入口由同一开关闸门驱动）。
// ⭐ P2-20 红线：①本页自守卫必须与首页入口**共用同一开关仓储**（brand-hub-gate ← page-config 仓储），
//   禁止两处各写一套 /api/page-config 解析（旧端 pageConfig.uts 即为此抽公共工具）——「不能入口显示但进入
//   又被错误拦回」：两侧同源同口径（安全默认 false：组件缺失/空/JSON 非法/接口失败一律隐藏）。
// ②过滤 PLATFORM 占位品牌（旧 :102 超管配置用占位品牌，不得展示）。
// ③品牌持久化与缓存隔离：enterBrand 写 versioned.saveBrandId 后 bumpScope（在飞旧品牌响应按代次丢弃，P2-07），
//   再 switchTab 回首页；下次冷启动读持久化品牌直接进该品牌首页（旧 utils/brand.uts 语义）。
// 旧端事实：onLoad 自守卫失败即 toast「该功能未开放」+ 800ms 后 navigateBack 且不加载品牌列表（:78-95）；
// 骨架 4 卡与真实卡 1:1 镜像（:15-24）；品牌卡 logo 缺失回退首字方块（:42-44）；空态「暂无入驻品牌」（:57-59）；
// 卡片点击 hapticTap＋setBrandId＋switchTab('/pages/index/index')（:111-116）。
// 有意偏差（已声明）：①主题暗→亮（旧 --color-bg #160F04→colorPage 白）——旧端用于浅底文字的低透明度
// 白/金（desc rgba(255,255,255,.5)、空态 .4）在白底不可读，改取 colorTextSecondary（CR 🟡3）；
// ②卡片 fade-in 入场动画未带（旧 :38，属全局样式批次）；③font-harmony/font-noto-serif 全局类新端未定义
// （沿用 PhotoGrid/priceList 既有口径，仅引用不定义）。
import { ref } from "vue";
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
import { createPageConfigRepository } from "../../infrastructure/repositories/page-config";
import { createBrandRepository, type BrandBrief } from "../../infrastructure/repositories/brands";
import { createBrandHubGate } from "../../application/brand-hub-gate";
import { hapticTap } from "../../application/haptics";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import SkeletonBlock from "../../components/SkeletonBlock/SkeletonBlock.vue";

// —— 装配（同 index/demoDetail/mine）——
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
const ctxFactory = createContextFactory({
  platform,
  environment: env,
  profileKey: PROFILE.profileKey,
  appCode: PROFILE.appCode,
  getBrandId: () => versioned.loadBrandId(),
});
// ⭐ 与首页入口同源：同一 page-config 仓储 → 同一开关闸门
const brandHubGate = createBrandHubGate({ pageConfig: createPageConfigRepository({ client }) });
const brandRepo = createBrandRepository({ client });

// —— 页面状态（旧端 :72-77）——
const loading = ref(true);
const brands = ref<BrandBrief[]>([]);

onLoad(() => {
  void (async () => {
    // 自守卫：该商户未开启品牌馆入口时直接退回上一页（不加载品牌列表，旧 :78-83）
    const ok = await guardEnabled();
    if (!ok) return;
    await loadBrands();
  })();
});

async function guardEnabled(): Promise<boolean> {
  // 旧 :87-95：安全默认——查询失败也视为关闭（与首页入口口径一致）
  const on = await brandHubGate.isEnabled(ctxFactory.next());
  if (!on) {
    toast("该功能未开放");
    setTimeout(() => {
      if (typeof uni !== "undefined" && typeof uni.navigateBack === "function") uni.navigateBack();
    }, 800);
    return false;
  }
  return true;
}

async function loadBrands(): Promise<void> {
  loading.value = true;
  try {
    const res = await brandRepo.getBrands(ctxFactory.next());
    if (res.ok && res.value != null) {
      // 过滤平台管理品牌（PLATFORM 是超管配置用的占位品牌，旧 :100-102）
      brands.value = res.value.filter((b) => b != null && b.brandId !== "PLATFORM");
    } else {
      // 旧 :103-106：加载失败 toast（新端仓储/client 只返回 Result 从不抛——CR 🔴2 修正：
      // 失败必须走此分支提示，不能只落在 catch 死代码里）
      brands.value = [];
      toast("品牌加载失败，请重试");
    }
  } catch (err) {
    console.error("[brandHub] 加载品牌列表失败:", err);
    toast("品牌加载失败，请重试");
    brands.value = [];
  } finally {
    loading.value = false;
  }
}

function enterBrand(b: BrandBrief): void {
  // 旧 :111-116：触感反馈＋写入品牌上下文（持久化）→ 回首页；切品牌同时作废旧 scope 在飞响应
  hapticTap();
  versioned.saveBrandId(b.brandId);
  ctxFactory.bumpScope(); // 缓存隔离（P2-07/P2-20）
  if (typeof uni !== "undefined" && typeof uni.switchTab === "function") {
    uni.switchTab({ url: "/pages/index/index" });
  }
}

function toast(title: string): void {
  if (typeof uni !== "undefined" && typeof uni.showToast === "function") {
    uni.showToast({ title, icon: "none" });
  }
}
</script>

<template>
  <view class="container">
    <CustomNavBar title="品牌馆" />
    <view class="brand-hub">
      <view class="hub-aura"></view>

      <!-- 骨架屏：与真实品牌卡 1:1 镜像（圆 logo＋名称/描述＋进入按钮，旧 :15-24） -->
      <view v-if="loading" class="sk-wrap">
        <view v-for="i in 4" :key="i" class="brand-card">
          <SkeletonBlock width="96rpx" height="96rpx" radius="50%" />
          <view class="sk-flex-1">
            <SkeletonBlock width="55%" height="34rpx" radius="8rpx" />
            <SkeletonBlock width="82%" height="24rpx" radius="6rpx" />
          </view>
          <SkeletonBlock width="88rpx" height="44rpx" radius="22rpx" />
        </view>
      </view>

      <view v-else class="brand-list">
        <view
          v-for="(b, index) in brands"
          :key="index"
          class="brand-card"
          hover-class="press-dim"
          @click="enterBrand(b)"
        >
          <view class="brand-logo-wrap">
            <image v-if="b.logoUrl" class="brand-logo" :src="b.logoUrl" mode="aspectFill"></image>
            <view v-else class="brand-logo brand-logo-default">
              <text class="brand-logo-text">{{ b.brandName.charAt(0) }}</text>
            </view>
          </view>
          <view class="brand-info">
            <view class="brand-name font-noto-serif">{{ b.brandName }}</view>
            <view v-if="b.description" class="brand-desc font-harmony">{{ b.description }}</view>
          </view>
          <view class="brand-enter">
            <text class="brand-enter-text">进入</text>
            <image class="brand-arrow" src="/static/iconpark/right.svg" mode="aspectFit"></image>
          </view>
        </view>

        <view v-if="brands.length === 0" class="hub-empty">
          <view class="empty-title">暂无入驻品牌</view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.container {
  height: 100vh; /* 旧 :124 height:100vh（内层 .brand-hub 自滚，忠实保留） */
  display: flex;
  flex-direction: column;
  background: v-bind("tokens.semantic.colorPage");
}
.brand-hub {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow-y: auto;
}
/* 顶部金色氛围光（旧 :135-143） */
.hub-aura {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 420rpx;
  pointer-events: none;
  background: radial-gradient(
    ellipse 90% 60% at 50% 0%,
    rgba(241, 205, 145, 0.14),
    rgba(241, 205, 145, 0.04) 46%,
    rgba(255, 255, 255, 0) 78%
  );
}
.sk-wrap {
  padding: 24rpx 32rpx 40rpx;
}
.sk-flex-1 {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-right: 24rpx;
}
.brand-list {
  padding: 24rpx 32rpx 40rpx;
}
/* 品牌卡（旧 :158-170）：旧 --radius-md 硬编码 16rpx（token 无对应档） */
.brand-card {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  min-height: 132rpx;
  padding: 0 28rpx;
  margin-bottom: 24rpx;
  background: linear-gradient(
    135deg,
    rgba(241, 205, 145, 0.1),
    rgba(241, 205, 145, 0.03) 60%,
    rgba(241, 205, 145, 0.01)
  );
  border: 2rpx solid rgba(241, 205, 145, 0.2);
  border-radius: 16rpx;
  transition: opacity 0.15s ease-out; /* 旧 :169 */
}
.brand-logo-wrap {
  width: 96rpx;
  height: 96rpx;
  margin-right: 24rpx;
  flex-shrink: 0;
}
.brand-logo {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  border: 3rpx solid v-bind("tokens.semantic.colorAction");
  background: rgba(241, 205, 145, 0.06);
}
.brand-logo-default {
  display: flex;
  align-items: center;
  justify-content: center;
}
.brand-logo-text {
  font-size: 40rpx;
  color: v-bind("tokens.semantic.colorAction");
}
.brand-info {
  flex: 1;
  min-width: 0;
}
.brand-name {
  font-size: 34rpx; /* 旧端 34rpx（token 无该档，硬编码还原） */
  color: v-bind("tokens.semantic.colorAction");
  letter-spacing: 2rpx;
}
.brand-desc {
  margin-top: 8rpx;
  font-size: 22rpx; /* 旧 --font-size-body-sm=22rpx */
  /* 旧 rgba(255,255,255,.5) 在白底 colorPage 上≈1.3:1 不可读（CR 🟡3）→ 取新端正文次级色 */
  color: v-bind("tokens.semantic.colorTextSecondary");
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.brand-enter {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-left: 16rpx;
  flex-shrink: 0;
}
.brand-enter-text {
  font-size: v-bind("tokens.semantic.fontSizeBody");
  color: v-bind("tokens.semantic.colorAction");
}
.brand-arrow {
  width: 40rpx;
  height: 40rpx;
  opacity: 0.35;
  margin-left: 4rpx;
}
.hub-empty {
  padding: 160rpx 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-title {
  font-size: v-bind("tokens.semantic.fontSizeBody");
  /* 旧 rgba(255,255,255,.4) 白底不可读（CR 🟡3）→ 正文次级色 */
  color: v-bind("tokens.semantic.colorTextSecondary");
}
.press-dim {
  opacity: 0.82; /* 旧全局 .press-dim（App.uvue:139-141）；部分既有页用 0.7，全端待统一 */
}
</style>
