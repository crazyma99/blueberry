// 商家端运行时装配（M1 · issue #14）：把**平台相关构造**（uni 传输/存储/环境）与**商家会话服务**接到一起，
// 作为 pkg-merchant 各页面共用的**惰性单例**——同一进程内所有商家页共享同一个内存 coordinator，
// 一个页面遇 401 作废会话后，其它页面下次读取即见未登录（页面各自 new 会导致内存会话滞后，C 端 2026-10-11 就踩过这个坑）。
//
// 纪律：①**零平台直调**（uni.* 全部经 platform/uni 下既有适配器）；②不触碰 C 端会话/品牌上下文；
// ③接口域名走 `PROFILE.apiBases[env]` 运行时自动分流（env 严禁写接口地址）。
import { PROFILE } from "../../generated/profile.config";
import { resolveRuntimeEnvironment } from "../../platform/uni/runtime-env";
import { createUniTransport } from "../../platform/uni/transport";
import { createUniStorage } from "../../platform/uni/storage";
import { detectUiPlatform } from "../../ui/ui-platform";
import { isPlatform, type Platform } from "../../ports/context";
import { createMerchantTransport } from "../infrastructure/merchant-transport";
import { createMerchantSession, type MerchantSession } from "./merchant-session";

let instance: MerchantSession | null = null;

/** 接口根地址（运行时按小程序版本自动分流；与 transport 同口径，去尾斜杠）——multipart 上传需要绝对地址 */
export function merchantApiBase(): string {
  const env = resolveRuntimeEnvironment(PROFILE.environment);
  return PROFILE.apiBases[env].replace(/\/+$/, "");
}

export function getMerchantRuntime(): MerchantSession {
  if (instance != null) return instance;
  const detected = detectUiPlatform();
  // 商家端只在微信注册；非闭集值回落微信（与各页同口径）
  const platform: Platform = isPlatform(detected) ? detected : "mp-weixin";
  const env = resolveRuntimeEnvironment(PROFILE.environment);
  instance = createMerchantSession({
    backend: createUniStorage(),
    transport: createMerchantTransport(createUniTransport({ baseUrl: PROFILE.apiBases[env] })),
    platform,
    environment: env,
    profileKey: PROFILE.profileKey,
    appCode: PROFILE.appCode,
  });
  return instance;
}

/** 仅供测试复位单例 */
export function __resetMerchantRuntime(): void {
  instance = null;
}
