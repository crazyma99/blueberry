<script setup lang="ts">
// ProfilePopup — 完善个人资料弹窗（全局居中弹窗 · 与 LoginPopup 品牌视觉一致）
// 旧端源：/home/majunhi/blueberry/src/components/ProfilePopup/ProfilePopup.uvue（195 行）
// 忠实移植：模板 :9-38；props :43-52；emits :53；样式 :62-195。
//
// 视觉：居中卡片 + 顶部金色氛围光 + Noto Serif 金色标题 + 头像金描边角标
//       + 深色输入面板 + 渐变主按钮 + 弹入动画。
// 交互：emit 事件交回页面既有 handler（业务逻辑完全不变）。
// 事件：@choose-avatar 头像选择（透传 open-type="chooseAvatar" 原始事件对象，detail.avatarUrl）；
//       @update-nickname 昵称输入（string）；@submit 确认；@skip 跳过/遮罩关闭。
//
// ⚠️ 有意偏差（AppInput 未移植）：旧端模板 :25-32 引用 <AppInput>（独立组件，本批次未移植）。
// 按「模板/样式照搬 + 不发明新交互」纪律，此处将 AppInput.uvue 的结构（label/value/placeholder/
// maxLength/focus 描边/@input 发 string）与样式（:42-72）就地内联还原；待 AppInput 组件移植后
// 应替换回 <AppInput>（页头已声明，避免伪装完成度）。
//
// 平台差异（已知，保留原样不降级）：chooseAvatar 为 MP-WEIXIN 专属 button open-type；
// 抖音端不可用属已知平台差异，照旧端原样保留。
//
// token 映射与 LoginPopup 同口径（详见其页头）：金色 → tokens.semantic.colorAction；
// 墨色 → tokens.semantic.colorActionText；深色卡片/渐变/字号档位 → 硬编码并注释。
import { ref } from "vue";
import BasePopup from "../../ui/BasePopup.vue";

/** 🟡CR3：`placeholder-class` 在 scoped 下**永不命中**（基座自造 class，不带 data-v）⇒ 改内联 style（含字体，见 🔴1） */
const PLACEHOLDER_STYLE = "font-family:'HarmonyOS-Sans-SC';color:rgba(255,255,255,0.35)";

withDefaults(
  defineProps<{
    avatarUrl?: string;
    nickname?: string;
  }>(),
  { avatarUrl: "", nickname: "" },
);

const emit = defineEmits<{
  (e: "choose-avatar", event: unknown): void;
  (e: "update-nickname", value: string): void;
  (e: "submit"): void;
  (e: "skip"): void;
}>();

// 内联 AppInput 的聚焦态（旧 AppInput.uvue :31-32 data.focused；@focus/@blur 切换金描边）
const inputFocused = ref(false);

// 昵称输入（模板内不能写 TS as 断言，统一在方法里收窄；uni input 事件 detail.value 为 string）
function onNicknameInput(e: unknown): void {
  const value = (e as { detail?: { value?: unknown } })?.detail?.value;
  emit("update-nickname", typeof value === "string" ? value : "");
}
</script>

<template>
  <!-- 2026-09-22 主人两项：①「完善个人资料」弹窗文字须为 HarmonyOS Sans（本仓 HarmonyOS 靠全局类 `.font-harmony`，
       默认仍是系统字体）⇒ 容器挂类、所有文案继承（标题 font-noto-serif 优先）；②弹窗统一走 **wot Popup 门面** `ui/BasePopup`
       （内部＝wot `wd-popup`，遮罩点击关闭由门面 `cancel` 转发为 `skip`，业务组件零 `wd-*` 直用）。 -->
  <BasePopup :show="true" position="bottom" :z-index="1200" @cancel="emit('skip')">
    <view class="profile-card font-harmony">
      <!-- 顶部氛围光 -->
      <view class="card-aura"></view>
      <view class="card-title font-noto-serif">完善个人资料</view>
      <view class="card-desc">设置头像和昵称以获得完整体验</view>

      <!-- 头像选择 -->
      <button class="avatar-btn" open-type="chooseAvatar" @chooseavatar="emit('choose-avatar', $event)">
        <image class="avatar-img" :src="avatarUrl || '/static/iconpark/mine.svg'" mode="aspectFill"></image>
        <view class="avatar-badge">+</view>
        <text class="avatar-tip">点击选择头像</text>
      </button>

      <!-- 昵称输入（内联 AppInput，见页头有意偏差声明；外层控制与下方按钮间距） -->
      <view class="input-wrap">
        <view class="app-input" :class="{ 'is-focused': inputFocused }">
          <text class="app-input-label">昵称</text>
          <input
            class="app-input-field"
            :value="nickname"
            placeholder="请输入昵称"
            :maxlength="60"
            :placeholder-style="PLACEHOLDER_STYLE"
            @focus="inputFocused = true"
            @blur="inputFocused = false"
            @input="onNicknameInput"
          />
        </view>
      </view>

      <button class="confirm-btn btn-primary" hover-class="press-dim" @click="emit('submit')">确认</button>
      <view class="profile-skip" hover-class="press-dim" @click="emit('skip')">跳过</view>
    </view>
  </BasePopup>
