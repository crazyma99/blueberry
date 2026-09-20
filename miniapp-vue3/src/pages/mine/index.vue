<script setup lang="ts">
// T7 P2-18：我的页——登录两态＋头像昵称非空合并＋退出（旧端 mine/index.uvue 639 行忠实移植）。
// 旧端事实：displayAvatar 未登录恒 ''（:148-151，image 不渲染露出灰色 avatar DOM）；
// displayNickname 三态（:153-157：未登录「点击立即登陆」/已登录无昵称「点击获取用户信息」/有昵称显示）；
// userSub 三态（:38）；onShow tab 同步＋刷新登录态＋已登录缺头像拉一次后端信息（:164-191）；
// handleUserClick 未登录弹 LoginPopup／已登录弹 ProfilePopup（:237-247）；
// onGetPhoneNumber 协议校验→runPhoneLogin→缺 profile 弹补齐（:275-333）；
// submitProfile 乐观合并→PUT→finishProfile（:354-390，profileFromLogin 才 toast 登录成功）；
// confirmLogout showModal→logout→刷新（:397-414）；菜单 needLogin 守卫＋hapticTap（:449-465）。
// 菜单范围与未登录引导文案由 PROFILE.features 驱动（2026-09-17 主人拍板：抖音我的页只留「我的喜欢」、
// mineHintText＝「登录后可收藏」；微信两项全留、文案含 AI 试衣）——单一事实源＝profile 生成期 features。
// 有意偏差（已声明）：①uni.$on('login-required') 401 事件监听未移植——新端 client 401 返回 AUTH_EXPIRED
// 错误给调用方，无事件总线（T5 合同），页面侧显式处理；②list-view/list-item（uni-app x 组件）→普通 view 容器；
// ③aiTryOnHistory 页尚未迁移（AI 批次），「AI试衣」菜单点击在 pages.json 注册前会导航失败；favorites 页已由
// P2-19 迁移并注册（2026-09-17），菜单可正常进入。
// ④主题：2026-09-19 撤回迁移期亮色、恢复旧端深色（colorPage=#160F04，同旧 --color-bg），
// 骨架等亮色残留值已按旧端全局骨架还原（白 8%，App.uvue:283/:316/:322）；⑤骨架屏未带旧端 sk-animate 闪烁动画（共享 SkeletonBlock 组件口径）。
import { computed, ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import { PROFILE } from "../../generated/profile.config";
import { detectUiPlatform } from "../../ui/ui-platform";
import { isPlatform } from "../../ports/context";
import type { Platform } from "../../ports/context";
import { createUniTransport } from "../../platform/uni/transport";
import { createUniStorage } from "../../platform/uni/storage";
import { createUniLoginCode } from "../../platform/uni/login";
import { toast, showLoading, hideLoading } from "../../platform/uni/feedback";
import { createAuthCoordinator } from "../../application/auth-coordinator";
import { createSilentIdentityExchange } from "../../application/silent-login";
import { createContextFactory } from "../../application/request-context";
import { createVersionedStorage } from "../../infrastructure/storage/versioned";
import { createHttpClient } from "../../infrastructure/http/client";
import { createWxAuthRepository } from "../../infrastructure/repositories/wx-auth";
import { createUserInfoRepository } from "../../infrastructure/repositories/user-info";
import { createUserInfoStore } from "../../application/user-info-store";
import { createPhoneLoginFlow, toLocalUser } from "../../application/login-flow";
import { hapticTap } from "../../application/haptics";
import { syncTabBarSelected } from "../../application/tabbar";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import LoginPopup from "../../components/LoginPopup/LoginPopup.vue";
import ProfilePopup from "../../components/ProfilePopup/ProfilePopup.vue";
import BottomActionBarSecondary from "../../components/BottomActionBarSecondary/BottomActionBarSecondary.vue";

// —— 装配（同 index/demoDetail/priceList）——
const detected = detectUiPlatform();
const platform: Platform = isPlatform(detected) ? detected : "mp-weixin";
// 自定义 tabbar 仅微信端 ⇒ 底部占位仅微信需要（抖音原生 tab 不占页面区域，2026-09-19 主人反馈）
const isMpWeixin = platform === "mp-weixin";
const env = PROFILE.environment;
const transport = createUniTransport({ baseUrl: PROFILE.apiBases[env] });
const uniStorage = createUniStorage();
const versioned = createVersionedStorage({ backend: uniStorage, platform, profileKey: PROFILE.profileKey });
const userStore = createUserInfoStore({ backend: uniStorage });
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
const userInfoRepo = createUserInfoRepository({ client });
const ctxFactory = createContextFactory({
  platform,
  environment: env,
  profileKey: PROFILE.profileKey,
  appCode: PROFILE.appCode,
  getBrandId: () => versioned.loadBrandId(),
});
const phoneLoginFlow = createPhoneLoginFlow({
  wxAuth,
  authCoordinator,
  userStore,
  context: () => ctxFactory.next(),
  platform,
  profileKey: PROFILE.profileKey,
});

// 协议名（旧端 legal.uts:2-3：《${MINI_APP_NAME} 用户协议/隐私政策》，miniAppName 随 Profile）
const userAgreementName = `《${PROFILE.miniAppName} 用户协议》`;
const privacyPolicyName = `《${PROFILE.miniAppName} 隐私政策》`;

// —— 页面状态（旧端拆扁平基本类型字段，响应式可靠，:124-142）——
const loading = ref(true);
const userAvatarUrl = ref("");
const userNickname = ref("");
const isLoggedIn = ref(false);
interface MenuItem {
  title: string;
  linkUrl: string;
  needLogin: boolean;
  specialFont?: boolean;
}
const menuItems = ref<MenuItem[]>([]);
const showLoginPopup = ref(false);
const loginAgreementChecked = ref(false);
const showProfilePopup = ref(false);
const profileAvatarUrl = ref("");
const profileNickname = ref("");
const profileFromLogin = ref(false);

// 显示用头像：未登录恒 ''（旧端 :148-151）
const displayAvatar = computed(() => (isLoggedIn.value ? userAvatarUrl.value : ""));
// 显示用昵称三态（旧端 :153-157）
const displayNickname = computed(() => {
  if (!isLoggedIn.value) return "点击立即登陆";
  if (userNickname.value === "") return "点击获取用户信息";
  return userNickname.value;
});
// 副标题三态（旧端 :38）；未登录文案随 Profile（微信「登录后可收藏与体验AI试衣」/抖音「登录后可收藏」）
const userSub = computed(() => {
  if (!isLoggedIn.value) return PROFILE.features.mineHintText;
  return userNickname.value === "" ? "完善头像昵称，获得完整体验" : "欢迎回来，蓝梅云";
});

// 默认菜单（旧端 :216-221）＋Profile 功能块过滤（features.mineMenu：抖音只留 favorites，
// 2026-09-17 主人拍板；微信两项全留）——单一事实源＝profile 生成期 features，不再用 pageRegistry 推断
function getDefaultMenuItems(): MenuItem[] {
  const all: (MenuItem & { key: string })[] = [
    { key: "favorites", title: "我的喜欢", linkUrl: "/pages/favorites/index", needLogin: true },
    { key: "aiTryOnHistory", title: "AI试衣", linkUrl: "/pages/aiTryOnHistory/index", needLogin: true, specialFont: true },
  ];
  const allowed = PROFILE.features.mineMenu as readonly string[];
  return all.filter((m) => allowed.includes(m.key));
}

function updateLoginState(): void {
  isLoggedIn.value = versioned.loadSession() != null;
  const info = userStore.load();
  userAvatarUrl.value = info?.avatarUrl ?? "";
  userNickname.value = info?.nickname ?? "";
}

async function loadData(): Promise<void> {
  try {
    loading.value = true;
    updateLoginState();
    menuItems.value = getDefaultMenuItems();
  } catch (err) {
    console.error("[mine] 加载数据失败:", err);
    menuItems.value = getDefaultMenuItems();
  } finally {
    loading.value = false;
  }
}

onLoad(() => {
  void loadData();
});

onShow(() => {
  syncTabBarSelected(2);
  // 页面显示时刷新登录状态（旧端 :177）
  updateLoginState();
  // 兜底：已登录但本地缺头像 → 拉一次后端最新（旧端 :178-190）
  if (isLoggedIn.value && userAvatarUrl.value === "") {
    void (async () => {
      try {
        const res = await userInfoRepo.getUserInfo(ctxFactory.next());
        if (res.ok && res.value != null) {
          userStore.merge(toLocalUser(res.value as unknown as Record<string, unknown>));
          updateLoginState();
        }
      } catch (err) {
        console.warn("[mine.onShow] 拉取最新用户信息失败:", err);
      }
    })();
  }
});

function handleUserClick(): void {
  if (!isLoggedIn.value) {
    showLoginPopup.value = true; // 未登录 → 手机号登录弹窗
    return;
  }
  openProfilePopup(); // 已登录 → 头像昵称弹窗
}

function closeLoginPopup(): void {
  showLoginPopup.value = false;
  loginAgreementChecked.value = false;
}

function toggleLoginAgreement(): void {
  loginAgreementChecked.value = !loginAgreementChecked.value;
}

function showLoginAgreementToast(): void {
  toast("请先同意用户协议和隐私政策");
}

function openUserAgreement(): void {
  if (typeof uni !== "undefined" && typeof uni.navigateTo === "function") {
    uni.navigateTo({ url: "/pages/policies/user" });
  }
}

function openPrivacyPolicy(): void {
  if (typeof uni !== "undefined" && typeof uni.navigateTo === "function") {
    uni.navigateTo({ url: "/pages/policies/privacy" });
  }
}

// 手机号授权回调（旧端 :275-333）
async function onGetPhoneNumber(e: unknown): Promise<void> {
  if (!loginAgreementChecked.value) {
    showLoginAgreementToast();
    return;
  }
  const detail = ((e as { detail?: Record<string, unknown> })?.detail ?? {}) as {
    errMsg?: string;
    code?: string;
  };
  if (detail.errMsg != null && detail.errMsg !== "getPhoneNumber:ok") {
    if (detail.errMsg.includes("deny") || detail.errMsg.includes("cancel")) {
      toast("已取消授权");
    } else {
      console.error("[login] 手机号授权失败:", detail.errMsg);
      toast("授权失败，请重试");
    }
    return;
  }
  const phoneCode = detail.code;
  if (!phoneCode) {
    console.error("[login] 未获取到 phoneCode");
    toast("获取手机号失败，请检查小程序认证状态");
    return;
  }
  try {
    showLoading("登录中...");
    const result = await phoneLoginFlow.runPhoneLogin(phoneCode);
    hideLoading();
    if (!result.ok) {
      toast(result.errorKind === "login" ? "获取登录凭证失败，请重试" : result.errorMsg || "登录失败");
      return;
    }
    showLoginPopup.value = false;
    if (result.phoneHasFullProfile) {
      updateLoginState();
      toast("登录成功", "success");
    } else {
      profileFromLogin.value = true;
      openProfilePopup();
    }
  } catch (err) {
    console.error("[login] 手机号登录失败(catch):", err);
    hideLoading();
    toast("登录失败，请重试");
  }
}

function openProfilePopup(): void {
  const info = userStore.load();
  profileAvatarUrl.value = info?.avatarUrl ?? "";
  profileNickname.value = info?.nickname ?? "";
  showProfilePopup.value = true;
}

function onChooseAvatar(e: unknown): void {
  const url = (e as { detail?: { avatarUrl?: string } })?.detail?.avatarUrl;
  if (url) profileAvatarUrl.value = String(url);
}

// 昵称输入（模板内禁 TS 标注，提为具名方法；同 aiRecommend/aiTryOn 页 onProfileNicknameInput 写法）
function onProfileNicknameInput(value: string): void {
  profileNickname.value = value;
}

// 提交头像昵称：非空合并＋PUT（旧端 :354-390 乐观写入语义）
async function submitProfile(): Promise<void> {
  const nickname = (profileNickname.value || "").trim();
  const avatarUrl = profileAvatarUrl.value || "";
  if (nickname === "" && avatarUrl === "") {
    skipProfile();
    return;
  }
  // 乐观写入：保证后端响应不带 avatarUrl 时本地仍立即展示（旧端 :362-371）
  userStore.merge({
    id: 0,
    openid: "",
    phone: null,
    nickname: nickname !== "" ? nickname : null,
    avatarUrl: avatarUrl !== "" ? avatarUrl : null,
  });
  try {
    showLoading("更新中...");
    const res = await userInfoRepo.updateUserInfo(ctxFactory.next(), {
      nickname: nickname !== "" ? nickname : undefined,
      avatarUrl: avatarUrl !== "" ? avatarUrl : undefined,
    });
    hideLoading();
    if (!res.ok) {
      // 旧端 :380 result.errorMsg || '更新失败'——带后端 message（CR 🟡4）
      toast(res.error.message !== "" ? res.error.message : "更新失败");
    } else if (res.value != null) {
      userStore.merge(toLocalUser(res.value as unknown as Record<string, unknown>));
    }
  } catch (err) {
    console.error("更新头像昵称失败:", err);
    hideLoading();
    toast("更新失败，请重试");
  } finally {
    finishProfile();
  }
}

function skipProfile(): void {
  finishProfile();
}

function confirmLogout(): void {
  if (typeof uni !== "undefined" && typeof uni.showModal === "function") {
    uni.showModal({
      title: "确认退出登录",
      content: "退出后将清除当前账号登录状态",
      cancelText: "取消",
      confirmText: "确认",
      success: (res) => {
        if (res.confirm) doLogout();
      },
    });
  } else {
    doLogout();
  }
}

function doLogout(): void {
  authCoordinator.logout(); // 作废旧会话（P2-03，清 lm.session.v1）
  userStore.clear(); // 清用户信息（lm.userinfo.v1）
  // 验证期兼容：同步清 legacy 键——否则 versioned.loadSession 读旧 token 键会把会话"复活"
  //（旧端 logout 清 token+userInfo 两键，auth.uts:176-182；CR 🟡1）
  uniStorage.remove("token");
  uniStorage.remove("userInfo");
  showLoginPopup.value = false;
  showProfilePopup.value = false;
  loginAgreementChecked.value = false;
  updateLoginState();
  toast("已退出登录", "success");
}

// 关闭头像昵称弹窗并刷新（旧端 :417-428：仅登录流程拉起时才提示登录成功）
function finishProfile(): void {
  showProfilePopup.value = false;
  profileAvatarUrl.value = "";
  profileNickname.value = "";
  updateLoginState();
  if (profileFromLogin.value) {
    toast("登录成功", "success");
  }
  profileFromLogin.value = false;
}

function navigateToUrl(url: string): void {
  if (typeof uni === "undefined" || typeof uni.navigateTo !== "function") return;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    uni.navigateTo({ url: "/pages/webview/index?url=" + encodeURIComponent(url) });
  } else {
    uni.navigateTo({ url });
  }
}

