// 预约页（底部 Tab 常驻）生命周期用例：品牌切换竞态防护、onShow 跨日/间隔静默刷新、无品牌上下文提示、
// 切换品牌清登录挂起、成功页回表单、分享钩子。
// 驱动方式同 booking-page.spec：mock uni 生命周期＋仓储模块；时间相关用例只伪造 Date（flush 仍用真实 setTimeout）。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Step = { gate?: Promise<void>; result: unknown };

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  onShowCalls: [] as Array<() => void>,
  onHideCalls: [] as Array<() => void>,
  shareAppCalls: [] as Array<() => Record<string, unknown>>,
  shareTimelineCalls: [] as Array<() => Record<string, unknown>>,
  store: new Map<string, string>(),
  navCalls: [] as string[],
  slotsCalls: [] as Array<{ date: string }>,
  /** 逐次消费的脚本化响应（先进先出）；为空则走默认。响应在**调用时刻**快照，门控只延迟到达时间 */
  slotsQueue: [] as Step[],
  slotsDefault: [] as unknown[],
  slotsFail: null as unknown,
  configCalls: 0,
  configQueue: [] as Step[],
  merchantName: "红河水乡店",
  deposit: { enabled: false, amountFen: 0, freeCancelHours: 0, lateCancelForfeitPct: 0, noShowForfeitPct: 0, refundTrigger: "manual" } as unknown,
  configFail: null as unknown,
  submitCalls: [] as unknown[],
  submitGate: null as Promise<void> | null,
  loginGate: null as Promise<void> | null,
  phoneLoginCodes: [] as string[],
  pageConfigCalls: 0,
  brandHubCfg: '{"enabled":true}' as string,
  pageConfigFail: false,
}));

vi.mock("../../src/application/haptics", () => ({ hapticTap: () => undefined }));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoadCalls.push(fn),
  onShow: (fn: () => void) => h.onShowCalls.push(fn),
  onHide: (fn: () => void) => h.onHideCalls.push(fn),
  onShareAppMessage: (fn: () => Record<string, unknown>) => h.shareAppCalls.push(fn),
  onShareTimeline: (fn: () => Record<string, unknown>) => h.shareTimelineCalls.push(fn),
}));

vi.mock("../../src/application/tabbar", async (orig) => {
  const m = await orig<typeof import("../../src/application/tabbar")>();
  return { ...m, syncTabBarSelected: () => undefined };
});

const okCfg = () => ({
  ok: true,
  value: { merchantName: h.merchantName, deposit: h.deposit, payHoldMinutes: 10, subscribeTemplates: { result: "", done: "" } },
});

vi.mock("../../src/infrastructure/repositories/bookings", () => ({
  createBookingRepository: () => ({
    getMerchantSlots: async (_c: unknown, date: string) => {
      h.slotsCalls.push({ date });
      const step = h.slotsQueue.shift();
      if (step != null) {
        if (step.gate) await step.gate;
        return step.result as never;
      }
      if (h.slotsFail) return { ok: false, error: h.slotsFail } as never;
      return { ok: true, value: { date, slots: h.slotsDefault } } as never;
    },
    getMerchantBookingConfig: async () => {
      h.configCalls += 1;
      const step = h.configQueue.shift();
      if (step != null) {
        if (step.gate) await step.gate;
        return step.result as never;
      }
      if (h.configFail) return { ok: false, error: h.configFail } as never;
      return okCfg() as never;
    },
    createBooking: async (_c: unknown, body: unknown) => {
      h.submitCalls.push(body);
      if (h.submitGate) await h.submitGate;
      return {
        ok: true,
        value: {
          id: 1, shopId: 0, merchantId: 7, shopName: "红河水乡店", slotId: 1, startTime: "10:00", endTime: "11:00",
          date: "2026-11-05", customerName: "张三", customerPhone: "13800138000", guestCount: 2, remark: "",
          status: "pending", channel: "wx", createTime: "", deposit: null, pay: null,
        },
      } as never;
    },
    getSlots: async () => ({ ok: false, error: { kind: "BUSINESS", message: "legacy" } }) as never,
    getBookingConfig: async () => ({ ok: false, error: { kind: "BUSINESS", message: "legacy" } }) as never,
  }),
}));

