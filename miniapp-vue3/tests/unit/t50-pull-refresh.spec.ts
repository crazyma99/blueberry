// 2026-09-21 主人②：「客片列表页、详情页、AI试衣列表页、价目表 tab 都要加下拉刷新」——
// 本 spec 锁共享内核（`composables/use-pull-refresh`）与共享指示器（`components/PullRefreshIndicator`）的契约，
// 以及本轮新增 4 页的 pages.json 配置：守卫/收口/位置口径全在一处，页面只提供「刷新要重载什么」。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setUiPlatformOverride } from "../../src/ui/ui-platform";
import { createPullRefresh, CUSTOM_NAV_HEIGHT_PX, NATIVE_PULL_BAND_PX, PULL_GAP_PX } from "../../src/composables/use-pull-refresh";
import PullRefreshIndicator from "../../src/components/PullRefreshIndicator/PullRefreshIndicator.vue";
import StubLoading from "../stubs/wot/wd-loading/wd-loading.vue";

const h = vi.hoisted(() => ({
  pullDownCalls: [] as Array<() => void>,
  stops: 0,
  refreshes: 0,
}));

vi.mock("@dcloudio/uni-app", () => ({
  onPullDownRefresh: (fn: () => void) => h.pullDownCalls.push(fn),
}));

const root = resolve(__dirname, "../..");
const pagesJson = readFileSync(resolve(root, "src/pages.json"), "utf-8");
const indicatorSource = readFileSync(resolve(root, "src/components/PullRefreshIndicator/PullRefreshIndicator.vue"), "utf-8");
const flush = () => new Promise((r) => setTimeout(r, 20));

function pageBlock(path: string): string {
  const at = pagesJson.indexOf(`"path": "${path}"`);
  if (at < 0) throw new Error("pages.json 未找到页面：" + path);
  const next = pagesJson.indexOf('"path":', at + 1);
  return pagesJson.slice(at, next < 0 ? undefined : next);
}

beforeEach(() => {
  h.pullDownCalls.length = 0;
  h.stops = 0;
  h.refreshes = 0;
  setUiPlatformOverride(null);
  (globalThis as { uni?: unknown }).uni = {
    stopPullDownRefresh: () => {
      h.stops += 1;
    },
    getSystemInfoSync: () => ({ statusBarHeight: 20, uniPlatform: "mp-weixin" }),
  };
});

describe("共享下拉刷新内核（P… 2026-09-21 四页接入）", () => {
  it("注册一个下拉回调；沉浸式位置＝状态栏 20 + 原生指示带 40 + 间距 8", () => {
    const { indicatorTop } = createPullRefresh({ label: "t", refresh: () => undefined });
    expect(h.pullDownCalls.length).toBe(1);
    expect(indicatorTop).toBe(`${20 + NATIVE_PULL_BAND_PX + PULL_GAP_PX}px`); // 68px
  });

  it("自绘标题栏页面：让出导航栏 44px（> 原生指示带）⇒ 位置 +4px", () => {
    const { indicatorTop } = createPullRefresh({ label: "t", refresh: () => undefined, hasCustomNav: true });
    expect(indicatorTop).toBe(`${20 + CUSTOM_NAV_HEIGHT_PX + PULL_GAP_PX}px`); // 72px
  });

  it("抖音端（页面坐标原点已在系统栏之下）不叠加状态栏高度", () => {
    setUiPlatformOverride("mp-toutiao");
    const { indicatorTop } = createPullRefresh({ label: "t", refresh: () => undefined });
    expect(indicatorTop).toBe(`${NATIVE_PULL_BAND_PX + PULL_GAP_PX}px`); // 48px
  });

  it("执行：连拉守卫（在飞不重入）＋ finally 收口（stopPullDownRefresh 恰好一次）", async () => {
    let release: (() => void) | null = null;
    const { refreshing } = createPullRefresh({
      label: "t",
      refresh: () =>
        new Promise<void>((resolve) => {
          h.refreshes += 1;
          release = resolve;
        }),
    });
    h.pullDownCalls[0](); // 第一次下拉
    h.pullDownCalls[0](); // 在飞再拉（应被守卫吞掉）
    await flush();
    expect(h.refreshes).toBe(1);
    expect(refreshing.value).toBe(true);
    expect(h.stops).toBe(0); // 未收口不提前收指示器
    release?.();
    await flush();
    expect(refreshing.value).toBe(false);
    expect(h.stops).toBe(1);
  });

  it("意外异常：留 `[label] 下拉刷新失败` 痕、仍收口（不卡下拉态）", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { refreshing } = createPullRefresh({
      label: "priceHomePage",
      refresh: () => {
        throw new Error("boom");
      },
    });
    h.pullDownCalls[0]();
    await flush();
    expect(refreshing.value).toBe(false);
    expect(h.stops).toBe(1);
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes("[priceHomePage]"))).toBe(true);
    errSpy.mockRestore();
  });

  it("容器无 uni.stopPullDownRefresh 也不崩（H5/vitest 守卫）", async () => {
    delete (globalThis as { uni?: unknown }).uni;
    const { refreshing } = createPullRefresh({ label: "t", refresh: () => undefined });
    h.pullDownCalls[0]();
    await flush();
    expect(refreshing.value).toBe(false);
  });
});

