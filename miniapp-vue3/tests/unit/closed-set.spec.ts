// P1-12 闭集测试：未知 engine/platform/env 必须失败；必需能力 unknown/unsupported 阻断；可选降级须批准文案
import { describe, expect, it } from "vitest";
import {
  ENGINES, PLATFORMS, ENVIRONMENTS,
  isEngine, isPlatform, isEnvironment,
  requireCapability, degradeCapability,
} from "../../src/ports/context";

describe("engine/platform/env 闭集（未知值拒绝）", () => {
  it("engine：legacy/vue3 通过，其余拒绝", () => {
    expect(isEngine("legacy")).toBe(true);
    expect(isEngine("vue3")).toBe(true);
    expect(isEngine("uniapp-x")).toBe(false);
    expect(isEngine(undefined)).toBe(false);
    expect(ENGINES.length).toBe(2);
  });
  it("platform：三端批准闭集，其余拒绝", () => {
    for (const p of ["mp-weixin", "mp-toutiao", "mp-xhs"]) expect(isPlatform(p)).toBe(true);
    for (const p of ["mp-kuaishou", "mp-douyin", "h5", "mp-alipay"]) expect(isPlatform(p)).toBe(false);
    expect(PLATFORMS.length).toBe(3);
  });
  it("env：develop/trial/release 通过，production/staging 拒绝", () => {
    for (const e of ["develop", "trial", "release"]) expect(isEnvironment(e)).toBe(true);
    for (const e of ["production", "staging", "prod"]) expect(isEnvironment(e)).toBe(false);
    expect(ENVIRONMENTS.length).toBe(3);
  });
});

describe("能力门禁（P1-12）", () => {
  it("必需能力 supported 放行；unsupported/unknown 阻断", () => {
    expect(requireCapability({ name: "payment", level: "supported" }).ok).toBe(true);
    expect(requireCapability({ name: "payment", level: "unsupported" }).ok).toBe(false);
    expect(requireCapability({ name: "payment", level: "unknown" }).ok).toBe(false);
  });
  it("可选能力降级必须带非空批准文案", () => {
    expect(degradeCapability({ name: "haptics", level: "unsupported" }, "").ok).toBe(false);
    expect(degradeCapability({ name: "haptics", level: "unsupported" }, "   ").ok).toBe(false);
    const r = degradeCapability({ name: "haptics", level: "unsupported" }, "抖音端无震动能力，降级静默（主人批准 2026-09-17）");
    expect(r.ok).toBe(true);
  });
});