vi.mock("../../src/infrastructure/repositories/page-config", () => ({
  createPageConfigRepository: () => ({
    getPageConfig: async () => {
      h.pageConfigCalls += 1;
      if (h.pageConfigFail) return { ok: false, error: { kind: "NETWORK" } } as never;
      return { ok: true, value: [{ type: "brand_hub", config: h.brandHubCfg }] } as never;
    },
  }),
}));

vi.mock("../../src/application/login-flow", () => ({
  createPhoneLoginFlow: () => ({
    prefetchLoginCode: async () => true,
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

const GLOBAL = { components: { "wd-popup": StubWdPopup, "wd-button": StubWdButton, "wd-toast": StubWdToast } };
const flush = () => new Promise((r) => setTimeout(r, 30));
const BRAND_KEY = "lm.brand.v1";
const NO_BRAND_ERR = { kind: "BUSINESS", businessCode: 500, message: "请先选择入驻门店", requestId: "r", retryable: false };

const slotOf = (id: number, start: string, end: string, remaining = 3) => ({
  slotId: id, startTime: start, endTime: end, capacity: 5, used: 5 - remaining, remaining, bookable: remaining > 0,
});
const slotsOk = (date: string, slots: unknown[]) => ({ ok: true, value: { date, slots } });
const gate = () => {
  let release!: () => void;
  const p = new Promise<void>((r) => (release = r));
  return { p, release };
};

const wrappers: Array<{ unmount: () => void }> = [];
function seedSession(kind: "silent" | "full"): void {
  h.store.set(
    "lm.session.v1",
    JSON.stringify({ userId: "1", token: "tk-" + kind, platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind }),
  );
}
async function mountPage() {
  const w = mount(BookingPage, { global: GLOBAL });
  wrappers.push(w);
  h.onLoadCalls[h.onLoadCalls.length - 1]({});
  await flush();
  await w.vm.$nextTick();
  return w;
}
const show = () => h.onShowCalls[h.onShowCalls.length - 1]();
const hide = () => h.onHideCalls[h.onHideCalls.length - 1]();
const toastText = (w: Awaited<ReturnType<typeof mountPage>>) => w.find(".stub-wd-toast").text();
const cellTexts = (w: Awaited<ReturnType<typeof mountPage>>) => w.findAll(".slot-cell").map((c) => c.text());

async function fillAndPick(w: Awaited<ReturnType<typeof mountPage>>) {
  const inputs = w.findAll("input.form-input");
  await inputs[0].setValue("张三");
  await inputs[1].setValue("13800138000");
  await w.findAll(".slot-cell")[0].trigger("click");
}
async function submitOk(w: Awaited<ReturnType<typeof mountPage>>) {
  seedSession("full");
  await fillAndPick(w);
  await w.find(".submit-btn").trigger("click");
  await flush();
  await w.vm.$nextTick();
}

beforeEach(() => {
  for (const k of ["onLoadCalls", "onShowCalls", "onHideCalls", "shareAppCalls", "shareTimelineCalls", "navCalls", "slotsCalls", "slotsQueue", "configQueue", "submitCalls", "phoneLoginCodes"] as const) {
    (h[k] as unknown[]).length = 0;
  }
  h.store.clear();
  h.slotsDefault = [slotOf(1, "10:00", "11:00", 4), slotOf(2, "11:00", "12:00", 3)];
  h.slotsFail = null;
  h.configCalls = 0;
  h.merchantName = "红河水乡店";
  h.deposit = { enabled: false, amountFen: 0, freeCancelHours: 0, lateCancelForfeitPct: 0, noShowForfeitPct: 0, refundTrigger: "manual" };
  h.configFail = null;
  h.submitGate = null;
  h.loginGate = null;
  h.pageConfigCalls = 0;
  h.brandHubCfg = '{"enabled":true}';
  h.pageConfigFail = false;
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => h.store.set(k, v),
    removeStorageSync: (k: string) => h.store.delete(k),
    navigateTo: (o: { url: string }) => void h.navCalls.push(o.url),
    navigateBack: () => undefined,
    redirectTo: () => undefined,
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    showLoading: () => undefined,
    hideLoading: () => undefined,
  };
});

afterEach(() => {
  while (wrappers.length > 0) wrappers.pop()?.unmount();
  vi.useRealTimers();
});

// ───────────────────────────── MAJOR-2：品牌切换竞态防护 ─────────────────────────────
describe("品牌切换竞态：旧品牌在飞的响应晚到不得污染新品牌页面", () => {
  it("⭐旧品牌的 slots 与 config 响应在新品牌加载完成之后才到达：页面仍是新品牌数据（标题/时段/配置次数）", async () => {
    h.store.set(BRAND_KEY, "brandA");
    const gOldSlots = gate();
    const gOldCfg = gate();
    h.slotsQueue.push({ gate: gOldSlots.p, result: slotsOk("d", [slotOf(901, "08:00", "09:00", 9)]) });
    h.configQueue.push({
      gate: gOldCfg.p,
      result: { ok: true, value: { merchantName: "旧商家", deposit: { ...(h.deposit as object), enabled: true, amountFen: 5000 }, payHoldMinutes: 10, subscribeTemplates: { result: "", done: "" } } },
    });
    const w = await mountPage(); // 旧品牌的两个请求均挂起：仍是骨架
    expect(w.find(".sk-wrap").exists()).toBe(true);

    h.store.set(BRAND_KEY, "brandB");
    h.merchantName = "新商家";
    h.slotsDefault = [slotOf(2, "14:00", "15:00", 2)];
    show(); // 品牌变化：整页重载，新一轮请求立即完成
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".sk-wrap").exists()).toBe(false);
    expect(w.text()).toContain("新商家 · 到店预约");
    expect(cellTexts(w)).toEqual([expect.stringContaining("14:00-15:00")]);

    // 旧品牌的响应现在才到：config 与 slots 都必须被丢弃
    gOldSlots.release();
    gOldCfg.release();
    await flush();
    await w.vm.$nextTick();
    expect(w.text()).toContain("新商家 · 到店预约");
    expect(w.text()).not.toContain("旧商家");
    expect(w.find(".deposit-card").exists()).toBe(false); // 旧 config 的保证金规则不得出现
    expect(cellTexts(w)).toEqual([expect.stringContaining("14:00-15:00")]);
    expect(w.text()).not.toContain("08:00-09:00");
    expect(h.configCalls).toBe(2); // 旧响应被丢弃后不得触发额外重试/重拉
  });

  it("⭐ready 由新一轮置位：旧品牌的加载先于新品牌返回时，页面仍是骨架，新一轮完成后才展示内容", async () => {
    h.store.set(BRAND_KEY, "brandA");
    const gOldSlots = gate();
    const gOldCfg = gate();
    const gNewSlots = gate();
    h.slotsQueue.push({ gate: gOldSlots.p, result: slotsOk("d", [slotOf(901, "08:00", "09:00", 9)]) });
    h.slotsQueue.push({ gate: gNewSlots.p, result: slotsOk("d", [slotOf(2, "14:00", "15:00", 2)]) });
    h.configQueue.push({ gate: gOldCfg.p, result: okCfg() });
    const w = await mountPage();
    h.store.set(BRAND_KEY, "brandB");
    h.merchantName = "新商家";
    show(); // 新一轮：slots 挂起（gNewSlots），config 立即返回
    await flush();
    expect(w.find(".sk-wrap").exists()).toBe(true);

    gOldSlots.release();
    gOldCfg.release(); // 旧一轮全部完成
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".sk-wrap").exists()).toBe(true); // 旧一轮不得把 ready 置位
    expect(w.text()).not.toContain("08:00-09:00");

    gNewSlots.release();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".sk-wrap").exists()).toBe(false);
    expect(cellTexts(w)).toEqual([expect.stringContaining("14:00-15:00")]);
    expect(w.text()).toContain("新商家 · 到店预约");
  });
});

