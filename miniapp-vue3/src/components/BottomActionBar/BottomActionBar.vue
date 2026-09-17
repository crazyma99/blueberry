<script setup lang="ts">
// BottomActionBar — 底部固定操作栏（组件级重构）
// 旧端源：/home/majunhi/blueberry/src/components/BottomActionBar/BottomActionBar.uvue（60 行）
// 忠实移植：模板 :14-22（默认插槽 + 内置版权 footer）；props 无（旧端 :24-28 仅声明 name）；样式 :30-60。
// 旧端 :1-13 头注释口径逐字保留：
//   - 按钮组由调用方通过默认插槽传入（各页按钮逻辑不同）
//   - 版权 footer（分割线 + AppFooter）组件内置，样式对齐 Figma 2072:387 Footer Container
//   - 页面需自行保留底部占位（ai-tryon-spacer / bottom-spacer），避免遮挡内容
//
// 契约：
//   默认插槽（唯一，无具名插槽）
//   ⚠️ 新增透传 props（**唯一有意偏差**，见下）：footerMainLine / footerSupportLine
//
// 【唯一有意偏差 · 必读】版权 footer 的两行文案：
//   旧端内置 `<AppFooter />`（:19）不传 props ⇒ AppFooter 自带默认版权文案（AppFooter.uvue:26-39 的
//   copyrightText 默认值 + data.remoteSupportText，并由组件内 mounted 调 /api/page-config 的 OPS 覆盖）。
//   新端 AppFooter.vue 已由 P2-21 改为**纯 props 组件**（请求上提到 application/page-config-content 用例，
//   `createPageConfigContent().loadFooter()`），其默认值为**空串** ⇒ 若本组件照抄 `<AppFooter />` 不传 props，
//   页脚两行将渲染为空白（金线保留、文案丢失），与旧端不等价。
//   故本组件新增两个可选透传 props（默认 ''），原样转发给 AppFooter：
//     footerMainLine    → AppFooter.mainLine（旧端主行：OPS copyright.text／Profile copyrightText）
//     footerSupportLine → AppFooter.supportLine（旧端支持行：'小程序与AI技术能力由 蓝梅网络 提供支持'）
//   ⚠️ 接线要求：调用方（aiTryOn 页）**必须**把页脚用例内容传进来，例如
//     <BottomActionBar :footer-main-line="footer.mainLine" :footer-support-line="footer.supportLine">
//   （口径与本仓已迁页面一致：favorites/index.vue:318、priceList/index.vue:162、
//     aiTryOnHistory/index.vue:218、demoDetail/index.vue:286 均以用例 props 注入页脚。）
//   不新增插槽、不改旧端默认插槽契约；本组件内**不发任何请求**（禁止在组件内取 /api/page-config）。
//
// 纯展示组件：无 mounted/onMounted 取数、无 client/仓储/uni.request；交互只 emit（本组件自身无 emit）。
// 容器安全：本组件不调用任何 uni/wx API（无 safe-area 计算，全静态 CSS）。
// 平台差异：无 MP-WEIXIN 专属能力（无条件编译需求）。
//
// token 映射（旧端 App.uvue 全局 CSS 变量 → 新端 tokens.ts / 硬编码，口径与已迁 BottomActionBarSecondary 完全一致）：
//   --color-bg #160F04 (#41) → 硬编码 #160F04（渐变遮罩底色）。**不映射 tokens.semantic.colorPage**：
//                              新端 colorPage=#FFFFFF 为亮色底，而此处语义＝页面深色底色，语义不符。
//   --color-primary-50       → rgba(241, 205, 145, 0.5) 字面值（App.uvue:81，派生透明度色）
//   --spacing-md 28rpx       → 硬编码 28rpx（App.uvue:117）
//   --font-size-caption-md 18rpx → 硬编码 18rpx（App.uvue:131）
//   注意 padding 两行（旧端 :39-40）：`padding: 64rpx 0 24rpx 0` 后紧跟 `padding-bottom: 12rpx`，
//   后者生效 ⇒ 底部实际 12rpx；照旧端原样保留两行（勿合并，保真留痕）。
import AppFooter from "../AppFooter/AppFooter.vue";

withDefaults(
  defineProps<{
    /** 透传 AppFooter 主行（旧端为 AppFooter 默认版权文案／OPS copyright.text）；不传则页脚空 */
    footerMainLine?: string;
    /** 透传 AppFooter 支持行（旧端默认「小程序与AI技术能力由 蓝梅网络 提供支持」）；不传则空 */
    footerSupportLine?: string;
  }>(),
  { footerMainLine: "", footerSupportLine: "" },
);
</script>

<template>
  <view class="bottom-bar">
    <slot />
    <view class="bar-footer">
      <view class="bar-divide"></view>
      <view class="bar-copyright">
        <AppFooter :main-line="footerMainLine" :support-line="footerSupportLine" />
      </view>
    </view>
  </view>
</template>

<style scoped>
.bottom-bar {
  position: fixed;
  left: 0;
  bottom: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 64rpx 0 24rpx 0;
  padding-bottom: 12rpx; /* 旧端 :40 覆盖上一行 ⇒ 底部实际 12rpx */
  background: linear-gradient(to top, #160F04 59.6%, rgba(22, 15, 4, 0)); /* 旧 var(--color-bg) #160F04 */
  z-index: 100;
}
.bar-footer {
  width: 100%;
  margin-top: 32rpx;
}
.bar-divide {
  height: 2rpx;
  width: 100%;
  background: rgba(255, 255, 255, 0.15);
}
.bar-copyright {
  margin: 28rpx auto; /* 旧 --spacing-md=28rpx（App.uvue:117） */
  font-size: 18rpx; /* 旧 --font-size-caption-md=18rpx（App.uvue:131）——AppFooter 主行本无 font-size，继承此处 */
  color: rgba(241, 205, 145, 0.5); /* 旧 --color-primary-50（App.uvue:81） */
  font-weight: 400;
  text-align: center;
}
</style>
