// 2026-09-21 主人③：「首页/客片详情分享卡片迁移遗漏了」——
// 旧端 `utils/share.uts`（品牌槽位 > 中台全局同键 > 代码默认 三层兜底、`{brand}` 占位符、品牌名 60s 缓存）
// 与三页 `onShareAppMessage`/`onShareTimeline`（index 有朋友圈、demoDetail/targetPhotoDetail 仅好友）本轮补迁。
// 本 spec 分两层：①用例层（三层兜底/字段级兜底/占位符/缓存，纯依赖注入）②页面层（挂载三页，取回分享对象逐字段核对）。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createShareCardResolver, DEFAULT_SHARE_CARDS } from "../../src/application/share-card";

const h = vi.hoisted(() => ({
  shareCalls: [] as Array<() => unknown>,
  timelineCalls: [] as Array<() => unknown>,
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  onShowCalls: [] as Array<() => void>,
  pageConfig: { ok: true, value: [] as unknown[] },
  savedBrandIds: [] as string[],
  brandCalls: 0,
  brandOk: true,
  brandName: "蓝梅云",
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoadCalls.push(fn),
  onShow: (fn: () => void) => h.onShowCalls.push(fn),
  onPullDownRefresh: () => undefined,
  onReachBottom: () => undefined,
  onShareAppMessage: (fn: () => unknown) => h.shareCalls.push(fn),
  onShareTimeline: (fn: () => unknown) => h.timelineCalls.push(fn),
}));

// 品牌上下文固定 brand9：分享路径带品牌 + `{brand}` 占位符替换两条分支都被覆盖
vi.mock("../../src/infrastructure/storage/versioned", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/infrastructure/storage/versioned")>();
  return {
    ...actual,
    createVersionedStorage: (deps: Parameters<typeof actual.createVersionedStorage>[0]) => ({
      ...actual.createVersionedStorage(deps),
      loadBrandId: () => "brand9",
      saveBrandId: (id: string) => {
        h.savedBrandIds.push(id);
      },
    }),
  };
});

vi.mock("../../src/infrastructure/repositories/page-config", () => ({
  createPageConfigRepository: () => ({ getPageConfig: async () => h.pageConfig }),
}));

vi.mock("../../src/infrastructure/repositories/brands", () => ({
  createBrandRepository: () => ({
    getBrands: async () => {
      h.brandCalls += 1;
      return h.brandOk ? { ok: true, value: [{ brandId: "brand9", brandName: h.brandName }] } : { ok: false, error: { kind: "NETWORK" } };
    },
  }),
}));

// 页面其余取数打桩为空（本 spec 只关心分享链路）
vi.mock("../../src/infrastructure/repositories/carousels", () => ({ createCarouselRepository: () => ({ getImage: async () => ({ ok: true, value: [] }) }) }));
vi.mock("../../src/infrastructure/repositories/shops", () => ({ createShopRepository: () => ({ getShops: async () => ({ ok: true, value: [] }) }) }));
vi.mock("../../src/infrastructure/repositories/albums", () => ({
  createAlbumRepository: () => ({
    getCategories: async () => ({ ok: true, value: [] }),
    getAlbumList: async () => ({ ok: true, value: { albums: [], page: 1, size: 10, total: 0 } }),
    getAlbumDetail: async () => ({ ok: true, value: { images: [], likeCount: 0 } }),
  }),
}));
vi.mock("../../src/infrastructure/repositories/likes", () => ({
  createLikeRepository: () => ({ getLikeStatus: async () => ({ ok: true, value: [] }), toggle: async () => ({ ok: true, value: {} }) }),
}));

import IndexPage from "../../src/pages/index/index.vue";
import DemoDetailPage from "../../src/pages/demoDetail/index.vue";
import TargetPhotoDetailPage from "../../src/pages/targetPhotoDetail/index.vue";

const flush = () => new Promise((r) => setTimeout(r, 20));
const ctx = { kind: "test" } as unknown as Parameters<ReturnType<typeof createShareCardResolver>["resolve"]>[1];

function fakeResolverDeps(overrides?: {
  pageConfig?: unknown;
  brands?: unknown;
  brandId?: string;
}) {
  return {
    pageConfig: {
      getPageConfig: async () =>
        (overrides?.pageConfig as { ok: boolean; value?: unknown[] }) ?? { ok: true, value: [] },
    },
    brands: {
      getBrands: async () =>
        (overrides?.brands as { ok: boolean; value?: unknown[] }) ?? { ok: true, value: [] },
    },
    getBrandId: () => overrides?.brandId ?? "",
  } as unknown as Parameters<typeof createShareCardResolver>[0];
}

