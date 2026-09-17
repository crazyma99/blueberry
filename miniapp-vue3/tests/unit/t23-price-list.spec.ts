// T7 后半（P2-17）：价目表二级页冒烟＋忠实性回归（mock uni 生命周期；驱动方式同 t18/t19/t22）。
// 关键回归点：①navTitle 拼接（shopName 有/无）②兜底图分支（id=1 honghe / 其他 price.svg）
// ③decodeRouteValue 非法编码容错 ④套餐渲染（1:1 图/名称/detail/¥ 价格）⑤失败静默（无错误 UI，loading 收敛）。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  repoMode: "ok" as "ok" | "fail",
  packages: [
    {
      id: 11,
      shopId: 1,
      name: "个人写真套餐",
      detail: "含妆造 3 套服装 精修 20 张",
      photoDetail: "",
      price: 1999,
      imageUrl: "https://cos.example/pkg1.png",
      sortOrder: 1,
    },
    {
      id: 12,
      shopId: 1,
      name: "闺蜜套餐",
      detail: "",
      photoDetail: "",
      price: 2999,
      imageUrl: "",
      sortOrder: 2,
    },
  ] as Array<Record<string, unknown>>,
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => {
    h.onLoadCalls.push(fn);
  },
}));

vi.mock("../../src/infrastructure/repositories/packages", () => ({
  createPackageRepository: () => ({
    getPackages: async () =>
      h.repoMode === "fail" ? { ok: false, error: { kind: "network" } } : { ok: true, value: h.packages },
  }),
}));

import PriceList from "../../src/pages/priceList/index.vue";

const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  h.repoMode = "ok";
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: () => "",
    setStorageSync: () => {},
    removeStorageSync: () => {},
  };
});

describe("pages/priceList（T7 P2-17 二级页）", () => {
  it("shopName 有：标题「XX价目表」；priceImage 参数直用；套餐区渲染（名称/detail/¥价格＋空图占位）", async () => {
    const w = mount(PriceList);
    h.onLoadCalls[h.onLoadCalls.length - 1]({
      idx: "1",
      shopName: "红河体验店",
      priceImage: "https://cos.example/price1.png",
    });
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".sk-wrap").exists()).toBe(false);
    const img = w.find("image");
    expect(img.attributes("src")).toBe("https://cos.example/price1.png");
    expect(w.find(".pkg-name").text()).toBe("个人写真套餐");
    expect(w.find(".pkg-detail").text()).toContain("含妆造");
    expect(w.find(".pkg-price").text()).toBe("1999");
    expect(w.find(".pkg-price-symbol").text()).toBe("¥");
    // 空图回退占位卡（旧端 :24-26）
    expect(w.findAll(".pkg-img-empty").length).toBe(1);
    // detail 为空的条目不渲染 detail 节点（旧端 v-if）
    expect(w.findAll(".pkg-detail").length).toBe(1);
  });

  it("shopName 缺：标题「蓝梅价目表」；priceImage 缺：兜底图按 id 分支（1→honghe；2→price.svg）", async () => {
    const w1 = mount(PriceList);
    h.onLoadCalls[h.onLoadCalls.length - 1]({ idx: "1" });
    await flush();
    await w1.vm.$nextTick();
    // navTitle 默认分支（旧端 :65 蓝梅价目表）——CR 🟡3 补断言
    expect(w1.findComponent({ name: "CustomNavBar" }).props("title")).toBe("蓝梅价目表");
    expect(w1.find("image").attributes("src")).toBe("/static/honghe-price.png");

    const w2 = mount(PriceList);
    h.onLoadCalls[h.onLoadCalls.length - 1]({ idx: "2" });
    await flush();
    await w2.vm.$nextTick();
    expect(w2.findComponent({ name: "CustomNavBar" }).props("title")).toBe("蓝梅价目表");
    expect(w2.find("image").attributes("src")).toBe("/static/iconpark/price.svg");
  });

  it("decodeRouteValue：编码值解码；非法编码保持原样不崩（旧端 :70-77 容错）", async () => {
    const w = mount(PriceList);
    h.onLoadCalls[h.onLoadCalls.length - 1]({
      idx: "1",
      shopName: encodeURIComponent("弥勒体验店"),
      priceImage: "%E4%BD", // 截断的 UTF-8 序列：decodeURIComponent 抛 URIError
    });
    await flush();
    await w.vm.$nextTick();
    // 编码的 shopName 正常解码进标题（CustomNavBar title prop）
    expect(w.findComponent({ name: "CustomNavBar" }).props("title")).toBe("弥勒体验店价目表");
    // 非法编码保持原样（不抛、不吞成空串）
    expect(w.find("image").attributes("src")).toBe("%E4%BD");
  });

  it("仓储失败：静默收敛（价目图仍渲染、无套餐区、无错误 UI、骨架退出）——忠实旧端 catch 仅 console.error", async () => {
    h.repoMode = "fail";
    const w = mount(PriceList);
    h.onLoadCalls[h.onLoadCalls.length - 1]({ idx: "1", shopName: "红河体验店" });
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".sk-wrap").exists()).toBe(false);
    expect(w.find("image").attributes("src")).toBe("/static/honghe-price.png");
    expect(w.find(".pkg-section").exists()).toBe(false);
    // 静默语义正向断言：CustomNavBar 仍带标题渲染（页面本身正常，仅套餐区缺席）
    expect(w.findComponent({ name: "CustomNavBar" }).props("title")).toBe("红河体验店价目表");
  });
});
