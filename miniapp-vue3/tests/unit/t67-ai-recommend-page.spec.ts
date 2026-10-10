// T8 S2尾/S4 接线（2026-10-10 扩展）：aiRecommend 页面级测试。
//
// 背景（本文件存在的理由）：
//  1. 独立 CR 实测——**把页面上传拦截分支整段删掉，全套测试仍全绿**（该页此前**没有任何页面级测试**）
//     ⇒ 需求"4002 在上传阶段弹层"的页面层本体**没有回归防线**。本文件即补这条防线。
//  2. 2026-10-10 主人口径：**AI 智能推荐与 AI 试衣口径统一** —— 选好照片**立刻上传**（＝立刻过服务端
//     质量门），不再把上传留到点按钮时；且**选图前先查登录态**（与试衣一致）。
//
// 断言口径：只看"页面真实调用了什么"（upload 次数、弹层 modelValue、按钮禁用态、跳转），
// 不做源码字符串匹配（静态审计在 t45，不能替代行为断言）。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  onShowCalls: [] as Array<() => void>,
  store: new Map<string, string>(),
  toasts: [] as string[],
  navCalls: [] as string[],
  chooseImageCalls: 0,
  uploadCalls: 0,
  /** uploadFile 返回的业务信封（默认成功）；设 4002 模拟服务端质量门拦截 */
  uploadEnvelope: { code: 200, data: { filename: "f.jpg" } } as unknown,
  uploadTransportFail: false,
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoadCalls.push(fn),
  onShow: (fn: () => void) => h.onShowCalls.push(fn),
  onHide: () => undefined,
  onUnload: () => undefined,
  onShareAppMessage: () => undefined,
  onShareTimeline: () => undefined,
}));

vi.mock("../../src/infrastructure/repositories/page-config", () => ({
  createPageConfigRepository: () => ({ getPageConfig: async () => ({ ok: true, value: [] }) }),
}));

vi.mock("../../src/infrastructure/repositories/credits", () => ({
  createCreditRepository: () => ({
    getBalance: async () => ({ ok: true, value: { balance: 0, inited: true, priceFenPerCredit: 0 } }),
    createRecharge: async () => ({ ok: true, value: {} }),
    getRechargeStatus: async () => ({ ok: true, value: { outTradeNo: "T", status: 0, paid: false, credits: 1, balance: 0 } }),
  }),
}));

vi.mock("../../src/infrastructure/repositories/wx-auth", () => ({
  createWxAuthRepository: () => ({ exchange: async () => ({ ok: false, error: { kind: "unsupported" } }) }),
}));

vi.mock("../../src/platform/weixin/photo-compress", () => ({
  createWeixinPhotoCompress: () => ({
    compress: async () => ({ path: "/tmp/pick-compressed.jpg", size: 300 * 1024, width: 810, height: 1080 }),
  }),
}));

import StubWdPopup from "../stubs/wot/wd-popup/wd-popup.vue";
import AiRecommendPage from "../../src/pages/aiRecommend/index.vue";
import AppPhotoPicker from "../../src/components/AppPhotoPicker/AppPhotoPicker.vue";
import QualityRejectSheet from "../../src/components/QualityRejectSheet/QualityRejectSheet.vue";

/** wot 桩：门面 BasePopup 内部是 `wd-popup`，不注册会打 Vue warn 且断言退化为「裸元素」 */
const GLOBAL = { components: { "wd-popup": StubWdPopup } };

const flush = () => new Promise((r) => setTimeout(r, 40));

beforeEach(() => {
  h.toasts.length = 0;
  h.navCalls.length = 0;
  h.chooseImageCalls = 0;
  h.uploadCalls = 0;
  h.uploadEnvelope = { code: 200, data: { filename: "f.jpg" } };
  h.uploadTransportFail = false;
  h.store.clear();
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => {
      h.store.set(k, v);
    },
    removeStorageSync: (k: string) => {
      h.store.delete(k);
    },
    showToast: (o: { title: string }) => {
      h.toasts.push(o.title);
    },
    showLoading: () => undefined,
    hideLoading: () => undefined,
    // 人脸信息单独同意门：默认「同意」放行
    showModal: (o: { success?: (r: { confirm: boolean }) => void }) => o.success?.({ confirm: true }),
    navigateTo: (o: { url: string }) => {
      h.navCalls.push(o.url);
    },
    getSystemInfoSync: () => ({ statusBarHeight: 20 }),
    chooseImage: (o: Record<string, unknown>) => {
      h.chooseImageCalls += 1;
      (o.success as (r: unknown) => void)({ tempFilePaths: ["/tmp/pick.jpg"], tempFiles: [{ size: 1024 * 1024 }] });
    },
    uploadFile: (o: Record<string, unknown>) => {
      h.uploadCalls += 1;
      if (h.uploadTransportFail) {
        (o.fail as (r?: unknown) => void)?.({ errMsg: "uploadFile:fail network" });
      } else {
        (o.success as (r: unknown) => void)({ statusCode: 200, data: JSON.stringify(h.uploadEnvelope) });
      }
      return { onProgressUpdate: () => undefined, abort: () => undefined };
    },
    getImageInfo: (o: Record<string, unknown>) => {
      (o.success as (r: unknown) => void)({ width: 1200, height: 1600 });
    },
  };
});

