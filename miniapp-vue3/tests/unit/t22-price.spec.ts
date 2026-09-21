// T7 首批（P2-17）：价目表 tab 页冒烟＋忠实性回归（mock uni 生命周期；驱动方式同 t18/t19）。
// 关键回归点（独立 CR 🔴1/🔴3）：①导航串必须用 shopName（≠displayName）②品牌切换重载骨架重现。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  pullDownCalls: [] as Array<() => void>,
  stops: 0,
  shopsCalls: 0,
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  onShowCalls: [] as Array<() => void>,
  navigateToCalls: [] as Array<{ url: string }>,
  store: new Map<string, string>(),
  repoMode: "ok" as "ok" | "fail",
  // shopName 与 displayName 刻意不同（旧端 ShopInfo 两字段并列），防字段误用回归
  shops: [
    {
      id: 1,
      shopName: "红河体验店",
      displayName: "红河旅拍馆",
      displayNameEn: "Honghe",
      homeImage: "https://cos.example/shop1.png",
      priceImage: "https://cos.example/price1.png",
    },
    {
      id: 2,
      shopName: "弥勒体验店",
      displayName: "弥勒旅拍馆",
      displayNameEn: "Mile",
      homeImage: "https://cos.example/shop2.png",
      priceImage: "https://cos.example/price2.png",
    },
  ] as Array<Record<string, unknown>>,
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => {
    h.onLoadCalls.push(fn);
  },
  onShow: (fn: () => void) => {
    h.onShowCalls.push(fn);
  },
  onPullDownRefresh: (fn: () => void) => {
    h.pullDownCalls.push(fn);
  },}));

vi.mock("../../src/infrastructure/repositories/shops", () => ({
  createShopRepository: () => ({
    getShops: async () => {
      h.shopsCalls += 1;
      return h.repoMode === "fail" ? { ok: false, reason: "network" } : { ok: true, value: h.shops };
    },
  }),
}));

import PriceHomePage from "../../src/pages/priceHomePage/index.vue";

const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  h.navigateToCalls.length = 0;
  h.store.clear();
  h.repoMode = "ok";
  // 容器最小 uni 存根：storage 进 Map（品牌检测可驱动）；navigateTo 记录；无 request ⇒ transport 安全回落
  (globalThis as { uni?: unknown }).uni = {
    stopPullDownRefresh: () => {
      h.stops += 1;
    },
    navigateTo: (o: { url: string }) => {
      h.navigateToCalls.push(o);
    },
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => {
      h.store.set(k, v);
    },
    removeStorageSync: (k: string) => {
      h.store.delete(k);
    },
  };
});

describe("pages/priceHomePage（T7 P2-17 tab 页）", () => {
  it("加载失败：骨架 → onLoad 后内联错误态＋demo 兜底卡；demo 点击导航串忠实（from=banner&idx）", async () => {
    h.repoMode = "fail";
    const w = mount(PriceHomePage);
    await w.vm.$nextTick();
    expect(w.find(".sk-wrap").exists()).toBe(true);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".sk-wrap").exists()).toBe(false);
    expect(w.text()).toContain("门店加载失败，请重试");
    // PhotoGrid 空列表回退 2 张 demo 卡（旧端语义），点第一张 → idx=1
    const demoCards = w.findAll(".shopCard");
    expect(demoCards.length).toBe(2);
    await demoCards[0].trigger("click");
    expect(h.navigateToCalls.length).toBe(1);
    expect(h.navigateToCalls[0].url).toBe("/pages/priceList/index?from=banner&idx=1");
  });

  it("加载成功：两店网格渲染；店铺点击导航串必须用 shopName（🔴1 回归：不含 displayName）", async () => {
    const w = mount(PriceHomePage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".sk-wrap").exists()).toBe(false);
    // 标题块忠实（旧端 :15-16 PRICE LIST/价目表）
    expect(w.find(".divideTit").text()).toBe("PRICE LIST");
    expect(w.find(".demoPhotoTit").text()).toBe("价目表");
    const cards = w.findAll(".shopCard");
    expect(cards.length).toBe(2);
    await cards[0].trigger("click");
    expect(h.navigateToCalls.length).toBe(1);
    expect(h.navigateToCalls[0].url).toBe(
      "/pages/priceList/index?from=banner&idx=1&shopName=红河体验店&priceImage=https://cos.example/price1.png",
    );
    // 关键：URL 不得出现 displayName 值（字段误用回归直接红）
    expect(h.navigateToCalls[0].url).not.toContain("红河旅拍馆");
  });

  it("品牌切换：onShow 检测到变化 → 骨架重现（🔴3 回归：重载前 ready 置 false）→ 数据回来", async () => {
    const w = mount(PriceHomePage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".sk-wrap").exists()).toBe(false);
    // 模拟切品牌（versioned storage 新键 lm.brand.v1）
    h.store.set("lm.brand.v1", "brand-b");
    h.onShowCalls[h.onShowCalls.length - 1]();
    await w.vm.$nextTick();
    // 同步即应重现骨架——不得让上一品牌网格滞留可见
    expect(w.find(".sk-wrap").exists()).toBe(true);
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".sk-wrap").exists()).toBe(false);
    expect(w.findAll(".shopCard").length).toBe(2);
    // 品牌未再变：onShow 不触发重载（网格不闪）
    h.onShowCalls[h.onShowCalls.length - 1]();
    await w.vm.$nextTick();
    expect(w.find(".sk-wrap").exists()).toBe(false);
  });
});

describe("价目表 tab · 下拉刷新（2026-09-21 主人②）", () => {
  it("下拉 ⇒ 重新拉门店（getShops 第二次）＋收口 stopPullDownRefresh 一次", async () => {
    h.shopsCalls = 0;
    h.stops = 0;
    h.pullDownCalls.length = 0;
    const w = mount(PriceHomePage);
    await flush();
    h.onLoadCalls[h.onLoadCalls.length - 1](); // 页面在 onLoad 拉门店
    await flush();
    expect(h.shopsCalls).toBe(1);
    expect(h.pullDownCalls.length).toBe(1); // 已注册
    h.pullDownCalls[0]();
    await flush();
    expect(h.shopsCalls).toBe(2);
    expect(h.stops).toBe(1);
    w.unmount();
  });
});
