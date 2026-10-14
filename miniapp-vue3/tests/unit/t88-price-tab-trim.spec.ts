// T88（2026-10-14 · task-70）：抖音端价目表「整条链」裁剪——底栏无 tab、两页不注册、无其它入口。
// 背景：抖音「生活服务-摄影」类目未过审 ⇒ 主人要求**价目表整个 tab ＋ 内容一并隐藏**（本单）。技术事实：抖音用**原生
// tabBar**（custom:true 仅在 #ifdef MP-WEIXIN 内）⇒ 运行期无法按 profile 位过滤 ⇒ 走**编译期裁剪**（
// pages.json 三处 #ifndef MP-TOUTIAO ＋ C4/COMPAT_DECLARATIONS 登记 ＋ 生成期页清单 11→9 ＋ features.priceTab 单一事实源）。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateProfile } from "../../scripts/profile-schema.mjs";
import { COMPAT_DECLARATIONS } from "../../scripts/scan-platform-usage.mjs";

const root = resolve(__dirname, "../..");
const rawA = JSON.parse(readFileSync(resolve(root, "tests/fixtures/profiles/A.json"), "utf-8"));
const PRICE_PAGES = ["pages/priceHomePage/index", "pages/priceList/index"];

describe("t88 · ① profile：抖音页清单 11→9（剔除价目表两页）＋ priceTab 位", () => {
  it("⭐抖音：9 页、不含价目表两页、priceTab=false", () => {
    const r = validateProfile(rawA, { platform: "mp-toutiao", environment: "trial" });
    expect(r.ok).toBe(true);
    expect(r.profile.pageRegistry.length).toBe(9);
    for (const p of PRICE_PAGES) expect(r.profile.pageRegistry, p).not.toContain(p);
    expect(r.profile.features.priceTab).toBe(false);
  });

  it("⭐微信：17 页、含价目表两页、priceTab=true（保持现状）", () => {
    const r = validateProfile(rawA, { platform: "mp-weixin", environment: "release" });
    expect(r.profile.pageRegistry.length).toBe(17);
    for (const p of PRICE_PAGES) expect(r.profile.pageRegistry, p).toContain(p);
    expect(r.profile.features.priceTab).toBe(true);
  });
});

describe("t88 · ② 源码级：受控点数 == 调用点数（防漏）", () => {
  const pagesJson = readFileSync(resolve(root, "src/pages.json"), "utf-8");
  it("⭐pages.json 三处 #ifndef MP-TOUTIAO（价目表 tab 1 ＋ 两页注册 2）", () => {
    const blocks = pagesJson.match(/#ifndef MP-TOUTIAO/g) ?? [];
    expect(blocks.length).toBe(3);
    // 每处都必须配平 #endif
    expect((pagesJson.match(/#endif/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("⭐价目表在三处条件块内（不在抖音注册）：tab 项与两页 path 都位于 #ifndef 段内", () => {
    for (const needle of ['"path": "pages/priceHomePage/index"', '"path": "pages/priceList/index"', '"pagePath": "pages/priceHomePage/index"']) {
      const i = pagesJson.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      const before = pagesJson.lastIndexOf("#ifndef MP-TOUTIAO", i);
      const endIf = pagesJson.lastIndexOf("#endif", i);
      expect(before, needle + " 应位于 #ifndef MP-TOUTIAO 段内").toBeGreaterThan(endIf);
    }
  });

  it("⭐C4 登记：COMPAT_DECLARATIONS 含 src/pages.json | MP-TOUTIAO（含影响端＋后果）", () => {
    const hit = COMPAT_DECLARATIONS.find((d: { file: string; macro: string }) => d.file === "src/pages.json" && d.macro === "MP-TOUTIAO");
    expect(hit).toBeDefined();
    expect(String((hit as { reason: string }).reason)).toContain("抖音");
    expect(String((hit as { reason: string }).reason).length).toBeGreaterThan(40);
  });

  it("⭐其它代码入口 0 处（除 pages.json 配置与微信自定义 tabbar 外，无任何 price 页跳转）", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name === "node_modules" || name === ".work" || name === "dist") continue;
          walk(p);
          continue;
        }
        if (!/\.(vue|ts|js|json)$/.test(name)) continue;
        const rel = p.slice(root.length + 1);
        if (rel === "src/pages.json" || rel.startsWith("src/custom-tab-bar/")) continue; // 配置层与微信自绘 tabbar（微信保持现状）
        if (rel.startsWith("src/generated/")) continue; // 生成期 profile（按平台生成：抖音产物内不含两页，见 ① 断言）
        const src = readFileSync(p, "utf-8");
        for (const page of PRICE_PAGES) if (src.includes(page)) hits.push(rel + " -> " + page);
      }
    };
    walk(resolve(root, "src"));
    // 页面自身文件不算入口
    const entries = hits.filter((h) => !/^src\/pages\/price(HomePage|List)\//.test(h));
    expect(entries, "不得存在其它入口: " + entries.join(", ")).toEqual([]);
  });
});
