<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
onLaunch(() => {
  console.log("App Launch");
  // 全局加载自定义字体（旧端 App.uvue :9-32 移植；微信小程序需在 mp 后台配置 downloadFile 合法域名：
  // www.lanmei66.cloud）。使用方式：全局类名 font-noto-serif / font-harmony。
  // 2026-09-19 补：迁移时遗漏 ⇒ 抖音端 font-noto-serif 全部回落系统字体（微信端靠 custom-tab-bar 的
  // wx.loadFontFace 兜底才没暴露）；uni.loadFontFace 抖音映射 tt.loadFontFace，旧端抖音线上已验证。
  if (typeof uni !== "undefined" && typeof uni.loadFontFace === "function") {
    uni.loadFontFace({
      global: true,
      family: "NotoSerifSC-Bold",
      source: 'url("https://lanmeiimgstore-1311468332.cos.ap-shanghai.myqcloud.com/font/NotoSerifSC-Bold-subset.woff")',
      success: () => console.log("[font] NotoSerifSC-Bold 加载成功"),
      fail: (err) => console.warn("NotoSerifSC-Bold 字体加载失败", err),
    });
    uni.loadFontFace({
      global: true,
      family: "HarmonyOS-Sans-SC",
      source: 'url("https://lanmeiimgstore-1311468332.cos.ap-shanghai.myqcloud.com/font/HarmonyOS_Sans_SC-subset.woff")',
      success: () => console.log("[font] HarmonyOS-Sans-SC 加载成功"),
      fail: (err) => console.warn("HarmonyOS-Sans-SC 字体加载失败", err),
    });
  }
});
onShow(() => {
  console.log("App Show");
});
onHide(() => {
  console.log("App Hide");
});
</script>

<!--
  全局样式＝**旧端 `src/App.uvue` <style> 块的忠实移植**（「每个页面公共css」＋圆角/字号/间距/弹窗等）。
  ⚠️ 2026-09-17 修复（体验版「UI 错乱/布局错乱」根因）：此前本文件 `<style>` 为空 ⇒ 构建产物 `app.wxss` 仅 191B，
  **页面里 46 处 `var(--color-*)` 等变量全部无定义** ⇒ 真机颜色/背景/圆角/字号全失效。
  保持旧端 `page{...}` 选择器（**微信 wxss 不支持 `:root`**，旧端写法在 wxss 下同样成立）。
  ⚠️ 2026-09-19 抖音兼容：TTSS 不支持 CSS 变量（官方：变量特性编译暂不支持）⇒ 原 `page{--*}` 变量定义块
  整体删除，全部消费点（本文件及 13 个 .vue）经 codemod-css-var-literal.mjs 替换为字面量；
  页面级 token 改走 theme.scss 编译期 $ 变量（vite additionalData 注入），单源仍是 tokens/source.json。
-->
<style>
/*每个页面公共css */
	.uni-row {
		flex-direction: row;
	}

/* ========== 全局自定义字体（微信端在 App onLaunch 中通过 uni.loadFontFace 全局加载） ========== */
/* 抖音端：小程序侧无 tt.loadFontFace（仅小游戏有 tt.loadFont），官方 FAQ 指定 TTSS @font-face 加载外部字体。
   微信 wxss 不支持远程 @font-face（只能靠 loadFontFace）⇒ 条件编译只进抖音 ttss。
   ⚠️ 真机如需下载域名白名单：lanmeiimgstore-1311468332.cos.ap-shanghai.myqcloud.com 配到抖音后台 downloadFile 域名。 */
/* #ifdef MP-TOUTIAO */
@font-face {
	font-family: 'NotoSerifSC-Bold';
	src: url("https://lanmeiimgstore-1311468332.cos.ap-shanghai.myqcloud.com/font/NotoSerifSC-Bold-subset.woff");
}
@font-face {
	font-family: 'HarmonyOS-Sans-SC';
	src: url("https://lanmeiimgstore-1311468332.cos.ap-shanghai.myqcloud.com/font/HarmonyOS_Sans_SC-subset.woff");
}
/* #endif */
/* 宋体标题：font-family: 'NotoSerifSC-Bold' */
/* ========== 全局按压反馈（hover-class 引用） ========== */
/* 可点击元素加 hover-class="press-dim"，按压时降透明度 + 轻微变亮，不改变布局 */
.press-dim {
  opacity: 0.82;
}
/* 列表行按压：背景加深（与 press-dim 二选一） */
.press-row {
  background: rgba(255, 255, 255, 0.1) !important;
}

