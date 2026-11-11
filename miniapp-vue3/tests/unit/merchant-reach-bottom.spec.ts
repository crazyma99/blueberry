// 触底自动加载（issue #14 · UX P0 批次2-①）：相册列表 / 分类列表 / 档期列表 / 图片网格。
// 后端全量返回、前端分段渲染（nextVisibleCount）；触底（onReachBottom）与「显示更多」按钮共用一个加载器，按钮保留作兜底。
// 变异靶点：①页面不注册 onReachBottom ②触底不增加可见条数 ③加载中仍触发 ④无更多仍触发（越界）⑤冷却被去掉（连发连翻）⑥弹层打开时仍触发
//          ⑦按钮兜底被删 ⑧步长被改（图片网格不是 3 倍）⑨分类/档期没有分段（一次全渲染）。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  onLoad: [] as Array<(o?: Record<string, unknown>) => void>,
  onShow: [] as Array<() => void>,
  bottom: [] as Array<() => void>,
  store: new Map<string, string>(),
  n: 0,
  hold: null as null | Promise<void>,
}));
vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoad.push(fn),
  onShow: (fn: () => void) => h.onShow.push(fn),
  onHide: () => undefined,
  onReachBottom: (fn: () => void) => h.bottom.push(fn),
  onPullDownRefresh: () => undefined,
}));
const cat = (id: number, name: string, parentId = 0) => ({ id, name, sortOrder: id, shopId: 1, parentId, depth: parentId === 0 ? 1 : 2 });
vi.mock("../../src/platform/uni/transport", () => ({
  createUniTransport: () => ({
    request: async (req: { url: string; query?: Record<string, string> }) => {
      const ok = (data: unknown) => ({ ok: true, value: { status: 200, businessCode: 200, message: undefined, requestId: null, data } });
      if (h.hold != null && req.url === "/photo-albums/photo") await h.hold;
      if (req.url === "/shop/parent/list") return ok(Array.from({ length: h.n }, (_, i) => cat(i + 1, "一级" + (i + 1))));
      if (req.url === "/shop/sub/get-by-parent") return ok([]);
      if (req.url === "/photo-albums/photo") return ok(Array.from({ length: h.n }, (_, i) => ({ id: i + 1, shopId: 1, childId: 9, parentId: 5, childName: "c", title: "相册" + (i + 1), coverImageUrl: "", price: 1, packageDesc: "", aiDesc: "", sortOrder: i, tryonCount: 0 })));
      if (req.url === "/photo-albums/albums/get") return ok(Array.from({ length: h.n }, (_, i) => ({ id: i + 1, albumId: 7, imageUrl: "https://c/" + i + ".jpg", sortOrder: i, aiTryonStatus: 1, aiTryonReason: "", aiTryonManual: 0 })));
      if (req.url === "/booking/slots") return ok(Array.from({ length: h.n }, (_, i) => ({ id: i + 1, startTime: "10:00", endTime: "11:00", capacity: 5, status: 1 })));
      return ok([]);
    },
    cancel: () => undefined,
  }),
}));

import AlbumListPage from "../../src/pkg-merchant/album/list.vue";
import AlbumDetailPage from "../../src/pkg-merchant/album/detail.vue";
import CategoryPage from "../../src/pkg-merchant/category/list.vue";
import SlotPage from "../../src/pkg-merchant/slot/list.vue";
import { __resetMerchantRuntime } from "../../src/pkg-merchant/application/merchant-runtime";
import { MERCHANT_PROFILE_KEY, MERCHANT_SESSION_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";
import { createSegmentLoader, REACH_BOTTOM_COOLDOWN_MS, SEGMENT_STEP } from "../../src/pkg-merchant/domain/merchant-segment";
import { ALBUM_PAGE_STEP } from "../../src/pkg-merchant/domain/merchant-album";

const FeedbackStub = defineComponent({ setup(_p, { expose }) { expose({ show: () => undefined }); return () => null; } });
const GLOBAL = { stubs: { PullRefreshIndicator: true, BaseFeedback: FeedbackStub, BaseDialog: true, PageFooter: true, CustomNavBar: true, MerchantNeedLogin: true, BasePopup: true, BasePicker: true, BaseProgress: true, SkeletonBlock: true, BaseField: true } };

beforeEach(() => {
  vi.useRealTimers();
  h.onLoad.length = 0;
  h.onShow.length = 0;
  h.bottom.length = 0;
  h.store.clear();
  h.hold = null;
  __resetMerchantRuntime();
  h.store.set(MERCHANT_SESSION_KEY, JSON.stringify({ userId: "7", token: "m-token", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }));
  h.store.set(MERCHANT_PROFILE_KEY, JSON.stringify({ adminId: 7, merchantId: 1, username: "a", role: "merchant", displayName: "A", roleName: "", permissions: ["album", "category", "booking_slot", "booking_slot_template"], shopList: [{ id: 1, name: "A", merchantName: "", status: 1 }] }));
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => h.store.set(k, v),
    removeStorageSync: (k: string) => h.store.delete(k),
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    getMenuButtonBoundingClientRect: () => ({ left: 280, width: 87 }),
    stopPullDownRefresh: () => undefined,
    showToast: () => undefined,
    upx2px: (x: number) => x / 2,
  };
});

