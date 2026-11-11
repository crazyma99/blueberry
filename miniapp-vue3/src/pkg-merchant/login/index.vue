<script setup lang="ts">
// 商家登录页（issue #14 · M1；2026-11 视觉升级 + 记住账号 + 键盘避让 + 分享）：商家专属小程序码直接落地于此（page 参数由后端生成码时指定）。
// 用户名 + 密码 → `POST /auth/login`（后端零改动）。失败是 HTTP200+code=500（文案原样展示）、限流 HTTP429、无 refresh/logout；
// 角色闸：只放行 merchant 及带 merchantId 的运营类角色，其余提示无权限（被拒账号不落盘任何会话）。
// 登录成功 reLaunch 到工作台；已登录再进本页（如再次扫码）直接进工作台，不让商家重复输密码。
// 密码只存在于本页内存：不入存储、不打印、不进错误文案；成功后立即清空。仅「用户名」可记住（商家命名空间键，见 domain/merchant-login-ui）。
// 视觉：纯 CSS 背景层次（顶部金色光晕 + 底部微光 + 极淡斜纹）+ 服务端 darkmode SVG logo（分包内）+ 半透明金边卡片（不依赖 backdrop-filter）。
// 键盘避让：输入框 adjust-position + cursor-spacing；页面根为纵向 scroll-view，小屏 + 键盘时可滚动。
// 分享：好友（onShareAppMessage）+ 朋友圈（onShareTimeline）+ 页内「分享给同事」按钮；卡片键 merchantLogin，三层兜底，失败静默回落默认。
import { ref } from "vue";
import { onShareAppMessage, onShareTimeline, onShow } from "@dcloudio/uni-app";
import { INPUT_PLACEHOLDER_STYLE } from "../../ui/field-theme";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import PageFooter from "../../components/PageFooter/PageFooter.vue";
import { useMerchantFooter } from "../composables/use-merchant-footer";
import { useMerchantShare } from "../composables/use-merchant-share";
import BaseFeedback from "../../ui/BaseFeedback.vue";
import { toast as nativeToast } from "../../platform/uni/feedback";
import { createUniStorage } from "../../platform/uni/storage";
import { getMerchantRuntime } from "../application/merchant-runtime";
import { hapticTap } from "../../application/haptics";
import { SLOGAN_DEFAULT } from "../../application/page-config-content";
import { PROFILE } from "../../generated/profile.config";
import { MERCHANT_HOME_URL, MERCHANT_LOGIN_URL } from "../../domain/merchant-entry";
import { createLastLoginNameStore, LOGIN_CURSOR_SPACING } from "../domain/merchant-login-ui";

const rt = getMerchantRuntime();
const footer = useMerchantFooter();
const nameStore = createLastLoginNameStore(createUniStorage());
const share = useMerchantShare(MERCHANT_LOGIN_URL);

// 分包静态资源：uni 约定 `<subpackage root>/static/` 原样拷贝进该分包；引用写全路径。放在 script 常量里（而非模板字面量）避免 Vite 把绝对路径当模块去解析。
const LOGO_SRC = "/pkg-merchant/static/darkmode_web_logo.svg";
const BRAND_NAME = PROFILE.brandName;
const SLOGAN = SLOGAN_DEFAULT;

const remembered = nameStore.load();
const username = ref(remembered);
const password = ref("");
/** 有记住的账号时焦点直接落在密码框（只在首次渲染时聚焦一次） */
const focusPassword = ref(remembered !== "");
const busy = ref(false);
const errorText = ref("");

const feedbackRef = ref<InstanceType<typeof BaseFeedback> | null>(null);
function toast(text: string): void {
  const f = feedbackRef.value;
  if (f != null) f.show(text);
  else nativeToast(text);
}

function enterHome(): void {
  if (typeof uni !== "undefined" && typeof uni.reLaunch === "function") uni.reLaunch({ url: MERCHANT_HOME_URL });
}

onShow(() => {
  if (rt.getState().loggedIn) enterHome();
});

// 分享：好友 / 朋友圈。解析在 onLoad 之后异步完成，分享对象取「当前已解析的卡片」（未解析好则为默认标题 + 空图），绝不抛错
onShareAppMessage(() => share.appMessage());
onShareTimeline(() => share.timeline());

async function onSubmit(): Promise<void> {
  if (busy.value) return;
  hapticTap();
  errorText.value = "";
  busy.value = true;
  try {
    const r = await rt.login(username.value, password.value);
    if (!r.ok) {
      errorText.value = r.message;
      return;
    }
    nameStore.save(username.value); // 只记用户名（trim 后非空才存）；密码绝不落盘
    password.value = ""; // 成功后立刻清掉内存里的密码
    toast("登录成功");
    enterHome();
  } finally {
    busy.value = false;
  }
}

/** 「不是我的账号？清除」：清空输入与存储，焦点回账号框 */
function onForget(): void {
  hapticTap();
  nameStore.clear();
  username.value = "";
  password.value = "";
  focusPassword.value = false;
  errorText.value = "";
}
</script>

