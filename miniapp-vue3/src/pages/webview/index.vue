<script setup lang="ts">
// T7 P2-22：webview 页——外部链接承载页（旧端 webview/index.uvue 61 行忠实移植）。
// 旧端事实：web-view 为微信原生组件且自动铺满整页，普通 view 无法覆盖其上 ⇒ 用 cover-view/cover-image 绘制
// 金色返回栏（无标题，旧 :1-3/:11-17）；onLoad 解 url 参数（decodeURIComponent，旧 :24-26）＋
// statusBarHeight（守卫取值，旧 :27-28）；goBack → navigateBack（旧 :32-34）。
// ⭐ P2-22 加固（有意偏差，登记 see deviations.md）：旧端对 url **零校验**（可打开任意 URL）；新端按 phases
// 「只允许既有合法 URL 策略，不放开任意 URL」收敛——仅 http(s) 且 host 命中 Profile 域白名单（含子域）才渲染，
// 非法/缺失一律拒绝：toast「链接不可打开」＋返回（拒绝路径）。
// 协议/客服/联系信息（policies/user、policies/privacy、ServiceContact 电话）走**站内页**，不经本页；
// 本页仍拒绝其之外的任意第三方 URL（t29 断言）。
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { PROFILE } from "../../generated/profile.config";
import { isAllowedWebviewUrl, webviewHost } from "../../domain/webview-url";

// Profile 派生域白名单（release/trial/develop 三个 API 基址的 host，去重）
function profileHosts(): string[] {
  const hosts = [PROFILE.apiBases.release, PROFILE.apiBases.trial, PROFILE.apiBases.develop]
    .map((u) => webviewHost(u))
    .filter((h): h is string => h !== null);
  return Array.from(new Set(hosts));
}
const allowedHosts = profileHosts();

const url = ref("");
const statusBarHeight = ref(20);
const rejected = ref(false);
// 幂等返回（CR 🟡1）：用户先点返回栏 → 定时器到点不得再退一页
let backRequested = false;

function requestBack(): void {
  if (backRequested) return;
  backRequested = true;
  if (typeof uni !== "undefined" && typeof uni.navigateBack === "function") uni.navigateBack();
}

onLoad((options) => {
  const raw = ((options ?? {}) as Record<string, unknown>).url;
  const incoming = typeof raw === "string" ? raw : "";
  // 旧端 :25：decodeURIComponent（非法编码保持原样，不阻断判定）
  let decoded = incoming;
  try {
    decoded = decodeURIComponent(incoming);
  } catch {
    decoded = incoming;
  }
  if (isAllowedWebviewUrl(decoded, { allowedHosts })) {
    url.value = decoded;
  } else {
    // 拒绝路径：不渲染 web-view，提示后返回（旧端无此分支＝本批加固）
    rejected.value = true;
    if (typeof uni !== "undefined" && typeof uni.showToast === "function") {
      uni.showToast({ title: "链接不可打开", icon: "none" });
    }
    setTimeout(() => {
      requestBack();
    }, 800);
  }
  // 旧端 :27-28：statusBarHeight 容器守卫取值（默认 20）
  try {
    if (typeof uni !== "undefined" && typeof uni.getSystemInfoSync === "function") {
      const info = uni.getSystemInfoSync() as { statusBarHeight?: number };
      if (info.statusBarHeight != null) statusBarHeight.value = info.statusBarHeight;
    }
  } catch {
    // 容器异常保持默认 20
  }
});

function goBack(): void {
  requestBack();
}
</script>

<template>
  <view class="webview-container">
    <!-- 仅准入通过且已有地址时渲染 web-view（拒绝/未就绪时不出现空 src，CR 🟡4） -->
    <web-view v-if="url !== ''" :src="url"></web-view>
    <cover-view class="wv-nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <cover-view class="wv-nav-back" @click="goBack">
        <cover-image class="wv-nav-back-icon" src="/static/back-arrow.png"></cover-image>
      </cover-view>
    </cover-view>
  </view>
</template>

<style scoped>
.webview-container {
  width: 100%;
  height: 100vh;
}
.wv-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
}
.wv-nav-back {
  width: 88rpx;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wv-nav-back-icon {
  width: 48rpx;
  height: 48rpx;
}
</style>
