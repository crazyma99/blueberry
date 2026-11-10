// 相册列表页「分类树加载失败」不得静默（issue #14 · CR）：此前 `if (g.value.t.ok) tree.value = …` 吞掉失败，
// 用户点「新建」会被告知「请先创建二级分类」——把「加载失败」误报成「确实没有分类」。
// 本文件挂真实页面 + 可控 transport：失败 ⇒ 可见失败条 + 重试；成功但确实为空 ⇒ 才提示创建二级分类。
// 变异靶点：①失败不记 treeError ②失败条不渲染 ③新建不检查 treeOk（失败时仍提示「请先创建」）④重试不重新加载。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

type Reply = { status?: number; code?: number | null; message?: string; data?: unknown };
const h = vi.hoisted(() => ({
  onLoad: [] as Array<(o?: Record<string, unknown>) => void>,
  onShow: [] as Array<() => void>,
  store: new Map<string, string>(),
  responder: ((_u: string, _q: Record<string, string> | undefined) => ({ status: 200, code: 200, data: [] })) as (u: string, q: Record<string, string> | undefined) => Reply | Promise<Reply>,
  toasts: [] as string[],
}));
vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoad.push(fn),
  onShow: (fn: () => void) => h.onShow.push(fn),
  onHide: () => undefined,
  onReachBottom: () => undefined,
  onPullDownRefresh: () => undefined,
}));
vi.mock("../../src/platform/uni/transport", () => ({
  createUniTransport: () => ({
    request: async (req: { url: string; query?: Record<string, string> }) => {
      const r = await h.responder(req.url, req.query);
      return { ok: true, value: { status: r.status ?? 200, businessCode: r.code === undefined ? 200 : r.code, message: r.message, requestId: null, data: r.data } };
    },
    cancel: () => undefined,
  }),
}));

import AlbumListPage from "../../src/pkg-merchant/album/list.vue";
import { __resetMerchantRuntime } from "../../src/pkg-merchant/application/merchant-runtime";
import { MERCHANT_PROFILE_KEY, MERCHANT_SESSION_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";

const FeedbackStub = defineComponent({
  setup(_p, { expose }) {
    expose({ show: (t: string) => void h.toasts.push(t) });
    return () => null;
  },
});
const GLOBAL = { stubs: { PullRefreshIndicator: true, BaseFeedback: FeedbackStub, BaseDialog: true, PageFooter: true, BasePicker: true, BasePopup: true, CustomNavBar: true, MerchantNeedLogin: true } };

const parent = { id: 5, name: "外景", sortOrder: 0, shopId: 1, parentId: 0, depth: 1 };
const sub = { id: 9, name: "海边", sortOrder: 0, shopId: 1, parentId: 5, depth: 2 };
const album = (id: number, title: string) => ({ id, shopId: 1, childId: 9, parentId: 5, childName: "海边", title, coverImageUrl: "", price: 10, packageDesc: "", aiDesc: "", sortOrder: 0, tryonCount: 0 });
const CREATE_HINT = "请先在「分类管理」里创建二级分类";

/** 业务应答：parents / subs 可单独指定；其余（相册列表）恒给一条相册；footer 公开接口给空配置 */
function respond(opts: { parents: () => Reply; subs?: () => Reply }) {
  h.responder = (url) => {
    if (url.startsWith("/api/page-config")) return { code: 200, data: {} };
    if (url === "/shop/parent/list") return opts.parents();
    if (url === "/shop/sub/get-by-parent") return (opts.subs ?? (() => ({ code: 200, data: [sub] })))();
    if (url === "/photo-albums/photo") return { code: 200, data: [album(1, "A1")] };
    return { code: 200, data: [] };
  };
}

beforeEach(() => {
  h.onLoad.length = 0;
  h.onShow.length = 0;
  h.store.clear();
  h.toasts.length = 0;
  __resetMerchantRuntime();
  h.store.set(MERCHANT_SESSION_KEY, JSON.stringify({ userId: "7", token: "m-token", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }));
  h.store.set(
    MERCHANT_PROFILE_KEY,
    JSON.stringify({ adminId: 7, merchantId: 1, username: "a", role: "merchant", displayName: "A", roleName: "", permissions: ["album", "category"], shopList: [{ id: 1, name: "A店", merchantName: "", status: 1 }] }),
  );
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

async function mountPage() {
  const w = mount(AlbumListPage, { global: GLOBAL });
  h.onLoad[h.onLoad.length - 1]?.();
  await flushPromises();
  await flushPromises();
  return w;
}

describe("⭐相册列表：分类树加载失败 ⇒ 可见失败条 + 可重试（不再静默）", () => {
  it("分类接口业务失败：相册列表仍显示，但页面出现「分类加载失败：<原因>」+ 重试按钮（变异：不记失败/不渲染即红）", async () => {
    respond({ parents: () => ({ code: 500, message: "系统繁忙，请稍后重试" }) });
    const w = await mountPage();
    expect(w.findAll(".card").length).toBe(1); // 相册本身不受影响
    expect(w.find(".tree-error").exists()).toBe(true);
    expect(w.find(".tree-error-text").text()).toContain("分类加载失败");
    expect(w.find(".tree-error-text").text()).toContain("系统繁忙，请稍后重试");
    expect(w.find(".tree-error-retry").exists()).toBe(true);
  });
  it("某个一级的二级接口失败 ⇒ 整棵树视为失败（不返回半棵树）", async () => {
    respond({ parents: () => ({ code: 200, data: [parent] }), subs: () => ({ code: 500, message: "子分类服务异常" }) });
    const w = await mountPage();
    expect(w.find(".tree-error").exists()).toBe(true);
    expect(w.find(".tree-error-text").text()).toContain("子分类服务异常");
  });
  it("⭐加载失败时点「新建」：不得提示「请先创建二级分类」（那是误报），而是提示失败原因（变异：新建不检查 treeOk 即红）", async () => {
    respond({ parents: () => ({ code: 500, message: "系统繁忙，请稍后重试" }) });
    const w = await mountPage();
    await w.find(".add").trigger("click");
    await flushPromises();
    expect(h.toasts).not.toContain(CREATE_HINT);
    expect(h.toasts.some((t) => t.includes("系统繁忙"))).toBe(true);
  });
  it("⭐点「重试」重新加载分类树：成功后失败条消失（变异：重试不重新加载即红）", async () => {
    let fail = true;
    respond({ parents: () => (fail ? { code: 500, message: "系统繁忙，请稍后重试" } : { code: 200, data: [parent] }) });
    const w = await mountPage();
    expect(w.find(".tree-error").exists()).toBe(true);
    fail = false;
    await w.find(".tree-error-retry").trigger("click");
    await flushPromises();
    await flushPromises();
    expect(w.find(".tree-error").exists()).toBe(false);
    await w.find(".add").trigger("click");
    await flushPromises();
    expect(h.toasts).not.toContain(CREATE_HINT); // 有二级分类 ⇒ 正常进入新建表单，不提示
  });
  it("⭐加载成功且确实没有任何二级分类 ⇒ 才提示「请先创建二级分类」，且不显示失败条", async () => {
    respond({ parents: () => ({ code: 200, data: [] }) });
    const w = await mountPage();
    expect(w.find(".tree-error").exists()).toBe(false);
    await w.find(".add").trigger("click");
    await flushPromises();
    expect(h.toasts).toContain(CREATE_HINT);
  });
});