// 菜单点击（旧端 :449-465：hapticTap＋needLogin 守卫）
function handleMenuClick(item: MenuItem): void {
  hapticTap();
  if (item.linkUrl) {
    if (item.needLogin && !isLoggedIn.value) {
      showLoginPopup.value = true;
      return;
    }
    navigateToUrl(item.linkUrl);
  } else {
    toast("功能开发中");
  }
}
</script>

<template>
  <view class="container">
    <view class="bg-aura"></view>
    <CustomNavBar title="我的" />
    <view v-if="loading" class="sk-wrap">
      <view class="sk-row">
        <view class="sk-avatar"></view>
        <view class="sk-text"></view>
      </view>
      <view class="sk-menu"></view>
    </view>
    <view v-else class="content">
      <view class="profile-group">
        <view class="user-card" hover-class="press-dim" @click="handleUserClick">
          <view class="user-card-glow"></view>
          <view class="avatar">
            <image v-if="displayAvatar !== ''" class="avatar-img" :src="displayAvatar" mode="aspectFill"></image>
          </view>
          <view class="user-info">
            <view class="nickname font-noto-serif">{{ displayNickname }}</view>
            <view class="user-sub">{{ userSub }}</view>
          </view>
          <image class="user-arrow" src="/static/iconpark/right.svg" mode="aspectFit"></image>
        </view>
        <view
          v-for="(item, index) in menuItems"
          :key="index"
          class="menu-row"
          hover-class="press-row"
          @click="handleMenuClick(item)"
        >
          <view class="menu-title font-noto-serif" :class="{ 'special-font': item.specialFont === true }">
            {{ item.title }}
          </view>
          <image class="menu-arrow" src="/static/iconpark/right.svg" mode="aspectFit"></image>
        </view>
      </view>
      <view v-if="isLoggedIn" class="logout-spacer"></view>
      <view class="footer-space"></view>
    </view>

    <LoginPopup
      v-if="showLoginPopup"
      :agreement-checked="loginAgreementChecked"
      :user-agreement-name="userAgreementName"
      :privacy-policy-name="privacyPolicyName"
      @close="closeLoginPopup"
      @toggle-agreement="toggleLoginAgreement"
      @show-toast="showLoginAgreementToast"
      @open-user="openUserAgreement"
      @open-privacy="openPrivacyPolicy"
      @get-phone="onGetPhoneNumber"
    />

    <ProfilePopup
      v-if="showProfilePopup"
      :avatar-url="profileAvatarUrl"
      :nickname="profileNickname"
      @choose-avatar="onChooseAvatar"
      @update-nickname="onProfileNicknameInput"
      @submit="submitProfile"
      @skip="skipProfile"
    />

    <BottomActionBarSecondary v-if="isLoggedIn" bottom-offset="calc(116rpx + env(safe-area-inset-bottom) + 24rpx)">
      <view class="logout-btn" hover-class="press-dim" @click.stop="confirmLogout">退出登录</view>
    </BottomActionBarSecondary>

    <view v-if="isMpWeixin" class="tabbar-safe-spacer"></view>
  </view>
