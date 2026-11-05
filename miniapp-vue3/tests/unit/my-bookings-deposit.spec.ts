// 预约保证金 · 我的预约页（pages/myBookings）页面级用例：
// 保证金各状态展示、待支付倒计时与「继续支付」（以服务端状态为准）、倒计时归零自动刷新、取消前结算预览（fail-closed）、防重复点击、
// 无保证金预约保持原文案。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

type Anyobj = Record<string, unknown>;

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  store: new Map<string, string>(),
  log: [] as string[],
  /** listBookings 每次调用返回 lists[min(i,last)] */
  lists: [] as unknown[][],
  listIdx: 0,
  payBookingResult: null as unknown,
  payBookingCalls: 0,
  payResult: { ok: true } as unknown,
  /** getBooking 轮询脚本 */
  polls: [] as unknown[],
  pollIdx: 0,
  previewResult: null as unknown,
  previewCalls: 0,
  cancelCalls: [] as number[],
  payGate: null as Promise<void> | null,
  /** cancelBooking 成功时返回的 value（带保证金结算结果）；null＝空对象 */
  cancelResultValue: null as unknown,
  /** 非 null 时 cancelBooking 返回该错误（AppError 形状） */
  cancelError: null as unknown,
  /** true 时 listBookings 返回网络失败 */
  listFail: false,
}));

vi.mock("../../src/application/haptics", () => ({ hapticTap: () => undefined }));
vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoadCalls.push(fn),
  onShow: () => undefined,
  onReachBottom: () => undefined,
  onPullDownRefresh: () => undefined,
}));
vi.mock("../../src/platform/weixin/payments", () => ({
  createWeixinPayments: () => ({
    requestPayment: async () => {
      h.log.push("pay");
      if (h.payGate) await h.payGate;
      return h.payResult;
    },
  }),
}));
vi.mock("../../src/application/booking-deposit-pay", async (orig) => {
  const m = await orig<typeof import("../../src/application/booking-deposit-pay")>();
  return {
    ...m,
    // 轮询时钟用自增计数器（不依赖 Date）：页面用例里 Date 可能被 fake timers 冻结，真实 Date 会让轮询永不超时
    createDepositPayFlow: (d: Parameters<typeof m.createDepositPayFlow>[0]) => {
      let t = 0;
      return m.createDepositPayFlow({ ...d, sleep: async () => undefined, now: () => (t += 10), poll: { intervalMs: 1, timeoutMs: 30 }, payTimeoutMs: 1000 });
    },
  };
});
vi.mock("../../src/infrastructure/repositories/bookings", () => ({
  createBookingRepository: () => ({
    listBookings: async () => {
      h.log.push("list");
      if (h.listFail) return { ok: false, error: { kind: "NETWORK", businessCode: null, message: "x", requestId: "r", retryable: true } } as never;
      const v = h.lists[Math.min(h.listIdx++, h.lists.length - 1)] ?? [];
      return { ok: true, value: { list: v, total: v.length, page: 1, pageSize: 20 } };
    },
    cancelBooking: async (_c: unknown, id: number) => {
      h.log.push("cancel");
      h.cancelCalls.push(id);
      if (h.cancelError != null) return { ok: false, error: h.cancelError } as never;
      return { ok: true, value: h.cancelResultValue ?? {} } as never;
    },
    getCancelPreview: async () => {
      h.log.push("preview");
      h.previewCalls += 1;
      return h.previewResult as never;
    },
    payBooking: async () => {
      h.log.push("payBooking");
      h.payBookingCalls += 1;
      return h.payBookingResult as never;
    },
    getBooking: async () => {
      h.log.push("getBooking");
      return { ok: true, value: h.polls[Math.min(h.pollIdx++, h.polls.length - 1)] } as never;
    },
  }),
}));
vi.mock("../../src/application/login-flow", () => ({
  createPhoneLoginFlow: () => ({ prefetchLoginCode: async () => true, hasValidLoginCode: () => true, runPhoneLogin: async () => ({ ok: true }) }),
}));
vi.mock("../../src/infrastructure/repositories/wx-auth", () => ({
  createWxAuthRepository: () => ({ login: async () => ({ ok: false, error: { kind: "unsupported" } }) }),
}));

