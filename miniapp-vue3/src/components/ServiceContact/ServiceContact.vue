<script setup lang="ts">
// P2-21：纯 props 展示组件（请求已上提 application/page-config-content 用例，组件内**不发请求**）。
// 旧端 ServiceContact.uvue（262 行）原本 mounted → loadContactConfig() 自取 /api/page-config；
// 本批按 phases「上提请求到用例/组合函数，再 props 注入」改造：OPS 优先 → Profile 注入 → 本地兜底
// 的优先级链保留在用例内（profile 注入锚点 contactQrSrc/contactPhoneText 由 PROFILE 承载，字段名不变量）。
// 有意偏差（已声明）：①主题：本区块沿用旧端深色卡片/金色描边——2026-09-19 colorPage 已恢复深色 #160F04，与旧端口径一致；
// ②字号：旧端若干 CSS 变量（--font-size-slogan/--font-size-display 等）未盘点，按近似档硬编码并注释；
// ③font-noto-serif 全局类新端未定义（沿用既有口径仅引用）。
// 2026-09-30 流量成本 PRD R2/R3：客服二维码缩略（cosThumb 300，250rpx 展示位足够且仍可扫）＋懒加载；
// 非自家 COS/CDN 域由 cosThumb 安全透传（不拼参数）。
import { cosThumb } from "../../application/image";
import LifeImButton from "../../platform/ui-bridge/LifeImButton.vue";
import { isToutiaoPlatform } from "../../ui/ui-platform";

// 2026-10-10（抖音提审打回修正）：抖音端**不再出现微信二维码**（长按加好友＝站外引流），
// 改用官方「抖音来客 IM 客服」按钮（`platform/ui-bridge/LifeImButton.vue`，基础库 3.61.0+）；
// 微信端**保持现状**（长按二维码加客服）。判定为**运行时可判定**（逻辑层零 #ifdef，合 SPEC §C3）。
const isToutiao = isToutiaoPlatform();

/** 抖音端拉起客服失败（未开通来客／基础库低于 3.61.0／框架错误 179791）⇒ 明确提示，不静默失败 */
function onContactFailed(): void {
  uni.showToast({ title: "客服暂不可用，请稍后重试", icon: "none" });
}

withDefaults(
  defineProps<{
    list?: string[];
    slogan?: string;
    qrSrc?: string;
    phone?: string;
    coopPhone?: string;
    /**
     * 客服的**抖音号**（2026-10-10 新增）：有值 ⇒ 抖音端走官方「IM 客服」(`open-type="im"`)；
     * 为空 ⇒ 回落到「抖音来客 IM 客服」(`open-type="lifeIm"`，需账号开通来客客服能力)。
     */
    imId?: string;
  }>(),
  { list: () => [], slogan: "", qrSrc: "", phone: "", coopPhone: "", imId: "" },
);
</script>