<template>
  <view class="container">
    <view class="bg-glow-top" />
    <view class="bg-glow-bottom" />
    <view class="bg-stripes" />
    <CustomNavBar title="商家登录" transparent />
    <scroll-view scroll-y class="scroller" :show-scrollbar="false">
      <view class="content">
        <view class="brand">
          <image class="brand-logo" :src="LOGO_SRC" mode="aspectFit" />
          <text class="brand-name">{{ BRAND_NAME }}</text>
          <text class="brand-slogan">{{ SLOGAN }}</text>
        </view>
        <view class="card">
          <text class="title">商家登录</text>
          <text class="sub">请使用商家后台账号登录</text>
          <view class="form-row">
            <text class="form-label">账号</text>
            <input
              class="form-input"
              v-model="username"
              placeholder="请输入用户名"
              :placeholder-style="INPUT_PLACEHOLDER_STYLE"
              maxlength="64"
              :disabled="busy"
              :adjust-position="true"
              :cursor-spacing="LOGIN_CURSOR_SPACING"
            />
          </view>
          <view class="form-row">
            <text class="form-label">密码</text>
            <input
              class="form-input"
              v-model="password"
              password
              placeholder="请输入密码"
              :placeholder-style="INPUT_PLACEHOLDER_STYLE"
              maxlength="64"
              :disabled="busy"
              :focus="focusPassword"
              :adjust-position="true"
              :cursor-spacing="LOGIN_CURSOR_SPACING"
              confirm-type="done"
              @confirm="onSubmit"
            />
          </view>
          <view v-if="remembered !== '' && username === remembered" class="forget" hover-class="press-dim" @click="onForget">
            <text class="forget-text">不是我的账号？清除</text>
          </view>
          <text v-if="errorText" class="error">{{ errorText }}</text>
          <view :class="busy ? 'submit is-busy' : 'submit'" hover-class="press-dim" @click="onSubmit">
            <text class="submit-text">{{ busy ? "登录中..." : "登录" }}</text>
          </view>
          <button class="share-btn" open-type="share" hover-class="press-dim">分享给同事</button>
        </view>
        <PageFooter main-line="" :support-line="footer.supportLine.value" variant="bottomdesc" />
      </view>
    </scroll-view>
    <BaseFeedback ref="feedbackRef" />
  </view>
</template>

<style lang="scss" scoped>
.container {
  position: relative;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: $color-page;
}
/* 背景层次（纯 CSS，零图片）：顶部径向金光晕 + 底部微光 + 极淡斜纹；均为 rgba，取色同 token 金（#F1CD91 = 241,205,145） */
.bg-glow-top {
  position: absolute;
  top: -200rpx;
  left: 0;
  right: 0;
  height: 760rpx;
  background: radial-gradient(ellipse at 50% 0%, rgba(241, 205, 145, 0.26) 0%, rgba(241, 205, 145, 0.08) 45%, rgba(241, 205, 145, 0) 72%);
  pointer-events: none;
}
.bg-glow-bottom {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -160rpx;
  height: 520rpx;
  background: radial-gradient(ellipse at 50% 100%, rgba(241, 205, 145, 0.12) 0%, rgba(241, 205, 145, 0) 70%);
  pointer-events: none;
}
.bg-stripes {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: repeating-linear-gradient(135deg, rgba(241, 205, 145, 0.035) 0, rgba(241, 205, 145, 0.035) 2rpx, rgba(241, 205, 145, 0) 2rpx, rgba(241, 205, 145, 0) 36rpx);
  pointer-events: none;
}
.scroller {
  position: relative;
  flex: 1;
  min-height: 0;
}
.content {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56rpx 32rpx 8rpx;
}
.brand-logo {
  width: 150rpx;
  height: 263rpx;
}
.brand-name {
  margin-top: 20rpx;
  font-size: $font-size-title;
  letter-spacing: 8rpx;
  color: $color-action;
}
.brand-slogan {
  margin-top: 12rpx;
  font-size: $font-size-caption;
  letter-spacing: 2rpx;
  color: $color-text-secondary;
}
.card {
  margin: 40rpx 32rpx 48rpx;
  padding: 48rpx 32rpx 40rpx;
  border-radius: 24rpx;
  background: rgba(38, 38, 38, 0.82);
  border: 2rpx solid rgba(241, 205, 145, 0.32);
  box-shadow: inset 0 0 40rpx rgba(241, 205, 145, 0.06), 0 16rpx 48rpx rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  animation: login-card-in 240ms ease-out both;
}
@keyframes login-card-in {
  from {
    opacity: 0;
    transform: translateY(24rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.title {
  font-size: $font-size-title;
  color: $color-action;
  margin-bottom: 8rpx;
}
.sub {
  font-size: $font-size-caption;
  color: $color-text-secondary;
  margin-bottom: 40rpx;
}
.form-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 24rpx 0;
  border-bottom: 2rpx solid $color-divider;
}
.form-label {
  width: 120rpx;
  flex-shrink: 0;
  font-size: $font-size-body;
  color: $color-text-secondary;
}
.form-input {
  flex: 1;
  font-size: $font-size-body;
  color: $color-text-primary;
}
.forget {
  align-self: flex-end;
  padding: 16rpx 0 0;
}
.forget-text {
  font-size: $font-size-caption;
  color: $color-text-muted;
  text-decoration: underline;
}
.error {
  margin-top: 24rpx;
  font-size: $font-size-caption;
  color: #ff6b6b;
}
.submit {
  margin-top: 48rpx;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%);
}
.submit.is-busy {
  opacity: 0.6;
}
.submit-text {
  font-size: $font-size-body;
  color: $color-action-text;
}
/* <button> 默认样式重置：去默认背景/边框/内边距/外边距与 ::after 描边；金描边次按钮（同 .btn-secondary 口径） */
.share-btn {
  margin: 24rpx 0 0;
  padding: 0;
  height: 80rpx;
  line-height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: rgba(241, 205, 145, 0.1);
  border: 2rpx solid rgba(241, 205, 145, 0.5);
  font-size: $font-size-body;
  color: $color-action;
}
.share-btn::after {
  border: none;
}
</style>
