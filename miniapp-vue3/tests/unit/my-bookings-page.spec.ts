// T9 到店预约 MVP：pages/myBookings 页面级冒烟（状态展示/可取消按钮可见性/取消流程二次确认/下拉刷新/触底加载/未登录）。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

type B = Record<string, unknown>;

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  onShowCalls: [] as Array<() => void>,
  reachBottomCalls: [] as Array<() => void>,
  pullDownCalls: [] as Array<() => void>,
  stops: 0,
  store: new Map<string, string>(),
  listCalls: [] as Array<{ status?: string; page?: number; pageSize?: number }>,
  cancelCalls: [] as number[],
  cancelResult: null as unknown,
  pages: {} as Record<string, { list: unknown[]; total: number }>,
  /** 按 "status:page" 强制失败（值为 AppError 形状）；命中则优先于 pages */
  listFail: {} as Record<string, unknown>,
  prefetchCalls: 0,
  phoneLoginCodes: [] as string[],
  loginGate: null as Promise<void> | null,
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoadCalls.push(fn),
  onShow: (fn: () => void) => h.onShowCalls.push(fn),
  onReachBottom: (fn: () => void) => h.reachBottomCalls.push(fn),
  onPullDownRefresh: (fn: () => void) => h.pullDownCalls.push(fn),
}));

vi.mock("../../src/infrastructure/repositories/bookings", () => ({
  createBookingRepository: () => ({
    listBookings: async (_c: unknown, p: { status?: string; page?: number; pageSize?: number }) => {
      h.listCalls.push({ status: p.status, page: p.page, pageSize: p.pageSize });
      const failKey = (p.status ?? "all") + ":" + (p.page ?? 1);
      if (h.listFail[failKey]) return { ok: false, error: h.listFail[failKey] } as never;
      const hit = h.pages[(p.status ?? "all") + ":" + (p.page ?? 1)];
      return hit
        ? { ok: true, value: { ...hit, page: p.page ?? 1, pageSize: p.pageSize ?? 20 } }
        : { ok: true, value: { list: [], total: 0, page: p.page ?? 1, pageSize: p.pageSize ?? 20 } };
    },
    cancelBooking: async (_c: unknown, id: number) => {
      h.cancelCalls.push(id);
      return (h.cancelResult ?? { ok: true, value: {} }) as never;
    },
    getSlots: async () => ({ ok: true, value: { date: "", slots: [] } }),
    createBooking: async () => ({ ok: true, value: {} }),
  }),
}));

// 登录流：页面级用例只关心“登录成功后会话变 full 并自动加载列表”
vi.mock("../../src/application/login-flow", () => ({
  createPhoneLoginFlow: () => ({
    prefetchLoginCode: async () => {
      h.prefetchCalls += 1;
      return true;
    },
    hasValidLoginCode: () => true,
    runPhoneLogin: async (phoneCode: string) => {
      h.phoneLoginCodes.push(phoneCode);
      if (h.loginGate) await h.loginGate;
      h.store.set(
        "lm.session.v1",
        JSON.stringify({ userId: "1", token: "tk-full", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }),
      );
      return { ok: true, phoneHasFullProfile: true };
    },
  }),
}));

vi.mock("../../src/infrastructure/repositories/wx-auth", () => ({
  createWxAuthRepository: () => ({ login: async () => ({ ok: false, error: { kind: "unsupported" } }) }),
}));

import StubWdPopup from "../stubs/wot/wd-popup/wd-popup.vue";
import StubWdButton from "../stubs/wot/wd-button/wd-button.vue";
import StubWdToast from "../stubs/wot/wd-toast/wd-toast.vue";
import StubWdDialog from "../stubs/wot/wd-dialog/wd-dialog.vue";
import StubWdLoading from "../stubs/wot/wd-loading/wd-loading.vue";
import MyBookingsPage from "../../src/pages/myBookings/index.vue";

