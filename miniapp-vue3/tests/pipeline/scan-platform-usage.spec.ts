// P4-12 扫描规则测试：敏感平台 API 仅允许在 platform/ui/generated 或**显式登记的例外**中出现；
// UI 类 API 与注释提及不算违规；真实仓库扫描应为 0 违规。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { REGISTERED_EXCEPTIONS, collectSources, scanPlatformUsage, scanSource } from "../../scripts/scan-platform-usage.mjs";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("P4-12 平台用法扫描规则", () => {
  it("允许目录（platform/ui/generated）内的敏感 API 不报", () => {
    expect(scanSource("src/platform/uni/login.ts", "uni.login({}); wx.setVisualEffectOnCapture({})")).toEqual([]);
    expect(scanSource("src/ui/BaseButton.vue", "uni.request({})")).toEqual([]);
  });

  it("⭐业务层出现敏感 API → 报违规（wx.*/tt.*/uni.request 等）", () => {
    expect(scanSource("src/pages/index/index.vue", "uni.request({url:'/x'})")).toEqual(["uni.request"]);
    expect(scanSource("src/components/A.vue", "const s = wx.getStorageSync('k')")).toEqual(["wx.getStorageSync"]);
    expect(scanSource("src/application/x.ts", "tt.login({})")).toEqual(["tt.login"]);
  });

  it("UI 类 API（toast/导航/getSystemInfoSync）与注释提及**不算违规**", () => {
    const uiOnly = "uni.showToast({}); uni.navigateTo({url:'/x'}); uni.showLoading({}); uni.hideLoading(); uni.getSystemInfoSync(); uni.switchTab({});";
    expect(scanSource("src/pages/index/index.vue", uiOnly)).toEqual([]);
    expect(scanSource("src/pages/index/index.vue", "// 旧端用 wx.setVisualEffectOnCapture\n/* uni.login 见 platform 层 */")).toEqual([]);
  });

  it("⭐登记例外放行、且例外必须带理由（防「悄悄放行」）", () => {
    for (const e of REGISTERED_EXCEPTIONS) {
      expect(e.file).toMatch(/^src\//);
      expect(typeof e.reason).toBe("string");
      expect(e.reason.length).toBeGreaterThan(10);
    }
    expect(scanSource("src/application/ai-share-routing.ts", "uni.getEnterOptionsSync()")).toEqual([]);
    // 例外只对该 file+api 生效，别的文件/别的 api 仍报
    expect(scanSource("src/application/other.ts", "uni.getEnterOptionsSync()")).toEqual(["uni.getEnterOptionsSync"]);
    expect(scanSource("src/application/ai-share-routing.ts", "uni.request({})")).toEqual(["uni.request"]);
  });

  it("⭐真实仓库扫描：0 违规（规则与代码现状一致）", () => {
    const root = resolve(__dirname, "../..");
    const files = collectSources(join(root, "src"), walk);
    const violations = scanPlatformUsage(files);
    expect(violations, JSON.stringify(violations)).toEqual([]);
    expect(files.length).toBeGreaterThan(50); // 确认确实扫到了源码
    // 例外的文件确实存在（防登记幽灵例外）
    for (const e of REGISTERED_EXCEPTIONS) {
      expect(readFileSync(join(root, e.file), "utf-8")).toContain(e.api);
    }
  });
});