// ───────────────────────────── MINOR-1：无品牌上下文 ─────────────────────────────
describe("无品牌上下文（请先选择入驻门店）", () => {
  const count = (w: Awaited<ReturnType<typeof mountPage>>, s: string) => w.text().split(s).length - 1;
  async function mountFake() {
    vi.useFakeTimers();
    const w = mount(BookingPage, { global: GLOBAL });
    wrappers.push(w);
    h.onLoadCalls[h.onLoadCalls.length - 1]({});
    await vi.advanceTimersByTimeAsync(10);
    await w.vm.$nextTick();
    return w;
  }

  it("⭐只显示一条提示；档期与配置各只请求一次（确定性业务错误不自动重试），无配置错误卡片", async () => {
    h.slotsFail = NO_BRAND_ERR;
    h.configFail = NO_BRAND_ERR;
    const w = await mountFake();
    await vi.advanceTimersByTimeAsync(10_000); // 越过 600ms/1500ms 两档退避
    await w.vm.$nextTick();
    expect(h.configCalls).toBe(1);
    expect(h.slotsCalls.length).toBe(1);
    expect(count(w, "请先选择入驻门店")).toBe(1);
    expect(w.find(".config-retry-btn").exists()).toBe(false);
    expect(w.find(".deposit-card").exists()).toBe(false);
  });

  it("⭐brand_hub 开启：提示旁出现「去入驻门店」，点击跳转 /pages/brandHub/index", async () => {
    h.slotsFail = NO_BRAND_ERR;
    h.configFail = NO_BRAND_ERR;
    const w = await mountFake();
    await vi.advanceTimersByTimeAsync(50);
    await w.vm.$nextTick();
    const btn = w.find(".go-brand-hub-btn");
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain("去入驻门店");
    await btn.trigger("click");
    expect(h.navCalls).toEqual(["/pages/brandHub/index"]);
    expect(count(w, "请先选择入驻门店")).toBe(1);
  });

  it("⭐brand_hub 关闭：只显示提示文字，无按钮", async () => {
    h.slotsFail = NO_BRAND_ERR;
    h.configFail = NO_BRAND_ERR;
    h.brandHubCfg = '{"enabled":false}';
    const w = await mountFake();
    await vi.advanceTimersByTimeAsync(50);
    await w.vm.$nextTick();
    expect(h.pageConfigCalls).toBeGreaterThan(0);
    expect(w.find(".go-brand-hub-btn").exists()).toBe(false);
    expect(count(w, "请先选择入驻门店")).toBe(1);
  });

  it("开关查询失败按安全默认视为关闭：无按钮", async () => {
    h.slotsFail = NO_BRAND_ERR;
    h.configFail = NO_BRAND_ERR;
    h.pageConfigFail = true;
    const w = await mountFake();
    await vi.advanceTimersByTimeAsync(50);
    await w.vm.$nextTick();
    expect(w.find(".go-brand-hub-btn").exists()).toBe(false);
    expect(count(w, "请先选择入驻门店")).toBe(1);
  });

  it("正常品牌不查 brand_hub 开关（零额外请求）；其它业务错误仍按原策略自动重试 2 次后出现配置错误卡片", async () => {
    h.configFail = { kind: "BUSINESS", businessCode: 500, message: "该商家未开通预约", requestId: "r", retryable: false };
    const w = await mountFake();
    await vi.advanceTimersByTimeAsync(5_000);
    await w.vm.$nextTick();
    expect(h.pageConfigCalls).toBe(0);
    expect(h.configCalls).toBe(3); // 初次 + 600ms + 1500ms
    expect(w.find(".config-retry-btn").exists()).toBe(true);
    expect(w.find(".go-brand-hub-btn").exists()).toBe(false);
  });

  it("用户入驻/切换品牌后再进入本 Tab：整页重载，提示消失、档期恢复", async () => {
    h.slotsFail = NO_BRAND_ERR;
    h.configFail = NO_BRAND_ERR;
    const w = await mountPage();
    expect(count(w, "请先选择入驻门店")).toBe(1);
    h.slotsFail = null;
    h.configFail = null;
    h.store.set(BRAND_KEY, "brandB");
    show();
    await flush();
    await w.vm.$nextTick();
    expect(w.text()).not.toContain("请先选择入驻门店");
    expect(w.findAll(".slot-cell").length).toBe(2);
  });
});