beforeEach(() => {
  h.shareCalls.length = 0;
  h.timelineCalls.length = 0;
  h.onLoadCalls.length = 0;
  h.onShowCalls.length = 0;
  h.brandCalls = 0;
  h.savedBrandIds.length = 0;
  h.brandOk = true;
  h.brandName = "蓝梅云";
  h.pageConfig = { ok: true, value: [] };
});

describe("createShareCardResolver（旧端 utils/share.uts 三层兜底）", () => {
  it("配置取不到 → 三键各自回落代码默认卡片（逐字同旧端）", async () => {
    const r = createShareCardResolver(fakeResolverDeps({ pageConfig: { ok: false } }));
    expect(await r.resolve("index", ctx)).toEqual(DEFAULT_SHARE_CARDS.index);
    expect(await r.resolve("demoDetail", ctx)).toEqual(DEFAULT_SHARE_CARDS.demoDetail);
    expect(await r.resolve("targetPhotoDetail", ctx)).toEqual(DEFAULT_SHARE_CARDS.targetPhotoDetail);
    expect(DEFAULT_SHARE_CARDS.index.imageUrl).toBe("/static/share-home.jpg");
    expect(DEFAULT_SHARE_CARDS.demoDetail.imageUrl).toBe("/static/share-album.jpg");
    expect(DEFAULT_SHARE_CARDS.targetPhotoDetail.imageUrl).toBe("/static/share-aitryon.jpg");
  });

  it("命中 share_card 组件 + bizName 槽位 → 覆盖 title/imageUrl；字段级兜底（空串不覆盖）", async () => {
    const r = createShareCardResolver(
      fakeResolverDeps({
        pageConfig: {
          ok: true,
          value: [
            { type: "brand_hub", config: "{}" }, // 非 share_card 组件不参与
            {
              type: "share_card",
              items: [
                { bizName: "index", title: "OPS首页标题", imageUrl: "" }, // imageUrl 空 ⇒ 保留默认图
                { bizName: "demoDetail", title: "OPS客片列表", imageUrl: "https://cdn/album.jpg" },
              ],
            },
          ],
        },
      }),
    );
    const index = await r.resolve("index", ctx);
    expect(index.title).toBe("OPS首页标题");
    expect(index.imageUrl).toBe(DEFAULT_SHARE_CARDS.index.imageUrl);
    const demo = await r.resolve("demoDetail", ctx);
    expect(demo.title).toBe("OPS客片列表");
    expect(demo.imageUrl).toBe("https://cdn/album.jpg");
  });

  it("`{brand}` 占位符用当前品牌名替换；无品牌上下文时剔除占位符（标题仍可用）", async () => {
    const cfg = { ok: true, value: [{ type: "share_card", items: [{ bizName: "index", title: "{brand}｜一键解锁AI推荐" }] }] };
    const withBrand = createShareCardResolver(
      fakeResolverDeps({ pageConfig: cfg, brands: { ok: true, value: [{ brandId: "brand9", brandName: "蓝梅云" }] }, brandId: "brand9" }),
    );
    expect((await withBrand.resolve("index", ctx)).title).toBe("蓝梅云｜一键解锁AI推荐");
    const noBrand = createShareCardResolver(fakeResolverDeps({ pageConfig: cfg, brandId: "" }));
    expect((await noBrand.resolve("index", ctx)).title).toBe("｜一键解锁AI推荐");
  });

  it("品牌名 60s 缓存：同品牌连续解析只查一次 brands；品牌接口失败不阻断（占位符剔除）", async () => {
    const cfg = { ok: true, value: [{ type: "share_card", items: [{ bizName: "index", title: "{brand}X" }] }] };
    let brandCalls = 0;
    const r = createShareCardResolver({
      pageConfig: { getPageConfig: async () => cfg },
      brands: {
        getBrands: async () => {
          brandCalls += 1;
          return { ok: true, value: [{ brandId: "brand9", brandName: "蓝梅云" }] };
        },
      },
      getBrandId: () => "brand9",
    } as unknown as Parameters<typeof createShareCardResolver>[0]);
    await r.resolve("index", ctx);
    await r.resolve("index", ctx);
    expect(brandCalls).toBe(1);
    expect((await r.resolve("index", ctx)).title).toBe("蓝梅云X");

    const failing = createShareCardResolver({
      pageConfig: { getPageConfig: async () => cfg },
      brands: { getBrands: async () => ({ ok: false }) },
      getBrandId: () => "brandX",
    } as unknown as Parameters<typeof createShareCardResolver>[0]);
    expect((await failing.resolve("index", ctx)).title).toBe("X"); // 解析失败 ⇒ 剔除占位符
  });
});