describe("共享指示器组件（PullRefreshIndicator）", () => {
  it("2026-09-21 主人：「内 padding 加大一些」⇒ 走 token 的 16rpx/24rpx（原 8rpx/16rpx）", () => {
    const styleBlock = indicatorSource.slice(indicatorSource.indexOf("<style"), indicatorSource.lastIndexOf("</style>"));
    expect(styleBlock).toContain("padding: $space-sm $space-md;");
    expect(styleBlock).not.toContain("$space-xs $space-sm");
  });

  it("show=false 不渲染；show=true 渲染门面加载器（默认文案「刷新中…」）且 top 由页面传入", () => {
    const hidden = mount(PullRefreshIndicator, { props: { show: false, top: "68px" } });
    expect(hidden.find(".pull-refresh-indicator").exists()).toBe(false);

    const w = mount(PullRefreshIndicator, { props: { show: true, top: "68px" }, global: { components: { "wd-loading": StubLoading } } });
    const pill = w.find(".pull-refresh-indicator");
    expect(pill.exists()).toBe(true);
    expect(pill.attributes("style")).toContain("top: 68px");
    expect(w.findComponent(StubLoading).props("text")).toBe("刷新中…");
  });
});

describe("本轮新增 4 页的下拉刷新配置（pages.json）", () => {
  it("客片列表/客片详情/AI试衣记录/价目表 四页均开 enablePullDownRefresh＋亮色指示点", () => {
    for (const p of [
      "pages/demoDetail/index",
      "pages/targetPhotoDetail/index",
      "pages/aiTryOnHistory/index",
      "pages/priceHomePage/index",
    ]) {
      const block = pageBlock(p);
      expect(block).toContain('"enablePullDownRefresh": true');
      expect(block).toContain('"backgroundTextStyle": "light"');
    }
  });

  it("⭐位置接线（独立 CR 🟡4）：4 页均传 hasCustomNav:true（72px），首页不传（68px 沉浸式）", () => {
    for (const p of ["demoDetail", "targetPhotoDetail", "aiTryOnHistory", "priceHomePage"]) {
      const src = readFileSync(resolve(root, `src/pages/${p}/index.vue`), "utf-8");
      const block = src.slice(src.indexOf("createPullRefresh("), src.indexOf("createPullRefresh(") + 260);
      expect(block).toContain("hasCustomNav: true");
    }
    const indexSrc = readFileSync(resolve(root, "src/pages/index/index.vue"), "utf-8");
    expect(indexSrc).toContain('createPullRefresh({ label: "index", refresh: refreshHome })'); // 默认沉浸式（不传旗标）
  });

  it("四页均接入共享指示器与内核（页面零自写 try/finally 收口）", () => {
    for (const p of ["demoDetail", "targetPhotoDetail", "aiTryOnHistory", "priceHomePage"]) {
      const src = readFileSync(resolve(root, `src/pages/${p}/index.vue`), "utf-8");
      expect(src).toContain("createPullRefresh(");
      expect(src).toContain("<PullRefreshIndicator ");
      expect(src).not.toContain("stopPullDownRefresh()"); // 收口只在内核里
    }
  });
});
