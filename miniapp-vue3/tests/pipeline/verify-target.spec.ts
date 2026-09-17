// P4-07/P4-13 产物断言测试：平台作用域路由（禁用路由不得出现）、抖音 tt 前缀产物、appid 占位告警。
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyTarget } from "../../scripts/verify-target.mjs";

function makeArtifact(opts: {
  pages: string[];
  appid?: string;
  withTtss?: boolean;
  navTitle?: string;
}) {
  const dir = mkdtempSync(join(tmpdir(), "verify-"));
  mkdirSync(join(dir, "common"), { recursive: true });
  writeFileSync(join(dir, "app.js"), "// app");
  writeFileSync(join(dir, "app.json"), JSON.stringify({ pages: opts.pages, window: { navigationBarTitleText: opts.navTitle ?? "AI试衣" } }));
  writeFileSync(join(dir, "project.config.json"), JSON.stringify({ appid: opts.appid ?? "wxreal" }));
  writeFileSync(join(dir, "common", "vendor.js"), "/* createApp */");
  if (opts.withTtss) writeFileSync(join(dir, "app.ttss"), ".a{}");
  return dir;
}

describe("verify-target（P4-07/P4-13 平台作用域断言）", () => {
  it("⭐抖音：AI 页若出现在产物 → 失败（客片展示版不得注册）", () => {
    const dir = makeArtifact({ pages: ["pages/index/index", "pages/aiTryOn/index"], withTtss: true });
    const r = verifyTarget({
      artifactDir: dir,
      manifest: { platform: "mp-toutiao", expectedRoutes: ["pages/index/index", "pages/aiTryOn/index"], appid: "ttreal", navTitle: "AI试衣", forbiddenRoutes: ["pages/aiTryOn"] },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("forbidden route present: pages/aiTryOn/index");
  });

  it("⭐抖音：缺 tt 前缀样式 app.ttss → 失败；齐备则通过", () => {
    const bad = makeArtifact({ pages: ["pages/index/index"] });
    const rb = verifyTarget({
      artifactDir: bad,
      manifest: { platform: "mp-toutiao", expectedRoutes: ["pages/index/index"], appid: "ttreal", navTitle: "AI试衣", forbiddenRoutes: [] },
    });
    expect(rb.errors.join(" ")).toContain("app.ttss");
    const ok = makeArtifact({ pages: ["pages/index/index"], appid: "ttreal", withTtss: true });
    const ro = verifyTarget({
      artifactDir: ok,
      manifest: { platform: "mp-toutiao", expectedRoutes: ["pages/index/index"], appid: "ttreal", navTitle: "AI试衣", forbiddenRoutes: [] },
    });
    expect(ro.ok).toBe(true);
    expect(ro.checked).toContain("platform:mp-toutiao(tt-files)");
  });

  it("⭐appid 占位（testAppId）→ **告警不伪装通过**：结果 ok 但 warnings 非空（该产物不可真机出码）", () => {
    const dir = makeArtifact({ pages: ["pages/index/index"], appid: "testAppId", withTtss: true });
    const r = verifyTarget({
      artifactDir: dir,
      manifest: { platform: "mp-toutiao", expectedRoutes: ["pages/index/index"], navTitle: "AI试衣", forbiddenRoutes: [] },
    });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toContain("placeholder");
  });

  it("微信：无禁用路由 ⇒ 不因平台作用域断言失败", () => {
    const dir = makeArtifact({ pages: ["pages/index/index", "pages/aiTryOn/index"] });
    const r = verifyTarget({
      artifactDir: dir,
      manifest: { platform: "mp-weixin", expectedRoutes: ["pages/aiTryOn/index", "pages/index/index"], appid: "wxreal", navTitle: "AI试衣", forbiddenRoutes: [] },
    });
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });
});
