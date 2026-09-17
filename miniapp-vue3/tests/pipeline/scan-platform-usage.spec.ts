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

  it("⭐可绕过构造（加固）：globalThis 访问／别名赋值／解构取值／方括号访问 一律报 bypass", () => {
    const cases: Array<[string, string]> = [
      ["globalThis-access", "const w = globalThis.wx; w.request({})"],
      ["alias-assignment", "const w = wx; w.request({})"],
      ["destructure", "const { request } = uni; request({})"],
      ["bracket-access", 'wx["setVisualEffectOnCapture"]({})'],
    ];
    for (const [name, code] of cases) {
      const out = scanSource("src/pages/index/index.vue", code);
      expect(out, name + " 未被拦截: " + JSON.stringify(out)).toContain("bypass:" + name);
    }
    // 允许目录内同样不报（平台适配层本来就该这么写）
    expect(scanSource("src/platform/uni/transport.ts", "const w = wx; w.request({})")).toEqual([]);
  });

  it("⭐CR 🔴3 回归：同行字符串含 `//` 不得吞掉其后真实调用；globalThis 方括号形式必拦", () => {
    // 曾漏报：字符串里的 // 把整行其后当真注释
    expect(scanSource("src/pages/index/index.vue", 'const u = "https://x.com"; tt.login({})')).toContain("tt.login");
    expect(scanSource("src/pages/index/index.vue", 'const b = "https://api.lanmei66.cloud"; wx.setVisualEffectOnCapture({})')).toContain("wx.setVisualEffectOnCapture");
    // 第 5 类：globalThis 方括号取值
    expect(scanSource("src/pages/index/index.vue", 'globalThis["wx"].request({})')).toContain("bypass:bracket-access");
    expect(scanSource("src/pages/index/index.vue", "const w = globalThis['wx']; w.request({})")).toContain("bypass:bracket-access");
  });

  it("⭐CR 抓到的真实越界已下沉：`application/haptics.ts` 不再直触平台（`platform/uni/haptics.ts` 承接）", () => {
    const root = resolve(__dirname, "../..");
    const app = readFileSync(join(root, "src/application/haptics.ts"), "utf-8");
    const plat = readFileSync(join(root, "src/platform/uni/haptics.ts"), "utf-8");
    expect(scanSource("src/application/haptics.ts", app)).toEqual([]); // 本层零平台 API
    expect(plat).toContain("uni.vibrateShort"); // 平台层承接
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
