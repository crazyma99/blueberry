// 端口层：上下文与闭集（纯 TS；不导入 Vue/Pinia/Wot/平台 SDK）
// P1-12：未知 engine/platform/env 必须失败；必需能力 unknown/unsupported 阻断；可选降级须批准文案。

export const ENGINES = ["legacy", "vue3"] as const;
export type Engine = (typeof ENGINES)[number];

export const PLATFORMS = ["mp-weixin", "mp-toutiao", "mp-xhs"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const ENVIRONMENTS = ["develop", "trial", "release"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export function isEngine(v: unknown): v is Engine {
  return typeof v === "string" && (ENGINES as readonly string[]).includes(v);
}
export function isPlatform(v: unknown): v is Platform {
  return typeof v === "string" && (PLATFORMS as readonly string[]).includes(v);
}
export function isEnvironment(v: unknown): v is Environment {
  return typeof v === "string" && (ENVIRONMENTS as readonly string[]).includes(v);
}

export interface RequestContext {
  readonly platform: Platform;
  readonly environment: Environment;
  readonly brandId: string | null;
  readonly requestId: string;
}

export type CapabilityLevel = "supported" | "unsupported" | "unknown";

export interface Capability {
  readonly name: string;
  readonly level: CapabilityLevel;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
export function fail<T = never>(reason: string): Result<T> {
  return { ok: false, reason };
}

/** 必须能力：仅 supported 放行，unsupported/unknown 一律阻断 */
export function requireCapability(cap: Capability): Result<Capability> {
  if (cap.level === "supported") return ok(cap);
  return fail("required capability " + cap.name + " is " + cap.level);
}

/** 可选能力降级：必须携带非空批准文案才放行 */
export function degradeCapability(cap: Capability, approvedNote: string): Result<Capability> {
  if (approvedNote.trim().length === 0) {
    return fail("optional capability " + cap.name + " degraded without approved note");
  }
  return ok(cap);
}
