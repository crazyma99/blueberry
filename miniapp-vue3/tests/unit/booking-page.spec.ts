// T9 到店预约 MVP：pages/booking 页面级冒烟（提交成功/约满置灰/校验失败/未登录触发登录）。
// 驱动方式同 t26/t38：mock uni 生命周期 + 仓储模块；wot 门面走 stub（wd-popup/wd-toast/wd-button）。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  store: new Map<string, string>(),
  lastRequestedDate: "",
  slotsResponse: null as unknown,
  slotsCalls: [] as Array<{ shopId: number; date: string }>,
  submitResult: null as unknown,
  submitCalls: [] as unknown[],
  prefetchCalls: 0,
  phoneLoginCodes: [] as string[],
  /** 按日期挂起 getSlots 响应（模拟慢请求）与按日期给定响应 */
  slotsGate: {} as Record<string, Promise<void> | undefined>,
  slotsByDate: {} as Record<string, unknown[]>,
  /** 挂起 runPhoneLogin（模拟登录进行中） */
  loginGate: null as Promise<void> | null,
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoadCalls.push(fn),
}));

vi.mock("../../src/infrastructure/repositories/bookings", () => ({
  createBookingRepository: () => ({
    getSlots: async (_c: unknown, shopId: number, date: string) => {
      h.slotsCalls.push({ shopId, date });
      h.lastRequestedDate = date;
      if (h.slotsGate[date]) await h.slotsGate[date];
      if (h.slotsByDate[date]) return { ok: true, value: { date, slots: h.slotsByDate[date] } };
      return { ok: true, value: (h.slotsResponse as { date: string; slots: unknown[] } | null) ?? { date, slots: [] } };
    },
    createBooking: async (_c: unknown, body: unknown) => {
      h.submitCalls.push(body);
      return (
        h.submitResult ?? {
          ok: true,
          value: {
            id: 1, shopId: 1, shopName: "红河水乡店", slotId: 1, startTime: "10:00", endTime: "11:00",
            date: "2026-11-05", customerName: "张三", customerPhone: "13800138000", guestCount: 2, remark: "",
            status: "pending", channel: "wx", createTime: "",
          },
        }
      ) as never;
    },
    listBookings: async () => ({ ok: true, value: { list: [], total: 0, page: 1, pageSize: 20 } }),
    cancelBooking: async () => ({ ok: true, value: {} }),
  }),
}));

vi.mock("../../src/infrastructure/repositories/shops", () => ({
  createShopRepository: () => ({ getShops: async () => ({ ok: true, value: [{ id: 1, displayName: "红河水乡店" }] }) }),
}));

// 登录流：真实 runPhoneLogin 依赖平台 login code 与服务端换票，页面级用例只关心"登录成功后会话变 full 并补发提交"
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
import BookingPage from "../../src/pages/booking/index.vue";
import { buildDateWindow } from "../../src/domain/booking";

const GLOBAL = { components: { "wd-popup": StubWdPopup, "wd-button": StubWdButton, "wd-toast": StubWdToast } };
const flush = () => new Promise((r) => setTimeout(r, 30));

function seedSession(kind: "silent" | "full"): void {
  h.store.set(
    "lm.session.v1",
    JSON.stringify({ userId: "1", token: "tk-" + kind, platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind }),
  );
}

const SLOTS_SAMPLE = {
  slots: [
    { slotId: 1, startTime: "10:00", endTime: "11:00", capacity: 3, used: 1, remaining: 2, bookable: true },
    { slotId: 2, startTime: "11:00", endTime: "12:00", capacity: 2, used: 2, remaining: 0, bookable: false },
  ],
};

beforeEach(() => {
  h.onLoadCalls.length = 0;
  h.store.clear();
  h.lastRequestedDate = "";
  h.slotsResponse = null;
  h.slotsCalls.length = 0;
  h.submitResult = null;
  h.submitCalls.length = 0;
  h.prefetchCalls = 0;
  h.phoneLoginCodes.length = 0;
  h.slotsGate = {};
  h.slotsByDate = {};
  h.loginGate = null;
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => h.store.set(k, v),
    removeStorageSync: (k: string) => h.store.delete(k),
    navigateTo: () => undefined,
    navigateBack: () => undefined,
    redirectTo: () => undefined,
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    showLoading: () => undefined,
    hideLoading: () => undefined,
  };
});