/* 金色主按钮统一类（Phase4）：各页面主按钮引用，样式一处收敛 */
.btn-primary {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  padding: 26rpx 40rpx;
  font-size: 32rpx;
  line-height: 1.2;
  font-weight: 400;
  color: #160F04;
  background: linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%);
  border: 1rpx solid #160F04;
  border-radius: 999rpx;
  transition: opacity 0.15s ease-out;
}

/* 金色次要按钮统一类（Phase4）：与 btn-primary 同尺寸，金描边+金文字+微底，操作栏次按钮用 */
.btn-secondary {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  padding: 26rpx 40rpx;
  font-size: 32rpx;
  line-height: 1.2;
  font-weight: 400;
  color: #F1CD91;
  background: rgba(241, 205, 145, 0.1);
  border: 1rpx solid rgba(241, 205, 145, 0.5);
  border-radius: 999rpx;
  transition: opacity 0.15s ease-out;
}

/* 全局过渡规范（Phase3）：快速反馈 150ms / 常规过渡 250ms / 图片渐显 */
.transition-fast {
  transition: opacity 0.15s ease-out;
}
.transition-base {
  transition: opacity 0.25s ease;
}
.fade-in {
  animation: fadeIn 0.3s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.font-noto-serif {
  font-family: 'NotoSerifSC-Bold';
}
/* 正文/界面文字：font-family: 'HarmonyOS-Sans-SC' */
.font-harmony {
  font-family: 'HarmonyOS-Sans-SC';
}

/* 全局默认字体：HarmonyOS Sans SC（个别标题可用 font-noto-serif 覆盖） */
/* 页面底色：深色主题必须显式设置，否则 tab 切换重绘间隙会透出默认白底（闪白） */
page {
  font-family: 'HarmonyOS-Sans-SC';
  background-color: #160F04;
}

/* 自定义底部 tabbar 的页面占位（高度需与 src/custom-tab-bar 保持一致：116rpx + 底部安全区） */
.tabbar-safe-spacer {
  height: 116rpx;
  height: calc(116rpx + constant(safe-area-inset-bottom));
  height: calc(116rpx + env(safe-area-inset-bottom));
}
/* 隐藏所有页面的滚动条 */
::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
  color: transparent;
}
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

/* ========== 统一骨架屏样式 ========== */
@keyframes skeletonPulse {
  0% { opacity: 0.4; }
  50% { opacity: 0.8; }
  100% { opacity: 0.4; }
}
.sk-animate {
  animation: skeletonPulse 1.5s ease-in-out infinite;
}
/* 骨架屏容器 */
.sk-container {
  padding: 32rpx;
}
/* 通用矩形块 */
.sk-block {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8rpx;
}
/* 圆形（头像等） */
.sk-circle {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 50%;
}
/* 横向排列 */
.sk-row {
  display: flex;
  flex-direction: row;
  align-items: center;
}
/* 常用尺寸 */
.sk-banner {
  width: 100%;
  height: 384rpx;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8rpx;
  margin-bottom: 32rpx;
}
.sk-title {
  width: 200rpx;
  height: 24rpx;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4rpx;
  margin: 0 auto 16rpx;
}
.sk-subtitle {
  width: 140rpx;
  height: 36rpx;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4rpx;
  margin: 0 auto 32rpx;
}
.sk-text {
  height: 28rpx;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4rpx;
}
.sk-photo-card {
  width: 364rpx;
  height: 226rpx;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8rpx;
  margin-right: 8rpx;
}
.sk-photo-card:last-child {
  margin-right: 0;
}
.sk-photo-item {
  width: 340rpx;
  height: 482rpx;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8rpx;
  margin: 0 8rpx 8rpx 0;
}
.sk-photo-item:nth-child(2n) {
  margin: 0 0 8rpx;
}
.sk-tab {
  width: 128rpx;
  height: 42rpx;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8rpx;
  margin-right: 16rpx;
}
.sk-avatar {
  width: 120rpx;
  height: 120rpx;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 50%;
}
.sk-menu {
  width: 100%;
  height: 200rpx;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 16rpx;
  margin-bottom: 32rpx;
}
</style>
