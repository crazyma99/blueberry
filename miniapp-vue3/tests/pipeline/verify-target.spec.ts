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

  it("⭐appid 占位（testAppId）→ **阻断（ok=false）**，不伪装通过（CR 🟡：下游只读 ok，warnings 会被误读）", () => {
    const dir = makeArtifact({ pages: ["pages/index/index"], appid: "testAppId", withTtss: true });
    const r = verifyTarget({
      artifactDir: dir,
      manifest: { platform: "mp-toutiao", expectedRoutes: ["pages/index/index"], appid: "ttreal", navTitle: "AI试衣", forbiddenRoutes: [] },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("placeholder");
  });

  it("⭐隔离干扰：同为合法 appid、**仅多一条禁用路由** → 仍失败（证明失败直接挂钩新断言）", () => {
    const dir = makeArtifact({ pages: ["pages/index/index", "pages/aiRecommend/index"], appid: "ttreal", withTtss: true });
    const r = verifyTarget({
      artifactDir: dir,
      manifest: { platform: "mp-toutiao", expectedRoutes: ["pages/aiRecommend/index", "pages/index/index"], appid: "ttreal", navTitle: "AI试衣", forbiddenRoutes: ["pages/aiRecommend"] },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("forbidden route present: pages/aiRecommend/index");
  });

  it("⭐subPackages 内的禁用页也要拦（CR 🟡：只扫 pages 会漏判）", () => {
    const dir = mkdtempSync(join(tmpdir(), "verify-"));
    mkdirSync(join(dir, "common"), { recursive: true });
    writeFileSync(join(dir, "app.js"), "// app");
    writeFileSync(
      join(dir, "app.json"),
      JSON.stringify({
        pages: ["pages/index/index"],
        subPackages: [{ root: "pages/ai/", pages: ["tryOn/index"] }],
        window: { navigationBarTitleText: "AI试衣" },
      }),
    );
    writeFileSync(join(dir, "project.config.json"), JSON.stringify({ appid: "ttreal" }));
    writeFileSync(join(dir, "common", "vendor.js"), "/* createApp */");
    writeFileSync(join(dir, "app.ttss"), ".a{}");
    const r = verifyTarget({
      artifactDir: dir,
      manifest: { platform: "mp-toutiao", expectedRoutes: ["pages/index/index"], appid: "ttreal", navTitle: "AI试衣", forbiddenRoutes: ["pages/ai/"] },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("pages/ai/tryOn/index");
  });

  // CLI 入口已手工验证（`node scripts/verify-target.mjs --manifest … --artifact …` 通过→exit 0、缺产物→exit 1）；
  // 此处不做进程级冒烟，避免测试脚手架脆性（CR 建议项，已在 phase4-prep 记录）。


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