const GLOBAL = {
  components: {
    "wd-popup": StubWdPopup,
    "wd-button": StubWdButton,
    "wd-toast": StubWdToast,
    "wd-dialog": StubWdDialog,
    "wd-loading": StubWdLoading,
  },
};
const flush = () => new Promise((r) => setTimeout(r, 30));

function seedSession(kind: "silent" | "full"): void {
  h.store.set(
    "lm.session.v1",
    JSON.stringify({ userId: "1", token: "tk-" + kind, platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind }),
  );
}

function booking(id: number, status: string, extra: B = {}): B {
  return {
    id, shopId: 1, shopName: "红河水乡店", slotId: 7, startTime: "10:00", endTime: "11:00", date: "2026-11-05",
    customerName: "张三", customerPhone: "13800138000", guestCount: 2, remark: "", status, channel: "wx",
    createTime: "2026-11-04 10:00:00", ...extra,
  };
}

beforeEach(() => {
  h.onLoadCalls.length = 0;
  h.onShowCalls.length = 0;
  h.reachBottomCalls.length = 0;
  h.pullDownCalls.length = 0;
  h.stops = 0;
  h.store.clear();
  h.listCalls.length = 0;
  h.cancelCalls.length = 0;
  h.cancelResult = null;
  h.pages = {};
  h.listFail = {};
  h.prefetchCalls = 0;
  h.phoneLoginCodes.length = 0;
  h.loginGate = null;
  seedSession("full");
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => h.store.set(k, v),
    removeStorageSync: (k: string) => h.store.delete(k),
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    stopPullDownRefresh: () => {
      h.stops += 1;
    },
    navigateTo: () => undefined,
    showLoading: () => undefined,
    hideLoading: () => undefined,
  };
});

async function mountPage() {
  const w = mount(MyBookingsPage, { global: GLOBAL });
  h.onLoadCalls[h.onLoadCalls.length - 1]();
  await flush();
  await w.vm.$nextTick();
  return w;
}

