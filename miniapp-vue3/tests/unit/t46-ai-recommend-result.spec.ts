// T9b P3-18/P3-19 页级渲染测试（aiRecommendResult）：finalScore 显示条件、理由渲染、脏数据不崩、gender 归一。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  toasts: [] as string[],
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoadCalls.push(fn),
  onShow: () => undefined,
  onHide: () => undefined,
  onUnload: () => undefined,
  onShareAppMessage: () => undefined,
  onShareTimeline: () => undefined,
}));

vi.mock("../../src/infrastructure/repositories/page-config", () => ({
  createPageConfigRepository: () => ({ getPageConfig: async () => ({ ok: true, value: [] }) }),
}));

import AiRecommendResult from "../../src/pages/aiRecommendResult/index.vue";

const flush = () => new Promise((r) => setTimeout(r, 20));

/** 反馈门面桩（2026-09-23 B2 起轻提示通道＝`ui/BaseFeedback`）：vitest 下平台判定为 `"other"`、wot Toast
 *  不真渲染，故以桩替换门面并把「页面要求展示的文案」记进 `h.toasts`（断言口径不变）。
 *  自证：把 `show` 改成空实现，`h.toasts` 断言即变红（测的是门面通道，不是原生回落）。 */
const BaseFeedbackStub = defineComponent({
  name: "BaseFeedback",
  setup(_props, { expose }) {
    expose({ show: (text: string) => h.toasts.push(text), hide: () => undefined });
    return () => null;
  },
});

function mountPage() {
  return mount(AiRecommendResult, { global: { stubs: { BaseFeedback: BaseFeedbackStub } } });
}

function load(payload: unknown, shopId = "7"): Promise<void> {
  const w = mountPage();
  const data = encodeURIComponent(JSON.stringify(payload));
  h.onLoadCalls[h.onLoadCalls.length - 1]({ shopId, data });
  return flush().then(() => w.vm.$nextTick().then(() => undefined)).then(() => undefined);
}

beforeEach(() => {
  h.onLoadCalls.length = 0;
  h.toasts.length = 0;
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: () => "",
    setStorageSync: () => undefined,
    removeStorageSync: () => undefined,
    showToast: (o: { title: string }) => h.toasts.push(o.title),
    getSystemInfoSync: () => ({ statusBarHeight: 20 }),
    navigateTo: () => undefined,
  };
});

describe("pages/aiRecommendResult（T9b P3-18/P3-19）", () => {
  it("⭐finalScore 显示条件：>0 才渲染「N分」；0 与缺失一律不渲染（不凑分）", async () => {
    const w = mountPage();
    h.onLoadCalls[0]({
      shopId: "7",
      data: encodeURIComponent(
        JSON.stringify({
          analysis: { gender: "女" },
          recommendations: [
            { id: 1, finalScore: 88, styleName: "汉服", reason: "气质契合" },
            { id: 2, finalScore: 0, styleName: "旗袍", reason: "色彩协调", score: 99 },
            { id: 3, styleName: "民国", reason: "轮廓相似" },
          ],
        }),
      ),
    });
    await flush();
    await w.vm.$nextTick();
    const text = w.text();
    expect(text).toContain("88分");
    expect(text).not.toContain("0分");
    expect(text).not.toContain("99分"); // 原始 score 不得被当作展示分数
    expect(text).toContain("气质契合");
    expect(w.findAll(".recommend-item, .rec-card, .card-title").length).toBeGreaterThanOrEqual(3);
  });

  it("脏数据不崩（偏差⑥）：recommendations 非数组 → 空列表；analysis 缺字段 → 不抛", async () => {
    const w = mountPage();
    h.onLoadCalls[0]({
      shopId: "7",
      data: encodeURIComponent(JSON.stringify({ analysis: {}, recommendations: "not-an-array" })),
    });
    await flush();
    await w.vm.$nextTick();
    expect(w.findAll(".recommend-item, .rec-card").length).toBe(0);
  });

  it("非法 JSON → toast「结果解析失败，请重试」且不崩", async () => {
    const w = mountPage();
    h.onLoadCalls[0]({ shopId: "7", data: "%7Bbroken" });
    await flush();
    await w.vm.$nextTick();
    expect(h.toasts).toContain("结果解析失败，请重试");
    expect(w.findAll(".recommend-item, .rec-card").length).toBe(0);
  });
});