/** 挂载页面并跑完 onLoad/onShow */
async function mountPage() {
  const w = mount(AiRecommendPage, { global: GLOBAL });
  for (const fn of h.onLoadCalls) fn();
  for (const fn of h.onShowCalls) fn();
  await flush();
  return w;
}

/** 种入「已登录」：only 弹窗交互登录（full）算已登录 ⇒ 走 legacy token 迁移（与 t38 同口径） */
function seedLoggedIn() {
  h.store.set("token", "tok-legacy");
}

describe("aiRecommend 页面级：选图即上传 ＋ 上传阶段质量拦截（2026-10-10 主人口径）", () => {
  it("未登录点「选图」→ 弹登录弹窗，且**零**选图零上传（与试衣同口径：上传需要会话）", async () => {
    const w = await mountPage();
    w.findComponent(AppPhotoPicker).vm.$emit("click");
    await flush();
    expect(h.chooseImageCalls).toBe(0); // 未登录不进入选图
    expect(h.uploadCalls).toBe(0);
    expect(w.text()).toContain("登录"); // 登录弹层出现（文案随门面组件）
  });

  it("⭐选好照片就**立刻上传**（不再等点按钮）", async () => {
    seedLoggedIn();
    const w = await mountPage();
    w.findComponent(AppPhotoPicker).vm.$emit("click");
    await flush();
    await flush();
    expect(h.chooseImageCalls).toBe(1);
    expect(h.uploadCalls).toBe(1); // ← 关键：仅"选图"就触发了上传
    // 上传成功 ⇒ 按钮可用（canStart：有预览且未在支付）
    expect(w.find(".action-btn-disabled").exists()).toBe(false);
  });

  it("⭐上传返回 4002 → 弹**同一个**质量弹层（标题随 check_code）＋ 照片被清空（按钮禁用）", async () => {
    seedLoggedIn();
    h.uploadEnvelope = { code: 4002, message: "请正对镜头再拍一张", data: { check_code: "side_face" } };
    const w = await mountPage();
    w.findComponent(AppPhotoPicker).vm.$emit("click");
    await flush();
    await flush();

    const sheet = w.findComponent(QualityRejectSheet);
    expect(sheet.findComponent(StubWdPopup).props("modelValue")).toBe(true);
    expect(sheet.find(".qr-title").text()).toBe("请正对镜头"); // code=side_face ⇒ 契约文案
    expect(sheet.find(".qr-text").text()).toContain("侧脸");
    // 照片已清空 ⇒ 按钮回到禁用态（防「以为换了图、实际仍持旧图」）
    expect(w.find(".action-btn-disabled").exists()).toBe(true);
  });

  it("已上传成功后点按钮 → 直接跳转，**不重复上传**（upload 仍为 1 次）", async () => {
    seedLoggedIn();
    const w = await mountPage();
    w.findComponent(AppPhotoPicker).vm.$emit("click");
    await flush();
    await flush();
    expect(h.uploadCalls).toBe(1);

    await (w.vm as unknown as { handleStartAnalysis: () => Promise<void> }).handleStartAnalysis?.();
    await flush();
    expect(h.uploadCalls).toBe(1); // 已上传 ⇒ 不再上传
    expect(h.navCalls.some((u) => u.includes("/pages/aiRecommendLoading/index"))).toBe(true);
  });

  it("选图时上传失败（网络）→ 不阻塞选图；点按钮时**补传一次**", async () => {
    seedLoggedIn();
    h.uploadTransportFail = true;
    const w = await mountPage();
    w.findComponent(AppPhotoPicker).vm.$emit("click");
    await flush();
    await flush();
    expect(h.uploadCalls).toBe(1); // 第一次失败
    // 页面 toast 优先走 BaseFeedback 组件（不调 uni.showToast）⇒ 这里断**可观察结果**：
    // 上传失败**不阻塞选图**（照片仍在、按钮可用），点按钮时补传（见下）
    expect(w.find(".action-btn-disabled").exists()).toBe(false);

    h.uploadTransportFail = false; // 网络恢复 ⇒ 点按钮补传
    await (w.vm as unknown as { handleStartAnalysis: () => Promise<void> }).handleStartAnalysis?.();
    await flush();
    expect(h.uploadCalls).toBe(2);
    expect(h.navCalls.some((u) => u.includes("/pages/aiRecommendLoading/index"))).toBe(true);
  });
});
