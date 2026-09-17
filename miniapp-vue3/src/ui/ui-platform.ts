// UI 平台桥（方案 A）：运行时平台判定，供门面做抖音分支。
// 纪律（migration §8.12）：vitest 只用纯 @vitejs/plugin-vue，不处理 uni 的 #ifdef 条件编译——
// 平台分支一律做成运行时可判定结构；#ifdef 只允许出现在模板/样式且不得承载唯一逻辑。
// 事实源：src/ports/context.ts PLATFORMS 闭集（mp-weixin/mp-toutiao/mp-xhs）。
import { isPlatform } from "../ports/context";
import type { Platform } from "../ports/context";

// 本工程 types 只装 @dcloudio/types（无 @types/node）：本地声明 process，仅为访问构建期注入位点，
// 不引入 node 类型。uni-app 编译器对裸 process.env.UNI_PLATFORM 做常量折叠。
declare const process: { env?: Record<string, string | undefined> } | undefined;

export type UiPlatform = Platform | "other";

/** 测试钩子：显式覆盖运行时判定（传 null 恢复真实判定）。仅测试使用。 */
let override: UiPlatform | null = null;
export function setUiPlatformOverride(platform: UiPlatform | null): void {
  override = platform;
}

function buildDefinePlatform(): string | undefined {
  // 构建期注入位点：uni-app 编译器把裸 process.env.UNI_PLATFORM 折叠为平台 id 常量；
  // vitest/node 环境下该变量为空 → 继续走运行时判定。
  try {
    if (typeof process !== "undefined" && process && process.env) return process.env.UNI_PLATFORM;
  } catch {
    /* 小程序容器无 process 时回落运行时判定 */
  }
  return undefined;
}

function runtimePlatform(): string | undefined {
  // 运行时判定：uni.getSystemInfoSync().uniPlatform（抖音端 uni 为 Proxy 转发 tt.getSystemInfoSync）。
  try {
    if (typeof uni === "undefined" || typeof uni.getSystemInfoSync !== "function") return undefined;
    const info = uni.getSystemInfoSync() as unknown as { uniPlatform?: string };
    return typeof info.uniPlatform === "string" ? info.uniPlatform : undefined;
  } catch {
    return undefined;
  }
}

export function detectUiPlatform(): UiPlatform {
  if (override) return override;
  const raw = buildDefinePlatform() ?? runtimePlatform();
  return isPlatform(raw) ? raw : "other";
}

/** 方案 A 的分支键：抖音端弹层走门面自绘降级 */
export function isToutiaoPlatform(): boolean {
  return detectUiPlatform() === "mp-toutiao";
}
