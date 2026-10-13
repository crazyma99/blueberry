// T62（2026-10-13 CR 收口①）：**页面接线行为用例** —— 覆盖 t56 的盲区（t56 只锁纯函数与模板字面）。
// 目标：撤掉 pages/aiTryOnResult/index.vue 内「s.errorKind === 'AUTH_EXPIRED'」一行（或等价破坏）即**转红**。
// 范式参照 t53（mock @dcloudio/uni-app 生命周期 + mock 仓储 + mount 页面 + wot 组件桩）。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import StubPopup from "../stubs/wot/wd-popup/wd-popup.vue";
import StubLoading from "../stubs/wot/wd-loading/wd-loading.vue";

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  /** getResult 结果序列（按调用序推进，最后一格循环） */
  sequence: [] as unknown[],
  calls: 0,
  /** 分享只读落地：getSharedTask 返回的后端 message（样本＝品牌门内部文案） */
  sharedFailMessage: "",
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoadCalls.push(fn),
  onShow: () => undefined,
  onHide: () => undefined,
  onUnload: () => undefined,
  onShareAppMessage: () => undefined,
  onShareTimeline: () => undefined,
}));

vi.mock("../../src/infrastructure/repositories/ai-result", () => ({
  createAiResultRepository: () => ({
    getResult: async () => {
      const r = h.sequence[Math.min(h.calls, h.sequence.length - 1)];
      h.calls += 1;
      return r;
    },
    downloadResult: async () => ({ ok: false }),
  }),
}));

vi.mock("../../src/infrastructure/repositories/ai", () => ({
  createAiRepository: () => ({
    getSharedTask: async () => ({
      ok: false,
      error: { kind: "BUSINESS", businessCode: 500, message: h.sharedFailMessage, requestId: "r", retryable: false },
    }),
  }),
}));

import AiTryOnResultPage from "../../src/pages/aiTryOnResult/index.vue";

const TEXTS = {
  auth: "登录状态异常，请点击重试",
  unavailable: "该作品暂时无法查看，请稍后再试",
  generic: "生成失败，请重试",
  busy: "当前服务繁忙，请稍后再试", // CR ②：鉴权失败连点 3 次后自洽降级到本条（无祈使句、无按钮）
};
const INTERNAL_MESSAGE = "店铺不存在、已停用或不属于当前品牌"; // 后端品牌门真实文案，端侧绝不能上屏
const globalWith = { components: { "wd-popup": StubPopup, "wd-loading": StubLoading } };

const okProcessing = { ok: true, value: { status: "processing" } };
const authFailure = {
  ok: false,
  error: { kind: "AUTH_EXPIRED", businessCode: null, message: "unauthorized", requestId: "r", retryable: false },
};
const businessFailure = {
  ok: false,
  error: { kind: "BUSINESS", businessCode: 500, message: INTERNAL_MESSAGE, requestId: "r", retryable: false },
};

/** 假计时器：轮询间隔 8s（elapsed<20s）⇒ 用 advanceTimersByTimeAsync 推进并冲刷微任务 */
async function boot(options: Record<string, unknown>) {
  vi.useFakeTimers();
  const w = mount(AiTryOnResultPage, { global: globalWith });
  await vi.advanceTimersByTimeAsync(20);
  h.onLoadCalls[h.onLoadCalls.length - 1](options);
  await vi.advanceTimersByTimeAsync(20); // 首查 settle（queryInitialTask / loadSharedTask）
  return w;
}

beforeEach(() => {
  h.onLoadCalls.length = 0;
  h.sequence = [];
  h.calls = 0;
  h.sharedFailMessage = "";
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllTimers();
});

describe("t62 · 页面接线：AUTH_EXPIRED 必须落到「登录状态异常」文案（撤接线即红）", () => {
  it("⭐轮询期内收到 AUTH_EXPIRED ⇒ 显示「登录状态异常，请点击重试」＋重试按钮（非只读）", async () => {
    h.sequence = [okProcessing, authFailure]; // 首查 processing → 8s 后轮询拿到 401
    const w = await boot({ taskId: "42", shopId: "7" });
    await vi.advanceTimersByTimeAsync(8100);
    await w.vm.$nextTick();
    expect(w.find(".fail-text").text()).toBe(TEXTS.auth);
    expect(w.find(".retry-btn").exists()).toBe(true); // canRetry：非只读且 failCount<3
    w.unmount();
  });

  it("⭐【CR ① 真盲区】首查（queryInitialTask）即 401 ⇒ 同样显示「登录状态异常，请点击重试」＋重试按钮", async () => {
    // 打开结果页首查就 401 是**最常见**的触发路径；此接线在 index.vue 的 queryInitialTask 分支里（非轮询）
    h.sequence = [authFailure]; // 首查即失败（无需推进定时器）
    const w = await boot({ taskId: "42", shopId: "7" });
    await w.vm.$nextTick();
    expect(w.find(".fail-text").text()).toBe(TEXTS.auth);
    expect(w.find(".retry-btn").exists()).toBe(true); // failCount=0 ⇒ 有按钮，与「请点击重试」自洽
    w.unmount();
  });

  it("⭐【CR ②】鉴权失败连点重试 3 次 ⇒ 文案自洽降级为「当前服务繁忙」，且**不留**无按钮的「点击重试」", async () => {
    h.sequence = [authFailure]; // 首查 401 → authExpired=true, failCount=0
    const w = await boot({ taskId: "42" });
    await w.vm.$nextTick();
    expect(w.find(".fail-text").text()).toBe(TEXTS.auth);
    for (let i = 0; i < 3; i++) {
      await w.find(".retry-btn").trigger("click");
      await vi.advanceTimersByTimeAsync(20);
      await w.vm.$nextTick();
    }
    // 第 3 次点击后 failCount>=3（不再重试）⇒ 文案必须不含祈使句，且不能出现「有祈使句却没按钮」
    const text = w.find(".fail-text").text();
    expect(text).toBe(TEXTS.busy);
    expect(w.find(".retry-btn").exists()).toBe(false);
    expect(text.includes("点击重试") && !w.find(".retry-btn").exists()).toBe(false);
    w.unmount();
  });

  it("⭐对照：轮询期内收到业务失败（品牌门）⇒ 通用「生成失败，请重试」，后端 message 不上屏", async () => {
    h.sequence = [okProcessing, businessFailure];
    const w = await boot({ taskId: "42" });
    await vi.advanceTimersByTimeAsync(8100);
    await w.vm.$nextTick();
    expect(w.find(".fail-text").text()).toBe(TEXTS.generic);
    expect(w.text()).not.toContain("店铺");
    w.unmount();
  });
});

describe("t62 · 页面接线：分享只读落地失败 → 暂时不可查看（防枚举＋不上屏内部 message）", () => {
  it("⭐getSharedTask 失败 ⇒ 「该作品暂时无法查看，请稍后再试」＋「我也要试」；无重试；后端 message 不上屏", async () => {
    h.sharedFailMessage = INTERNAL_MESSAGE;
    const w = await boot({ share_from: "tryon_result", taskId: "9", shareToken: "tok" });
    await w.vm.$nextTick();
    expect(w.find(".fail-text").text()).toBe(TEXTS.unavailable);
    expect(w.find(".retry-btn").exists()).toBe(false); // 只读态恒不给重试（canRetry=false）
    expect(w.find(".btn-primary").exists()).toBe(true); // 「我也要试」入口保留
    expect(w.text()).not.toContain("店铺");
    w.unmount();
  });
});
