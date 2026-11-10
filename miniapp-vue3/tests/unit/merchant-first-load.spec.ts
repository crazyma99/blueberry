// 商家预约/档期列表「首屏骨架屏永不消失」复现与防线（issue #14 M1 真机缺陷）。
// 真机现象：预约管理页只显示筛选 chip + 骨架屏，列表一直不出来；服务端 GET /booking/bookings 全部 200 且有数据。
// 本文件把**真实页面组件**挂起来，用可控的 transport（不 mock 页面内部依赖）分别制造：
//   ①首个请求永不返回 ②传输层抛异常 ③401（authExpired）④正常成功 ⑤空列表 ⑥业务失败（HTTP200+code=500），
// 逐一断言页面状态（骨架屏/列表/空态/错误态/登录占位）以及「点 chip / 点重试 能否恢复」。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount, flushPromises } from "@vue/test-utils";

type Reply = { status?: number; code?: number | null; message?: string; data?: unknown };
const h = vi.hoisted(() => ({
  onLoad: [] as Array<(o?: Record<string, unknown>) => void>,
  onShow: [] as Array<() => void>,
  store: new Map<string, string>(),
  /** 每个请求的应答函数；返回 "hang" ⇒ 永不 resolve；返回 "throw" ⇒ 传输层同步/异步抛异常；返回对象 ⇒ 正常应答 */
  responder: ((_url: string, _query: Record<string, string> | undefined) => ({ status: 200, code: 200, data: { list: [], total: 0 } })) as (
    url: string,
    query: Record<string, string> | undefined,
  ) => Reply | "hang" | "throw",
  requests: [] as Array<{ url: string; query?: Record<string, string> }>,
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoad.push(fn),
  onShow: (fn: () => void) => h.onShow.push(fn),
  onReachBottom: () => undefined,
  onPullDownRefresh: () => undefined,
}));

// 只替换「平台传输」：其余（client / coordinator / session / 仓储 / 页面）全部是真实代码
vi.mock("../../src/platform/uni/transport", () => ({
  createUniTransport: () => ({
    request: async (req: { url: string; query?: Record<string, string> }) => {
      h.requests.push({ url: req.url, query: req.query });
      const r = h.responder(req.url, req.query);
      if (r === "hang") return await new Promise(() => undefined);
      if (r === "throw") throw new Error("transport exploded");
      return { ok: true, value: { status: r.status ?? 200, businessCode: r.code === undefined ? 200 : r.code, message: r.message, requestId: null, data: r.data } };
    },
    cancel: () => undefined,
  }),
}));

import BookingPage from "../../src/pkg-merchant/booking/list.vue";
import SlotPage from "../../src/pkg-merchant/slot/list.vue";
import { __resetMerchantRuntime, getMerchantRuntime } from "../../src/pkg-merchant/application/merchant-runtime";
import { __setLoadTimeoutMsForTest, guardedLoad, shouldShowSkeleton, LOAD_ERROR_TEXT, LOAD_TIMEOUT_TEXT } from "../../src/pkg-merchant/composables/load-guard";
import { createPagedListViewModel } from "../../src/pkg-merchant/composables/use-merchant-list";
import { MERCHANT_PROFILE_KEY, MERCHANT_SESSION_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";

const GLOBAL = { stubs: { PullRefreshIndicator: true, BaseFeedback: true, BaseDialog: true, PageFooter: true, BasePicker: true, BasePopup: true } };

function seedLoggedIn(): void {
  h.store.set(MERCHANT_SESSION_KEY, JSON.stringify({ userId: "7", token: "m-token", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }));
  h.store.set(
    MERCHANT_PROFILE_KEY,
    JSON.stringify({ adminId: 7, merchantId: 1, username: "shopA", role: "merchant", displayName: "A", roleName: "", permissions: ["booking", "booking_slot", "booking_slot_template"], shopList: [] }),
  );
}
/** 业务请求判定：排除 footer 的公开接口（它与列表并发发出，会干扰「第一个请求」的计数） */
const isBiz = (url: string) => !url.startsWith("/api/page-config");
/** 构造「第 n 个业务请求」的应答序列；其余业务请求取最后一个；非业务请求恒空配置 */
function seq(...replies: Array<Reply | "hang" | "throw">) {
  let n = 0;
  h.responder = (url) => {
    if (!isBiz(url)) return { status: 200, code: 200, data: [] };
    const r = replies[Math.min(n, replies.length - 1)];
    n++;
    return r;
  };
}
const row = (id: number) => ({ id, status: "pending", rawStatus: "pending", date: "2026-11-09", startTime: "10:00", endTime: "11:00", customerName: "张三", customerPhone: "13800138000", guestCount: 2, remark: "", channel: "wx", channelLabel: "微信", createTime: "", deposit: null });

afterEach(() => __setLoadTimeoutMsForTest(null));
beforeEach(() => {
  __setLoadTimeoutMsForTest(40); // 整次加载超时缩短到 40ms，便于验证「挂起 ⇒ 超时失败态」
  h.onLoad.length = 0;
  h.onShow.length = 0;
  h.requests.length = 0;
  h.store.clear();
  h.responder = () => ({ status: 200, code: 200, data: { list: [], total: 0 } });
  __resetMerchantRuntime();
  seedLoggedIn();
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => h.store.set(k, v),
    removeStorageSync: (k: string) => h.store.delete(k),
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    getMenuButtonBoundingClientRect: () => ({ left: 280, width: 87 }),
    stopPullDownRefresh: () => undefined,
    showToast: () => undefined,
    upx2px: (n: number) => n / 2,
  };
});

