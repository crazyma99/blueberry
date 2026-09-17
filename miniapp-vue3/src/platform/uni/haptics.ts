// 触感反馈平台端口（P4-12：平台 API 只允许出现在 src/platform/**；旧端 utils/haptics.uts 语义）。
// 容器安全：uni.vibrateShort 不存在（测试环境/非支持端）时安全跳过——**能力降级，不抛**。
export interface HapticsPort {
  /** 轻交互瞬态轻振动 */
  tap(): void;
}

export function createUniHaptics(): HapticsPort {
  return {
    tap(): void {
      try {
        if (typeof uni !== "undefined" && typeof uni.vibrateShort === "function") {
          uni.vibrateShort({ type: "light" });
        }
      } catch {
        // 静默
      }
    },
  };
}
