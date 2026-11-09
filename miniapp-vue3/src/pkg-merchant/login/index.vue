<script setup lang="ts">
// 商家登录页（issue #14 · M1）：商家专属小程序码直接落地于此（page 参数由后端生成码时指定）。
// 用户名 + 密码 → `POST /auth/login`（后端零改动）。失败是 HTTP200+code=500（文案原样展示）、限流 HTTP429、无 refresh/logout；
// 角色闸：只放行 merchant 及带 merchantId 的运营类角色，其余提示无权限（被拒账号不落盘任何会话）。
// 登录成功 reLaunch 到工作台；已登录再进本页（如再次扫码）直接进工作台，不让商家重复输密码。
// 密码只存在于本页内存：不入存储、不打印、不进错误文案。
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import PageFooter from "../../components/PageFooter/PageFooter.vue";
import { useMerchantFooter } from "../composables/use-merchant-footer";
import BaseFeedback from "../../ui/BaseFeedback.vue";
import { toast as nativeToast } from "../../platform/uni/feedback";
import { getMerchantRuntime } from "../application/merchant-runtime";
import { hapticTap } from "../../application/haptics";
import { MERCHANT_HOME_URL } from "../../domain/merchant-entry";

const rt = getMerchantRuntime();
const footer = useMerchantFooter();
const username = ref("");
const password = ref("");
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
    password.value = ""; // 成功后立刻清掉内存里的密码
    toast("登录成功");
    enterHome();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <view class="container">
    <CustomNavBar title="商家登录" transparent />
    <view class="card">
      <text class="title">商家登录</text>
      <text class="sub">请使用商家后台账号登录</text>
      <view class="form-row">
        <text class="form-label">账号</text>
        <input class="form-input" v-model="username" placeholder="请输入用户名" maxlength="64" :disabled="busy" />
      </view>
      <view class="form-row">
        <text class="form-label">密码</text>
        <input class="form-input" v-model="password" password placeholder="请输入密码" maxlength="64" :disabled="busy" confirm-type="done" @confirm="onSubmit" />
      </view>
      <text v-if="errorText" class="error">{{ errorText }}</text>
      <view :class="busy ? 'submit is-busy' : 'submit'" hover-class="press-dim" @click="onSubmit">
        <text class="submit-text">{{ busy ? "登录中..." : "登录" }}</text>
      </view>
    </view>
    <PageFooter main-line="" :support-line="footer.supportLine.value" variant="bottomdesc" />
    <BaseFeedback ref="feedbackRef" />
  </view>
</template>

<style lang="scss" scoped>
.container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: $color-page;
}
.card {
  margin: 48rpx 32rpx;
  padding: 48rpx 32rpx;
  border-radius: 24rpx;
  background: $color-popup-card;
  display: flex;
  flex-direction: column;
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
</style>
