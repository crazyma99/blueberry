// 2026-09-21 主人：「小程序的首页下拉刷新功能丢失了，下拉刷新使用 wotui + design token 完成」——
// 本 spec 锁三件事（对齐旧端 index.uvue:252-263 ＋ src/pages.json:5-8 口径）：
//  ①配置：pages.json **仅首页**开启 `enablePullDownRefresh`（＋ `backgroundTextStyle: light`），自绘标题栏条件编译未被动过；
//  ②行为：`onPullDownRefresh` 已注册 ⇒ 触发后重新拉取首页数据（banner 带防缓存 `t`，旧端 index.uvue:356 口径）、
//         刷新期渲染 wot `wd-loading`（token 着色/尺寸/文案），收口后指示器撤下；
//  ③收口：正常与异常都调 `uni.stopPullDownRefresh()`（旧端 .then/.catch 双分支 ⇒ 新端 finally 等价）、刷新后前景层重挂载重播动效（旧端 :258 `fgTick+1`）；
//  ④纪律守卫：页面自身样式零运行时 CSS 变量／零通配选择器（deviations #13/#15），且**不直用 `wd-*`**（走 `ui/` 门面，plan §26/§229）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import StubLoading from "../stubs/wot/wd-loading/wd-loading.vue";

const h = vi.hoisted(() => ({
  pullDownCalls: [] as Array<() => void>,
  carouselCalls: [] as Array<{ params?: Record<string, string>; method?: string }>,
  stops: 0,
  throwNext: false,
  banners: [] as Array<Record<string, unknown>>,
}));

vi.mock("@dcloudio/uni-app", () => ({
  onShow: () => undefined,
  onLoad: () => undefined, // 2026-09-21：首页补 onLoad（分享落地 ?brandId=/scene 写品牌上下文）
  onPullDownRefresh: (fn: () => void) => h.pullDownCalls.push(fn),
  onShareAppMessage: () => undefined,
  onShareTimeline: () => undefined,}));

// 轮播仓储打桩：记录每次取件入参（证明「刷新＝重新拉取」＋「banner 防缓存 t」）；
// throwNext 用于构造「意外异常」路径（同步抛，验证 finally 收口）。
vi.mock("../../src/infrastructure/repositories/carousels", () => ({
  createCarouselRepository: () => ({
    getImage: (_ctx: unknown, options?: { params?: Record<string, string>; method?: string }) => {
      h.carouselCalls.push(options ?? {});
      if (h.throwNext) {
        h.throwNext = false;
  h.banners = [];
        throw new Error("boom");
      }
      return Promise.resolve({ ok: true, value: h.banners });
    },
  }),
}));

import IndexPage from "../../src/pages/index/index.vue";

const root = resolve(__dirname, "../..");
const pagesJson = readFileSync(resolve(root, "src/pages.json"), "utf-8");
const pageSource = readFileSync(resolve(root, "src/pages/index/index.vue"), "utf-8");
const flush = () => new Promise((r) => setTimeout(r, 20));

const globalWith = { components: { "wd-loading": StubLoading } };

/** 取某页面条目所在的配置块（从 `"path": "<path>"` 起到下一条 path 前） */
function pageBlock(path: string): string {
  const at = pagesJson.indexOf(`"path": "${path}"`);
  if (at < 0) throw new Error("pages.json 未找到页面：" + path);
  const next = pagesJson.indexOf('"path":', at + 1);
  return pagesJson.slice(at, next < 0 ? undefined : next);
}

const indicator = (w: ReturnType<typeof mount>) => w.find(".pull-refresh-indicator");

beforeEach(() => {
  h.pullDownCalls.length = 0;
  h.carouselCalls.length = 0;
  h.stops = 0;
  h.throwNext = false;
  h.banners = [];
  (globalThis as { uni?: unknown }).uni = {
    stopPullDownRefresh: () => {
      h.stops += 1;
    },
    getSystemInfoSync: () => ({ statusBarHeight: 20 }),
    // 网络侧故意缺失（request/uploadFile 不提供）⇒ 仓储落 Result 失败分支，页面不抛
  };
});