/** 页面 onMounted 内按"今天"日期拉首批时段——先挂载一次探出真实请求日期，再把桩数据注册到该日期重新挂载，
 *  避免用例里硬编码日期字符串与 `domain/booking.buildDateWindow()` 的"今天"产生耦合/脆弱。 */
async function mountReady(query: Record<string, unknown> = { shopId: "1" }, slots = SLOTS_SAMPLE) {
  const probe = mount(BookingPage, { global: GLOBAL });
  h.onLoadCalls[h.onLoadCalls.length - 1](query);
  await flush();
  const date = h.lastRequestedDate;
  probe.unmount();
  h.slotsResponse = { date, slots: slots.slots };
  const w = mount(BookingPage, { global: GLOBAL });
  h.onLoadCalls[h.onLoadCalls.length - 1](query);
  await flush();
  await w.vm.$nextTick();
  return w;
}

describe("pages/booking（到店预约页）", () => {
  it("缺 shopId：不发请求，展示空态", async () => {
    const w = mount(BookingPage, { global: GLOBAL });
    h.onLoadCalls[h.onLoadCalls.length - 1]({});
    await flush();
    await w.vm.$nextTick();
    expect(h.slotsCalls.length).toBe(0);
    expect(w.text()).toContain("门店信息缺失");
  });

  it("有 shopId：门店名展示、日期条渲染 14 天、首日默认选中", async () => {
    const w = await mountReady();
    expect(w.text()).toContain("红河水乡店");
    expect(w.findAll(".date-cell").length).toBe(14);
    expect(w.findAll(".date-cell")[0].classes()).toContain("is-active");
  });

  it("时段格子：约满置灰不可点（显示'已约满'）、可约格子显示剩余席位且可点选中", async () => {
    const w = await mountReady();
    const cells = w.findAll(".slot-cell");
    expect(cells.length).toBe(2);
    expect(cells[0].text()).toContain("剩余2席");
    expect(cells[1].text()).toContain("已约满");
    expect(cells[1].classes()).toContain("is-disabled");

    await cells[1].trigger("click");
    expect(cells[1].classes()).not.toContain("is-active"); // 约满格子点击不选中

    await cells[0].trigger("click");
    expect(cells[0].classes()).toContain("is-active");
  });

  it("校验失败：手机号为空时不提交（零请求）", async () => {
    const w = await mountReady();
    await w.findAll(".slot-cell")[0].trigger("click");
    await w.find("input.form-input").setValue("张三"); // 仅填姓名，手机号留空
    await w.find(".stub-wd-button").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.submitCalls.length).toBe(0);
    // 前端校验提示经 BaseFeedback（wot Toast 桩）可观测
    expect(w.find(".stub-wd-toast").text()).toContain("请填写正确的手机号");
  });

  it("未选时段：提示先选择时段，不提交", async () => {
    const w = await mountReady();
    seedSession("full");
    const inputs = w.findAll("input.form-input");
    await inputs[0].setValue("张三");
    await inputs[1].setValue("13800138000");
    await w.find(".stub-wd-button").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.submitCalls.length).toBe(0);
    expect(w.find(".stub-wd-toast").text()).toContain("请先选择到店时段");
  });

  it("未登录提交：拉起登录弹窗，零提交请求；登录成功后自动补发一次提交", async () => {
    const w = await mountReady();
    const inputs = w.findAll("input.form-input");
    await inputs[0].setValue("张三");
    await inputs[1].setValue("13800138000");
    await w.findAll(".slot-cell")[0].trigger("click");
    await w.find(".stub-wd-button").trigger("click");
    await flush();
    expect(h.submitCalls.length).toBe(0); // 未登录：零提交请求
    expect(w.find(".login-card").exists()).toBe(true); // 弹登录窗
    expect(h.prefetchCalls).toBe(1); // 进弹窗即预取登录码（官方：须在点手机号按钮之前）

    // 勾选协议 → 一键登录按钮（open-type=getPhoneNumber）出现；登录成功 → 自动补发挂起的提交
    await w.find(".agreement-row").trigger("click");
    await w.vm.$nextTick();
    await w.find('button[open-type="getPhoneNumber"]').trigger("getphonenumber", {
      detail: { errMsg: "getPhoneNumber:ok", code: "phone-code-1" },
    } as never);
    await flush();
    await w.vm.$nextTick();
    expect(h.phoneLoginCodes).toEqual(["phone-code-1"]);
    expect(h.submitCalls.length).toBe(1);
    expect(w.text()).toContain("预约已提交");
  });

  it("已登录直接提交成功：展示成功态文案", async () => {
    const w = await mountReady();
    seedSession("full");
    const inputs = w.findAll("input.form-input");
    await inputs[0].setValue("张三");
    await inputs[1].setValue("13800138000");
    await w.findAll(".slot-cell")[0].trigger("click");
    await w.find(".stub-wd-button").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.submitCalls.length).toBe(1);
    expect(h.submitCalls[0]).toMatchObject({ customerName: "张三", customerPhone: "13800138000", slotId: 1 });
    expect(w.text()).toContain("预约已提交");
    expect(w.text()).toContain("等待门店确认");
    expect(w.text()).toContain("我的预约");
    // 后端没有短信/电话通知能力：成功态不得承诺任何通知渠道
    expect(w.text()).not.toMatch(/短信|电话|通知/);
  });

  it("服务端业务失败（已约满等）：message 原样 toast，不进入成功态", async () => {
    h.submitResult = { ok: false, error: { kind: "BUSINESS", businessCode: 500, message: "该时段已约满", requestId: "r", retryable: false } };
    const w = await mountReady();
    seedSession("full");
    const inputs = w.findAll("input.form-input");
    await inputs[0].setValue("张三");
    await inputs[1].setValue("13800138000");
    await w.findAll(".slot-cell")[0].trigger("click");
    await w.find(".stub-wd-button").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(w.text()).not.toContain("预约已提交");
    expect(w.find(".stub-wd-toast").text()).toContain("该时段已约满"); // 服务端可读原因原样展示
  });

  // —— CR 建议 4：时段请求序号（只应用最新一次响应）——
  const slotOf = (id: number, start: string, end: string) => ({ slotId: id, startTime: start, endTime: end, capacity: 3, used: 0, remaining: 3, bookable: true });

  it("连续切换两个日期、先发的后返回：最终只展示后选日期的时段，旧响应不覆盖", async () => {
    const w = await mountReady();
    const days = buildDateWindow();
    let releaseFirst!: () => void;
    h.slotsGate[days[1].date] = new Promise<void>((r) => (releaseFirst = r)); // 日期 1：慢
    h.slotsByDate[days[1].date] = [slotOf(101, "09:00", "10:00")];
    h.slotsByDate[days[2].date] = [slotOf(202, "14:00", "15:00")]; // 日期 2：快
    await w.findAll(".date-cell")[1].trigger("click");
    await w.findAll(".date-cell")[2].trigger("click");
    await flush();
    expect(w.findAll(".slot-cell").map((c) => c.text())).toEqual([expect.stringContaining("14:00-15:00")]);
    releaseFirst(); // 先发的（日期 1）现在才返回
    await flush();
    await w.vm.$nextTick();
    const texts = w.findAll(".slot-cell").map((c) => c.text());
    expect(texts.length).toBe(1);
    expect(texts[0]).toContain("14:00-15:00");
    expect(w.text()).not.toContain("09:00-10:00");
  });

  it("旧响应先于新响应返回时不改 slotsLoading：新请求未完成前仍是骨架，完成后才展示新时段", async () => {
    const w = await mountReady();
    const days = buildDateWindow();
    let releaseOld!: () => void;
    let releaseNew!: () => void;
    h.slotsGate[days[1].date] = new Promise<void>((r) => (releaseOld = r));
    h.slotsGate[days[2].date] = new Promise<void>((r) => (releaseNew = r));
    h.slotsByDate[days[1].date] = [slotOf(101, "09:00", "10:00")];
    h.slotsByDate[days[2].date] = [slotOf(202, "14:00", "15:00")];
    await w.findAll(".date-cell")[1].trigger("click");
    await w.findAll(".date-cell")[2].trigger("click");
    releaseOld(); // 旧的先返回
    await flush();
    await w.vm.$nextTick();
    expect(w.findAll(".slot-cell").length).toBe(0); // 不展示旧时段
    expect(w.findAll(".sk-block-root").length).toBeGreaterThan(0); // 仍在加载新日期（旧响应没把 loading 置 false）
    releaseNew();
    await flush();
    await w.vm.$nextTick();
    expect(w.findAll(".slot-cell").length).toBe(1);
    expect(w.findAll(".slot-cell")[0].text()).toContain("14:00-15:00");
    expect(w.findAll(".sk-block-root").length).toBe(0);
  });

  // —— CR 建议 1：401 引导重新登录 ——
  it("提交遇 401（会话失效）：中文 toast＋拉起登录弹窗；登录成功后自动补发提交", async () => {
    h.submitResult = { ok: false, error: { kind: "AUTH_EXPIRED", businessCode: null, message: "unauthorized", requestId: "r", retryable: false } };
    const w = await mountReady();
    seedSession("full");
    const inputs = w.findAll("input.form-input");
    await inputs[0].setValue("张三");
    await inputs[1].setValue("13800138000");
    await w.findAll(".slot-cell")[0].trigger("click");
    await w.find(".stub-wd-button").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.submitCalls.length).toBe(1);
    expect(w.find(".stub-wd-toast").text()).toContain("登录已失效，请重新登录");
    expect(w.text()).not.toMatch(/unauthorized/);
    expect(w.find(".login-card").exists()).toBe(true); // 沿用既有登录弹窗
    // 登录成功 → 补发提交（此次放行成功）
    h.submitResult = null;
    await w.find(".agreement-row").trigger("click");
    await w.vm.$nextTick();
    await w.find('button[open-type="getPhoneNumber"]').trigger("getphonenumber", { detail: { errMsg: "getPhoneNumber:ok", code: "c1" } } as never);
    await flush();
    await w.vm.$nextTick();
    expect(h.submitCalls.length).toBe(2);
    expect(w.text()).toContain("预约已提交");
  });

  // —— CR 建议 2：创建遇网络失败文案 ——
  it("提交遇网络超时：专属文案（可能已提交，勿重复提交），不进入成功态", async () => {
    h.submitResult = { ok: false, error: { kind: "TIMEOUT", businessCode: null, message: "transport failure: timeout", requestId: "r", retryable: true } };
    const w = await mountReady();
    seedSession("full");
    const inputs = w.findAll("input.form-input");
    await inputs[0].setValue("张三");
    await inputs[1].setValue("13800138000");
    await w.findAll(".slot-cell")[0].trigger("click");
    await w.find(".stub-wd-button").trigger("click");
    await flush();
    await w.vm.$nextTick();
    const toastText = w.find(".stub-wd-toast").text();
    expect(toastText).toContain("请勿重复提交");
    expect(toastText).toContain("我的预约");
    expect(toastText).not.toMatch(/transport failure/);
    expect(w.text()).not.toContain("预约已提交");
    expect(h.submitCalls.length).toBe(1); // 不自动重发
  });

  // —— CR 建议 7：授权按钮防连点 ——
  it("授权按钮连点：登录进行中再次触发被忽略，只跑一次登录", async () => {
    const w = await mountReady();
    const inputs = w.findAll("input.form-input");
    await inputs[0].setValue("张三");
    await inputs[1].setValue("13800138000");
    await w.findAll(".slot-cell")[0].trigger("click");
    await w.find(".stub-wd-button").trigger("click");
    await flush();
    await w.find(".agreement-row").trigger("click");
    await w.vm.$nextTick();
    let releaseLogin!: () => void;
    h.loginGate = new Promise<void>((r) => (releaseLogin = r));
    const btn = w.find('button[open-type="getPhoneNumber"]');
    const evt = { detail: { errMsg: "getPhoneNumber:ok", code: "dup" } } as never;
    await btn.trigger("getphonenumber", evt);
    await btn.trigger("getphonenumber", evt);
    await btn.trigger("getphonenumber", evt);
    await flush();
    expect(h.phoneLoginCodes).toEqual(["dup"]); // 并发只跑一次
    releaseLogin();
    await flush();
    await w.vm.$nextTick();
    expect(h.phoneLoginCodes.length).toBe(1);
    expect(h.submitCalls.length).toBe(1); // 登录成功后仍只补发一次提交
  });
});