<template>
  <view>
    <view class="divideTit">
      <image src="/static/left-divider.png" class="divider" mode="aspectFill" />
      <view class="demoPhotoTit">
        <view class="font-noto-serif">服务保障</view>
        <image src="/static/service-icon.png" class="icon" mode="aspectFill" />
      </view>
      <image src="/static/right-divider.png" class="divider" mode="aspectFill" />
    </view>
    <view class="service-contain">
      <image src="/static/service-flower.png" class="flower" mode="aspectFill" />
      <view class="tit font-noto-serif">{{ slogan }}</view>
      <view class="main-wrap">
        <view class="main">
          <view v-for="(item, index) in list" :key="index" class="item">
            <view class="content">
              <view class="item-mark">
                <image src="/static/service-li.png" class="li" mode="aspectFill" />
                <view class="number">{{ index + 1 }}</view>
              </view>
              <text class="item-text">{{ item }}</text>
            </view>
            <!-- 最后一项不渲染分隔线（旧 :38） -->
            <view v-if="index !== list.length - 1" class="line"></view>
          </view>
        </view>
      </view>
    </view>

    <view class="divideTit">
      <image src="/static/left-divider.png" class="divider" mode="aspectFill" />
      <view class="demoPhotoTit">
        <view class="font-noto-serif">联系我们</view>
        <image src="/static/contact-icon.png" class="icon" mode="aspectFill" />
      </view>
      <image src="/static/right-divider.png" class="divider" mode="aspectFill" />
    </view>
    <view class="service-contain">
      <!-- 端差异集中在此桥：抖音＝官方 IM 客服按钮（**不渲染二维码**）；微信等＝现状二维码提示 -->
      <LifeImButton :im-id="imId" @failed="onContactFailed">
        <template #native>点击咨询在线客服</template>
        <template #fallback>
          <!-- #ifndef MP-TOUTIAO -->
          <!-- 端语义＝「**抖音端不出现、其余端保持现状**」（与 LifeImButton「其他端行为完全不变」一致）。
               独立 CR 🟡1：初版用 `#ifdef MP-WEIXIN` 会让**小红书端**只剩二维码、丢掉该指引文案 ⇒ 已改。
               抖音包里连此字符串都不存在（防审核静态扫描）；模板/样式允许条件编译、逻辑层仍零 #ifdef
               （合 SPEC §C3；无 #else 兜底 ⇒ 已在 scan-platform-usage.mjs 的 C4 登记）。 -->
          <view class="tit font-noto-serif">长按下面二维码添加客服</view>
          <!-- #endif -->
        </template>
      </LifeImButton>
      <view class="contact-main" :class="{ 'contact-main--im': isToutiao }">
        <image v-if="!isToutiao" src="/static/contact-bg.png" class="contact-bg" mode="aspectFill" />
        <image
          v-if="!isToutiao"
          class="code"
          :src="cosThumb(qrSrc, 300)"
          mode="aspectFit"
          :show-menu-by-longpress="true"
          lazy-load
        ></image>
        <view class="label">联系电话</view>
        <view class="val font-noto-serif">{{ phone }}</view>
        <view class="label">商务合作</view>
        <view class="val font-noto-serif">{{ coopPhone }}</view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.divideTit {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 24rpx; /* 旧 --spacing-md=28rpx → token spaceMd 24rpx（近似，待主题批次核对） */
}
.divideTit .divider {
  width: 150rpx;
  height: 22rpx;
}
.divideTit .demoPhotoTit {
  display: flex;
  flex-direction: column;
  font-size: 38rpx; /* 旧 --font-size-display=38rpx（App.uvue:124，CR 🟡2 纠错） */
  font-weight: 400;
  color: $color-action;
}
.divideTit .demoPhotoTit .icon {
  width: 143rpx;
  height: 56rpx;
  margin-top: -30rpx;
}
.service-contain {
  margin: 40rpx 20rpx; /* 旧 --spacing-sm=20rpx */
  padding: 40rpx 20rpx 20rpx;
  border: 2rpx solid rgba(255, 255, 221, 0.3); /* 旧 --color-border-soft（App.uvue:86，CR 🟡2 纠错：非 primary-20） */
  border-radius: 24rpx; /* 旧 --radius-container=24rpx */
  position: relative;
}
.service-contain .flower {
  position: absolute;
  right: 0;
  top: 40rpx;
  width: 167rpx;
  height: 222rpx;
  z-index: 9;
}
.service-contain .tit {
  margin-bottom: 40rpx;
  text-align: center;
  font-weight: 400;
  font-size: 34rpx; /* 旧 --font-size-slogan=34rpx（App.uvue:125，CR 🟡2 纠错） */
  color: $color-action;
}
.service-contain .main-wrap {
  padding: 1rpx;
  border-radius: 14rpx; /* 旧 --radius-card=14rpx */
  background: linear-gradient(
    252.59deg,
    rgba(241, 205, 145, 0.2) 0%,
    rgba(241, 205, 145, 0.7) 33.41%,
    rgba(241, 205, 145, 0) 62.4%,
    rgba(241, 205, 145, 0.7) 100%
  );
}
.service-contain .main {
  border-radius: 14rpx;
  /* 旧端深色卡面（--color-bg #160F04）——主题差异已声明 */
  background: linear-gradient(138.87deg, #231a0c 0%, #160f04 100%);
  padding: 20rpx;
}
.service-contain .main .item {
  display: flex;
  flex-direction: column;
}
.service-contain .main .content {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 10rpx 14rpx; /* 旧 --spacing-xs=10rpx（App.uvue:113，CR 🟡2 纠错） */
  gap: 26rpx;
}
.service-contain .main .content .item-mark {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: $color-action;
  font-size: 20rpx; /* 旧 --font-size-body-xs=20rpx */
  font-weight: 400;
}
.service-contain .main .content .item-mark .li {
  width: 44rpx;
  height: 42rpx;
}
.service-contain .main .content .item-mark .number {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
.service-contain .main .content .item-text {
  flex: 1;
  font-size: 26rpx; /* 旧 --font-size-body-lg=26rpx */
  color: $color-action;
  letter-spacing: 0.1em;
}
.service-contain .main .line {
  width: 100%;
  height: 1rpx;
  background: linear-gradient(
    270deg,
    rgba(241, 205, 145, 0) 0%,
    rgba(241, 205, 145, 0.7) 50.48%,
    rgba(241, 205, 145, 0) 100%
  );
  margin: 10rpx 0; /* 旧 --spacing-xs=10rpx（CR 🟡2 纠错） */
}
.service-contain .contact-main {
  border-radius: 14rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: $color-action;
  background: linear-gradient(139deg, rgba(241, 205, 145, 0.06) 0%, rgba(241, 205, 145, 0) 100%);
  border: 1px solid rgba(241, 205, 145, 0.2);
  position: relative;
  width: 670rpx;
  height: 536rpx;
}
.service-contain .contact-main .contact-bg {
  position: absolute;
  width: 100%;
  height: 100%;
}
.service-contain .contact-main .code {
  margin: 30rpx auto;
  width: 250rpx;
  height: 248rpx;
}
/* 抖音端无二维码 ⇒ 卡片不再需要为二维码预留 536rpx 高度（避免大片空白） */
.service-contain .contact-main--im {
  height: auto;
  padding: 30rpx 0;
}
.service-contain .contact-main .label {
  font-size: 26rpx; /* 旧 --font-size-body-lg=26rpx */
  font-weight: 400;
  margin-bottom: 10rpx; /* 旧 --spacing-xs=10rpx（CR 🟡2 纠错） */
}
.service-contain .contact-main .val {
  font-size: 34rpx; /* 旧 --font-size-slogan=34rpx（CR 🟡2 纠错） */
  font-weight: 400;
  margin-bottom: 20rpx;
}

/* 2026-09-22 主人报「弹窗内字体不对」根因族：自定义组件**默认样式隔离（isolated）** ⇒ app.wxss 的
   `page{font-family}` 与全局类 `.font-noto-serif`／`.font-harmony` 都进不来 ⇒ 组件内自带声明。 */
.font-noto-serif {
  font-family: 'NotoSerifSC-Bold';
}
</style>
