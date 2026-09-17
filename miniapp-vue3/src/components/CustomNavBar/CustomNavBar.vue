<script setup lang="ts">
// 自定义顶部导航栏（旧端 CustomNavBar.uvue 移植）：
// 微信：navigationStyle custom 下自绘金色标题＋返回；**抖音端渲染空**（default 导航定案，系统栏接管）。
// statusBarHeight 经 getSystemInfoSync 守卫取值（默认 20，容器无该 API 时安全回落）；
// showBack 用 typeof 守卫 getCurrentPages（测试环境与异常容器安全）。
import { computed, ref } from "vue";
import { isToutiaoPlatform } from "../../ui/ui-platform";
import { tokens } from "../../generated/tokens";

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

const nativeHidden = isToutiaoPlatform();

const statusBarHeight = ref(20);
try {
  if (typeof uni !== "undefined" && typeof uni.getSystemInfoSync === "function") {
    const info = uni.getSystemInfoSync() as { statusBarHeight?: number };
    if (info.statusBarHeight != null) statusBarHeight.value = info.statusBarHeight;
  }
} catch {
  // 容器异常时保持默认 20
}

function stackDepth(): number {
  try {
    if (typeof getCurrentPages === "function") return getCurrentPages().length;
  } catch {
    // 容器无页面栈 API
  }
  return 0;
}

const showBack = computed(() => stackDepth() > 1 || props.backFallbackUrl !== "");

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
  <template v-if="!nativeHidden">
    <view :class="transparent ? 'custom-navbar custom-navbar-transparent' : 'custom-navbar'">
      <view :style="{ height: statusBarHeight + 'px' }" />
      <view class="custom-navbar-content">
        <view v-if="showBack" class="custom-navbar-back" @click="onBackTap">
          <image class="custom-navbar-back-icon" src="/static/iconpark/back.svg" mode="aspectFit" />
        </view>
        <text v-if="title !== ''" class="custom-navbar-title">{{ title }}</text>
        <view class="custom-navbar-slot">
          <slot />
        </view>
      </view>
    </view>
    <!-- 占位：撑开被 fixed 导航栏遮住的高度 -->
    <view :style="{ height: statusBarHeight + 44 + 'px' }" />
  </template>
</template>

<style scoped>
.custom-navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: v-bind("tokens.semantic.colorPage");
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
}
.custom-navbar-back {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
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
  left: 88px;
  right: 88px;
  text-align: center;
  font-size: 17px;
  font-weight: 400;
  color: v-bind("tokens.semantic.colorAction");
  letter-spacing: 1px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
