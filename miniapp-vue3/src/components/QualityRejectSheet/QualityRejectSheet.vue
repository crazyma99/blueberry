<script setup lang="ts">
// QualityRejectSheet — AI 试衣「上传照片质量拦截」（后端 `code=4002`）提示弹层。
//
// 2026-09-23 主人指示：①直接使用**底部弹层**（复用既有 `ui/BasePopup` 门面）②**要接 Tokens** ③未知识别码文案＝「换一张照片试试吧」；
// 契约来源：后端 `docs/api-tryon-photo-gate.md` v1.0（仅首次创建任务；**拦截在扣次前 ⇒ 不扣次数/不扣费**；fail-open；未知码须兜底）。
// 门面纪律：业务组件零 `wd-*` 直用；样式走 token（`$color-*`／`$space-*`／`$font-size-*`／`$popup-radius-rpx` 由 vite additionalData 注入）；
// 组件样式隔离（微信默认 `isolated`）⇒ **字体须在组件内显式声明**（沿弹窗族既有结论）。
import { computed } from "vue";
import BasePopup from "../../ui/BasePopup.vue";
import { PHOTO_GATE_ACCEPT_ASSET, resolvePhotoGateCopy } from "../../application/photo-gate";

const props = withDefaults(
  defineProps<{
    /** 弹层显隐（受控） */
    show?: boolean;
    /** 后端 `data.check_code`（未知码走兜底文案且只展示正例） */
    code?: string;
    /** 文案覆盖（端侧拦截用：无对应 4 码时保留端侧原话，避免指错方向）；留空则用该码的契约文案 */
    titleOverride?: string;
    textOverride?: string;
  }>(),
  { show: false, code: "unknown", titleOverride: "", textOverride: "" },
);

const emit = defineEmits<{
  (e: "retry"): void;
  (e: "close"): void;
}>();

const base = computed(() => resolvePhotoGateCopy(props.code));
const copy = computed(() => ({
  ...base.value,
  title: props.titleOverride !== "" ? props.titleOverride : base.value.title,
  text: props.textOverride !== "" ? props.textOverride : base.value.text,
}));
</script>

<template>
  <!-- 底部弹层：门面内部走 wot `wd-popup`（position=bottom）；z-index 显式 2000（＝仓内底部弹层惯例档，同 LoginPopup/ProfilePopup）；
       `root-portal=false` 与同页两弹层同口径（AI 试衣页非 tab 页，当前不触发失效，仍显式声明以免日后迁移踩坑） -->
  <BasePopup :show="show" position="bottom" :root-portal="false" :z-index="2000" @cancel="emit('close')">
    <view class="qr-sheet">
      <text class="qr-title">{{ copy.title }}</text>
      <text class="qr-text">{{ copy.text }}</text>

      <!-- 正反例对比：左 ✓ 合格示例，右 ✗ 本次问题（未知码无反例 ⇒ 只展示正例） -->
      <view class="qr-compare">
        <view class="qr-case">
          <image class="qr-img" :src="PHOTO_GATE_ACCEPT_ASSET" mode="aspectFill"></image>
          <text class="qr-badge qr-badge--ok">✓ 合格示例</text>
        </view>
        <view v-if="copy.rejectAsset" class="qr-case">
          <image class="qr-img" :src="copy.rejectAsset" mode="aspectFill"></image>
          <text class="qr-badge qr-badge--bad">✗ 本次问题</text>
        </view>
      </view>

      <!-- 安抚：拦截发生在扣次之前 ⇒ 不扣次数（契约 §5.3；不得出现「已退次」类文案） -->
      <text class="qr-note">本次未消耗试衣次数</text>

      <view class="qr-actions">
        <view class="qr-btn qr-btn--primary" @click="emit('retry')">
          <text class="qr-btn-text qr-btn-text--primary">重新选择照片</text>
        </view>
        <view class="qr-btn qr-btn--ghost" @click="emit('close')">
          <text class="qr-btn-text qr-btn-text--ghost">知道了</text>
        </view>
      </view>
    </view>
  </BasePopup>
</template>

<style scoped lang="scss">
.qr-sheet {
  /* 组件样式隔离 ⇒ 字体自带（不依赖全局类/页面继承） */
  font-family: 'HarmonyOS-Sans-SC';
  box-sizing: border-box;
  width: 100%;
  /* 卡片面（🔴CR：门面 `BasePopup` 把 wot 弹层面置透明 ⇒ 内容必须自带面与上圆角；同 LoginPopup/ProfilePopup 写法） */
  background: $color-popup-card;
  border-radius: #{$popup-radius-rpx * 2}rpx #{$popup-radius-rpx * 2}rpx 0 0;
  overflow: hidden;
  /* 🔴CR：安全区**不得写进 `padding` 简写**（运行时若不认 `constant()` ⇒ 整条简写失效、padding 全为 0）；
     统一为「纯简写 ＋ 两条 longhand」（沿 LoginPopup:106-107 / ProfilePopup:114-116 的加固写法） */
  padding: $space-lg;
  padding-bottom: calc(#{$space-lg} + constant(safe-area-inset-bottom));
  padding-bottom: calc(#{$space-lg} + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
}
.qr-title {
  font-family: 'NotoSerifSC-Bold'; /* 与弹窗族标题同口径（组件内自带衬线） */
  font-size: $font-size-sub-title;
  color: $color-action;
  text-align: center;
}
.qr-text {
  margin-top: $space-sm;
  font-size: $font-size-caption;
  color: $color-text-primary;
  text-align: center;
  line-height: 1.5;
}
.qr-compare {
  margin-top: $space-lg;
  display: flex;
  flex-direction: row;
  justify-content: center;
}
.qr-case {
  margin: 0 $space-sm;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.qr-img {
  width: 240rpx; /* 仓内无该档 token（登记为待补） */
  height: 240rpx;
  box-sizing: border-box; /* 🟡CR：有 2rpx 描边 ⇒ content-box 实渲染 244rpx */
  border-radius: #{$popup-radius-rpx}rpx;
  border: 2rpx solid $color-border;
  background: $color-page;
}
.qr-badge {
  margin-top: $space-xs;
  font-size: $font-size-caption;
}
.qr-badge--ok {
  color: $color-action;
}
.qr-badge--bad {
  color: $color-danger;
}
.qr-note {
  margin-top: $space-md;
  font-size: $font-size-caption;
  color: $color-text-muted;
}
.qr-actions {
  margin-top: $space-lg;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.qr-btn {
  width: 100%;
  height: #{$button-height-rpx}rpx; /* token：按钮高度 88rpx */
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx; /* 仓内无 pill token（登记为待补） */
  box-sizing: border-box;
}
.qr-btn--primary {
  /* 主按钮渐变与全站主按钮同口径（起点/终点 token，中段沿用既有品牌金渐变常量） */
  background: linear-gradient(135deg, $color-action-soft 0%, $color-action 45%, #d9a75c 100%);
}
.qr-btn--ghost {
  margin-top: $space-sm;
  border: 2rpx solid $color-border;
}
.qr-btn-text {
  font-size: $font-size-body;
}
.qr-btn-text--primary {
  color: $color-action-text;
}
.qr-btn-text--ghost {
  color: $color-action;
}
</style>