import StubWdPopup from "../stubs/wot/wd-popup/wd-popup.vue";
import StubWdButton from "../stubs/wot/wd-button/wd-button.vue";
import StubWdToast from "../stubs/wot/wd-toast/wd-toast.vue";
import StubWdLoading from "../stubs/wot/wd-loading/wd-loading.vue";
import MyBookingsPage from "../../src/pages/myBookings/index.vue";

const GLOBAL = {
  components: { "wd-popup": StubWdPopup, "wd-button": StubWdButton, "wd-toast": StubWdToast, "wd-loading": StubWdLoading },
};
const flush = () => new Promise((r) => setTimeout(r, 40));

const PAY = { outTradeNo: "T1", prepayId: "p", appId: "a", timeStamp: "1", nonceStr: "n", package: "pkg", signType: "RSA", paySign: "s" };

function cst(ms: number): string {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
}
function dep(status: string, extra: Anyobj = {}): Anyobj {
  return { status, amountFen: 5000, refundFen: 0, forfeitFen: 0, payExpireTime: "", settleReason: "", ...extra };
}
function bk(id: number, status: string, deposit: Anyobj | null, extra: Anyobj = {}): Anyobj {
  return {
    id, shopId: 1, shopName: "红河水乡店", slotId: 7, startTime: "10:00", endTime: "11:00", date: "2026-11-05",
    customerName: "张三", customerPhone: "13800138000", guestCount: 2, remark: "", status, channel: "wx",
    createTime: "2026-11-04 10:00:00", deposit, ...extra,
  };
}
const awaiting = (id = 1, secs = 600) => bk(id, "awaiting_payment", dep("pending", { payExpireTime: cst(Date.now() + secs * 1000) }));

function seedFull(): void {
  h.store.set("lm.session.v1", JSON.stringify({ userId: "1", token: "tk", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }));
}

beforeEach(() => {
  h.onLoadCalls.length = 0;
  h.store.clear();
  h.log.length = 0;
  h.lists = [];
  h.listIdx = 0;
  h.payBookingResult = { ok: true, value: { ...(awaiting(1) as Anyobj), pay: PAY } };
  h.payBookingCalls = 0;
  h.payResult = { ok: true };
  h.polls = [bk(1, "pending", dep("paid"))];
  h.pollIdx = 0;
  h.previewResult = { ok: true, value: { refundFen: 5000, forfeitFen: 0, reason: "cancel_free" } };
  h.previewCalls = 0;
  h.cancelCalls.length = 0;
  h.payGate = null;
  h.cancelResultValue = null;
  h.cancelError = null;
  h.listFail = false;
  seedFull();
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => h.store.set(k, v),
    removeStorageSync: (k: string) => h.store.delete(k),
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    stopPullDownRefresh: () => undefined,
    navigateTo: () => undefined,
    showLoading: () => undefined,
    hideLoading: () => undefined,
  };
});
/** 本文件挂载的页面实例：afterEach 统一卸载。未卸载的待支付页面会在真实计时器上一直滴答，下一个用例装上 fake timers 后其下一跳会落进假时钟，污染 getTimerCount／请求计数 */
const mountedPages: Array<{ unmount: () => void }> = [];
function track<T extends { unmount: () => void }>(w: T): T {
  mountedPages.push(w);
  return w;
}
afterEach(() => {
  for (const w of mountedPages.splice(0)) {
    try {
      w.unmount();
    } catch {
      /* 用例内已卸载 */
    }
  }
  vi.useRealTimers();
});

async function mountPage() {
  const w = track(mount(MyBookingsPage, { global: GLOBAL }));
  h.onLoadCalls[h.onLoadCalls.length - 1]();
  await flush();
  await w.vm.$nextTick();
  return w;
}
const toastText = (w: Awaited<ReturnType<typeof mountPage>>) => w.find(".stub-wd-toast").text();
const cards = (w: Awaited<ReturnType<typeof mountPage>>) => w.findAll(".card");