async function mountBooking(waitMs = 0) {
  const w = mount(BookingPage, { global: GLOBAL });
  h.onLoad[h.onLoad.length - 1]?.();
  await flushPromises();
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  await flushPromises();
  return w;
}
const has = (w: ReturnType<typeof mount>, sel: string) => w.find(sel).exists();
const SK = ".sk-wrap";

describe("复现：骨架屏条件 `v-if=\"!ready\"` 在各种首屏结果下的真实表现", () => {
  it("⭐成功有数据 ⇒ 列表出现、骨架屏消失", async () => {
    h.responder = () => ({ data: { list: [row(1), row(2)], total: 2 } });
    const w = await mountBooking();
    expect(has(w, SK)).toBe(false);
    expect(w.findAll(".card").length).toBe(2);
  });
  it("成功但空列表 ⇒ 空态「暂无预约」、骨架屏消失", async () => {
    const w = await mountBooking();
    expect(has(w, SK)).toBe(false);
    expect(w.text()).toContain("暂无预约");
  });
  it("⭐业务失败（HTTP200+code=500）⇒ 「加载失败」错误态 + 后端文案 + 重试按钮（骨架屏消失）", async () => {
    h.responder = () => ({ status: 200, code: 500, message: "状态筛选不合法" });
    const w = await mountBooking();
    expect(has(w, SK)).toBe(false);
    expect(w.text()).toContain("加载失败");
    expect(w.text()).toContain("状态筛选不合法");
    expect(has(w, ".retry")).toBe(true);
  });
  it("401（authExpired）⇒ 「登录已失效」占位、骨架屏消失", async () => {
    h.responder = () => ({ status: 401, code: 401, message: "Token 已过期" });
    const w = await mountBooking();
    expect(has(w, SK)).toBe(false);
    expect(w.text()).toContain("登录已失效");
  });
  it("⭐传输层抛异常（reload 内部 await 抛出）⇒ 骨架屏必须消失并给出失败态（旧写法：.then 不执行，ready 永远 false）", async () => {
    h.responder = () => "throw";
    const w = await mountBooking();
    expect(has(w, SK), "传输异常后骨架屏仍在 ＝ 真机缺陷").toBe(false);
    expect(w.text()).toContain("加载失败");
    expect(has(w, ".retry")).toBe(true);
  });
  it("⭐首个请求永不返回（挂起）⇒ 超时后进入「加载失败，点击重试」态，而不是无限骨架屏", async () => {
    h.responder = () => "hang";
    const w = mount(BookingPage, { global: GLOBAL });
    h.onLoad[h.onLoad.length - 1]?.();
    await flushPromises();
    expect(has(w, SK)).toBe(true); // 加载中：骨架屏合理
    await new Promise((r) => setTimeout(r, 120)); // 页面级超时由 FIRST_LOAD_TIMEOUT_MS 控制（见 domain/merchant-load.ts），测试里注入短值
    await flushPromises();
    expect(has(w, SK), "挂起后骨架屏永不消失 ＝ 真机缺陷").toBe(false);
    expect(w.text()).toContain("加载失败");
    expect(has(w, ".retry")).toBe(true);
  });
});