// ───────────────────────────── MINOR-2：品牌切换清登录挂起 ─────────────────────────────
describe("品牌切换：清掉登录弹窗与挂起的提交", () => {
  it("⭐弹窗打开时切换品牌：弹窗关闭", async () => {
    h.store.set(BRAND_KEY, "brandA");
    const w = await mountPage();
    seedSession("silent");
    await fillAndPick(w);
    await w.find(".submit-btn").trigger("click");
    await flush();
    expect(w.find(".login-card").exists()).toBe(true);
    h.store.set(BRAND_KEY, "brandB");
    show();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".login-card").exists()).toBe(false);
  });

  it("⭐登录进行中切换品牌：登录完成后不补发上一品牌的提交，也不误提示「请先选择到店时段」", async () => {
    h.store.set(BRAND_KEY, "brandA");
    const w = await mountPage();
    seedSession("silent");
    await fillAndPick(w);
    await w.find(".submit-btn").trigger("click");
    await flush();
    await w.find(".agreement-row").trigger("click");
    await w.vm.$nextTick();
    const g = gate();
    h.loginGate = g.p;
    await w.find('button[open-type="getPhoneNumber"]').trigger("getphonenumber", {
      detail: { errMsg: "getPhoneNumber:ok", code: "c1" },
    } as never);
    await flush();
    expect(h.phoneLoginCodes).toEqual(["c1"]); // 登录在飞
    h.store.set(BRAND_KEY, "brandB");
    show();
    await flush();
    g.release();
    await flush();
    await w.vm.$nextTick();
    expect(h.submitCalls.length).toBe(0);
    expect(toastText(w)).not.toContain("请先选择到店时段");
  });
});

