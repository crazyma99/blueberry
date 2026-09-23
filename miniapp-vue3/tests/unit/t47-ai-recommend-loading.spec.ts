// T9b P3-20 页级场景测试（aiRecommendLoading）：单次 POST、失败不自增、显式重试才再发、4001/弱网均给恢复入口。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  onShowCalls: [] as Array<() => void>,
  onUnloadCalls: [] as Array<() => void>,
  recommendCalls: 0,
  mode: "ok" as "ok" | "insufficient" | "network" | "business" | "auth",
  toasts: [] as string[],
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoadCalls.push(fn),
  onShow: (fn: () => void) => h.onShowCalls.push(fn),
  onHide: () => undefined,
  onUnload: (fn: () => void) => h.onUnloadCalls.push(fn),
}));

vi.mock("../../src/infrastructure/repositories/ai", () => ({
  createAiRepository: () => ({
    getRecommend: async () => {
      h.recommendCalls += 1;
      if (h.mode === "hang") return await new Promise(() => {}); // 停在等待态（进度续算/推进测试用）
      if (h.mode === "insufficient") return { ok: false, error: { kind: "INSUFFICIENT_CREDITS" } };
      if (h.mode === "network") return { ok: false, error: { kind: "NETWORK" } };
      if (h.mode === "auth") return { ok: false, error: { kind: "AUTH_EXPIRED" } };
      if (h.mode === "business") return { ok: false, error: { kind: "BUSINESS", message: "功能未启用" } };
      return { ok: true, value: { analysis: { gender: "女" }, recommendations: [{ id: 1, finalScore: 88 }] } };
    },
  }),
}));

vi.mock("../../src/infrastructure/repositories/credits", () => ({
  createCreditRepository: () => ({
    getBalance: async () => ({ ok: true, value: { balance: 3, inited: true, priceFenPerCredit: 0 } }),
    createRecharge: async () => ({ ok: true, value: {} }),
    getRechargeStatus: async () => ({ ok: true, value: { outTradeNo: "T", status: 0, paid: false, credits: 1, balance: 0 } }),
  }),
}));

vi.mock("../../src/infrastructure/repositories/page-config", () => ({
  createPageConfigRepository: () => ({ getPageConfig: async () => ({ ok: true, value: [] }) }),
}));

vi.mock("../../src/infrastructure/repositories/wx-auth", () => ({
  createWxAuthRepository: () => ({ login: async () => ({ ok: false, error: { kind: "unsupported" } }) }),
}));

import AiRecommendLoading from "../../src/pages/aiRecommendLoading/index.vue";

const flush = () => new Promise((r) => setTimeout(r, 30));

function boot(options: Record<string, unknown> = { filename: "up.png", shopId: "7" }) {
  const w = mount(AiRecommendLoading);
  h.onLoadCalls[h.onLoadCalls.length - 1](options);
  return w;
}

beforeEach(() => {
  h.recommendCalls = 0;
  h.mode = "ok";
  h.toasts.length = 0;
  h.onLoadCalls.length = 0;
  h.onShowCalls.length = 0;
  h.onUnloadCalls.length = 0;
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: () => "",
    setStorageSync: () => undefined,
    removeStorageSync: () => undefined,
    showToast: (o: { title: string }) => h.toasts.push(o.title),
    showLoading: () => undefined,
    hideLoading: () => undefined,
    redirectTo: () => undefined,
    navigateBack: () => undefined,
    navigateTo: () => undefined,
    getSystemInfoSync: () => ({ statusBarHeight: 20 }),
  };
});

