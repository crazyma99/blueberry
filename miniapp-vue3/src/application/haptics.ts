// 触感反馈（旧端 utils/haptics.uts 忠实移植）：轻交互瞬态轻振动；失败静默不影响业务。
// 容器安全：uni.vibrateShort 不存在（测试环境）时安全跳过。
export function hapticTap(): void {
  try {
    if (typeof uni !== "undefined" && typeof uni.vibrateShort === "function") {
      uni.vibrateShort({ type: "light" });
    }
  } catch {
    // 静默
  }
}