describe("pages/myBookings（我的预约页）", () => {
  it("按状态展示文案；仅 pending/confirmed 出现'取消预约'按钮", async () => {
    h.pages["all:1"] = {
      list: [booking(1, "pending"), booking(2, "confirmed"), booking(3, "completed"), booking(4, "cancelled"), booking(5, "expired")],
      total: 5,
    };
    const w = await mountPage();
    const cards = w.findAll(".card");
    expect(cards.length).toBe(5);
    const labels = cards.map((c) => c.find(".card-status").text());
    expect(labels).toEqual(["待确认", "已确认", "已完成", "已取消", "已过期"]);
    const cancelables = cards.map((c) => c.find(".cancel-btn").exists());
    expect(cancelables).toEqual([true, true, false, false, false]);
    // 免定金：页面不出现任何支付/定金/金额字样
    expect(w.text()).not.toMatch(/定金|支付|金额|元/);
  });

  it("空列表：展示空态；首屏请求带 page=1、pageSize=20、无 status", async () => {
    const w = await mountPage();
    expect(w.text()).toContain("暂无预约记录");
    expect(h.listCalls[0]).toEqual({ status: undefined, page: 1, pageSize: 20 });
  });

  it("状态筛选：点'待确认'重拉第 1 页并带 status=pending", async () => {
    h.pages["all:1"] = { list: [booking(1, "pending"), booking(2, "completed")], total: 2 };
    h.pages["pending:1"] = { list: [booking(1, "pending")], total: 1 };
    const w = await mountPage();
    const tab = w.findAll(".filter-item").find((t) => t.text() === "待确认")!;
    await tab.trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.listCalls[h.listCalls.length - 1]).toEqual({ status: "pending", page: 1, pageSize: 20 });
    expect(w.findAll(".card").length).toBe(1);
  });

  it("取消流程：点击→二次确认弹层→确认后调取消接口并重拉列表", async () => {
    h.pages["all:1"] = { list: [booking(11, "pending")], total: 1 };
    const w = await mountPage();
    const before = h.listCalls.length;
    await w.find(".cancel-btn").trigger("click");
    await w.vm.$nextTick();
    expect(h.cancelCalls.length).toBe(0); // 未确认前零取消请求
    expect(w.find(".stub-wd-dialog").exists()).toBe(true); // 二次确认弹层
    h.pages["all:1"] = { list: [booking(11, "cancelled")], total: 1 };
    await w.find(".stub-dialog-confirm").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.cancelCalls).toEqual([11]);
    expect(h.listCalls.length).toBe(before + 1); // 取消成功后重拉
    expect(w.find(".card-status").text()).toBe("已取消");
    expect(w.find(".cancel-btn").exists()).toBe(false);
  });

  it("取消流程：弹层选'取消'→ 不调取消接口", async () => {
    h.pages["all:1"] = { list: [booking(12, "confirmed")], total: 1 };
    const w = await mountPage();
    await w.find(".cancel-btn").trigger("click");
    await w.vm.$nextTick();
    await w.find(".stub-dialog-cancel").trigger("click");
    await flush();
    expect(h.cancelCalls.length).toBe(0);
  });

  it("取消失败：服务端可读原因 toast，列表不刷新", async () => {
    h.pages["all:1"] = { list: [booking(13, "pending")], total: 1 };
    h.cancelResult = { ok: false, error: { kind: "BUSINESS", businessCode: 500, message: "该预约当前状态不可取消", requestId: "r", retryable: false } };
    const w = await mountPage();
    const before = h.listCalls.length;
    await w.find(".cancel-btn").trigger("click");
    await w.vm.$nextTick();
    await w.find(".stub-dialog-confirm").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.listCalls.length).toBe(before);
    expect(w.find(".stub-wd-toast").text()).toContain("该预约当前状态不可取消");
  });

  it("触底加载：total 未到时请求 page=2 并追加；到底后不再请求", async () => {
    h.pages["all:1"] = { list: Array.from({ length: 20 }, (_, i) => booking(i + 1, "pending")), total: 21 };
    h.pages["all:2"] = { list: [booking(21, "pending")], total: 21 };
    const w = await mountPage();
    expect(w.findAll(".card").length).toBe(20);
    h.reachBottomCalls[h.reachBottomCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(h.listCalls[h.listCalls.length - 1]).toEqual({ status: undefined, page: 2, pageSize: 20 });
    expect(w.findAll(".card").length).toBe(21);
    const n = h.listCalls.length;
    h.reachBottomCalls[h.reachBottomCalls.length - 1]();
    await flush();
    expect(h.listCalls.length).toBe(n); // noMore 后不再请求
  });

  it("下拉刷新：重拉第 1 页并收口 stopPullDownRefresh", async () => {
    h.pages["all:1"] = { list: [booking(1, "pending")], total: 1 };
    await mountPage();
    const n = h.listCalls.length;
    h.pullDownCalls[h.pullDownCalls.length - 1]();
    await flush();
    expect(h.listCalls.length).toBe(n + 1);
    expect(h.stops).toBe(1);
  });

  it("未登录（无会话/仅 silent）：不请求列表，提示先登录", async () => {
    h.store.clear();
    seedSession("silent");
    const w = await mountPage();
    expect(h.listCalls.length).toBe(0);
    expect(w.text()).toContain("请先登录");
  });

  // —— CR 建议 5：失败保留策略（页面级）——
  const NET = { kind: "NETWORK", businessCode: null, message: "网络不太稳定，请稍后重试", requestId: "r", retryable: true };

  it("(a) 触底加载失败：列表底部出现‘加载失败，点击重试’，列表保留；点击重试（或再次触底）可成功", async () => {
    h.pages["all:1"] = { list: Array.from({ length: 20 }, (_, i) => booking(i + 1, "pending")), total: 21 };
    h.pages["all:2"] = { list: [booking(21, "pending")], total: 21 };
    h.listFail["all:2"] = NET;
    const w = await mountPage();
    h.reachBottomCalls[h.reachBottomCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(w.findAll(".card").length).toBe(20); // 已有列表保留
    expect(w.text()).toContain("加载失败，点击重试");
    expect(w.text()).not.toContain("已经到底了");
    delete h.listFail["all:2"];
    const retry = w.findAll(".load-more").find((n) => n.text().includes("点击重试"))!;
    await retry.trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(w.findAll(".card").length).toBe(21);
    expect(w.text()).not.toContain("加载失败，点击重试");
  });

  it("(a) 触底失败后再次触底同样会重试（noMore 未被置位）", async () => {
    h.pages["all:1"] = { list: Array.from({ length: 20 }, (_, i) => booking(i + 1, "pending")), total: 21 };
    h.pages["all:2"] = { list: [booking(21, "pending")], total: 21 };
    h.listFail["all:2"] = NET;
    const w = await mountPage();
    h.reachBottomCalls[h.reachBottomCalls.length - 1]();
    await flush();
    delete h.listFail["all:2"];
    h.reachBottomCalls[h.reachBottomCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(w.findAll(".card").length).toBe(21);
  });

  it("(b) 下拉刷新失败：保留已有列表（不出‘加载失败’空态），toast 中文原因", async () => {
    h.pages["all:1"] = { list: [booking(1, "pending"), booking(2, "confirmed")], total: 2 };
    const w = await mountPage();
    h.listFail["all:1"] = NET;
    h.pullDownCalls[h.pullDownCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(w.findAll(".card").length).toBe(2);
    expect(w.text()).not.toContain("加载失败");
    expect(w.find(".stub-wd-toast").text()).toContain("网络不太稳定，请稍后重试");
    expect(h.stops).toBe(1);
  });

  it("(b) 首次加载失败：‘加载失败’空态＋重试入口；点重试成功后展示列表", async () => {
    h.listFail["all:1"] = NET;
    h.pages["all:1"] = { list: [booking(1, "pending")], total: 1 };
    const w = await mountPage();
    expect(w.text()).toContain("加载失败");
    expect(w.text()).toContain("网络不太稳定，请稍后重试");
    expect(w.findAll(".card").length).toBe(0);
    delete h.listFail["all:1"];
    const retryBtn = w.findAll(".stub-wd-button").find((b) => b.text().includes("重试"))!;
    await retryBtn.trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(w.findAll(".card").length).toBe(1);
    expect(w.text()).not.toContain("加载失败");
  });

  it("(c) 取消成功但重拉失败：toast‘已取消预约’，列表不清空，该条本地显示‘已取消’", async () => {
    h.pages["all:1"] = { list: [booking(31, "pending"), booking(32, "confirmed")], total: 2 };
    const w = await mountPage();
    await w.findAll(".cancel-btn")[0].trigger("click");
    await w.vm.$nextTick();
    h.listFail["all:1"] = NET; // 取消后的重拉失败
    await w.find(".stub-dialog-confirm").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.cancelCalls).toEqual([31]);
    expect(w.findAll(".card").length).toBe(2);
    expect(w.findAll(".card-status").map((n) => n.text())).toEqual(["已取消", "已确认"]);
    expect(w.find(".stub-wd-toast").text()).toContain("已取消预约");
  });

  // —— CR 建议 7：取消二次确认防叠框 ——
  it("连点两张卡片的‘取消预约’：确认框打开期间第二次点击被忽略，确认只作用于第一条", async () => {
    h.pages["all:1"] = { list: [booking(41, "pending"), booking(42, "pending")], total: 2 };
    const w = await mountPage();
    const btns = w.findAll(".cancel-btn");
    await btns[0].trigger("click");
    await btns[1].trigger("click"); // 弹窗还没结算就点第二条
    await w.vm.$nextTick();
    expect(w.findAll(".stub-wd-dialog").length).toBe(1);
    await w.find(".stub-dialog-confirm").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.cancelCalls).toEqual([41]);
  });

  it("确认框关闭（选‘取消’）后占位释放：可再次对任一条发起取消", async () => {
    h.pages["all:1"] = { list: [booking(51, "pending"), booking(52, "pending")], total: 2 };
    const w = await mountPage();
    await w.findAll(".cancel-btn")[0].trigger("click");
    await w.vm.$nextTick();
    await w.find(".stub-dialog-cancel").trigger("click");
    await flush();
    await w.findAll(".cancel-btn")[1].trigger("click");
    await w.vm.$nextTick();
    await w.find(".stub-dialog-confirm").trigger("click");
    await flush();
    expect(h.cancelCalls).toEqual([52]);
  });

  // —— CR 建议 8：未登录‘去登录’入口 ——
  it("未登录空态提供‘去登录’：点击拉起登录弹窗；登录成功后自动加载列表", async () => {
    h.store.clear();
    h.pages["all:1"] = { list: [booking(61, "pending")], total: 1 };
    const w = await mountPage();
    expect(h.listCalls.length).toBe(0);
    expect(w.text()).toContain("请先登录");
    const goLogin = w.findAll(".stub-wd-button").find((b) => b.text().includes("去登录"))!;
    expect(goLogin).toBeTruthy();
    await goLogin.trigger("click");
    await w.vm.$nextTick();
    expect(w.find(".login-card").exists()).toBe(true);
    expect(h.prefetchCalls).toBe(1);
    await w.find(".agreement-row").trigger("click");
    await w.vm.$nextTick();
    await w.find('button[open-type="getPhoneNumber"]').trigger("getphonenumber", {
      detail: { errMsg: "getPhoneNumber:ok", code: "pc-1" },
    } as never);
    await flush();
    await w.vm.$nextTick();
    expect(h.phoneLoginCodes).toEqual(["pc-1"]);
    expect(w.find(".login-card").exists()).toBe(false);
    expect(h.listCalls.length).toBe(1); // 登录成功后自动加载
    expect(w.findAll(".card").length).toBe(1);
    expect(w.text()).not.toContain("请先登录");
  });

  it("授权按钮连点：只跑一次登录", async () => {
    h.store.clear();
    h.pages["all:1"] = { list: [booking(62, "pending")], total: 1 };
    const w = await mountPage();
    await w.findAll(".stub-wd-button").find((b) => b.text().includes("去登录"))!.trigger("click");
    await w.vm.$nextTick();
    await w.find(".agreement-row").trigger("click");
    await w.vm.$nextTick();
    let release!: () => void;
    h.loginGate = new Promise<void>((r) => (release = r));
    const btn = w.find('button[open-type="getPhoneNumber"]');
    const evt = { detail: { errMsg: "getPhoneNumber:ok", code: "dup" } } as never;
    await btn.trigger("getphonenumber", evt);
    await btn.trigger("getphonenumber", evt);
    await flush();
    expect(h.phoneLoginCodes).toEqual(["dup"]);
    release();
    await flush();
    await w.vm.$nextTick();
    expect(h.listCalls.length).toBe(1);
  });

  it("已登录请求遇 401（会话失效）：回到‘请先登录 / 去登录’，不透出英文技术串", async () => {
    h.pages["all:1"] = { list: [booking(71, "pending")], total: 1 };
    const w = await mountPage();
    h.listFail["all:1"] = { kind: "AUTH_EXPIRED", businessCode: null, message: "unauthorized", requestId: "r", retryable: false };
    h.store.clear(); // client 401 自愈已清会话
    h.pullDownCalls[h.pullDownCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(w.text()).toContain("请先登录");
    expect(w.text()).not.toMatch(/unauthorized/);
  });
});