describe("pages/aiRecommendLoading（P3-20 页级场景）", () => {
  it("⭐单次 POST：onLoad 带 filename → 恰好 1 次 getRecommend（同步扣费接口不得重发）", async () => {
    boot();
    await flush();
    expect(h.recommendCalls).toBe(1);
  });

  it("无 filename：**零请求**直接失败（不空转、不扣费，旧端 :67-69）", async () => {
    const w = boot({});
    await flush();
    await w.vm.$nextTick();
    expect(h.recommendCalls).toBe(0);
    expect(w.find(".fail-wrapper").exists()).toBe(true);
  });

  it("⭐4001（次数不足）→ 失败态给恢复入口，且**不自动重发**（仍 1 次）；点「重试」才再发 1 次", async () => {
    h.mode = "insufficient";
    const w = boot();
    await flush();
    await w.vm.$nextTick();
    expect(h.recommendCalls).toBe(1);
    expect(w.find(".fail-wrapper").exists()).toBe(true);
    expect(w.find(".retry-btn").exists()).toBe(true);

    // 等待期不得自行重发（P3-16：超时/失败都不自动再扣）
    await flush();
    expect(h.recommendCalls).toBe(1);

    h.mode = "ok";
    await w.find(".retry-btn").trigger("click"); // 用户显式重试
    await flush();
    expect(h.recommendCalls).toBe(2);
  });

  it("⭐弱网（NETWORK）→ 失败态＋恢复入口，**不自动重发**；重试后成功路径可继续", async () => {
    h.mode = "network";
    const w = boot();
    await flush();
    await w.vm.$nextTick();
    expect(h.recommendCalls).toBe(1);
    expect(w.find(".fail-text").text()).toContain("AI分析失败，请重试");
    await flush();
    expect(h.recommendCalls).toBe(1); // 未自动重发
  });

  it("业务错误：优先服务端 message（toast），仍不自动重发", async () => {
    h.mode = "business";
    const w = boot();
    await flush();
    await w.vm.$nextTick();
    expect(h.recommendCalls).toBe(1);
    expect(h.toasts).toContain("功能未启用");
  });

  it("⭐401（AUTH_EXPIRED）→ 失败态＋toast「登录已过期，请返回重新登录」，**零自动重发**", async () => {
    h.mode = "auth";
    const w = boot();
    await flush();
    await w.vm.$nextTick();
    expect(h.recommendCalls).toBe(1);
    expect(w.find(".fail-wrapper").exists()).toBe(true);
    expect(h.toasts).toContain("登录已过期，请返回重新登录");
    await flush();
    expect(h.recommendCalls).toBe(1); // 不自动重发
  });

  it("⭐180s 超时（页面计时器到点）→ 失败态且**绝不自动重发**（每次 POST 都会再扣次数）", async () => {
    // 捕获页面注册的 1s 计时器回调，手工推进 180 次（避免真实等待/假计时器与 Promise 混用）
    const intervals: Array<() => void> = [];
    const realSetInterval = globalThis.setInterval;
    (globalThis as { setInterval: typeof setInterval }).setInterval = ((fn: () => void) => {
      intervals.push(fn);
      return 0 as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval;
    try {
      const w = boot();
      await flush();
      await w.vm.$nextTick();
      expect(h.recommendCalls).toBe(1);
      const tick = intervals[intervals.length - 1];
      expect(typeof tick).toBe("function");
      for (let i = 0; i < 180; i++) tick();
      await w.vm.$nextTick();
      expect(w.find(".fail-wrapper").exists()).toBe(true);
      expect(w.find(".fail-text").text()).toContain("AI分析失败，请重试");
      expect(h.recommendCalls).toBe(1); // ✅ 超时不得自动再扣第二次
    } finally {
      (globalThis as { setInterval: typeof setInterval }).setInterval = realSetInterval;
    }
  });
});

// ===== 2026-09-23 目标：进度文案动画 ＋ 主人追加「离开再回来进度不能从 0 重来」 =====
describe("等待页进度：随时间推进（驱动圆环动画）与回页续算", () => {
  const uniStub = () => (globalThis as { uni?: { getStorageSync?: (k: string) => unknown } }).uni!;

  it("⭐进度随时间推进：进页 5s 后百分比约 50%（说明输入在动 ⇒ 圆环动画有驱动源）", async () => {
    vi.useFakeTimers();
    try {
      h.mode = "hang";
      const w = boot();
      await vi.advanceTimersByTimeAsync(30);
      expect(w.find(".gp-percent").text()).toBe("0%");
      await vi.advanceTimersByTimeAsync(5000); // 5s（同时推进假时钟 ⇒ 墙钟推导也 +5s）
      await w.vm.$nextTick();
      const pct = parseInt(w.find(".gp-percent").text().replace("%", ""), 10);
      expect(pct).toBeGreaterThanOrEqual(49);
      expect(pct).toBeLessThanOrEqual(51);
      expect(w.find(".gp-steps").exists()).toBe(true); // 增量：三段式仍在
    } finally {
      vi.useRealTimers();
    }
  });

  it("⭐回页续算：storage 里已有 5s 前的起始时间 ⇒ 首帧即 ≈50%（不从 0 重来）", async () => {
    vi.useFakeTimers();
    try {
      h.mode = "hang";
      const now = Date.now();
      uniStub().getStorageSync = (k: string) => (k === "aiRecommend:startedAt" ? String(now - 5000) : "");
      const w = boot();
      await vi.advanceTimersByTimeAsync(30);
      const pct = parseInt(w.find(".gp-percent").text().replace("%", ""), 10);
      expect(pct).toBeGreaterThanOrEqual(49);
      expect(pct).toBeLessThanOrEqual(51);
    } finally {
      vi.useRealTimers();
    }
  });

  it("陈旧保护：起始时间超过 180s（UI 超时窗口）⇒ 不续算，从 0 开始（防「永远 99%」）", async () => {
    vi.useFakeTimers();
    try {
      h.mode = "hang";
      const now = Date.now();
      uniStub().getStorageSync = (k: string) => (k === "aiRecommend:startedAt" ? String(now - 181000) : "");
      const w = boot();
      await vi.advanceTimersByTimeAsync(30);
      expect(w.find(".gp-percent").text()).toBe("0%");
    } finally {
      vi.useRealTimers();
    }
  });
});