async function mountPage(comp: Parameters<typeof mount>[0], n: number, onloadArg?: Record<string, unknown>) {
  h.n = n;
  const w = mount(comp, { global: GLOBAL });
  h.onLoad[h.onLoad.length - 1]?.(onloadArg);
  for (let i = 0; i < 4; i++) await flushPromises();
  return w;
}
/** 触发真实注册的 onReachBottom 回调（可能注册了多个：booking 之外只有本页一个） */
function reachBottom() {
  for (const f of h.bottom) f();
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("加载器内核（纯逻辑）", () => {
  const mk = (total: number, opts?: { blocked?: () => boolean; cooldown?: number }) => {
    let visible = 20;
    let t = 1000;
    const ld = createSegmentLoader({ step: 20, getVisible: () => visible, getTotal: () => total, setVisible: (n) => { visible = n; }, isBlocked: opts?.blocked ?? (() => false), cooldownMs: opts?.cooldown, now: () => t });
    return { ld, get visible() { return visible; }, tick: (ms: number) => { t += ms; } };
  };
  it("每次 +step，封顶 total；无更多返回 false 且不改状态（变异：越界即红）", () => {
    const c = mk(50);
    expect(c.ld.loadMore()).toBe(true);
    expect(c.visible).toBe(40);
    expect(c.ld.loadMore()).toBe(true);
    expect(c.visible).toBe(50);
    expect(c.ld.loadMore()).toBe(false);
    expect(c.visible).toBe(50);
    expect(c.ld.hasMore()).toBe(false);
  });
  it("被阻塞（加载中/弹层/无权限）⇒ 忽略（变异：不判阻塞即红）", () => {
    let blocked = true;
    const c = mk(100, { blocked: () => blocked });
    expect(c.ld.loadMore(true)).toBe(false);
    expect(c.visible).toBe(20);
    blocked = false;
    expect(c.ld.loadMore(true)).toBe(true);
  });
  it("⭐触底冷却：冷却内连发只增加一次；冷却后可再增；按钮（viaScroll=false）不受冷却（变异：去冷却即红）", () => {
    const c = mk(200);
    expect(c.ld.loadMore(true)).toBe(true);
    expect(c.ld.loadMore(true)).toBe(false);
    expect(c.ld.loadMore(true)).toBe(false);
    expect(c.visible).toBe(40);
    expect(c.ld.loadMore(false)).toBe(true); // 按钮显式点击
    expect(c.visible).toBe(60);
    c.tick(REACH_BOTTOM_COOLDOWN_MS + 1);
    expect(c.ld.loadMore(true)).toBe(true);
    expect(c.visible).toBe(80);
  });
});

describe("⭐相册列表：触底自动加载（后端全量、前端分段）", () => {
  it("55 条：首屏 20；触底 ⇒ 40；等冷却后再触底 ⇒ 55；再触底无变化（变异：不注册/不增加/越界即红）", async () => {
    const w = await mountPage(AlbumListPage, 55);
    expect(w.findAll(".card").length).toBe(ALBUM_PAGE_STEP);
    expect(h.bottom.length).toBe(1);
    reachBottom();
    await flushPromises();
    expect(w.findAll(".card").length).toBe(40);
    await sleep(REACH_BOTTOM_COOLDOWN_MS + 30);
    reachBottom();
    await flushPromises();
    expect(w.findAll(".card").length).toBe(55);
    await sleep(REACH_BOTTOM_COOLDOWN_MS + 30);
    reachBottom();
    await flushPromises();
    expect(w.findAll(".card").length).toBe(55);
    expect(w.text()).toContain("已经到底了");
  });
  it("⭐防重复：冷却内连发 5 次触底只多渲染一段（变异：去冷却即红）", async () => {
    const w = await mountPage(AlbumListPage, 100);
    for (let i = 0; i < 5; i++) reachBottom();
    await flushPromises();
    expect(w.findAll(".card").length).toBe(40);
  });
  it("「显示更多」按钮保留作兜底：点一下 +20（变异：删按钮即红）", async () => {
    const w = await mountPage(AlbumListPage, 55);
    expect(w.find(".more").text()).toContain("显示更多（35）");
    await w.find(".more").trigger("click");
    expect(w.findAll(".card").length).toBe(40);
  });
  it("⭐加载中触底被忽略（变异：不判 loading 即红）", async () => {
    h.n = 100;
    let release: () => void = () => undefined;
    const w = await mountPage(AlbumListPage, 100);
    expect(w.findAll(".card").length).toBe(20);
    // 下拉刷新式重载进行中：onShow 触发 reload，请求被挂起
    h.hold = new Promise<void>((r) => { release = r; });
    h.onShow[h.onShow.length - 1]?.(); // 首次 onShow 会被跳过
    h.onShow[h.onShow.length - 1]?.();
    await flushPromises();
    reachBottom();
    await flushPromises();
    expect(w.findAll(".card").length).toBe(20);
    release();
    for (let i = 0; i < 4; i++) await flushPromises();
  });
});

describe("⭐图片网格：触底自动加载（步长＝3 × 20 = 60，三列网格）", () => {
  it("130 张：首屏 60；触底 ⇒ 120；再触底 ⇒ 130（变异：步长被改/不注册即红）", async () => {
    const w = await mountPage(AlbumDetailPage, 130, { albumId: "7", shopId: "1", title: "x" });
    expect(w.findAll(".grid > .cell").length).toBe(ALBUM_PAGE_STEP * 3);
    reachBottom();
    await flushPromises();
    expect(w.findAll(".grid > .cell").length).toBe(120);
    await sleep(REACH_BOTTOM_COOLDOWN_MS + 30);
    reachBottom();
    await flushPromises();
    expect(w.findAll(".grid > .cell").length).toBe(130);
    expect(w.text()).toContain("共 130 张");
  });
  it("「显示更多」按钮兜底仍在", async () => {
    const w = await mountPage(AlbumDetailPage, 130, { albumId: "7", shopId: "1", title: "x" });
    await w.find(".more").trigger("click");
    expect(w.findAll(".grid > .cell").length).toBe(120);
  });
});

describe("⭐分类列表：新增分段 + 触底自动加载", () => {
  it("45 个一级分类：首屏 20；触底 ⇒ 40；按钮兜底 ⇒ 45（变异：没有分段/不注册即红）", async () => {
    const w = await mountPage(CategoryPage, 45);
    expect(w.findAll(".card").length).toBe(SEGMENT_STEP);
    expect(w.find(".more").text()).toContain("显示更多（25）");
    reachBottom();
    await flushPromises();
    expect(w.findAll(".card").length).toBe(40);
    await w.find(".more").trigger("click");
    expect(w.findAll(".card").length).toBe(45);
    expect(w.find(".more").exists()).toBe(false);
  });
  it("少于一段（5 个）：不出现「显示更多」，触底无副作用", async () => {
    const w = await mountPage(CategoryPage, 5);
    expect(w.findAll(".card").length).toBe(5);
    expect(w.find(".more").exists()).toBe(false);
    reachBottom();
    await flushPromises();
    expect(w.findAll(".card").length).toBe(5);
  });
});

describe("⭐档期列表：新增分段 + 触底自动加载", () => {
  it("45 个档期：首屏 20；触底 ⇒ 40；按钮兜底 ⇒ 45（变异：没有分段/不注册即红）", async () => {
    const w = await mountPage(SlotPage, 45);
    expect(w.findAll(".card").length).toBe(SEGMENT_STEP);
    reachBottom();
    await flushPromises();
    expect(w.findAll(".card").length).toBe(40);
    await w.find(".more").trigger("click");
    expect(w.findAll(".card").length).toBe(45);
  });
  it("⭐弹层打开（新增档期）时触底被忽略（变异：不判 formShow 即红）", async () => {
    const w = await mountPage(SlotPage, 45);
    await w.find(".tool-btn--primary").trigger("click"); // 新增档期 ⇒ formShow=true
    await flushPromises();
    reachBottom();
    await flushPromises();
    expect(w.findAll(".card").length).toBe(20);
  });
});
