// 运行时环境解析（2026-10-10 主人指示）：**按小程序版本自动分流接口域名**。
//
// 口径**仿照微信既有实现**（旧端 `src/utils/config.uts:18-19`）：
//   const envVersion = uni.getAccountInfoSync().miniProgram.envVersion
//   const baseURL = envVersion === 'release' ? 'https://lanmei66.cloud' : 'https://crazyma99.xyz'
// ⇒ 本模块把它落到新端的分层里，并用同一套口径覆盖**所有端**（微信／抖音／小红书）：
//   ① `uni.getAccountInfoSync().miniProgram.envVersion`（uni 跨端 API：微信映射 `wx.*`、抖音映射 `tt.*`）
//   ② 抖音兜底：`tt.getEnvInfoSync().microapp.envType`（部分运行时 uni 未做归一）
//   ③ 都取不到 ⇒ **回落构建期 `PROFILE.environment`**（fail-safe，绝不抛）
//
// 分流域名：`release` ⇒ `https://lanmei66.cloud`（线上版）；`trial`/`develop` ⇒ `https://crazyma99.xyz`
// （预览版／测试版）—— 与 `PROFILE.apiBases` 的既有映射一致，故调用方仍写 `PROFILE.apiBases[env]`。
//
// 实现纪律（合多端 SPEC §结构纪律／仓内既有模式）：
//   · 容器 API 一律**惰性解析**：优先 `globalThis.uni`（测试桩/H5），回落**裸 `uni`**（mp 产物由编译器
//     改写为 `common_vendor.index`）——与 `platform/uni/storage.ts` 的 `uniApi()` 同口径；
//   · `globalThis` 存在性守卫（抖音运行时不提供 `globalThis`，直读会崩，2026-10-10 实测）；
//   · 任何异常（低版本、IDE 异常、返回值畸形）⇒ 回落构建期环境，**绝不抛**。
import type { Environment } from "../../ports/context";

interface UniAccountLike {
  getAccountInfoSync?: () => { miniProgram?: { envVersion?: unknown } };
}
interface TtEnvLike {
  getEnvInfoSync?: () => { microapp?: { envType?: unknown } };
}

/** 取容器注入的 `uni`（并集类型：只声明本模块用到的方法） */
function uniApi(): (UniAccountLike & { tt?: unknown }) | undefined {
  const injected = (typeof globalThis === "undefined" ? undefined : (globalThis as { uni?: UniAccountLike }).uni);
  if (injected != null) return injected;
  return typeof uni !== "undefined" ? (uni as unknown as UniAccountLike) : undefined;
}

/** 抖音全局对象（tt 小程序里以**裸标识符**使用，如 `tt.xxx()`；微信端不存在 ⇒ `typeof` 判定安全） */
declare const tt: TtEnvLike | undefined;

/** 取容器注入的抖音 `tt`（仅抖音运行时提供；微信/其他端没有 ⇒ 自然回落） */
function ttApi(): TtEnvLike | undefined {
  // ⚠️ 2026-10-10 实测纠偏：**抖音运行时不提供 `globalThis`**（IDE sm 模式实测 `globalThis` 为 undefined）
  // ⇒ 必须先试**裸 `tt`**（与 `platform/uni/storage.ts` 用裸 `uni` 同口径）；`globalThis.tt` 仅作测试桩兜底。
  if (typeof tt !== "undefined" && tt != null) return tt;
  const g = typeof globalThis === "undefined" ? undefined : (globalThis as { tt?: TtEnvLike });
  return g?.tt;
}

/**
 * 版本标识 → 本项目 `Environment` 闭集（同时兼容两套字面量）：
 *  · 微信/uni 的 `envVersion`：`develop` / `trial` / `release`
 *  · 抖音的 `envType`：`development`（测试版）/ `preview`（预览版）/ `production`（线上版）
 * 未知一律 `null`（调用方回落构建期环境）。
 */
export function envVersionToEnvironment(v: unknown): Environment | null {
  if (v === "release" || v === "production") return "release";
  if (v === "trial" || v === "preview") return "trial";
  if (v === "develop" || v === "development") return "develop";
  return null;
}

/** 一次性启动日志（每进程一次；便于真机/IDE 直接核对"环境切没切成功"） */
let logged = false;

/**
 * 解析**运行时**环境；取不到一律回落 `buildEnv`（构建期 `PROFILE.environment`）。
 * 微信端自此与旧端口径一致（正式版 ⇒ 正式域；开发/体验版 ⇒ 测试域）。
 */
export function resolveRuntimeEnvironment(buildEnv: Environment): Environment {
  let envVersion: unknown;
  let envType: unknown;
  let resolved: Environment | null = null;
  // ① 仿照微信既有口径（uni 跨端 API）
  try {
    envVersion = uniApi()?.getAccountInfoSync?.()?.miniProgram?.envVersion;
    resolved = envVersionToEnvironment(envVersion);
  } catch {
    /* 低版本/异常 ⇒ 继续兜底 */
  }
  // ② 抖音兜底（uni 未把 envType 归一为 envVersion 时）
  if (resolved == null) {
    try {
      envType = ttApi()?.getEnvInfoSync?.()?.microapp?.envType;
      resolved = envVersionToEnvironment(envType);
    } catch {
      /* 同上 */
    }
  }
  // ③ 构建期环境
  const env = resolved ?? buildEnv;
  if (!logged) {
    logged = true;
    console.log("[runtime-env] 环境判定 =", {
      envVersion: envVersion ?? "(取不到)",
      envType: envType ?? "(取不到)",
      env,
      落点: resolved == null ? "构建期兜底" : "运行时分流",
      期望域名: env === "release" ? "lanmei66.cloud" : "crazyma99.xyz",
    });
  }
  return env;
}
