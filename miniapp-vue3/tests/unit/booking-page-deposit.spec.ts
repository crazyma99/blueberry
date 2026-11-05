// 预约保证金 · 预约页（pages/booking）页面级用例：规则展示与勾选、提交顺序（订阅授权→创建→支付→轮询）、
// 「支付回调不作依据」、取消支付后的保留提示、配置失败 fail-closed、未开启门店零变化。
// 驱动方式同 booking-page.spec：mock uni 生命周期＋仓储模块；另 mock 平台能力（订阅授权/微信支付），统一写入同一份调用日志断言顺序。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Anyobj = Record<string, unknown>;

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  store: new Map<string, string>(),
  log: [] as string[],
  subscribeArgs: [] as string[][],
  subscribeThrows: false,
  configResult: null as unknown,
  configCalls: 0,
  createResult: null as unknown,
  createCalls: 0,
  /** getBooking 轮询脚本（第 i 次取 min(i,last)） */
  polls: [] as unknown[],
  pollIdx: 0,
  payResult: { ok: true } as unknown,
  navCalls: [] as string[],
  redirectCalls: [] as string[],
}));

vi.mock("../../src/application/haptics", () => ({ hapticTap: () => undefined }));
vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoadCalls.push(fn),
}));

vi.mock("../../src/platform/weixin/capabilities", () => ({
  requestSubscribe: async (ids: string[]) => {
    h.log.push("subscribe");
    h.subscribeArgs.push(ids);
    if (h.subscribeThrows) throw new Error("boom");
    return { ok: false, results: {}, reason: "failed" };
  },
}));
vi.mock("../../src/platform/weixin/payments", () => ({
  createWeixinPayments: () => ({
    requestPayment: async () => {
      h.log.push("pay");
      return h.payResult;
    },
  }),
}));
// 支付流：真实实现，仅把轮询间隔/超时压到毫秒级（页面自己不暴露注入口）
vi.mock("../../src/application/booking-deposit-pay", async (orig) => {
  const m = await orig<typeof import("../../src/application/booking-deposit-pay")>();
  return {
    ...m,
    createDepositPayFlow: (d: Parameters<typeof m.createDepositPayFlow>[0]) =>
      m.createDepositPayFlow({ ...d, sleep: async () => undefined, poll: { intervalMs: 1, timeoutMs: 40 }, payTimeoutMs: 1000 }),
  };
});