</template>

<style lang="scss" scoped>

/* 居中卡片（与 LoginPopup login-card 同款视觉） */
.profile-card {
  position: relative;
  box-sizing: border-box; /* 修：width:100%+左右 padding 在 content-box 下会溢出屏幕（主人报「内容比弹窗宽」） */
  padding-bottom: calc(32rpx + constant(safe-area-inset-bottom)); /* 底部安全区（两端通用，非 CSS 变量） */
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
  width: 100%; /* 底部弹层：通栏（面/圆角/安全区由 wot 弹层承载） */
  background: $color-popup-card; /* 面色=**主题 token**（旧端 --color-popup-card 同值）；不依赖 CSS 变量 ⇒ 微信/抖音同源 */ /* 旧 var(--color-popup-card) #262626（App.uvue :90） */
  border-radius: #{$popup-radius-rpx * 2}rpx #{$popup-radius-rpx * 2}rpx 0 0; /* 底部弹层上圆角（token 档位） */ /* 旧 var(--radius-2xl) 48rpx（App.uvue :104） */
  padding: 56rpx 48rpx 44rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
  /* 底部弹层用 wot `position=bottom` 自带上滑过渡，不再叠加卡片缩放动画 */

  font-family: 'HarmonyOS-Sans-SC'; /* 组件样式隔离（默认 isolated）⇒ app.wxss 的 page/.font-harmony 进不来，必须自带 */}
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

  font-family: 'NotoSerifSC-Bold'; /* 同上：组件内自带衬线，不依赖全局类 */}

.card-desc {
  font-size: 22rpx; /* 旧 var(--font-size-body-sm) 22rpx */
  color: rgba(255, 255, 255, 0.45);
  margin-bottom: 36rpx;
}

/* 头像 */
.avatar-btn {
  position: relative;
  background: transparent;
  border: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 32rpx;
  padding: 0 20rpx;
  width: 180rpx;
  box-sizing: border-box;
  line-height: normal;
}
.avatar-btn::after {
  border: none;
}
.avatar-img {
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
  border: 3rpx solid $color-action; /* 旧 var(--color-primary) */
  background: rgba(255, 255, 255, 0.08);
}
.avatar-badge {
  position: absolute;
  right: 24rpx;
  bottom: 30rpx;
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%); /* 旧 var(--gradient-btn-primary) */
  color: $color-action-text; /* 旧 var(--color-bg) #160F04 */
  font-size: 26rpx;
  font-weight: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid #262626; /* 旧 var(--color-popup-card) #262626 */
}
.avatar-tip {
  margin-top: 14rpx;
  font-size: 20rpx; /* 旧 var(--font-size-body-xs) 20rpx */
  color: rgba(255, 255, 255, 0.45);
}

/* 输入框间距（使用方控制，组件不带外距） */
.input-wrap {
  width: 100%;
  margin-bottom: 36rpx;
}

/* —— 以下为内联 AppInput 样式（旧 AppInput.uvue :42-72 就地还原，待组件移植后移除）—— */
.app-input {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  background: rgba(255, 255, 255, 0.06);
  border: 2rpx solid rgba(255, 255, 255, 0.12);
  border-radius: 18rpx; /* 旧 var(--radius-item) 18rpx */
  padding: 0 24rpx;
  height: 88rpx;
  box-sizing: border-box;
  transition: border-color 0.15s ease-out;
}
.app-input.is-focused {
  border-color: $color-action; /* 旧 var(--color-primary) */
}
.app-input-label {
  font-size: 24rpx; /* 旧 var(--font-size-body) 24rpx */
  color: $color-action; /* 旧 var(--color-primary) */
  margin-right: 20rpx;
}
.app-input-field {
  /* 🔴CR1（2026-09-22）：小程序 `<input>` **不继承**父级/容器 font-family（基座对 wx-input 硬编码 UICTFontTextStyleBody）
     ⇒ 必须在元素自身声明；与仓内先例 `pages/demoDetail:474-476`／`pages/favorites:364-365` 同法 */
  font-family: 'HarmonyOS-Sans-SC';
  flex: 1;
  font-size: 24rpx; /* 旧 var(--font-size-body) 24rpx */
  color: #fff;
}

/* 确认 + 跳过 */
.confirm-btn {
  width: 100%;
  height: 92rpx;
  font-size: 28rpx; /* 旧 var(--font-size-body-plus) 28rpx */
}
.confirm-btn::after {
  border: none;
}
.profile-skip {
  margin-top: 28rpx;
  padding: 10rpx 40rpx;
  font-size: 22rpx; /* 旧 var(--font-size-body-sm) 22rpx */
  color: rgba(255, 255, 255, 0.4);
  transition: opacity 0.15s ease-out;
}
</style>