describe("复现：真机描述的「点 chip 也没画面变化」", () => {
  it("⭐首屏失败/挂起后点筛选 chip 取到数据 ⇒ 页面必须展示列表（旧写法：ready 仍 false，骨架屏继续遮挡）", async () => {
    seq("throw", { data: { list: [row(9)], total: 1 } });
    const w = await mountBooking();
    // 点状态分段「待确认」：onStatusChange ⇒ vm.loadFirst（与点击处理函数同路径；筛选区 2026-11 重设计后状态是横滑分段）
    const segs = w.findAll(".seg-item");
    await segs[1].trigger("click");
    await flushPromises();
    expect(w.findAll(".card").length, "chip 请求已成功但画面仍无列表 ＝ 真机现象").toBe(1);
    expect(has(w, SK)).toBe(false);
  });
  it("首屏挂起时点 chip 拿到数据 ⇒ 立刻展示列表（不必等首屏超时）", async () => {
    seq("hang", { data: { list: [row(3)], total: 1 } });
    const w = mount(BookingPage, { global: GLOBAL });
    h.onLoad[h.onLoad.length - 1]?.();
    await flushPromises();
    await w.findAll(".seg-item")[2].trigger("click");
    await flushPromises();
    expect(w.findAll(".card").length).toBe(1);
    expect(has(w, SK)).toBe(false);
  });
  it("⭐失败态点「重试」重新加载并恢复列表", async () => {
    seq({ status: 200, code: 500, message: "系统繁忙，请稍后重试" }, { data: { list: [row(5)], total: 1 } });
    const w = await mountBooking();
    expect(w.text()).toContain("加载失败");
    await w.find(".retry").trigger("click");
    await flushPromises();
    expect(w.findAll(".card").length).toBe(1);
    expect(w.text()).not.toContain("加载失败");
  });
});

describe("同类页面：档期页同样不得无限骨架屏", () => {
  async function mountSlot() {
    const w = mount(SlotPage, { global: GLOBAL });
    h.onLoad[h.onLoad.length - 1]?.();
    await flushPromises();
    await new Promise((r) => setTimeout(r, 120));
    await flushPromises();
    return w;
  }
  it("档期：传输抛异常 ⇒ 失败态可见、骨架屏消失", async () => {
    h.responder = () => "throw";
    const w = await mountSlot();
    expect(has(w, SK)).toBe(false);
    expect(w.text()).toContain("加载失败");
  });
  it("档期：请求挂起 ⇒ 超时后失败态", async () => {
    h.responder = () => "hang";
    const w = await mountSlot();
    expect(has(w, SK)).toBe(false);
    expect(w.text()).toContain("加载失败");
  });
  it("档期：正常 ⇒ 列表", async () => {
    h.responder = () => ({ data: [{ id: 1, startTime: "10:00", endTime: "11:00", capacity: 5, status: 1 }] });
    const w = await mountSlot();
    expect(has(w, SK)).toBe(false);
    expect(w.findAll(".card").length).toBe(1);
  });
});

