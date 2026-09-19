<script setup lang="ts">
// 自定义顶部导航栏（旧端 CustomNavBar.uvue 移植）：
// 微信：navigationStyle custom 下自绘金色标题＋返回。
// 抖音：系统默认导航栏接管（navStyle=default 定案）——2026-09-19 曾改「全平台 custom＋本组件全平台渲染」，
//   实测抖音端 navigationStyle:custom 未生效（该平台 custom 需在开放平台「功能管理-页面结构自定义」申请权限，
//   未申请则平台仍绘制默认栏：logo＋页面标题＋胶囊），叠加本组件自绘 ⇒ 我的/价目表等页双标题＋双顶部占位
//   （主人当日实测反馈，要求对齐微信单标题观感）。故抖音恢复系统栏单标题，本组件仅内联渲染 slot
//   （收藏页搜索框/客片详情标题组），无 slot 时完全不占位；自绘栏与占位仅微信渲染。
// 抖音 slot 外层包定宽 flex 行：平台自定义组件宿主节点默认被 inline 元素包裹（官方文档·组件模板和样式），
//   裸 slot 里子级 flex:1 找不到弹性父级、width:auto 随 inline 宿主塌缩成内容宽（2026-09-19 抖音实测
//   搜索框不占满）；wrapper 用 750rpx（恒等屏宽，绕开宿主宽度解析）＋flex 行，slot 内 flex:1 重新生效。
// statusBarHeight 经 getSystemInfoSync 守卫取值（默认 20，容器无该 API 时安全回落）；
// showBack 用 typeof 守卫 getCurrentPages（测试环境与异常容器安全）。
import { computed, ref } from "vue";
import { isToutiaoPlatform } from "../../ui/ui-platform";
const props = withDefaults(
  defineProps<{
    title?: string;
    transparent?: boolean;
    /** 无历史栈（分享冷启动）时的返回兜底路由；缺省回首页 */
    backFallbackUrl?: string;
    /** 返回点击改由页面处理（组件只 emit back） */
    manualBack?: boolean;
  }>(),
  { title: "", transparent: false, backFallbackUrl: "", manualBack: false },
);

const emit = defineEmits<{ (e: "back"): void }>();

const isToutiao = isToutiaoPlatform();

const statusBarHeight = ref(20);
let windowWidth = 375;
try {
  if (typeof uni !== "undefined" && typeof uni.getSystemInfoSync === "function") {
    const info = uni.getSystemInfoSync() as { statusBarHeight?: number; windowWidth?: number };
    if (info.statusBarHeight != null) statusBarHeight.value = info.statusBarHeight;
    if (info.windowWidth != null) windowWidth = info.windowWidth;
  }
} catch {
  // 容器异常时保持默认
}

// 胶囊实测矩形 → 内容区右侧避让宽度（px）；取不到则按平台经验值兜底（微信 87+8，抖音含反馈位更宽按 190）
const capsuleClearPx = ref(isToutiao ? 190 : 95);
try {
  if (typeof uni !== "undefined" && typeof uni.getMenuButtonBoundingClientRect === "function") {
    const rect = uni.getMenuButtonBoundingClientRect() as { left?: number; width?: number } | null;
    if (rect != null && typeof rect.left === "number" && rect.left > 0) {
      capsuleClearPx.value = windowWidth - rect.left + 8;
    }
  }
} catch {
  // 容器异常时保持兜底
}

function stackDepth(): number {
  try {
    if (typeof getCurrentPages === "function") return getCurrentPages().length;
  } catch {
    // 容器无页面栈 API
  }
  return 0;
}

// 抖音系统返回键宽度避让（栈深>1 时系统自绘在左上，实测约 60px）；微信为 0
const sysBackClearPx = computed(() => (isToutiao && stackDepth() > 1 ? 60 : 0));

const showBack = computed(() => {
  // 抖音栈深>1 由系统返回键接管，自绘隐藏防双返回
  if (isToutiao && stackDepth() > 1) return false;
  return stackDepth() > 1 || props.backFallbackUrl !== "";
});

const contentStyle = computed(() => ({
  paddingLeft: sysBackClearPx.value + "px",
  paddingRight: capsuleClearPx.value + "px",
}));
const titleStyle = computed(() => ({
  left: Math.max(88, sysBackClearPx.value + 44) + "px",
  right: Math.max(88, capsuleClearPx.value) + "px",
}));

function goBack() {
  if (stackDepth() > 1) {
    if (typeof uni !== "undefined" && typeof uni.navigateBack === "function") uni.navigateBack();
  } else if (props.backFallbackUrl !== "") {
    if (typeof uni !== "undefined" && typeof uni.reLaunch === "function") uni.reLaunch({ url: props.backFallbackUrl });
  } else if (typeof uni !== "undefined" && typeof uni.reLaunch === "function") {
    uni.reLaunch({ url: "/pages/index/index" });
  }
}
function onBackTap() {
  if (props.manualBack) {
    emit("back");
    return;
  }
  goBack();
}
</script>

<template>
  <!-- 抖音：系统默认导航栏接管，仅内联渲染 slot（收藏搜索框/客片详情标题组），无 slot 不占位（空 flex 行高 0） -->
  <template v-if="isToutiao">
    <view class="custom-navbar-tt-slot">
      <slot />
    </view>
  </template>
  <template v-else>
    <view :class="transparent ? 'custom-navbar custom-navbar-transparent' : 'custom-navbar'">
      <view :style="{ height: statusBarHeight + 'px' }" />
      <view class="custom-navbar-content" :style="contentStyle">
        <view v-if="showBack" class="custom-navbar-back" @click="onBackTap">
          <image class="custom-navbar-back-icon" src="/static/iconpark/back.svg" mode="aspectFit" />
        </view>
        <text v-if="title !== ''" class="custom-navbar-title" :style="titleStyle">{{ title }}</text>
        <view class="custom-navbar-slot">
          <slot />
        </view>
      </view>
    </view>
    <!-- 占位：撑开被 fixed 导航栏遮住的高度 -->
    <view :style="{ height: statusBarHeight + 44 + 'px' }" />
  </template>
</template>

<style lang="scss" scoped>
/* 抖音内联 slot 容器：宿主节点默认被 inline 元素包裹，% 宽随宿主塌缩不可靠，750rpx 恒等于屏宽；
   flex 行让 slot 内 flex:1（搜索框 .search-bar-wrap / 标题组 .nav-center）占满整行 */
.custom-navbar-tt-slot {
  width: 750rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  box-sizing: border-box;
}
.custom-navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: $color-page;
  z-index: 998;
}
.custom-navbar-transparent {
  background: transparent;
}
.custom-navbar-content {
  position: relative;
  height: 44px;
  display: flex;
  flex-direction: row;
  align-items: center;
  box-sizing: border-box;
}
.custom-navbar-back {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.custom-navbar-back-icon {
  width: 24px;
  height: 24px;
}
.custom-navbar-slot {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  min-width: 0;
}
.custom-navbar-title {
  position: absolute;
  text-align: center;
  font-size: 17px;
  font-weight: 400;
  color: $color-action;
  letter-spacing: 1px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
