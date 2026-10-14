<script setup lang="ts">
// P2-21：纯 props 展示组件（请求已上提 application/page-config-content 用例，组件内**不发请求**）+ 2026-10-14 task-68：承诺块条件渲染。
// 旧端 ServiceContact.uvue（262 行）原本 mounted → loadContactConfig() 自取 /api/page-config；
// 本批按 phases「上提请求到用例/组合函数，再 props 注入」改造：OPS 优先 → Profile 注入 → 本地兜底
// 的优先级链保留在用例内（profile 注入锚点 contactQrSrc/contactPhoneText 由 PROFILE 承载，字段名不变量）。
// 有意偏差（已声明）：①主题：本区块沿用旧端深色卡片/金色描边——2026-09-19 colorPage 已恢复深色 #160F04，与旧端口径一致；
// ②字号：旧端若干 CSS 变量（--font-size-slogan/--font-size-display 等）未盘点，按近似档硬编码并注释；
// ③font-noto-serif 全局类新端未定义（沿用既有口径仅引用）。
// 2026-10-13（主人 DevTools 实测 · 表1 #25 二次返修）：二维码展示**改回原图**（对齐线上旧端 `:src="qrSrc"`）。
// **撤销 2026-09-30 流量成本 PRD R2/R3 的 cosThumb(300) 缩略**：源图仅 327×326 / 57KB（流量可忽略），
// 缩略链路既非「更暗」的成因、又降低扫码清晰度；线上旧端原图口径已被主人验证正常。
// 展示仍走 `qrPreviewUrl` 做 CDN 域归一 + 剔除任何 imageMogr2 缩略参数 ⇒ 与「弹大图」**同源同值**，杜绝漂移。
import { qrPreviewUrl } from "../../application/image";
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

/**
 * 弹出二维码大图（2026-10-13 表1 #25；**二次返修后**的确定性入口）。
 *
 * **根因叙述更正（2026-10-13 独立 CR ⑤ · 诚实登记）**：修前**根本没有绑定 `@click`** ⇒「点击不弹大图」
 * 是**功能缺口**（本次新增的能力；旧端亦无点击弹图），**不是**命中问题 ⇒ 两个症状**不可同源归因**：
 *   · 「点击不弹图」＝ 功能缺口（已验证：修前 `git show 0955e19:…` 的 `<image>` 上无 `@click`）；
 *   · 「长按只震动不出菜单」＝ **命中/层叠嫌疑（属代码推断，未做真机命中实测）**：`.contact-main` 内
 *     `contact-bg`（`position:absolute` + 100%×100%）在 `.code`（**静态定位**）**之前**，按 CSS 2.1 附录 E
 *     的绘制顺序，定位元素（step 6）画在静态块级内容（step 3）之上 ⇒ **若**命中测试取最上层元素，事件会先落
 *     `contact-bg`（同机制先例：`deviations.md:146`，第 30 条「小程序命中测试取最上层元素」）；
 *   · 「更暗/像有透明度」**成因未唯一确定**：候选 ⒜ `static/contact-bg.png`（4-bit 调色板 + tRNS 12 项）半透明
 *     装饰层覆盖 ⒝ **源图自身即 RGBA 含 alpha**（CR 统计 3,715/106,602 像素 alpha<255；本机无 PIL，未能复算）。
 * ⇒ 本批修复＝`.code` 显式 `position: relative; z-index: 1`（无论命中语义如何都置顶且可接收触摸）＋展示图回**原图**。
 *
 * 分工（两个手势各司其职，避免互相抢占）：
 *   · **点击** ⇒ 本函数弹原图大图（确定性链路，任何端一致）；
 *   · **长按** ⇒ 交回原生 `show-menu-by-longpress` 菜单（保存/识别/转发）——**故此处不绑 `@longpress`**：
 *     若同时绑，`uni.previewImage` 的全屏预览会盖住原生菜单，反而让「长按出菜单」再次失效（主人验收点①）。
 *
 * **备选写法（CR ⑥ · 本轮不返工，仅留维护参考）**：若后续仍出现「背景层吃事件」，两条更「几何无关」的做法——
 *   ⒜ 给 `contact-bg` 加 `pointer-events: none`（本仓既有先例 `brandHub:199`／`mine:467`，见 `deviations.md:146`）；
 *   ⒝ 干脆不渲染该装饰层；⒞ 长按改绑自绘弹层并在其中复用 `show-menu-by-longpress`。
 * 容器安全：空 src／无 uni／无 previewImage 一律静默返回（fail-soft，不抛不阻断）。
 * 抖音端不渲染该二维码（`v-if="!isToutiao"`）⇒ 本函数在抖音端不可达，端行为完全不变。
 */
function previewQr(src: string): void {
  const url = qrPreviewUrl(src);
  if (url === "") return;
  if (typeof uni === "undefined" || typeof uni.previewImage !== "function") return;
  uni.previewImage({
    urls: [url],
    current: url,
    // 文案保持中性：抖音包里**不得**出现「二维码／长按」等引流词（2026-10-10 提审打回纪律），
    // 逻辑层字符串会同时打进抖音包 ⇒ 这里只说「图片」（该函数在抖音端本就不可达）
    fail: () => uni.showToast({ title: "图片加载失败，请稍后重试", icon: "none" }),
  });
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
    /**
     * ⭐2026-10-14（task-68 · 抖音审核类目合规）：是否渲染**承诺块**（分隔标题＋slogan＋编号列表）。
     * 抖音端 profile 该位＝false（首页不得出现服务承诺类模块）⇒ 只隐藏本块，**「联系我们」与页脚不受影响**。
     * 恢复＝profile 一行改回 true ＋ 重新构建（组件代码/样式/资源全部保留）。
     */
    showPromise?: boolean;
    /** 承诺块分隔标题文案（经 profile 下发：抖音端为空串 ⇒ 产物内不出现该中文标题字面量） */
    promiseTitle?: string;
  }>(),
  { list: () => [], slogan: "", qrSrc: "", phone: "", coopPhone: "", imId: "", showPromise: true, promiseTitle: "" },
);
</script>

<template>
  <view>
    <view v-if="showPromise" class="divideTit">
      <image src="/static/left-divider.png" class="divider" mode="aspectFill" />
      <view class="demoPhotoTit">
        <view class="font-noto-serif">{{ promiseTitle }}</view>
        <image src="/static/service-icon.png" class="icon" mode="aspectFill" />
      </view>
      <image src="/static/right-divider.png" class="divider" mode="aspectFill" />
    </view>
    <view v-if="showPromise" class="service-contain">
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
          <view class="tit font-noto-serif">长按二维码扫码添加客服</view>
          <!-- #endif -->
        </template>
      </LifeImButton>
      <view class="contact-main" :class="{ 'contact-main--im': isToutiao }">
        <image v-if="!isToutiao" src="/static/contact-bg.png" class="contact-bg" mode="aspectFill" />
        <image
          v-if="!isToutiao"
          class="code"
          :src="qrPreviewUrl(qrSrc)"
          mode="aspectFit"
          :show-menu-by-longpress="true"
          lazy-load
          @click="previewQr(qrSrc)"
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
  /* 2026-10-13（表1 #25 二次返修）：**必须**定位 + z-index 才在 contact-bg 之上且可接收触摸。
     contact-bg 是 absolute+100%×100%，.code 若为静态定位会被它盖住（CSS 绘制顺序第 6 步 vs 第 3 步），
     而小程序命中测试取最上层元素 ⇒ 点/长按全被背景层吃掉（实测症状：点击不弹图、长按只震动不出菜单）。 */
  position: relative;
  z-index: 1;
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
