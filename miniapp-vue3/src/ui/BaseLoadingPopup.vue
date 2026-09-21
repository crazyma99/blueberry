<script setup lang="ts">
// 公共组件（门面层）：**加载中遮罩**＝Wot `wd-popup` ＋ Wot `wd-loading` 组合，供业务页复用。
// 背景（2026-09-21 主人）：「AI 试衣落地页分享的准备 loading 换成 wotui 的 loading＋token」并追问
// 「是否可以 popup ＋ loading 做替代、做成公共组件，后面可以复用」⇒ 本组件即该公共实现。
// 组合与事实源（`npx wot info Popup`／`npx wot info Loading`，@wot-ui/cli 1.1.0 实测）：
//   · `wd-popup`：`position`（center）／`close-on-click-modal`／`root-portal`／`custom-class`／`custom-style`／`modal`；
//     其默认表面色为 `--wot-popup-bg`（默认白）⇒ 本组件用 `custom-style` 置透明，品牌面由**自有卡片**（design token）承担。
//   · `wd-loading`：经门面 `BaseLoading`（token 默认色 `semantic.colorAction` 金／尺寸 `component.pullRefreshLoadingSizeRpx`）。
// 层级（独立 CR 🔴1 据实登记）：wot `wd-popup` 默认 `z-index: 10` ⇒ 组件**显式传 `z-index`（默认 1001）**，
//   否则遮罩盖不住自绘标题栏 998（真机可见：顶栏不压暗、返回键可点）。
// 平台分支（同 BasePopup／BaseDialog 家法，migration §8.12 方案 A）：
//   · 非抖音端＝wd-popup 链（`root-portal` 生效、遮罩与居中由 wot 负责）；
//   · 抖音端＝自绘 fixed 蒙层＋居中卡片（绕开 wot 自定义组件宿主节点 fixed 失效问题；该端也不吃 `var(--wot-*)`）。
// 语义：**遮罩点击不关闭**（加载态由业务自己收口，`close-on-click-modal=false`）；无关闭按钮。
import { isToutiaoPlatform } from "./ui-platform";
import BaseLoading from "./BaseLoading.vue";

withDefaults(
  defineProps<{
    /** 是否显示（受控；加载态由业务持有） */
    show?: boolean;
    /** 文案（默认「加载中…」；空串＝只出 spinner） */
    text?: string;
    /** 指示器方向（默认竖排：spinner 在上、文案在下，同旧端 LoadingBlock 口径） */
    direction?: "horizontal" | "vertical";
    type?: "circular" | "spinner" | "dots" | "wave";
    /** 尺寸（缺省＝门面 token 默认值 `48rpx`） */
    size?: string | number;
    /** 颜色（缺省＝门面 token 默认值 品牌金） */
    color?: string;
    /** 是否从页面结构中脱离（微信/支付宝/H5 生效；抖音端自绘分支不适用） */
    rootPortal?: boolean;
    /**
     * 弹层层级。⚠️ **必须显式给**：wot `wd-popup` 默认 `z-index: 10`（`npx wot info Popup` 实测），
     * 而本仓自绘标题栏为 `z-index: 998`（`components/CustomNavBar`，不透明）⇒ 默认值下遮罩**盖不住顶栏**
     * （导航栏不压暗、返回键仍可点，独立 CR 🔴1 真机必现）。默认 1001＝高于自绘栏 998 与首页浮钮 999、低于原生 tabbar（平台层）。
     */
    zIndex?: number;
  }>(),
  { show: false, text: "加载中…", direction: "vertical", type: "circular", rootPortal: true, zIndex: 1001 },
);

/** 品牌面（design token）：玄墨底＋金 30% 描边＋卡片圆角（`$popup-radius-rpx`）＋紧凑内距 */
const CARD_CLASS = "base-loading-popup__card";
/** 置透明：wd-popup 默认白面（`--wot-popup-bg`）不应出现在品牌卡片外层（CSS 变量仅微信链使用；抖音走自绘分支） */
const POPUP_TRANSPARENT_STYLE = "--wot-popup-bg: transparent; --wot-popup-radius: 0;";

const useNative = isToutiaoPlatform();
</script>

<template>
  <wd-popup
    v-if="!useNative"
    :model-value="show"
    position="center"
    :closable="false"
    :close-on-click-modal="false"
    :root-portal="rootPortal"
    :z-index="zIndex"
    custom-class="base-loading-popup"
    :custom-style="POPUP_TRANSPARENT_STYLE"
  >
    <view :class="CARD_CLASS">
      <BaseLoading :text="text" :direction="direction" :type="type" :size="size" :color="color" />
    </view>
  </wd-popup>
  <view v-else-if="show" class="base-loading-popup-native" :style="{ zIndex }">
    <view class="base-loading-popup-native__mask" />
    <view :class="CARD_CLASS">
      <BaseLoading :text="text" :direction="direction" :type="type" :size="size" :color="color" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
/* 卡片：品牌面（token）——玄墨底 `$color-page`／金 30% 描边 `$color-border`／圆角 `$popup-radius-rpx`／内距 `$space-*` */
.base-loading-popup__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: $space-lg;
  border-radius: #{$popup-radius-rpx}rpx;
  background: $color-page;
  border: 2rpx solid $color-border;
}
/* 抖音自绘分支：页面级 fixed 节点（同 BasePopup／BaseDialog） */
.base-loading-popup-native {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.base-loading-popup-native__mask {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.5);
}
</style>