describe("保证金状态展示", () => {
  it("各状态的卡片文案（待支付／已支付／退还中／已退还／已扣除／退款处理中）", async () => {
    h.lists = [
      [
        awaiting(1),
        bk(2, "pending", dep("paid")),
        bk(3, "cancelled", dep("refunding", { refundFen: 5000, settleReason: "cancel_free" })),
        bk(4, "completed", dep("refunded", { refundFen: 5000, settleReason: "completed" })),
        bk(5, "no_show", dep("forfeited", { forfeitFen: 5000, settleReason: "no_show" })),
        bk(6, "cancelled", dep("refund_abnormal", { refundFen: 5000 })),
        bk(7, "cancelled", dep("refunded", { refundFen: 2500, forfeitFen: 2500, settleReason: "cancel_late" })),
      ],
    ];
    const w = await mountPage();
    const t = cards(w).map((c) => c.text());
    expect(t[0]).toContain("待支付");
    expect(t[0]).toContain("保证金 ¥50.00 · 待支付");
    expect(t[1]).toContain("保证金 ¥50.00 · 已支付");
    expect(t[2]).toContain("退还中");
    expect(t[3]).toContain("¥50.00 已原路退还");
    expect(t[4]).toContain("已爽约");
    expect(t[4]).toContain("已扣除 ¥50.00（爽约）");
    expect(t[5]).toContain("退款处理中");
    expect(t[5]).not.toContain("异常");
    expect(t[6]).toContain("¥25.00 已原路退还，已扣除 ¥25.00（迟取消）");
    expect(w.text()).not.toMatch(/定金|押金/);
  });

  it("按钮可见性：待支付有「继续支付」＋「取消预约」；已爽约/已完成/已取消均无按钮", async () => {
    h.lists = [[awaiting(1), bk(5, "no_show", dep("forfeited", { forfeitFen: 5000 })), bk(4, "completed", dep("refunded", { refundFen: 5000 })), bk(6, "cancelled", dep("refunded", { refundFen: 5000 }))]];
    const w = await mountPage();
    const c = cards(w);
    expect(c[0].find(".pay-btn").exists()).toBe(true);
    expect(c[0].find(".pay-btn").classes()).toContain("btn-primary");
    expect(c[0].find(".cancel-btn").exists()).toBe(true);
    for (const i of [1, 2, 3]) {
      expect(c[i].find(".pay-btn").exists()).toBe(false);
      expect(c[i].find(".cancel-btn").exists()).toBe(false);
    }
  });

  it("待支付展示倒计时「支付剩余 mm:ss」", async () => {
    h.lists = [[awaiting(1, 300)]];
    const w = await mountPage();
    expect(cards(w)[0].text()).toMatch(/支付剩余 0[45]:\d\d/);
  });

  it("过滤标签：有保证金预约时含「待支付」「已爽约」；无保证金预约时不出现", async () => {
    h.lists = [[awaiting(1)]];
    const w = await mountPage();
    const labels = w.findAll(".filter-item").map((n) => n.text());
    expect(labels).toContain("待支付");
    expect(labels).toContain("已爽约");
    w.unmount();
    h.listIdx = 0;
    h.onLoadCalls.length = 0;
    h.lists = [[bk(9, "pending", null)]];
    const w2 = await mountPage();
    const labels2 = w2.findAll(".filter-item").map((n) => n.text());
    expect(labels2).not.toContain("待支付");
    expect(labels2).not.toContain("已爽约");
  });

  it("无保证金的预约（deposit=null）：不出现任何保证金文案，取消确认框保持原文案且不拉取预览", async () => {
    h.lists = [[bk(11, "pending", null)]];
    const w = await mountPage();
    expect(cards(w)[0].text()).not.toMatch(/保证金|¥|继续支付/);
    await w.find(".cancel-btn").trigger("click");
    await flush();
    expect(w.find(".base-dialog-msg").text()).toBe("确认取消本次到店预约吗？");
    expect(h.previewCalls).toBe(0);
  });
});

