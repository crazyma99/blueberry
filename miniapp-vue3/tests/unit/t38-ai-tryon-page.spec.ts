// T8 S2尾/S4 接线：aiTryOn 页面级测试——模板双入口与相册回退、生成守卫（未上传照片）。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  onShowCalls: [] as Array<() => void>,
  templateQueries: [] as Array<Record<string, string>>,
  albumQueries: [] as Array<Record<string, string>>,
  templatesByQuery: (q: Record<string, string>) =>
    q.album_id != null ? [] : [{ id: 11, imageUrl: "https://lanmei66.cloud/t.png" }],
  store: new Map<string, string>(),
  toasts: [] as string[],
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoadCalls.push(fn),
  onShow: (fn: () => void) => h.onShowCalls.push(fn),
  onHide: () => undefined,
  onUnload: () => undefined,
}));

vi.mock("../../src/infrastructure/repositories/ai", () => ({
  createAiRepository: () => ({
    getTemplates: async (_c: unknown, q: Record<string, string>) => {
      h.templateQueries.push(q);
      return { ok: true, value: h.templatesByQuery(q) };
    },
    getTasks: async () => ({ ok: true, value: [] }),
    submitTryOnTask: async () => ({ ok: true, value: { task_id: 1 } }),
  }),
}));

vi.mock("../../src/infrastructure/repositories/albums", () => ({
  createAlbumRepository: () => ({
    getAlbumList: async (_c: unknown, q: Record<string, string>) => {
      h.albumQueries.push(q);
      return { ok: true, value: { albums: [{ id: 5, tryonDisabled: false }, { id: 6, tryonDisabled: true }], page: 1, size: 50, total: 2 } };
    },
  }),
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

import AiTryOnPage from "../../src/pages/aiTryOn/index.vue";

const flush = () => new Promise((r) => setTimeout(r, 30));

beforeEach(() => {
  h.templateQueries.length = 0;
  h.albumQueries.length = 0;
  h.toasts.length = 0;
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
    showModal: () => undefined,
    navigateTo: () => undefined,
    getSystemInfoSync: () => ({ statusBarHeight: 20 }),
  };
});

describe("pages/aiTryOn（T8 装配）", () => {
  it("默认入口：按 travel 维度加载模板（category=travel，带 shop_id）", async () => {
    const w = mount(AiTryOnPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]({ shopId: "7" });
    await flush();
    await w.vm.$nextTick();
    expect(h.templateQueries[0]).toMatchObject({ category: "travel", shop_id: "7" });
    expect(w.text()).toContain("左右横向滑动支持切换模板");
  });

  it("⭐albumId=random：先随机解析相册（过滤 tryonDisabled），再按 album_id 精确取模板；相册空则回退本店全部并提示", async () => {
    const w = mount(AiTryOnPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]({ shopId: "7", albumId: "random" });
    await flush();
    await w.vm.$nextTick();
    expect(h.albumQueries[0]).toMatchObject({ shopId: "7", page: "1", size: "50" });
    // 第一次按 album_id 取（返回空）→ 回退：清空 album_id 再取本店全部
    expect(h.templateQueries[0].album_id).toBe("5"); // 仅 tryonDisabled!==true 的相册入池
    expect(h.templateQueries[1]).toEqual({ category: "travel", shop_id: "7" });
    expect(h.toasts).toContain("该相册暂无可试衣客片，已展示本店全部模板");
  });

  it("生成守卫（未登录）：点生成 → 弹登录弹窗、不发提交请求（守卫顺序逐条已由 t37 覆盖）", async () => {
    const w = mount(AiTryOnPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]({ shopId: "7" });
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".login-overlay").exists()).toBe(false);
    await w.find(".generate-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    // 旧端守卫顺序：登录先于照片 ⇒ 未登录时拉登录弹窗（而非提示上传）
    expect(w.find(".login-overlay").exists()).toBe(true);
    expect(h.toasts).not.toContain("请先上传照片");
  });
});
