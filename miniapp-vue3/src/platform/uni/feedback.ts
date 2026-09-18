// 反馈小函数共享端口——收敛自 9 个页面内逐字重复的 uni 反馈 helper（纯去重重构，零行为变化）：
//   toast(title, icon="none")/showLoading/hideLoading ← pages/mine、aiTryOn、aiTryOnResult、aiRecommend；
//   toast(title)（固定 icon:"none"）← pages/favorites、brandHub、aiTryOnHistory、aiRecommendResult
//     ——共享版 icon 默认值 "none"，与固定写死版逐字同义；
//   showModal(title, content)（showCancel:false／confirmText:"知道了"）← pages/aiTryOn、aiTryOnResult、aiRecommend；
//   navigateTo(url) ← pages/aiRecommend、aiRecommendResult。
// 容器安全：uni 全局或对应 API 缺失（测试/异常容器）一律静默跳过，不抛。
export function toast(title: string, icon: "none" | "success" = "none"): void {
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