describe("继续支付：以服务端状态为准", () => {
  it("点击 → payBooking → 拉起支付 → 轮询 getBooking 变 paid → 提示成功并刷新列表", async () => {
    h.lists = [[awaiting(1)], [bk(1, "pending", dep("paid"))]];
    const w = await mountPage();
    h.log.length = 0;
    await w.find(".pay-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.log).toEqual(["payBooking", "pay", "getBooking", "list"]);
    expect(toastText(w)).toContain("支付成功");
    expect(cards(w)[0].text()).toContain("保证金 ¥50.00 · 已支付");
    expect(w.find(".pay-btn").exists()).toBe(false);
  });

  it("【守卫】支付面板回调成功但服务端仍待支付：不提示成功，提示确认中；预约仍在待支付", async () => {
    h.polls = [bk(1, "awaiting_payment", dep("pending"))];
    h.lists = [[awaiting(1)]];
    const w = await mountPage();
    await w.find(".pay-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    const t = toastText(w);
    expect(t).not.toContain("支付成功");
    expect(t).toContain("支付结果确认中");
    expect(cards(w)[0].text()).toContain("待支付");
  });

  it("用户取消支付：提示预约仍保留、可继续支付；按钮仍在，不新建预约", async () => {
    h.payResult = { ok: false, reason: "cancelled", message: "cancel" };
    h.polls = [bk(1, "awaiting_payment", dep("pending"))];
    h.lists = [[awaiting(1)]];
    const w = await mountPage();
    await w.find(".pay-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(toastText(w)).toContain("已取消支付，预约仍保留，可继续支付");
    expect(w.find(".pay-btn").exists()).toBe(true);
    expect(h.payBookingCalls).toBe(1);
  });

  it("payBooking 业务失败（如已过期）：toast 服务端原因并刷新列表，不拉起支付", async () => {
    h.payBookingResult = { ok: false, error: { kind: "BUSINESS", businessCode: 500, message: "预约已过期", requestId: "r", retryable: false } };
    h.lists = [[awaiting(1)], [bk(1, "cancelled", dep("closed"))]];
    const w = await mountPage();
    h.log.length = 0;
    await w.find(".pay-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(toastText(w)).toContain("预约已过期");
    expect(h.log).toEqual(["payBooking", "list"]);
    expect(cards(w)[0].text()).toContain("已取消");
    expect(w.find(".pay-btn").exists()).toBe(false);
  });

  it("防重复点击：支付流程在飞时连点只调用一次 payBooking、只拉起一次支付", async () => {
    let release!: () => void;
    h.payGate = new Promise<void>((r) => (release = r));
    h.lists = [[awaiting(1)], [bk(1, "pending", dep("paid"))]];
    const w = await mountPage();
    const btn = w.find(".pay-btn");
    await btn.trigger("click");
    await btn.trigger("click");
    await btn.trigger("click");
    await flush();
    expect(h.payBookingCalls).toBe(1);
    expect(h.log.filter((x) => x === "pay").length).toBe(1);
    expect(w.find(".pay-btn").text()).toContain("支付中...");
    release();
    await flush();
    await w.vm.$nextTick();
    expect(h.payBookingCalls).toBe(1);
  });

  it("支付进行中不允许同时发起取消", async () => {
    let release!: () => void;
    h.payGate = new Promise<void>((r) => (release = r));
    h.lists = [[awaiting(1)], [bk(1, "pending", dep("paid"))]];
    const w = await mountPage();
    await w.find(".pay-btn").trigger("click");
    await flush();
    await w.find(".cancel-btn").trigger("click");
    await flush();
    expect(w.find(".base-dialog-card").exists()).toBe(false);
    expect(h.previewCalls).toBe(0);
    release();
    await flush();
  });
});

describe("倒计时到 0：自动刷新为已取消，不得再继续支付", () => {
  const BASE = Date.parse("2026-11-05T12:00:00+08:00");

  it("归零时自动重拉列表；服务端已关单 → 展示「已取消」且无「继续支付」", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    h.lists = [
      [bk(1, "awaiting_payment", dep("pending", { payExpireTime: "2026-11-05 12:00:03" }))],
      [bk(1, "cancelled", dep("closed", { settleReason: "hold_expired" }))],
    ];
    const w = track(mount(MyBookingsPage, { global: GLOBAL }));
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await vi.advanceTimersByTimeAsync(10);
    await w.vm.$nextTick();
    expect(cards(w)[0].text()).toContain("支付剩余 00:0");
    expect(w.find(".pay-btn").exists()).toBe(true);
    expect(h.log.filter((x) => x === "list").length).toBe(1);

    await vi.advanceTimersByTimeAsync(4000);
    await w.vm.$nextTick();
    expect(h.log.filter((x) => x === "list").length).toBe(2); // 归零触发了一次刷新
    expect(cards(w)[0].find(".card-status").text()).toBe("已取消");
    expect(w.find(".pay-btn").exists()).toBe(false);
    w.unmount();
  });

  it("归零但服务端仍未关单（关单靠定时任务有延迟）：立刻隐藏「继续支付」；按 0/5/20/45/75 秒退避刷新共 5 次，之后停止（不死循环）；中途关单后即恢复为已取消", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    const stillAwaiting = [bk(1, "awaiting_payment", dep("pending", { payExpireTime: "2026-11-05 12:00:02" }))];
    h.lists = [stillAwaiting];
    const w = track(mount(MyBookingsPage, { global: GLOBAL }));
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await vi.advanceTimersByTimeAsync(10); // 首次加载
    await w.vm.$nextTick();
    const lists = () => h.log.filter((x) => x === "list").length;
    expect(lists()).toBe(1);

    await vi.advanceTimersByTimeAsync(3000); // t≈3s：已归零(2s)，第 1 次刷新(偏移 0)
    await w.vm.$nextTick();
    expect(w.find(".pay-btn").exists()).toBe(false); // 归零立刻隐藏
    expect(cards(w)[0].text()).toContain("支付已超时");
    expect(lists()).toBe(2);

    await vi.advanceTimersByTimeAsync(5000); // 偏移 5s
    expect(lists()).toBe(3);
    await vi.advanceTimersByTimeAsync(20000); // 偏移 20s
    expect(lists()).toBe(4);
    await vi.advanceTimersByTimeAsync(30000); // 偏移 45s
    expect(lists()).toBe(5);
    await vi.advanceTimersByTimeAsync(40000); // 偏移 75s
    expect(lists()).toBe(6);
    await vi.advanceTimersByTimeAsync(200_000); // 配额用尽：不再自动请求
    expect(lists()).toBe(6);
    w.unmount();
  });

  it("归零后重试期间服务端关单：下一次刷新即展示「已取消」，且不再继续刷新", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    h.lists = [
      [bk(1, "awaiting_payment", dep("pending", { payExpireTime: "2026-11-05 12:00:02" }))],
      [bk(1, "awaiting_payment", dep("pending", { payExpireTime: "2026-11-05 12:00:02" }))], // 归零时服务端尚未关单
      [bk(1, "cancelled", dep("closed", { settleReason: "hold_expired" }))], // +5s 关单
    ];
    const w = track(mount(MyBookingsPage, { global: GLOBAL }));
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(5000);
    await w.vm.$nextTick();
    expect(cards(w)[0].find(".card-status").text()).toBe("已取消");
    const n = h.log.filter((x) => x === "list").length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.log.filter((x) => x === "list").length).toBe(n);
    w.unmount();
  });

  it("支付结果「确认中」(timeout) 后短暂冷却：卡片显示「支付结果确认中」且不可再点继续支付，冷却结束后恢复", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    h.polls = [bk(1, "awaiting_payment", dep("pending"))]; // 面板回调成功但服务端一直待支付 ⇒ timeout
    h.lists = [[bk(1, "awaiting_payment", dep("pending", { payExpireTime: "2026-11-05 12:10:00" }))]];
    const w = track(mount(MyBookingsPage, { global: GLOBAL }));
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await vi.advanceTimersByTimeAsync(10);
    await w.vm.$nextTick();
    await w.find(".pay-btn").trigger("click");
    await vi.advanceTimersByTimeAsync(200);
    await w.vm.$nextTick();
    expect(h.payBookingCalls).toBe(1);
    expect(w.find(".pay-btn").exists()).toBe(false);
    expect(cards(w)[0].text()).toContain("支付结果确认中");
    const listsBeforeCooldownEnd = h.log.filter((x) => x === "list").length;
    await vi.advanceTimersByTimeAsync(16_000);
    await w.vm.$nextTick();
    expect(w.find(".pay-btn").exists()).toBe(true); // 冷却结束，允许再次尝试（服务端仍是权威）
    // 问题 9：冷却结束时补一次刷新（面板兜底超时后用户可能已付款，卡片不应一直停在待支付）
    expect(h.log.filter((x) => x === "list").length - listsBeforeCooldownEnd).toBeGreaterThanOrEqual(1);
    w.unmount();
  });

  it("【问题 4·设备时钟偏快】本机认为早已过期、服务端仍返回待支付：5 次退避刷新用尽后恢复「继续支付」，点击后由服务端 payBooking 裁决", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    // 设备时钟比服务端快 10 分钟：本机看截止时间已过去 10 分钟，服务端其实还没过期（列表始终返回待支付）
    const behind = [bk(1, "awaiting_payment", dep("pending", { payExpireTime: "2026-11-05 11:50:00" }))];
    h.lists = [behind];
    h.payBookingResult = { ok: false, error: { kind: "BUSINESS", businessCode: 500, message: "支付已超时,预约已释放,请重新预约", requestId: "r", retryable: false } };
    const w = track(mount(MyBookingsPage, { global: GLOBAL }));
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await vi.advanceTimersByTimeAsync(10);
    await w.vm.$nextTick();
    expect(w.find(".pay-btn").exists()).toBe(false); // 刷新配额未用尽：先等服务端关单
    expect(cards(w)[0].text()).toContain("支付已超时，正在更新状态");
    await vi.advanceTimersByTimeAsync(2500);
    expect(w.find(".pay-btn").exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000); // 5 次刷新（每秒一次）用尽
    await w.vm.$nextTick();
    expect(h.log.filter((x) => x === "list").length).toBe(6); // 首次加载 + 5 次退避刷新，之后不再自动请求
    expect(w.find(".pay-btn").exists()).toBe(true); // 恢复按钮
    expect(cards(w)[0].text()).not.toContain("正在更新状态");
    // 服务端是权威：点击后 payBooking 被调用，服务端拒绝 ⇒ 展示服务端原因（放开按钮不绕过服务端裁决）
    await w.find(".pay-btn").trigger("click");
    await vi.advanceTimersByTimeAsync(100);
    await w.vm.$nextTick();
    expect(h.payBookingCalls).toBe(1);
    expect(toastText(w)).toContain("支付已超时,预约已释放,请重新预约");
    expect(h.log).not.toContain("pay"); // 服务端拒绝 ⇒ 未拉起支付面板
    w.unmount();
  });

  it("【问题 4·设备时钟偏快】刷新用尽但最后一次刷新里服务端已关单：不恢复按钮（已取消）", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    const behind = bk(1, "awaiting_payment", dep("pending", { payExpireTime: "2026-11-05 11:50:00" }));
    h.lists = [[behind], [behind], [behind], [behind], [behind], [bk(1, "cancelled", dep("closed", { settleReason: "hold_expired" }))]];
    const w = track(mount(MyBookingsPage, { global: GLOBAL }));
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await vi.advanceTimersByTimeAsync(12_000);
    await w.vm.$nextTick();
    expect(cards(w)[0].find(".card-status").text()).toBe("已取消");
    expect(w.find(".pay-btn").exists()).toBe(false);
    w.unmount();
  });

  it("【问题 4·设备时钟偏慢】本机看还剩 45 分钟：倒计时按保留期上限 30 分钟封顶，不夸大", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    h.lists = [[bk(1, "awaiting_payment", dep("pending", { payExpireTime: "2026-11-05 12:45:00" }))]];
    const w = track(mount(MyBookingsPage, { global: GLOBAL }));
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await vi.advanceTimersByTimeAsync(10);
    await w.vm.$nextTick();
    const t = cards(w)[0].text();
    expect(t).toMatch(/支付剩余 (30:00|29:5\d)/);
    expect(t).not.toMatch(/支付剩余 (3[1-9]|4\d):/);
    expect(w.find(".pay-btn").exists()).toBe(true);
    w.unmount();
  });

  it("【问题 8】卸载后触发支付超时分支：不再 scheduleTick（零计时器）、不再重拉列表", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    let release!: () => void;
    h.payGate = new Promise<void>((r) => (release = r));
    h.polls = [bk(1, "awaiting_payment", dep("pending"))]; // 面板回调成功但服务端一直待支付 ⇒ timeout 分支
    h.lists = [[bk(1, "awaiting_payment", dep("pending", { payExpireTime: "2026-11-05 12:10:00" }))]];
    const w = track(mount(MyBookingsPage, { global: GLOBAL }));
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await vi.advanceTimersByTimeAsync(10);
    await w.vm.$nextTick();
    await w.find(".pay-btn").trigger("click");
    await vi.advanceTimersByTimeAsync(10);
    expect(h.payBookingCalls).toBe(1);
    w.unmount(); // 用户在支付面板/轮询期间离开页面
    const listsAtUnmount = h.log.filter((x) => x === "list").length;
    release(); // 面板回调返回 ⇒ 流程走完 timeout 分支
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.getTimerCount()).toBe(0); // 没有重新挂起的 1 秒计时器链
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.log.filter((x) => x === "list").length).toBe(listsAtUnmount); // 卸载后零请求（含冷却结束补刷新）
  });

  it("pending 缺截止时间（契约外的防御）：不显示倒计时行，「继续支付」仍可点由服务端裁决，不堵死用户", async () => {
    h.lists = [[bk(1, "awaiting_payment", dep("pending", { payExpireTime: "" }))]];
    const w = await mountPage();
    expect(cards(w)[0].text()).not.toMatch(/支付剩余|支付已超时/);
    expect(w.find(".pay-btn").exists()).toBe(true);
  });

  it("加载时已过截止时间：不出现「继续支付」", async () => {
    h.lists = [[bk(1, "awaiting_payment", dep("pending", { payExpireTime: cst(Date.now() - 60_000) }))]];
    const w = await mountPage();
    expect(w.find(".pay-btn").exists()).toBe(false);
  });

  it("卸载页面时清理计时器（不遗留悬挂定时器）", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    h.lists = [[bk(1, "awaiting_payment", dep("pending", { payExpireTime: "2026-11-05 12:10:00" }))]];
    const w = track(mount(MyBookingsPage, { global: GLOBAL }));
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await vi.advanceTimersByTimeAsync(1500);
    w.unmount();
    // 卸载后推进时间不应再触发列表请求
    const n = h.log.filter((x) => x === "list").length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.log.filter((x) => x === "list").length).toBe(n);
  });
});

