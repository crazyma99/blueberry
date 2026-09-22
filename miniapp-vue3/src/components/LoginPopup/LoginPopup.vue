<script setup lang="ts">
import BasePopup from "../../ui/BasePopup.vue";
// LoginPopup — 手机号快捷登录弹窗（全局居中弹窗 · 品牌视觉统一）
// 旧端源：/home/majunhi/blueberry/src/components/LoginPopup/LoginPopup.uvue（198 行）
// 忠实移植：模板 :9-47；props :52-65；emits :66；样式 :75-198。
//
// 视觉：居中卡片 + 顶部金色氛围光 + Noto Serif 金色标题 + 自绘勾选 + 渐变主按钮 + 弹入动画。
// 交互：emit 事件交回页面既有 handler（业务逻辑完全不变）。
// 事件：@close 关闭；@toggle-agreement 协议勾选；@show-toast 未勾选提示；
//       @open-user @open-privacy 协议链接；@get-phone 一键登录(getPhoneNumber 回调，透传原始事件对象)。
//
// 平台差异（已知，保留原样不降级）：getPhoneNumber/chooseAvatar 为 MP-WEIXIN 专属 button
// open-type；抖音端 button open-type 不可用属已知平台差异，本组件照旧端原样保留（不自行降级改行为）。
//
// token 映射（旧端 App.uvue 全局变量 → 新端 tokens.ts / 硬编码）：
//   --color-primary #F1CD91   → v-bind("tokens.semantic.colorAction")（同值）
//   --color-bg #160F04        → v-bind("tokens.semantic.colorActionText")（同值，金色面上的墨色文字/对勾）
//   --gradient-btn-primary    → 硬编码 linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%)
//   --color-popup-card #262626→ 硬编码 #262626（tokens 无该深色卡片档）
//   --radius-2xl 48rpx / --radius-full 999rpx → 硬编码（tokens.component.popupRadiusRpx=24rpx 为不同档位）
//   --font-size-body-plus 28rpx / -body-sm 22rpx / -body-xs 20rpx → 硬编码（tokens 无对应档位）
// 注意：.font-noto-serif / .btn-primary / .press-dim 旧端为 App.uvue 全局类；新端 App.vue 全局样式
// 已补齐（与旧端逐字一致），本组件仅引用不定义（2026-09-18 删除迁移期 scoped 临时副本）。

withDefaults(
  defineProps<{
    agreementChecked?: boolean;
    userAgreementName?: string;
    privacyPolicyName?: string;
  }>(),
  { agreementChecked: false, userAgreementName: "用户协议", privacyPolicyName: "隐私政策" },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "toggle-agreement"): void;
  (e: "show-toast"): void;
  (e: "open-user"): void;
  (e: "open-privacy"): void;
  (e: "get-phone", event: unknown): void;
}>();
</script>

<template>
  <!-- 2026-09-22 主人第③项：弹窗统一走 **wot Popup 门面** `ui/BasePopup`（内部＝wot `wd-popup`）；遮罩点击关闭由门面 `cancel` 转发 -->
  <BasePopup :show="true" position="center" @cancel="emit('close')">
    <view class="login-card font-harmony">
      <!-- 顶部氛围光 -->
      <view class="card-aura"></view>
      <view class="card-title font-noto-serif">手机号快捷登陆</view>
      <view class="card-desc">登录后可使用收藏与 AI 试衣</view>

      <!-- 协议勾选（自绘） -->
      <view class="agreement-row" @click="emit('toggle-agreement')">
        <view :class="agreementChecked ? 'agreement-check is-checked' : 'agreement-check'">
          <view v-if="agreementChecked" class="agreement-mark"></view>
        </view>
        <text class="agreement-text">
          <text>登录即代表同意 </text>
          <text class="agreement-link" @click.stop="emit('open-user')">{{ userAgreementName }}</text>
          <text>、</text>
          <text class="agreement-link" @click.stop="emit('open-privacy')">{{ privacyPolicyName }}</text>
        </text>
      </view>

      <!-- 一键登录 -->
      <button
        v-if="agreementChecked"
        class="login-btn btn-primary"
        open-type="getPhoneNumber"
        @getphonenumber="emit('get-phone', $event)"
      >一键登录</button>
      <button
        v-else
        class="login-btn btn-primary"
        hover-class="press-dim"
        @click="emit('show-toast')"
      >一键登录</button>

      <view class="login-skip" hover-class="press-dim" @click="emit('close')">暂不登陆</view>
    </view>
    </BasePopup>
</template>
<style lang="scss" scoped>
/* 遮罩 + 渐显（全屏：vw/vh 撑满，微信不支持 inset） */
@keyframes overlayFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 居中卡片 */
.login-card {
  position: relative;
  width: 620rpx;
  background: #262626; /* 旧 var(--color-popup-card) #262626（App.uvue :90） */
  border-radius: 48rpx; /* 旧 var(--radius-2xl) 48rpx（App.uvue :104） */
  padding: 56rpx 48rpx 44rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
  animation: cardPopIn 0.28s ease-out;
}
@keyframes cardPopIn {
  from { opacity: 0; transform: scale(0.92) translateY(24rpx); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

/* 顶部金色氛围光 */
.card-aura {
  position: absolute;
  top: -100rpx;
  left: 50%;
  width: 420rpx;
  height: 220rpx;
  margin-left: -210rpx;
  background: radial-gradient(ellipse 50% 50% at 50% 50%, rgba(241, 205, 145, 0.2), rgba(241, 205, 145, 0) 70%);
  pointer-events: none;
}

.card-title {
  font-size: 40rpx;
  font-weight: 400;
  color: $color-action; /* 旧 var(--color-primary) #F1CD91 */
  margin-bottom: 12rpx;
}

.card-desc {
  font-size: 22rpx; /* 旧 var(--font-size-body-sm) 22rpx */
  color: rgba(255, 255, 255, 0.45);
  margin-bottom: 40rpx;
}

/* 协议勾选 */
.agreement-row {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  margin-bottom: 40rpx;
}
.agreement-check {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  border: 2rpx solid rgba(255, 255, 255, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16rpx;
  transition: all 0.15s ease-out;
}
.agreement-check.is-checked {
  border-color: $color-action; /* 旧 var(--color-primary) */
  background: linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%); /* 旧 var(--gradient-btn-primary) */
}
/* 选中对勾（CSS 画勾：两条边框旋转 45 度） */
.agreement-mark {
  width: 18rpx;
  height: 10rpx;
  border-left: 4rpx solid $color-action-text; /* 旧 var(--color-bg) #160F04 */
  border-bottom: 4rpx solid $color-action-text;
  transform: rotate(-45deg) translate(1rpx, -2rpx);
}
.agreement-text {
  flex: 1;
  font-size: 20rpx; /* 旧 var(--font-size-body-xs) 20rpx */
  color: rgba(255, 255, 255, 0.55);
  word-break: break-all;
  line-height: 1.5;
}
.agreement-link {
  color: $color-action; /* 旧 var(--color-primary) */
}

/* 一键登录 */
.login-btn {
  width: 100%;
  height: 92rpx;
  font-size: 28rpx; /* 旧 var(--font-size-body-plus) 28rpx */
}
.login-btn::after {
  border: none;
}

/* 暂不登陆 */
.login-skip {
  margin-top: 32rpx;
  padding: 12rpx 40rpx;
  font-size: 22rpx; /* 旧 var(--font-size-body-sm) 22rpx */
  color: rgba(255, 255, 255, 0.4);
  transition: opacity 0.15s ease-out;
}
</style>