describe("页面分享卡片接线（三页逐字段核对）", () => {
  it("首页：好友分享带品牌落地 + 朋友圈无 path/query（旧端 index.uvue:265-278）", async () => {
    h.pageConfig = { ok: true, value: [{ type: "share_card", items: [{ bizName: "index", title: "{brand}·首页卡片", imageUrl: "https://ops/home.jpg" }] }] };
    const w = mount(IndexPage);
    await flush();
    await w.vm.$nextTick();
    const share = h.shareCalls[h.shareCalls.length - 1]() as { title: string; path: string; imageUrl: string };
    expect(share).toEqual({ title: "蓝梅云·首页卡片", path: "/pages/index/index?brandId=brand9", imageUrl: "https://ops/home.jpg" });
    const timeline = h.timelineCalls[h.timelineCalls.length - 1]() as Record<string, unknown>;
    expect(timeline).toEqual({ title: "蓝梅云·首页卡片", imageUrl: "https://ops/home.jpg" });
    expect(timeline.path).toBeUndefined();
    expect(timeline.query).toBeUndefined();
    w.unmount();
  });

  it("⭐首页 onLoad 消费分享落地参数（独立 CR 🟡2）：?brandId= 与小程序码 scene 均写入品牌上下文", async () => {
    const w = mount(IndexPage);
    await flush();
    h.onLoadCalls[h.onLoadCalls.length - 1]({ brandId: "brandX" });
    expect(h.savedBrandIds).toContain("brandX");
    h.onLoadCalls[h.onLoadCalls.length - 1]({ scene: encodeURIComponent("brandY") });
    expect(h.savedBrandIds).toContain("brandY");
    h.onLoadCalls[h.onLoadCalls.length - 1]({}); // 无参数不写（不覆盖既有上下文）
    expect(h.savedBrandIds.length).toBe(2);
    w.unmount();
  });

  it("客片列表页：有 idx 带 idx、无 idx 落首页（旧端 demoDetail.uvue:292-298）", async () => {
    h.pageConfig = { ok: true, value: [{ type: "share_card", items: [{ bizName: "demoDetail", title: "OPS列表卡片" }] }] };
    const withIdx = mount(DemoDetailPage);
    await flush();
    h.onLoadCalls[h.onLoadCalls.length - 1]({ idx: "7" });
    await flush();
    const s1 = h.shareCalls[h.shareCalls.length - 1]() as { title: string; path: string; imageUrl: string };
    expect(s1.title).toBe("OPS列表卡片");
    expect(s1.path).toBe("/pages/demoDetail/index?idx=7");
    expect(s1.imageUrl).toBe(DEFAULT_SHARE_CARDS.demoDetail.imageUrl); // 配置未给图 ⇒ 默认图
    withIdx.unmount();

    h.shareCalls.length = 0;
    h.onLoadCalls.length = 0;
    const noIdx = mount(DemoDetailPage);
    await flush();
    h.onLoadCalls[h.onLoadCalls.length - 1]({});
    await flush();
    expect((h.shareCalls[h.shareCalls.length - 1]() as { path: string }).path).toBe("/pages/index/index");
    noIdx.unmount();
  });

  it("客片详情页：`?idx=<albumId>&type=<shopId>`（旧端 targetPhotoDetail.uvue:164-170）", async () => {
    h.pageConfig = { ok: true, value: [{ type: "share_card", items: [{ bizName: "targetPhotoDetail", title: "OPS详情卡片", imageUrl: "https://ops/detail.jpg" }] }] };
    const w = mount(TargetPhotoDetailPage);
    await flush();
    h.onLoadCalls[h.onLoadCalls.length - 1]({ idx: "42", type: "1" });
    await flush();
    const share = h.shareCalls[h.shareCalls.length - 1]() as Record<string, unknown>;
    expect(share).toEqual({ title: "OPS详情卡片", path: "/pages/targetPhotoDetail/index?idx=42&type=1", imageUrl: "https://ops/detail.jpg" });
    w.unmount();
  });
});