describe("取消前结算预览", () => {
  it("迟取消会扣除：确认框写明「将扣除 ¥x，退还 ¥y」，确认后才取消", async () => {
    h.previewResult = { ok: true, value: { refundFen: 2500, forfeitFen: 2500, reason: "cancel_late" } };
    h.lists = [[bk(21, "confirmed", dep("paid"))], [bk(21, "cancelled", dep("refunded", { refundFen: 2500, forfeitFen: 2500, settleReason: "cancel_late" }))]];
    const w = await mountPage();
    await w.find(".cancel-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.previewCalls).toBe(1);
    expect(w.find(".base-dialog-msg").text()).toBe("确认取消本次到店预约吗？取消后将扣除 ¥25.00（迟取消），退还 ¥25.00");
    expect(h.cancelCalls).toEqual([]); // 未确认前零取消
    await w.find(".base-dialog-btn-confirm").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.cancelCalls).toEqual([21]);
    expect(cards(w)[0].text()).toContain("¥25.00 已原路退还，已扣除 ¥25.00（迟取消）");
  });

  it("预览与实际取消之间跨过迟取消边界：取消成功提示以响应里的实际结算为准，且重拉失败时卡片也不再停留在「已支付」", async () => {
    h.previewResult = { ok: true, value: { refundFen: 5000, forfeitFen: 0, reason: "cancel_free" } }; // 预览时仍全退
    h.cancelResultValue = bk(26, "cancelled", dep("refunding", { refundFen: 2500, forfeitFen: 2500, settleReason: "cancel_late" })); // 实际已迟取消
    h.lists = [[bk(26, "confirmed", dep("paid"))]];
    const w = await mountPage();
    await w.find(".cancel-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    h.listFail = true; // 取消后的重拉失败
    await w.find(".base-dialog-btn-confirm").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(toastText(w)).toContain("已取消预约，已扣除 ¥25.00（迟取消），退还 ¥25.00");
    expect(toastText(w)).not.toContain("将扣除"); // 事情已发生：过去时，不再是确认框里的「将扣除」
    const t = cards(w)[0].text();
    expect(t).toContain("已取消");
    expect(t).not.toContain("· 已支付");
    expect(t).toContain("已扣除 ¥25.00（迟取消）");
  });

  it("全额退：确认框写「保证金 ¥50.00 将原路退回」；取消成功后 toast 用过去时「已取消预约，保证金 ¥50.00 将原路退回」", async () => {
    h.lists = [[bk(22, "pending", dep("paid"))]];
    h.cancelResultValue = bk(22, "cancelled", dep("refunding", { refundFen: 5000, settleReason: "cancel_free" }));
    const w = await mountPage();
    await w.find(".cancel-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".base-dialog-msg").text()).toBe("确认取消本次到店预约吗？保证金 ¥50.00 将原路退回");
    await w.find(".base-dialog-btn-confirm").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(toastText(w)).toContain("已取消预约，保证金 ¥50.00 将原路退回");
  });

  // —— 终审问题 7：服务端对「已确认且已开始」的取消/预览返回业务错误；入口不据本地时间隐藏（时钟偏差会误伤），由服务端兜底 ——
  const STARTED = "预约已开始，如需处理请联系商家";
  it("预览返回「预约已开始」：toast 原样展示该句，不弹确认框、不取消，previewingId 复位（按钮恢复「取消预约」）", async () => {
    h.previewResult = { ok: false, error: { kind: "BUSINESS", businessCode: 500, message: STARTED, requestId: "r", retryable: false } };
    h.lists = [[bk(27, "confirmed", dep("paid"))]];
    const w = await mountPage();
    await w.find(".cancel-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(toastText(w)).toContain(STARTED);
    expect(w.find(".base-dialog-card").exists()).toBe(false);
    expect(h.cancelCalls).toEqual([]);
    expect(w.find(".cancel-btn").text()).toBe("取消预约"); // 不是「查询中...」
    // 复位后可再次发起（占位已释放）
    h.previewResult = { ok: true, value: { refundFen: 5000, forfeitFen: 0, reason: "cancel_free" } };
    await w.find(".cancel-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".base-dialog-card").exists()).toBe(true);
  });

  it("待支付取消：不拉预览，提示尚未支付、不会扣款；不得出现「款项将原路退回」（服务端发现已支付会拒绝取消，不会退款）", async () => {
    h.lists = [[awaiting(23)]];
    const w = await mountPage();
    await w.find(".cancel-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.previewCalls).toBe(0);
    expect(w.find(".base-dialog-msg").text()).toBe("确认取消本次到店预约吗？保证金尚未支付，取消不会产生扣款");
    expect(w.find(".base-dialog-msg").text()).not.toMatch(/原路退回|刚完成支付/);
  });

  it("取消请求返回「预约已开始」（预览与取消之间跨过开始时间）：toast 原样展示该句，列表不被改动，占位释放", async () => {
    h.cancelError = { kind: "BUSINESS", businessCode: 500, message: STARTED, requestId: "r", retryable: false };
    h.lists = [[bk(28, "confirmed", dep("paid"))]];
    const w = await mountPage();
    await w.find(".cancel-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    await w.find(".base-dialog-btn-confirm").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.cancelCalls).toEqual([28]);
    expect(toastText(w)).toContain(STARTED);
    expect(cards(w)[0].find(".card-status").text()).toBe("已确认");
    expect(w.find(".cancel-btn").text()).toBe("取消预约");
  });

  it("【fail-closed】预览拉取失败：不弹确认框、不取消，toast 提示（不让用户在不知扣款结果时取消）", async () => {
    h.previewResult = { ok: false, error: { kind: "NETWORK", businessCode: null, message: "x", requestId: "r", retryable: true } };
    h.lists = [[bk(24, "confirmed", dep("paid"))]];
    const w = await mountPage();
    await w.find(".cancel-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".base-dialog-card").exists()).toBe(false);
    expect(h.cancelCalls).toEqual([]);
    expect(toastText(w)).toContain("网络不太稳定");
    // 占位已释放：可再次发起
    h.previewResult = { ok: true, value: { refundFen: 5000, forfeitFen: 0, reason: "cancel_free" } };
    await w.find(".cancel-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".base-dialog-card").exists()).toBe(true);
  });

  it("预览期间重复点击同一张卡：只拉一次预览、只弹一个框", async () => {
    h.lists = [[bk(25, "confirmed", dep("paid"))]];
    const w = await mountPage();
    const btn = w.find(".cancel-btn");
    await btn.trigger("click");
    await btn.trigger("click");
    await btn.trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.previewCalls).toBe(1);
    expect(w.findAll(".base-dialog-card").length).toBe(1);
  });
});