describe("首页下拉刷新 · 配置（pages.json）", () => {
  it("首页开启 enablePullDownRefresh + backgroundTextStyle=light，且自绘标题栏条件编译保持原样", () => {
    const home = pageBlock("pages/index/index");
    expect(home).toContain('"enablePullDownRefresh": true');
    expect(home).toContain('"backgroundTextStyle": "light"');
    expect(home).toContain("// #ifdef MP-WEIXIN");
    expect(home).toContain('"navigationStyle": "custom"');
    expect(home).toContain("// #endif");
  });

  it("两个刷新键位于 `#ifdef` 条件块**之外**（双端同口径；CR 🟡7），且页面不直用 wd-*（走门面）", () => {
    const home = pageBlock("pages/index/index");
    const endifAt = home.indexOf("// #endif");
    expect(endifAt).toBeGreaterThan(-1);
    expect(home.indexOf('"enablePullDownRefresh"')).toBeGreaterThan(endifAt);
    expect(home.indexOf('"backgroundTextStyle"')).toBeGreaterThan(endifAt);
    // 门面纪律：业务页零 `<wd-`（本页经 BaseLoading 消费 Wot）
    expect(pageSource).not.toContain("<wd-");
    expect(pageSource).toContain("PullRefreshIndicator"); // 共享指示器（内含门面 BaseLoading）
  });

  it("页面自身样式零运行时 CSS 变量、零通配选择器（deviations #13／#15 守卫）", () => {
    // 只判「声明的样式」：注释里保留的旧端 `var(--*)` 映射说明是文档（同 t45 去注释口径）
    const styleBlock = pageSource
      .slice(pageSource.indexOf("<style"), pageSource.lastIndexOf("</style>"))
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(styleBlock.length).toBeGreaterThan(0);
    expect(styleBlock).not.toContain("var(--");
    expect(/[\s,{>]\*[\s,{]/.test(styleBlock)).toBe(false);
  });

  it("开启范围＝5 页（首页＋客片列表＋客片详情＋AI试衣记录＋价目表；2026-09-21 主人点名扩围）", () => {
    expect((pagesJson.match(/"enablePullDownRefresh"/g) ?? []).length).toBe(5);
    for (const p of [
      "pages/index/index",
      "pages/demoDetail/index",
      "pages/targetPhotoDetail/index",
      "pages/aiTryOnHistory/index",
      "pages/priceHomePage/index",
    ]) {
      expect(pageBlock(p)).toContain('"enablePullDownRefresh": true');
    }
  });
});

describe("首页下拉刷新 · 行为（onPullDownRefresh）", () => {
  it("注册了下拉刷新回调；触发后重新拉取首页数据（含 banner 防缓存 t）并收口", async () => {
    const w = mount(IndexPage, { global: globalWith });
    await flush();
    expect(h.pullDownCalls.length).toBe(1); // 生命周期已注册
    expect(h.carouselCalls.length).toBe(1); // 首屏一次
    h.pullDownCalls[0](); // 用户下拉
    await flush();
    expect(h.carouselCalls.length).toBe(2); // 刷新重新拉取
    expect(h.carouselCalls[1].params?.t).toBeTruthy(); // 防缓存时间戳（旧端 index.uvue:356）
    expect(h.stops).toBe(1); // 收口
    w.unmount();
  });

  it("刷新期渲染 wot wd-loading（token 金 + token 尺寸档 + 文案），收口后撤下", async () => {
    const w = mount(IndexPage, { global: globalWith });
    await flush();
    expect(indicator(w).exists()).toBe(false); // 未刷新不渲染

    h.pullDownCalls[0]();
    await w.vm.$nextTick();
    expect(indicator(w).exists()).toBe(true);
    const loading = w.findComponent(StubLoading);
    expect(loading.exists()).toBe(true);
    expect(loading.props("type")).toBe("circular");
    expect(loading.props("color")).toBe("#F1CD91"); // tokens.semantic.colorAction（＝primitive.gold）
    expect(loading.props("size")).toBe("48rpx"); // tokens.component.pullRefreshLoadingSizeRpx
    expect(loading.props("text")).toBe("刷新中…");
    expect(loading.props("direction")).toBe("horizontal");
    expect(h.stops).toBe(0); // 未收口不得先收指示器

    await flush();
    await w.vm.$nextTick();
    expect(h.stops).toBe(1);
    expect(indicator(w).exists()).toBe(false);
    w.unmount();
  });

  it("刷新后前景层重挂载（旧端 :258 `fgTick+1` 重播渐入动效）——元素引用必变", async () => {
    h.banners = [{ id: 1, imageUrl: "https://x/1.png", overlayType: 1, title: "蓝梅云", subtitle: "LANMEI" }];
    const w = mount(IndexPage, { global: globalWith });
    await flush();
    await w.vm.$nextTick();
    const before = w.find(".hero-fg-content").element; // banner 就绪后前景层在场
    expect(before).toBeTruthy();
    h.pullDownCalls[0]();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".hero-fg-content").element).not.toBe(before); // :key=fgTick ⇒ 重挂载
    w.unmount();
  });

  it("连拉守卫：刷新在飞时再次下拉不重入（不重复打接口、不重复收指示器）", async () => {
    const w = mount(IndexPage, { global: globalWith });
    await flush();
    h.pullDownCalls[0]();
    h.pullDownCalls[0](); // 第二次下拉（在飞）
    await flush();
    await w.vm.$nextTick();
    expect(h.carouselCalls.length).toBe(2); // 首屏 1 + 刷新 1（第二次未重入）
    expect(h.stops).toBe(1);
    expect(indicator(w).exists()).toBe(false);
    w.unmount();
  });

  it("意外异常也收口：catch 留痕（[index] 前缀）＋ 指示器撤下＋ stopPullDownRefresh 必被调用", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const w = mount(IndexPage, { global: globalWith });
    await flush();
    h.throwNext = true; // 下一次取件同步抛（模拟意外异常）
    h.pullDownCalls[0]();
    await w.vm.$nextTick();
    expect(indicator(w).exists()).toBe(true); // 刷新期指示器在
    await flush();
    await w.vm.$nextTick();
    expect(h.stops).toBe(1); // finally 收指示器
    expect(indicator(w).exists()).toBe(false);
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes("[index]"))).toBe(true);
    expect(w.find(".container").exists()).toBe(true); // 页面未崩
    errSpy.mockRestore();
    w.unmount();
  });
});
