// 端标识（channel）——随请求头 `X-Channel` 上报，供服务端区分「端」。
//
// 为什么需要它（2026-10-10 主人拍板）：
//  1. 后端已把「照片质量门」前移到 `POST /api/aiface/upload`（后端提交 `fecf5d4`）。旧端（`main` 封版）
//     在上传阶段**不认** `4002`，若门槛对其生效会「静默失败」⇒ 后端将改为「**仅当请求带 `X-Channel`
//     时才启门**」；本模块＝新端主动声明身份的那一半（前端带、后端认）。
//  2. 为后续「**按端独立订阅**」（微信／抖音各一笔）的端维度记账打底（P0-1）。
//
// 纪律（多端 SPEC §C3）：**逻辑层零 `#ifdef`** ⇒ 平台一律**由参数传入**（`PROFILE.platform` 或
// `RequestContext.platform`），本模块是纯函数、可在 vitest 直接测（无需 uni 条件编译）。
import type { Platform } from "../ports/context";

/** 端标识闭集（与 `ports/context.ts` 的 `PLATFORMS` 一一映射；`xhs` 为小红书端预留） */
export const CHANNELS = ["wx", "tt", "xhs"] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * 构建平台 → 端标识的**显式穷尽表**（独立 CR R4/R5 建议）：
 * `Record<Platform, Channel>` ⇒ **将来新增端若忘在此登记，`vue-tsc` 直接编译报错**
 * （比"靠单测断言发现"强一档）；`channel.spec.ts` 另断言表键与 `PLATFORMS` 完全一致。
 */
export const CHANNEL_BY_PLATFORM: Record<Platform, Channel> = {
  "mp-weixin": "wx",
  "mp-toutiao": "tt",
  "mp-xhs": "xhs",
};

/**
 * 构建平台 → 端标识。
 *  - 闭集内：走 `CHANNEL_BY_PLATFORM`（显式登记）
 *  - 闭集外（`null`／空串／未来新增但未登记的平台，如 `"other"`）：兜底 **`wx`** ——
 *    取向是「**宁可让服务端的质量门生效，也不要因认不出平台而漏掉保护**」。
 *    ⚠️ 兜底只保证"不漏门"，**不代表归属正确**；新增端请在 `CHANNEL_BY_PLATFORM` 显式登记。
 */
export function channelOf(platform: Platform | string | null | undefined): Channel {
  if (platform != null && Object.prototype.hasOwnProperty.call(CHANNEL_BY_PLATFORM, platform)) {
    return CHANNEL_BY_PLATFORM[platform as Platform];
  }
  return "wx";
}