// ───────────────────────────── MINOR-3：成功页回表单 ─────────────────────────────
describe("成功页：切走再回来 / 超时后回到可继续预约的表单态", () => {
  it("⭐成功后切走（onHide）再回来（onShow）：回到表单；保留姓名手机号，清掉所选时段，重拉余量", async () => {
    const w = await mountPage();
    await submitOk(w);
    expect(w.find(".success-back").exists()).toBe(true);
    const before = h.slotsCalls.length;
    hide();
    show();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".success-back").exists()).toBe(false);
    expect(w.findAll(".date-cell").length).toBe(14);
    const inputs = w.findAll("input.form-input");
    expect((inputs[0].element as HTMLInputElement).value).toBe("张三");
    expect((inputs[1].element as HTMLInputElement).value).toBe("13800138000");
    expect(w.findAll(".slot-cell.is-active").length).toBe(0);
    expect(h.slotsCalls.length).toBe(before + 1);
  });

  it("成功后未切走且未满 60s：onShow 保持成功页（不误清）", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 10, 10, 0, 0));
    const w = await mountPage();
    await submitOk(w);
    vi.setSystemTime(new Date(2026, 10, 10, 10, 0, 59));
    show();
    await flush();
    expect(w.find(".success-back").exists()).toBe(true);
  });

  it("成功后未切走但满 60s：onShow 回到表单", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 10, 10, 0, 0));
    const w = await mountPage();
    await submitOk(w);
    vi.setSystemTime(new Date(2026, 10, 10, 10, 1, 1));
    show();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".success-back").exists()).toBe(false);
    expect(w.findAll(".date-cell").length).toBe(14);
  });

  it("成功之前发生的隐藏（如支付拉起/返回）不算切走：成功后紧随的 onShow 不清成功页", async () => {
    const w = await mountPage();
    seedSession("full");
    await fillAndPick(w);
    hide(); // 成功之前的隐藏
    await w.find(".submit-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".success-back").exists()).toBe(true);
    show(); // 支付返回触发的 onShow
    await flush();
    expect(w.find(".success-back").exists()).toBe(true);
  });
});

// ───────────────────────────── MINOR-4：分享 ─────────────────────────────
describe("预约页分享钩子", () => {
  it("⭐好友分享：落地首页并带当前 brandId；标题=导航标题；不落到 tab 页带参；不设 imageUrl", async () => {
    h.store.set(BRAND_KEY, "brandA");
    await mountPage();
    expect(h.shareAppCalls.length).toBe(1);
    const r = h.shareAppCalls[0]() as { title: string; path: string; imageUrl?: string };
    expect(r.path).toBe("/pages/index/index?brandId=brandA");
    expect(r.path).not.toContain("pages/booking");
    expect(r.title).toBe("红河水乡店 · 到店预约");
    expect(r.imageUrl).toBeUndefined();
  });

  it("无品牌上下文：路径不带 brandId 参数", async () => {
    await mountPage();
    const r = h.shareAppCalls[0]() as { path: string };
    expect(r.path).toBe("/pages/index/index");
  });

  it("品牌切换后分享取最新 brandId（不缓存）", async () => {
    h.store.set(BRAND_KEY, "brandA");
    await mountPage();
    h.store.set(BRAND_KEY, "brandB");
    expect((h.shareAppCalls[0]() as { path: string }).path).toBe("/pages/index/index?brandId=brandB");
  });

  it("朋友圈：只给标题（单页模式只能落本页，不带 query/path）", async () => {
    await mountPage();
    expect(h.shareTimelineCalls.length).toBe(1);
    expect(h.shareTimelineCalls[0]()).toEqual({ title: "红河水乡店 · 到店预约" });
  });

  it("源码守卫：没有新造分享卡片键（不引用 share-card 解析器）", () => {
    const src = readFileSync(resolve(__dirname, "../../src/pages/booking/index.vue"), "utf-8");
    expect(src).not.toContain("share-card");
  });
});