</template>

<style lang="scss" scoped>
.container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: $color-page;
}
/* 顶部氛围光晕（旧端 :480-488 金色弥散） */
.bg-aura {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 640rpx;
  pointer-events: none;
  background: radial-gradient(
    ellipse 92% 62% at 50% 0%,
    rgba(241, 205, 145, 0.2),
    rgba(241, 205, 145, 0.06) 46%,
    rgba(255, 255, 255, 0) 78%
  );
}
.content {
  flex: 1;
  min-height: 0;
}
.sk-wrap {
  padding: 64rpx 32rpx 0;
}
.sk-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 40rpx;
}
.sk-avatar {
  width: 108rpx;
  height: 108rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08); /* 旧端全局 .sk-avatar（App.uvue:316）；2026-09-19 深色还原 */
}
.sk-text {
  width: 200rpx;
  height: 32rpx;
  margin-left: 24rpx;
  border-radius: 8rpx;
  background: rgba(255, 255, 255, 0.08); /* 旧端全局 .sk-text（App.uvue:283）；2026-09-19 深色还原 */
}
.sk-menu {
  height: 92rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.08); /* 旧端全局 .sk-menu（App.uvue:322）；2026-09-19 深色还原 */
}
/* 资料+功能列表合成一块（旧端 :503-509） */
.profile-group {
  margin: 32rpx 32rpx 0;
  border-radius: 24rpx;
  overflow: hidden;
  background: rgba(241, 205, 145, 0.06);
  border: 2rpx solid rgba(241, 205, 145, 0.12);
}
.user-card {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  min-height: 150rpx;
  padding: 0 28rpx;
  background: linear-gradient(
    135deg,
    rgba(241, 205, 145, 0.18),
    rgba(241, 205, 145, 0.06) 55%,
    rgba(241, 205, 145, 0.02)
  );
  overflow: hidden;
}
.user-card-glow {
  position: absolute;
  right: -60rpx;
  top: -40rpx;
  width: 260rpx;
  height: 260rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(241, 205, 145, 0.18), rgba(241, 205, 145, 0) 70%);
  pointer-events: none;
}
.avatar {
  width: 108rpx;
  height: 108rpx;
  border-radius: 50%;
  background: #333; /* 旧 :539 同值（头像占位底），2026-09-19 核对一致 */
  overflow: hidden;
  border: 2rpx solid rgba(241, 205, 145, 0.35);
}
.avatar-img {
  width: 100%;
  height: 100%;
  display: block;
}
.user-info {
  margin-left: 24rpx;
  flex: 1;
}
.nickname {
  font-size: $font-size-sub-title; /* 旧端 36rpx 精确 */
  font-weight: 400;
  color: $color-action;
  letter-spacing: 2rpx;
}
.user-sub {
  margin-top: 10rpx;
  font-size: 22rpx; /* 旧端 --font-size-body-sm=22rpx（token 粗化，硬编码还原，同 priceList CR 🟡1 口径） */
  color: rgba(241, 205, 145, 0.7);
  letter-spacing: 1rpx;
}
.user-arrow {
  width: 40rpx;
  height: 40rpx;
  opacity: 0.45;
  padding: 0 4rpx;
}
.menu-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  min-height: 92rpx;
  padding: 0 28rpx;
  border-top: 1rpx solid rgba(255, 255, 255, 0.06);
}
.menu-title {
  flex: 1;
  font-size: 28rpx; /* 旧端 --font-size-body-plus=28rpx（硬编码还原） */
  color: $color-action;
  font-weight: 400;
  letter-spacing: 1rpx;
}
/* AI试衣渐变字（旧端 :603-609） */
.special-font {
  /* 2026-09-20 主人反馈修复：渐变字（background-clip:text）在**微信小程序渲染器不支持** ⇒
     真机退化为首个渐变色 #ffb26f（橙金），与「我的喜欢」不一致 ⇒ 统一为品牌金 $color-action。
     旧端 uvue/webview 支持渐变，属**平台差异**（已登记 deviations）。 */
  color: $color-action;
}
.menu-arrow {
  width: 36rpx;
  height: 36rpx;
  opacity: 0.35;
  padding: 0 4rpx;
}
.logout-spacer {
  height: 200rpx;
}
/* 退出登录按钮（旧端 :616-632，view 实现避开 button 原生样式） */
.logout-btn {
  width: calc(100% - 64rpx);
  margin: 0 32rpx;
  height: 88rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  border-radius: 44rpx;
  background: rgba(255, 255, 255, 0.08);
  color: #ff6b6b;
  font-size: 28rpx;
  font-weight: 400;
  border: 2rpx solid rgba(255, 107, 107, 0.45);
}
.footer-space {
  height: 48rpx;
}
</style>
