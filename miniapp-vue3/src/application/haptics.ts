// 触感反馈（旧端 utils/haptics.uts 忠实移植）：轻交互瞬态轻振动；失败静默不影响业务。
// ⭐P4-12：平台调用下沉 `platform/uni/haptics.ts`（本层不再直触 `uni.vibrateShort`）——
// 默认端口按需构造，调用方亦可注入替身（测试/多端）。
import { createUniHaptics, type HapticsPort } from "../platform/uni/haptics";

let defaultPort: HapticsPort | null = null;

function port(): HapticsPort {
  if (defaultPort == null) defaultPort = createUniHaptics();
  return defaultPort;
}

export function hapticTap(): void {
  port().tap();
}
