// 反馈小函数共享端口——收敛自 9 个页面内逐字重复的 uni 反馈 helper（纯去重重构，零行为变化）：
//   toast(title, icon="none")/showLoading/hideLoading ← pages/mine、aiTryOn、aiTryOnResult、aiRecommend；
//   toast(title)（固定 icon:"none"）← pages/favorites、brandHub、aiTryOnHistory、aiRecommendResult
//     ——共享版 icon 默认值 "none"，与固定写死版逐字同义；
//   showModal(title, content)（showCancel:false／confirmText:"知道了"）← pages/aiTryOn、aiTryOnResult、aiRecommend；
//   navigateTo(url) ← pages/aiRecommend、aiRecommendResult。
// 轻提示（2026-11 统一）：非抖音 → toast-host 栈顶 BaseFeedback（wot 金色）；抖音/无宿主 → 原生 uni.showToast。
// 容器安全：uni 全局或对应 API 缺失（测试/异常容器）一律静默跳过，不抛。
import { isToutiaoPlatform } from "../../ui/ui-platform";
import { showToastViaHost } from "../../ui/toast-host";

export function toast(title: string, icon: "none" | "success" = "none"): void {
  // 非抖音：优先投递给栈顶 BaseFeedback 宿主（wot 金色 Toast，统一样式）；抖音保持原生（wot toast 在抖音浮层失效）。
  // 无宿主 → 回落原生，保证测试/异常容器不退化。
  if (!isToutiaoPlatform() && showToastViaHost(title, icon === "success" ? "success" : undefined)) return;
  nativeToast(title, icon);
}

// 原生兜底（tt 平台 ＋ 无宿主回落）
function nativeToast(title: string, icon: "none" | "success"): void {
  if (typeof uni !== "undefined" && typeof uni.showToast === "function") uni.showToast({ title, icon });
}

export function showLoading(title: string): void {
  if (typeof uni !== "undefined" && typeof uni.showLoading === "function") uni.showLoading({ title, mask: true });
}

export function hideLoading(): void {
  if (typeof uni !== "undefined" && typeof uni.hideLoading === "function") uni.hideLoading();
}

export function showModal(title: string, content: string): void {
  if (typeof uni !== "undefined" && typeof uni.showModal === "function") {
    uni.showModal({ title, content, showCancel: false, confirmText: "知道了" });
  }
}

export function navigateTo(url: string): void {
  if (typeof uni !== "undefined" && typeof uni.navigateTo === "function") uni.navigateTo({ url });
}