// ───────────────────────────── MAJOR-1：tab 常驻后的刷新 ─────────────────────────────
describe("onShow：跨日重建日期窗口 / 间隔静默重拉", () => {
  const clock = (y: number, m: number, d: number, hh = 10, mm = 0, ss = 0) => {
    vi.setSystemTime(new Date(y, m - 1, d, hh, mm, ss));
  };
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    clock(2026, 11, 10);
  });
  const dateLabels = (w: Awaited<ReturnType<typeof mountPage>>) => w.findAll(".date-cell").map((c) => c.text());

  it("同日且间隔未到（<30s）：onShow 不重拉、不重建", async () => {
    const w = await mountPage();
    const s0 = h.slotsCalls.length;
    const c0 = h.configCalls;
    clock(2026, 11, 10, 10, 0, 29);
    show();
    await flush();
    expect(h.slotsCalls.length).toBe(s0);
    expect(h.configCalls).toBe(c0);
    expect(dateLabels(w)[0]).toContain("今天");
  });

  it("⭐间隔到了（≥30s）：静默重拉当前日期的档期与配置——不回骨架、不清表单与选中，余量更新", async () => {
    const w = await mountPage();
    await fillAndPick(w); // 选中第 1 个时段
    expect(w.findAll(".slot-cell.is-active").length).toBe(1);
    const s0 = h.slotsCalls.length;
    const c0 = h.configCalls;
    const g = gate();
    h.slotsQueue.push({ gate: g.p, result: slotsOk("d", [slotOf(1, "10:00", "11:00", 1), slotOf(2, "11:00", "12:00", 3)]) });
    clock(2026, 11, 10, 10, 0, 31);
    show();
    await w.vm.$nextTick();
    expect(h.slotsCalls.length).toBe(s0 + 1);
    expect(h.configCalls).toBe(c0 + 1);
    // 请求在飞：仍展示旧时段，没有骨架，表单与选中保持
    expect(w.findAll(".sk-block-root").length).toBe(0);
    expect(w.find(".sk-wrap").exists()).toBe(false);
    expect(w.findAll(".slot-cell.is-active").length).toBe(1);
    expect((w.findAll("input.form-input")[0].element as HTMLInputElement).value).toBe("张三");
    g.release();
    await flush();
    await w.vm.$nextTick();
    expect(cellTexts(w)[0]).toContain("剩余1席");
    expect(w.findAll(".slot-cell.is-active").length).toBe(1); // 仍可约 ⇒ 选中保留
  });

  it("静默重拉后所选时段已约满：取消选中并提示重选（不清其它表单项）", async () => {
    const w = await mountPage();
    await fillAndPick(w);
    h.slotsQueue.push({ result: slotsOk("d", [slotOf(1, "10:00", "11:00", 0), slotOf(2, "11:00", "12:00", 3)]) });
    clock(2026, 11, 10, 10, 1, 0);
    show();
    await flush();
    await w.vm.$nextTick();
    expect(w.findAll(".slot-cell.is-active").length).toBe(0);
    expect(toastText(w)).toContain("所选时段已约满");
    expect((w.findAll("input.form-input")[1].element as HTMLInputElement).value).toBe("13800138000");
  });

  it("静默重拉失败：保持旧数据，不出现错误提示/重试按钮/骨架", async () => {
    const w = await mountPage();
    h.slotsQueue.push({ result: { ok: false, error: { kind: "NETWORK", businessCode: null, message: "x", requestId: "r", retryable: true } } });
    h.configQueue.push({ result: { ok: false, error: { kind: "NETWORK", businessCode: null, message: "x", requestId: "r", retryable: true } } });
    clock(2026, 11, 10, 10, 1, 0);
    show();
    await flush();
    await w.vm.$nextTick();
    expect(w.findAll(".slot-cell").length).toBe(2);
    expect(w.find(".retry-btn").exists()).toBe(false);
    expect(w.find(".config-retry-btn").exists()).toBe(false);
    expect(w.text()).toContain("红河水乡店 · 到店预约"); // 配置也保持旧值
  });

  it("⭐保证金规则在静默重拉后变化：已勾选的同意作废（须按新规则重新勾选），金额更新", async () => {
    h.deposit = { enabled: true, amountFen: 1000, freeCancelHours: 24, lateCancelForfeitPct: 50, noShowForfeitPct: 100, refundTrigger: "manual" };
    const w = await mountPage();
    await w.find(".deposit-agree").trigger("click");
    expect(w.find(".deposit-check.is-checked").exists()).toBe(true);
    const amountBefore = w.find(".deposit-amount").text();
    h.deposit = { enabled: true, amountFen: 2000, freeCancelHours: 24, lateCancelForfeitPct: 50, noShowForfeitPct: 100, refundTrigger: "manual" };
    clock(2026, 11, 10, 10, 1, 0);
    show();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".deposit-amount").text()).not.toBe(amountBefore);
    expect(w.find(".deposit-check.is-checked").exists()).toBe(false);
  });

  it("规则未变的静默重拉：已勾选的同意保留", async () => {
    h.deposit = { enabled: true, amountFen: 1000, freeCancelHours: 24, lateCancelForfeitPct: 50, noShowForfeitPct: 100, refundTrigger: "manual" };
    const w = await mountPage();
    await w.find(".deposit-agree").trigger("click");
    clock(2026, 11, 10, 10, 1, 0);
    show();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".deposit-check.is-checked").exists()).toBe(true);
  });

  it("⭐跨日：窗口重建（首格重新标「今天」、日期顺延），选中的未来日期保留且按该日期重拉", async () => {
    const w = await mountPage();
    expect(dateLabels(w)[0]).toContain("11-10");
    await w.findAll(".date-cell")[2].trigger("click"); // 选中 11-12
    await flush();
    const s0 = h.slotsCalls.length;
    clock(2026, 11, 11, 9, 0, 0); // 隔天回来（间隔也早已到期）
    show();
    await flush();
    await w.vm.$nextTick();
    expect(dateLabels(w)[0]).toContain("今天");
    expect(dateLabels(w)[0]).toContain("11-11");
    expect(w.findAll(".date-cell").length).toBe(14);
    const active = w.findAll(".date-cell.is-active");
    expect(active.length).toBe(1);
    expect(active[0].text()).toContain("11-12");
    expect(h.slotsCalls.length).toBe(s0 + 1);
    expect(h.slotsCalls[h.slotsCalls.length - 1].date).toBe("2026-11-12");
  });

  it("⭐跨日且选中的是昨天（被挤出窗口）：纠偏到今天，清掉旧选中时段，按今天重拉", async () => {
    const w = await mountPage();
    await w.findAll(".slot-cell")[0].trigger("click"); // 选中 11-10 的时段
    expect(w.findAll(".slot-cell.is-active").length).toBe(1);
    const s0 = h.slotsCalls.length;
    clock(2026, 11, 11, 9, 0, 0);
    show();
    await flush();
    await w.vm.$nextTick();
    const active = w.findAll(".date-cell.is-active");
    expect(active.length).toBe(1);
    expect(active[0].text()).toContain("今天");
    expect(active[0].text()).toContain("11-11");
    expect(h.slotsCalls[h.slotsCalls.length - 1].date).toBe("2026-11-11");
    expect(h.slotsCalls.length).toBe(s0 + 1);
    expect(w.findAll(".slot-cell.is-active").length).toBe(0);
  });

  it("提交进行中：onShow 不触发重拉（不干扰在飞的提交）", async () => {
    const w = await mountPage();
    seedSession("full");
    await fillAndPick(w);
    const g = gate();
    h.submitGate = g.p;
    await w.find(".submit-btn").trigger("click");
    await flush();
    const s0 = h.slotsCalls.length;
    clock(2026, 11, 10, 10, 5, 0);
    show();
    await flush();
    expect(h.slotsCalls.length).toBe(s0);
    g.release();
    await flush();
  });

  it("首轮加载尚未完成时 onShow 不叠加请求", async () => {
    const g = gate();
    h.slotsQueue.push({ gate: g.p, result: slotsOk("d", []) });
    const w = mount(BookingPage, { global: GLOBAL });
    wrappers.push(w);
    h.onLoadCalls[h.onLoadCalls.length - 1]({});
    await flush();
    const s0 = h.slotsCalls.length;
    clock(2026, 11, 12, 10, 0, 0);
    show();
    await flush();
    expect(h.slotsCalls.length).toBe(s0);
    g.release();
    await flush();
  });
});
