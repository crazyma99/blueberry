// 2026-09-21 主人：「AI试衣落地页分享的准备 loading 也使用 wotui 的 loading 组件＋token」，并追问
// 「是否可以用 popup ＋ loading 做替代、做成公共组件，后面可以复用」——
// 实现＝公共组件 `ui/BaseLoadingPopup`（wd-popup 遮罩/居中 ＋ 门面 BaseLoading＝wd-loading ＋ token 卡片面）；
// 本 spec 从**页面**侧锁接线与收口：①未点分享不显示 ②准备中显示且指示器取 token 值 ③就绪/降级后自动收口。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import StubPopup from "../stubs/wot/wd-popup/wd-popup.vue";
import StubLoading from "../stubs/wot/wd-loading/wd-loading.vue";

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  shareCalls: [] as Array<() => unknown>,
  faceMode: "pending" as "pending" | "resolved" | "null",
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoadCalls.push(fn),
  onShow: () => undefined,
  onHide: () => undefined,
  onUnload: () => undefined,
  onShareAppMessage: (fn: () => unknown) => h.shareCalls.push(fn),
  onShareTimeline: () => undefined,
}));

// 封面准备：pending＝永不结（模拟 VK 人脸检测最长 10s）／resolved＝出本地临时图／null＝降级网络 JPG
vi.mock("../../src/platform/weixin/face-share-card", () => ({
  generateFaceCenteredCard: () => {
    if (h.faceMode === "pending") return new Promise(() => undefined);
    if (h.faceMode === "resolved") return Promise.resolve({ imagePath: "wxfile://tmp/face-card.jpg" });
    return Promise.resolve(null);
  },
}));

// 首查直达 completed（带 result_image_url ⇒ 分享准备才有可裁的图）
vi.mock("../../src/infrastructure/repositories/ai-result", () => ({
  createAiResultRepository: () => ({
    getResult: async () => ({
      ok: true,
      value: {
        status: "completed",
        result_image_url: "https://lanmei66.cloud/result.jpg",
        style_name: "新中式",
        shop_name: "红河水乡店",
        share_token: "tok",
        shop_id: 1,
        album_id: 9,
        template_id: 3,
      },
    }),
    downloadResult: async () => ({ ok: false }),
    loadTaskEntitlement: async () => ({ ok: true, value: { taskBought: false } }),
  }),
}));

import AiTryOnResultPage from "../../src/pages/aiTryOnResult/index.vue";

const flush = () => new Promise((r) => setTimeout(r, 30));
const globalWith = { components: { "wd-popup": StubPopup, "wd-loading": StubLoading } };

async function boot() {
  const w = mount(AiTryOnResultPage, { global: globalWith });
  await flush();
  h.onLoadCalls[h.onLoadCalls.length - 1]({ taskId: "3" });
  await flush();
  await w.vm.$nextTick();
  return w;
}

beforeEach(() => {
  h.onLoadCalls.length = 0;
  h.shareCalls.length = 0;
  h.faceMode = "pending";
});

describe("AI试衣结果页 · 分享准备 loading＝公共组件 BaseLoadingPopup（wot popup＋loading＋token）", () => {
  it("未点分享不显示；点分享（封面准备中）显示且指示器取 token 色/尺寸＋竖排文案", async () => {
    const w = await boot();
    expect(w.findComponent(StubPopup).props("modelValue")).toBe(false);

    void h.shareCalls[h.shareCalls.length - 1]();
    await w.vm.$nextTick();
    expect(w.findComponent(StubPopup).props("modelValue")).toBe(true); // 遮罩弹出
    expect(w.findComponent(StubPopup).props("closeOnClickModal")).toBe(false); // 加载中不可点遮罩关
    expect(w.find(".base-loading-popup__card").exists()).toBe(true);
    const loading = w.findComponent(StubLoading);
    expect(loading.props("text")).toBe("正在准备分享…");
    expect(loading.props("direction")).toBe("vertical");
    expect(loading.props("color")).toBe("#F1CD91"); // token semantic.colorAction
    expect(loading.props("size")).toBe("48rpx"); // token component.pullRefreshLoadingSizeRpx
    w.unmount();
  });

  it("封面就绪 ⇒ 遮罩自动收口，分享对象用准备好的封面（人脸卡片路径）", async () => {
    const w = await boot();
    h.faceMode = "resolved";
    const result = (await h.shareCalls[h.shareCalls.length - 1]()) as { imageUrl: string };
    await w.vm.$nextTick();
    expect(w.findComponent(StubPopup).props("modelValue")).toBe(false);
    expect(result.imageUrl).toBe("wxfile://tmp/face-card.jpg");
    w.unmount();
  });

  it("降级（VK 不可用/未检出/异常）⇒ 同样收口，回退网络 JPG（bug #11 口径）", async () => {
    const w = await boot();
    h.faceMode = "null";
    const result = (await h.shareCalls[h.shareCalls.length - 1]()) as { imageUrl: string };
    await w.vm.$nextTick();
    expect(w.findComponent(StubPopup).props("modelValue")).toBe(false);
    expect(result.imageUrl).toContain("imageMogr2/thumbnail/400x/format/jpg");
    w.unmount();
  });

  it("复用与纪律：页面走公共组件（零自绘遮罩），且业务页零 `wd-*` 直用", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(__dirname, "../../src/pages/aiTryOnResult/index.vue"), "utf-8");
    expect(src).toContain("<BaseLoadingPopup :show=\"sharePreparing\"");
    expect(src).not.toContain("share-preparing-mask");
    expect(src).not.toContain("<wd-");
  });
});
