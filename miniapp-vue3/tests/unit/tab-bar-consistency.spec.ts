// 「到店预约」第二 Tab 守卫（2026-11-06）：下标/列表一致性 + 平台门控。
// 四处必须逐项一致：pages.json（微信求值后的 tabBar.list）≡ custom-tab-bar/index.js 的 list ≡ application/tabbar.ts 的 TAB_INDEX
// ≡ 各 tab 页 onShow 传给 syncTabBarSelected 的下标。
// 平台口径：微信四项（首页 0、到店预约 1、价目表 2、我的 3）；抖音为原生 tabBar（首页、我的；不注册预约/价目表），
// 小红书保持「首页、价目表、我的」。抖音端 syncTabBarSelected 恒为静默空操作（页面无 getTabBar），故下标不被消费。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateIfdefs, expectedRoutesForPlatform, stripJsonc } from "../../scripts/build-target.mjs";
import { syncTabBarSelected, TAB_INDEX } from "../../src/application/tabbar";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf-8");
const pagesJson = read("src/pages.json");

type Tab = { pagePath: string; text: string; iconPath?: string; selectedIconPath?: string };
function tabBarOf(platform: string): { custom?: boolean; list: Tab[] } {
  return JSON.parse(stripJsonc(evaluateIfdefs(pagesJson, platform))).tabBar;
}

/** custom-tab-bar/index.js 的 list（pagePath/icon/iconActive/text 四元组，按源码顺序） */
function customTabBarList(): Array<{ pagePath: string; icon: string; iconActive: string; text: string }> {
  const src = read("src/custom-tab-bar/index.js");
  const re = /pagePath:\s*'([^']+)',\s*icon:\s*'([^']+)',\s*iconActive:\s*'([^']+)',\s*text:\s*'([^']+)'/g;
  return [...src.matchAll(re)].map((m) => ({ pagePath: m[1], icon: m[2], iconActive: m[3], text: m[4] }));
}

const WX_ORDER = ["pages/index/index", "pages/booking/index", "pages/priceHomePage/index", "pages/mine/index"];

describe("tabBar 列表：三端", () => {
  it("⭐微信：四项且顺序＝首页、到店预约、价目表、我的；custom=true", () => {
    const tb = tabBarOf("mp-weixin");
    expect(tb.custom).toBe(true);
    expect(tb.list.map((t) => t.pagePath)).toEqual(WX_ORDER);
    expect(tb.list.map((t) => t.text)).toEqual(["首页", "到店预约", "价目表", "我的"]);
  });

  it("⭐抖音：原生 tabBar 维持现状（首页、我的），不含到店预约/价目表，且非 custom；项数合法（2–5）", () => {
    const tb = tabBarOf("mp-toutiao");
    expect(tb.custom).toBeUndefined();
    expect(tb.list.map((t) => t.pagePath)).toEqual(["pages/index/index", "pages/mine/index"]);
    expect(tb.list.length).toBeGreaterThanOrEqual(2);
    expect(tb.list.length).toBeLessThanOrEqual(5);
  });

  it("⭐小红书：保持现状（首页、价目表、我的），不含到店预约", () => {
    const tb = tabBarOf("mp-xhs");
    expect(tb.list.map((t) => t.pagePath)).toEqual(["pages/index/index", "pages/priceHomePage/index", "pages/mine/index"]);
  });

  it("每个端的 tabBar 项都在该端注册的页面里（原生 tabBar 引用未注册页面会让构建/审核失败）", () => {
    for (const platform of ["mp-weixin", "mp-toutiao", "mp-xhs"] as const) {
      const routes = expectedRoutesForPlatform(pagesJson, platform);
      for (const t of tabBarOf(platform).list) expect(routes, platform + " " + t.pagePath).toContain(t.pagePath);
    }
  });

  it("到店预约 Tab 项位于 `#ifdef MP-WEIXIN` 内（抖音/小红书原生 tabBar 不含）", () => {
    const at = pagesJson.indexOf('"pagePath": "pages/booking/index"');
    expect(at).toBeGreaterThan(-1);
    const before = pagesJson.slice(0, at);
    expect(before.lastIndexOf("// #ifdef MP-WEIXIN")).toBeGreaterThan(before.lastIndexOf("// #endif"));
  });
});

describe("TAB_INDEX ≡ pages.json(微信) ≡ custom-tab-bar", () => {
  it("⭐TAB_INDEX 取值与微信 tabBar 顺序逐项一致", () => {
    const paths = tabBarOf("mp-weixin").list.map((t) => t.pagePath);
    expect(paths[TAB_INDEX.home]).toBe("pages/index/index");
    expect(paths[TAB_INDEX.booking]).toBe("pages/booking/index");
    expect(paths[TAB_INDEX.price]).toBe("pages/priceHomePage/index");
    expect(paths[TAB_INDEX.mine]).toBe("pages/mine/index");
    expect(Object.values(TAB_INDEX).sort()).toEqual([0, 1, 2, 3]);
  });

  it("⭐custom-tab-bar 的 list 与 pages.json 微信 tabBar 逐项一致（pagePath、文案、顺序）", () => {
    const wx = tabBarOf("mp-weixin").list;
    const custom = customTabBarList();
    expect(custom.map((c) => c.pagePath)).toEqual(wx.map((t) => t.pagePath));
    expect(custom.map((c) => c.text)).toEqual(wx.map((t) => t.text));
  });

  it("custom-tab-bar 每项的线性/面性图标成对存在且文件名同源（x.svg / x-filled.svg）", () => {
    for (const c of customTabBarList()) {
      expect(c.icon).toMatch(/^\/static\/iconpark\/[a-z]+\.svg$/);
      expect(c.iconActive).toBe(c.icon.replace(/\.svg$/, "-filled.svg"));
      for (const f of [c.icon, c.iconActive]) expect(() => read("src" + f)).not.toThrow();
    }
  });

  it("⭐四个 tab 页 onShow 传入的下标都是 TAB_INDEX 对应常量（不得写死数字）", () => {
    const expected: Array<[string, keyof typeof TAB_INDEX]> = [
      ["src/pages/index/index.vue", "home"],
      ["src/pages/booking/index.vue", "booking"],
      ["src/pages/priceHomePage/index.vue", "price"],
      ["src/pages/mine/index.vue", "mine"],
    ];
    for (const [file, key] of expected) {
      const calls = [...read(file).matchAll(/syncTabBarSelected\(([^)]*)\)/g)].map((m) => m[1]);
      expect(calls, file).toEqual(["TAB_INDEX." + key]);
    }
  });
});

describe("抖音原生 tabBar：syncTabBarSelected 恒为静默空操作", () => {
  const g = globalThis as unknown as { getCurrentPages?: () => unknown[] };
  const prev = g.getCurrentPages;
  afterEach(() => {
    g.getCurrentPages = prev;
  });
  it("⭐页面实例无 getTabBar（抖音原生栏）时，无论传哪个下标都不抛、不触碰任何对象——因此抖音下标不被消费", () => {
    const page = {};
    g.getCurrentPages = () => [page];
    for (const i of Object.values(TAB_INDEX)) expect(() => syncTabBarSelected(i)).not.toThrow();
    expect(Object.keys(page)).toEqual([]);
  });
});