describe("guardedLoad / shouldShowSkeleton / 列表壳 —— 一定会 settle", () => {
  it("⭐guardedLoad：成功透传；抛异常（含同步抛）⇒ error；挂起 ⇒ timeout 且定时器已清（变异：去掉 try/catch 或超时即红）", async () => {
    expect(await guardedLoad(async () => 5, 50)).toEqual({ ok: true, value: 5 });
    expect(await guardedLoad(async () => { throw new Error("x"); }, 50)).toEqual({ ok: false, reason: "error", message: LOAD_ERROR_TEXT });
    expect(await guardedLoad((() => { throw new Error("sync"); }) as never, 50)).toMatchObject({ ok: false, reason: "error" });
    const t0 = Date.now();
    expect(await guardedLoad(() => new Promise(() => undefined), 30)).toEqual({ ok: false, reason: "timeout", message: LOAD_TIMEOUT_TEXT });
    expect(Date.now() - t0).toBeLessThan(500);
  });
  it("超时后 fn 迟到的结果不会再冒出来改变已返回的结果", async () => {
    let release!: (v: number) => void;
    const slow = new Promise<number>((r) => { release = r; });
    const r = await guardedLoad(() => slow, 20);
    expect(r).toMatchObject({ ok: false, reason: "timeout" });
    release(1); // 迟到
    await new Promise((x) => setTimeout(x, 10));
    expect(r).toMatchObject({ ok: false, reason: "timeout" });
  });
  it("⭐shouldShowSkeleton：只有「无数据且无错误且（加载中或还没尝试）」才显示；已有数据/错误绝不遮挡（变异：改回只看 ready 即红）", () => {
    expect(shouldShowSkeleton({ itemCount: 0, hasError: false, loading: true, attempted: false })).toBe(true);
    expect(shouldShowSkeleton({ itemCount: 0, hasError: false, loading: false, attempted: false })).toBe(true); // 尚未开始
    expect(shouldShowSkeleton({ itemCount: 0, hasError: false, loading: false, attempted: true })).toBe(false); // 已尝试且无数据 ⇒ 空态而非骨架
    expect(shouldShowSkeleton({ itemCount: 3, hasError: false, loading: true, attempted: false })).toBe(false); // 有数据绝不遮挡
    expect(shouldShowSkeleton({ itemCount: 0, hasError: true, loading: true, attempted: false })).toBe(false); // 有错误绝不遮挡
  });
  it("⭐列表壳 loadFirst：fetch 抛异常/挂起也会 settle 并返回失败（loading 复位、error 有文案）；loadMore 同理", async () => {
    const ctx = { requestId: "r" } as never;
    const vmThrow = createPagedListViewModel<{ id: number }, string>({ fetch: async () => { throw new Error("boom"); } }, { initialFilter: "" });
    expect(await vmThrow.loadFirst(ctx)).toEqual({ ok: false, message: LOAD_ERROR_TEXT });
    expect(vmThrow.loading.value).toBe(false);
    expect(vmThrow.error.value).toBe(LOAD_ERROR_TEXT);
    const vmHang = createPagedListViewModel<{ id: number }, string>({ fetch: () => new Promise(() => undefined) }, { initialFilter: "" });
    expect(await vmHang.loadFirst(ctx)).toEqual({ ok: false, message: LOAD_TIMEOUT_TEXT });
    expect(vmHang.loading.value).toBe(false);
    // loadMore 抛异常：记 loadMoreError，不动 noMore，可重试
    let n = 0;
    const vmMore = createPagedListViewModel<{ id: number }, string>(
      { fetch: async () => { if (++n === 2) throw new Error("m"); return { ok: true, value: { list: [{ id: n }, { id: n + 100 }], total: 10 } }; } },
      { pageSize: 2, initialFilter: "" },
    );
    await vmMore.loadFirst(ctx);
    await vmMore.loadMore(ctx);
    expect(vmMore.loadMoreError.value).toBe(LOAD_ERROR_TEXT);
    expect(vmMore.loadingMore.value).toBe(false);
    expect(vmMore.noMore.value).toBe(false);
  });
});

describe("源码级纪律：商家页「首屏骨架屏」必须有失败/超时出口（M2 新页面自检清单）", () => {
  const strip = (x: string) => x.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const root = resolve(__dirname, "../..");
  const pages = ["booking/list.vue", "slot/list.vue"].map((p) => [p, strip(readFileSync(resolve(root, "src/pkg-merchant", p), "utf-8"))] as const);
  it("⭐不再出现 `v-if=\"!ready\"` 与 `.then(() => { ready.value = true })` 的旧写法（变异：改回旧写法即红）", () => {
    for (const [p, code] of pages) {
      expect(code, p).not.toMatch(/v-if="!ready"/);
      expect(code, p).not.toMatch(/\.then\(\(\)\s*=>\s*\{\s*ready\.value\s*=\s*true/);
    }
  });
  it("⭐骨架屏条件走 shouldShowSkeleton；attempted 在 finally 里置位；加载走 guardedLoad", () => {
    for (const [p, code] of pages) {
      expect(code, p).toContain('v-if="showSkeleton"');
      expect(code, p).toContain("shouldShowSkeleton(");
      expect(code, p).toContain("guardedLoad(");
      expect(code, p).toMatch(/finally\s*\{[^}]*attempted\.value\s*=\s*true/);
    }
  });
  it("所有商家页面里 `v-if=\"…\"` 的骨架屏（含 sk-wrap）都不依赖单一布尔 ready：只允许 showSkeleton", () => {
    const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
    const files: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const f = resolve(d, n); if (statSync(f).isDirectory()) walk(f); else if (f.endsWith(".vue")) files.push(f); } };
    walk(resolve(root, "src/pkg-merchant"));
    for (const f of files) {
      const code = strip(readFileSync(f, "utf-8"));
      const m = code.match(/<view[^>]*\bclass="sk-wrap"[^>]*>/g) ?? [];
      for (const tag of m) expect(tag, f).toMatch(/v-if="showSkeleton"/);
    }
  });
});

void getMerchantRuntime;