vi.mock("../../src/infrastructure/repositories/bookings", () => ({
  createBookingRepository: () => ({
    getSlots: async (_c: unknown, _shopId: number, date: string) => ({
      ok: true,
      value: {
        date,
        slots: [{ slotId: 1, startTime: "10:00", endTime: "11:00", capacity: 3, used: 1, remaining: 2, bookable: true, reason: "" }],
      },
    }),
    getBookingConfig: async () => {
      h.configCalls += 1;
      const r = typeof h.configResult === "function" ? (h.configResult as () => unknown)() : h.configResult;
      return r as never;
    },
    createBooking: async () => {
      h.log.push("create");
      h.createCalls += 1;
      return h.createResult as never;
    },
    getBooking: async () => {
      h.log.push("getBooking");
      return { ok: true, value: h.polls[Math.min(h.pollIdx++, h.polls.length - 1)] } as never;
    },
    listBookings: async () => ({ ok: true, value: { list: [], total: 0, page: 1, pageSize: 20 } }),
    cancelBooking: async () => ({ ok: true, value: {} }),
  }),
}));
vi.mock("../../src/infrastructure/repositories/shops", () => ({
  createShopRepository: () => ({ getShops: async () => ({ ok: true, value: [{ id: 1, displayName: "红河水乡店" }] }) }),
}));
vi.mock("../../src/application/login-flow", () => ({
  createPhoneLoginFlow: () => ({
    prefetchLoginCode: async () => true,
    hasValidLoginCode: () => true,
    runPhoneLogin: async () => {
      h.store.set("lm.session.v1", JSON.stringify({ userId: "1", token: "tk-full", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }));
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
import BookingPage from "../../src/pages/booking/index.vue";

const GLOBAL = { components: { "wd-popup": StubWdPopup, "wd-button": StubWdButton, "wd-toast": StubWdToast } };
const flush = () => new Promise((r) => setTimeout(r, 40));

/** 毫秒时间戳 → `YYYY-MM-DD HH:mm:ss`（UTC+8 墙钟，契约时间格式） */
function cst(ms: number): string {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

const PAY = { outTradeNo: "T1", prepayId: "p", appId: "a", timeStamp: "1", nonceStr: "n", package: "pkg", signType: "RSA", paySign: "s" };

function depositView(status: string, extra: Anyobj = {}): Anyobj {
  return { status, amountFen: 5000, refundFen: 0, forfeitFen: 0, payExpireTime: cst(Date.now() + 10 * 60 * 1000), settleReason: "", ...extra };
}
function bookingView(status: string, deposit: Anyobj | null, extra: Anyobj = {}): Anyobj {
  return {
    id: 9, shopId: 1, shopName: "红河水乡店", slotId: 1, startTime: "10:00", endTime: "11:00", date: "2026-11-05",
    customerName: "张三", customerPhone: "13800138000", guestCount: 2, remark: "", status, channel: "wx", createTime: "", deposit, ...extra,
  };
}
const CFG_ON = {
  ok: true,
  value: {
    deposit: { enabled: true, amountFen: 5000, freeCancelHours: 24, lateCancelForfeitPct: 50, noShowForfeitPct: 100, refundTrigger: "manual" },
    payHoldMinutes: 10,
    subscribeTemplates: { result: "TPL-R", done: "TPL-D" },
  },
};
const CFG_OFF = {
  ok: true,
  value: {
    deposit: { enabled: false, amountFen: 0, freeCancelHours: 0, lateCancelForfeitPct: 0, noShowForfeitPct: 0, refundTrigger: "manual" },
    payHoldMinutes: 0,
    subscribeTemplates: { result: "", done: "" },
  },
};

function seedFull(): void {
  h.store.set("lm.session.v1", JSON.stringify({ userId: "1", token: "tk", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }));
}

beforeEach(() => {
  h.onLoadCalls.length = 0;
  h.store.clear();
  h.log.length = 0;
  h.subscribeArgs.length = 0;
  h.subscribeThrows = false;
  h.configResult = CFG_ON;
  h.configCalls = 0;
  h.createResult = { ok: true, value: { ...bookingView("awaiting_payment", depositView("pending")), pay: PAY } };
  h.createCalls = 0;
  h.polls = [bookingView("pending", depositView("paid", { payExpireTime: "" }))];
  h.pollIdx = 0;
  h.payResult = { ok: true };
  h.navCalls.length = 0;
  h.redirectCalls.length = 0;
  seedFull();
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => h.store.set(k, v),
    removeStorageSync: (k: string) => h.store.delete(k),
    navigateTo: (o: { url: string }) => h.navCalls.push(o.url),
    navigateBack: () => undefined,
    redirectTo: (o: { url: string }) => h.redirectCalls.push(o.url),
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    showLoading: () => undefined,
    hideLoading: () => undefined,
  };
});

async function mountPage() {
  const w = mount(BookingPage, { global: GLOBAL });
  h.onLoadCalls[h.onLoadCalls.length - 1]({ shopId: "1" });
  await flush();
  await w.vm.$nextTick();
  return w;
}
async function fillForm(w: Awaited<ReturnType<typeof mountPage>>) {
  const inputs = w.findAll("input.form-input");
  await inputs[0].setValue("张三");
  await inputs[1].setValue("13800138000");
  await w.findAll(".slot-cell")[0].trigger("click");
}
async function agree(w: Awaited<ReturnType<typeof mountPage>>) {
  await w.find(".deposit-agree").trigger("click");
  await w.vm.$nextTick();
}
const toastText = (w: Awaited<ReturnType<typeof mountPage>>) => w.find(".stub-wd-toast").text();

describe("未开启保证金的门店：页面与流程与改造前完全一致", () => {
  beforeEach(() => {
    h.configResult = CFG_OFF;
    h.createResult = { ok: true, value: { ...bookingView("pending", null), pay: null } };
  });

  it("无保证金卡片、无任何保证金/金额文案，提交按钮仍是「提交预约」", async () => {
    const w = await mountPage();
    expect(h.configCalls).toBe(1);
    expect(w.find(".deposit-card").exists()).toBe(false);
    expect(w.text()).not.toMatch(/保证金|¥|支付/);
    expect(w.find(".submit-btn").text()).toBe("提交预约");
  });

  it("提交：不弹订阅授权、不支付；直接进入既有成功态", async () => {
    const w = await mountPage();
    await fillForm(w);
    await w.find(".submit-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.log).toEqual(["create"]);
    expect(h.subscribeArgs).toEqual([]);
    expect(w.text()).toContain("预约已提交");
    expect(w.text()).toContain("预约已提交，等待门店确认。可在「我的预约」查看进度");
    expect(w.find(".my-bookings-btn").text()).toBe("查看我的预约");
  });
});

describe("开启保证金：规则展示与勾选", () => {
  it("展示「预约保证金 ¥50.00」、规则摘要（扣除比例/原路退回）与保留时长；提交按钮带金额", async () => {
    const w = await mountPage();
    const card = w.find(".deposit-card");
    expect(card.exists()).toBe(true);
    const t = card.text();
    expect(t).toContain("预约保证金");
    expect(t).toContain("¥50.00");
    expect(t).toContain("开始前 24 小时内取消，扣除 50% 保证金");
    expect(t).toContain("爽约扣除 100% 保证金");
    expect(t).toContain("款项原路退回");
    expect(t).toContain("10 分钟内完成支付");
    expect(w.find(".submit-btn").text()).toContain("¥50.00");
    expect(w.text()).not.toMatch(/定金|押金/);
  });

  it("【守卫】未勾选同意：点击提交只提示，零订阅、零创建、零支付", async () => {
    const w = await mountPage();
    await fillForm(w);
    await w.find(".submit-btn").trigger("click");
    await flush();
    expect(toastText(w)).toContain("请先阅读并勾选同意预约保证金规则");
    expect(h.log).toEqual([]);
    expect(h.createCalls).toBe(0);
  });

  it("勾选框可切换（再点取消勾选后又被拦住）", async () => {
    const w = await mountPage();
    await fillForm(w);
    await agree(w);
    expect(w.find(".deposit-check").classes()).toContain("is-checked");
    await agree(w);
    expect(w.find(".deposit-check").classes()).not.toContain("is-checked");
    await w.find(".submit-btn").trigger("click");
    await flush();
    expect(h.createCalls).toBe(0);
  });
});

describe("开启保证金：提交流程顺序与结果", () => {
  it("勾选后提交：订阅授权（后端下发的模板）→ 创建 → 调起支付 → 轮询服务端；成功态展示已支付金额", async () => {
    const w = await mountPage();
    await fillForm(w);
    await agree(w);
    // 订阅授权必须在点击手势的**同步**调用栈内触发：直接派发 DOM 事件（同步执行 Vue 处理器），不经任何 await，
    // 派发返回的那一刻日志里就必须已有 subscribe，且 create 还没发生
    (w.find(".submit-btn").element as HTMLElement).dispatchEvent(new Event("click"));
    expect(h.log).toEqual(["subscribe"]);
    await flush();
    await w.vm.$nextTick();
    expect(h.log).toEqual(["subscribe", "create", "pay", "getBooking"]);
    expect(h.subscribeArgs).toEqual([["TPL-R", "TPL-D"]]);
    const t = w.text();
    expect(t).toContain("预约已提交");
    expect(t).toContain("¥50.00");
    expect(t).toContain("已支付");
    expect(t).toContain("等待门店确认");
    expect(t).not.toMatch(/定金|押金/);
  });

  it("订阅授权被拒/抛异常：不阻断，照常创建并支付", async () => {
    h.subscribeThrows = true;
    const w = await mountPage();
    await fillForm(w);
    await agree(w);
    await w.find(".submit-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.log).toEqual(["subscribe", "create", "pay", "getBooking"]);
    expect(w.text()).toContain("已支付");
  });

  it("【守卫】requestPayment 回调成功但服务端一直待支付：不展示「已支付」，提示确认中，且只创建一次预约", async () => {
    h.polls = [bookingView("awaiting_payment", depositView("pending"))];
    const w = await mountPage();
    await fillForm(w);
    await agree(w);
    await w.find(".submit-btn").trigger("click");
    await flush();
    await flush();
    await w.vm.$nextTick();
    const t = w.text();
    expect(t).toContain("支付结果确认中");
    expect(t).not.toContain("已支付");
    expect(t).toContain("请勿重复支付");
    expect(h.createCalls).toBe(1);
  });

  it("用户取消支付：留在待支付态，提示「预约已保留 N 分钟，可在我的预约继续支付」，不重复创建，可跳转我的预约", async () => {
    h.payResult = { ok: false, reason: "cancelled", message: "requestPayment:fail cancel" };
    h.polls = [bookingView("awaiting_payment", depositView("pending"))];
    const w = await mountPage();
    await fillForm(w);
    await agree(w);
    await w.find(".submit-btn").trigger("click");
    await flush();
    await flush();
    await w.vm.$nextTick();
    const t = w.text();
    expect(t).toContain("预约已保留 10 分钟，可在「我的预约」继续支付");
    expect(t).not.toContain("已支付");
    expect(h.createCalls).toBe(1);
    expect(w.find(".submit-btn").exists()).toBe(false); // 表单已让位于结果页：无法再次提交
    const cta = w.find(".my-bookings-btn");
    expect(cta.text()).toBe("去我的预约");
    await cta.trigger("click");
    expect(h.redirectCalls).toEqual(["/pages/myBookings/index"]);
  });

  it("支付失败同样保留预约并提示继续支付", async () => {
    h.payResult = { ok: false, reason: "failed", message: "x" };
    h.polls = [bookingView("awaiting_payment", depositView("pending"))];
    const w = await mountPage();
    await fillForm(w);
    await agree(w);
    await w.find(".submit-btn").trigger("click");
    await flush();
    await flush();
    await w.vm.$nextTick();
    expect(w.text()).toContain("支付未完成，预约已保留 10 分钟，可在「我的预约」继续支付");
  });

  it("创建失败（业务失败，如已约满）：toast 原因，不支付，不进入结果页", async () => {
    h.createResult = { ok: false, error: { kind: "BUSINESS", businessCode: 500, message: "该时段已约满", requestId: "r", retryable: false } };
    const w = await mountPage();
    await fillForm(w);
    await agree(w);
    await w.find(".submit-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(toastText(w)).toContain("该时段已约满");
    expect(h.log).toEqual(["subscribe", "create"]);
    expect(w.text()).not.toContain("预约已提交");
  });

  it("提交中连点：只创建一次、只支付一次", async () => {
    const w = await mountPage();
    await fillForm(w);
    await agree(w);
    const btn = w.find(".submit-btn");
    await btn.trigger("click");
    await btn.trigger("click");
    await btn.trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.createCalls).toBe(1);
    expect(h.log.filter((x) => x === "pay").length).toBe(1);
    expect(h.log.filter((x) => x === "subscribe").length).toBe(1);
  });
});

describe("未登录 → 登录成功后补发提交", () => {
  it("补发已脱离点击手势：不再请求订阅授权（避免必然失败的调用），创建与支付照常；全程只创建一次", async () => {
    h.store.clear(); // 未登录
    const w = await mountPage();
    await fillForm(w);
    await agree(w);
    await w.find(".submit-btn").trigger("click");
    await flush();
    expect(h.createCalls).toBe(0);
    expect(h.log).toEqual([]); // 未登录：不为必然失败的提交弹授权
    expect(w.find(".login-card").exists()).toBe(true);
    await w.find(".agreement-row").trigger("click");
    await w.vm.$nextTick();
    await w.find('button[open-type="getPhoneNumber"]').trigger("getphonenumber", {
      detail: { errMsg: "getPhoneNumber:ok", code: "c1" },
    } as never);
    await flush();
    await w.vm.$nextTick();
    expect(h.log).toEqual(["create", "pay", "getBooking"]); // 没有 subscribe
    expect(h.subscribeArgs).toEqual([]);
    expect(h.createCalls).toBe(1);
    expect(w.text()).toContain("已支付");
  });
});

describe("配置拉取失败：fail-closed（不在未明示规则时提交）", () => {
  it("展示失败提示与重试；点提交被拦（零创建）；重试成功后恢复规则卡片", async () => {
    h.configResult = { ok: false, error: { kind: "NETWORK", businessCode: null, message: "x", requestId: "r", retryable: true } };
    const w = await mountPage();
    expect(w.find(".deposit-card").exists()).toBe(true);
    expect(w.find(".config-retry-btn").exists()).toBe(true);
    expect(w.text()).toContain("网络不太稳定");
    await fillForm(w);
    await w.find(".submit-btn").trigger("click");
    await flush();
    expect(h.createCalls).toBe(0);
    expect(h.log).toEqual([]);

    h.configResult = CFG_ON;
    await w.find(".config-retry-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".config-retry-btn").exists()).toBe(false);
    expect(w.find(".deposit-agree").exists()).toBe(true);
    expect(h.configCalls).toBe(2);
  });
});

describe("源码卫生", () => {
  it("预约页订阅模板 ID 不写死（来自 booking-config）", () => {
    const src = readFileSync(resolve(__dirname, "../../src/pages/booking/index.vue"), "utf-8");
    expect(src).not.toMatch(/tmplIds?\s*[:=]\s*\[\s*["']/);
    expect(src).not.toContain("a-9CzBoRFvtp9mZbhsJ08opS4f_Owt1bdwQDouVkPs0"); // 旧 AI 试衣写死的模板，不得复用
  });
});
