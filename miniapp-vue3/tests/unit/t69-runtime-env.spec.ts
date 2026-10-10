// 运行时环境分流（2026-10-10 主人指示）——**仿照微信既有实现**（旧端 `src/utils/config.uts:18-19`：
// `uni.getAccountInfoSync().miniProgram.envVersion === 'release' ? 正式域 : 测试域`）。
// 断言目标：①微信口径 ②抖音兜底 ③都取不到 ⇒ 回落构建期 ④异常绝不抛。
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { envVersionToEnvironment, resolveRuntimeEnvironment } from "../../src/platform/uni/runtime-env";
import { PROFILE } from "../../src/generated/profile.config";

const g = globalThis as { uni?: unknown; tt?: unknown };
beforeEach(() => {
  delete g.uni;
  delete g.tt;
});
afterEach(() => {
  delete g.uni;
  delete g.tt;
});

describe("runtime-env：按小程序版本自动分流（微信口径 + 抖音兜底）", () => {
  it("版本标识映射闭集：release/production→release；trial/preview→trial；develop/development→develop；未知→null", () => {
    expect(envVersionToEnvironment("release")).toBe("release");
    expect(envVersionToEnvironment("production")).toBe("release");
    expect(envVersionToEnvironment("trial")).toBe("trial");
    expect(envVersionToEnvironment("preview")).toBe("trial");
    expect(envVersionToEnvironment("develop")).toBe("develop");
    expect(envVersionToEnvironment("development")).toBe("develop");
    expect(envVersionToEnvironment("whatever")).toBeNull();
    expect(envVersionToEnvironment(undefined)).toBeNull();
  });

  it("⭐微信口径（仿旧端）：envVersion=release ⇒ 正式域；trial/develop ⇒ 测试域", () => {
    g.uni = { getAccountInfoSync: () => ({ miniProgram: { envVersion: "release" } }) };
    let env = resolveRuntimeEnvironment("trial"); // 运行时应纠正构建期
    expect(env).toBe("release");
    expect(PROFILE.apiBases[env]).toContain("lanmei66.cloud");

    g.uni = { getAccountInfoSync: () => ({ miniProgram: { envVersion: "trial" } }) };
    env = resolveRuntimeEnvironment("release");
    expect(env).toBe("trial");
    expect(PROFILE.apiBases[env]).toContain("crazyma99.xyz");

    g.uni = { getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }) };
    expect(resolveRuntimeEnvironment("release")).toBe("develop");
    expect(PROFILE.apiBases["develop"]).toContain("crazyma99.xyz");
  });

  it("⭐抖音：uni 未归一 envVersion 时，走 `tt.getEnvInfoSync().microapp.envType` 兜底", () => {
    g.tt = { getEnvInfoSync: () => ({ microapp: { envType: "production" } }) };
    expect(resolveRuntimeEnvironment("trial")).toBe("release");
    g.tt = { getEnvInfoSync: () => ({ microapp: { envType: "preview" } }) };
    expect(resolveRuntimeEnvironment("release")).toBe("trial");
    g.tt = { getEnvInfoSync: () => ({ microapp: { envType: "development" } }) };
    expect(resolveRuntimeEnvironment("release")).toBe("develop");
    // uni 与 tt 同时可用时：以 uni 的 envVersion 为准（与微信同口径）
    g.uni = { getAccountInfoSync: () => ({ miniProgram: { envVersion: "release" } }) };
    g.tt = { getEnvInfoSync: () => ({ microapp: { envType: "preview" } }) };
    expect(resolveRuntimeEnvironment("develop")).toBe("release");
  });

  it("取不到（其他端／接口缺失）⇒ **原样返回构建期环境**（零回归）", () => {
    expect(resolveRuntimeEnvironment("release")).toBe("release");
    expect(resolveRuntimeEnvironment("trial")).toBe("trial");
    expect(resolveRuntimeEnvironment("develop")).toBe("develop");
    g.uni = {}; // 容器有 uni 但无 getAccountInfoSync
    expect(resolveRuntimeEnvironment("trial")).toBe("trial");
  });

  it("探测异常（低版本 <2.21.0／IDE 异常／返回值畸形）⇒ 回落构建期，**绝不抛**", () => {
    g.uni = {
      getAccountInfoSync: () => {
        throw new Error("getAccountInfoSync:fail");
      },
    };
    expect(() => resolveRuntimeEnvironment("trial")).not.toThrow();
    expect(resolveRuntimeEnvironment("trial")).toBe("trial");

    g.uni = { getAccountInfoSync: () => ({}) }; // 缺 miniProgram
    g.tt = {
      getEnvInfoSync: () => {
        throw new Error("getEnvInfoSync:fail native exception");
      },
    };
    expect(resolveRuntimeEnvironment("release")).toBe("release");

    g.uni = { getAccountInfoSync: () => ({ miniProgram: { envVersion: "unknown-value" } }) };
    g.tt = { getEnvInfoSync: () => ({ microapp: {} }) };
    expect(resolveRuntimeEnvironment("release")).toBe("release");
  });
});
