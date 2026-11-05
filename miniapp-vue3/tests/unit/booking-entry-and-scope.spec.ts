// 到店预约 MVP：入口组件 + 首页接线 + 平台作用域守卫（pages.json 仅微信注册；逻辑层零 #ifdef；index.vue 保持零条件编译）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  navigateToCalls: [] as Array<{ url: string }>,
  shops: [] as Array<Record<string, unknown>>,
}));

vi.mock("@dcloudio/uni-app", () => ({
  onShow: () => undefined,
  onLoad: () => undefined,
  onPullDownRefresh: () => undefined,
  onShareAppMessage: () => undefined,
  onShareTimeline: () => undefined,
}));

vi.mock("../../src/infrastructure/repositories/shops", () => ({
  createShopRepository: () => ({ getShops: async () => ({ ok: true, value: h.shops }) }),
}));
vi.mock("../../src/infrastructure/repositories/carousels", () => ({
  createCarouselRepository: () => ({ getImage: async () => ({ ok: true, value: [] }) }),
}));

import StubLoading from "../stubs/wot/wd-loading/wd-loading.vue";
import BookingEntry from "../../src/components/BookingEntry/BookingEntry.vue";
import IndexPage from "../../src/pages/index/index.vue";
import { expectedRoutesForPlatform } from "../../scripts/build-target.mjs";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf-8");
const flush = () => new Promise((r) => setTimeout(r, 30));

beforeEach(() => {
  h.navigateToCalls.length = 0;
  h.shops = [];
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: () => "",
    setStorageSync: () => undefined,
    removeStorageSync: () => undefined,
    navigateTo: (o: { url: string }) => h.navigateToCalls.push(o),
    getSystemInfoSync: () => ({ statusBarHeight: 20 }),
  };
});

describe("BookingEntry 组件", () => {
  it("渲染「到店预约」；点击 emit click", async () => {
    const w = mount(BookingEntry, { props: { shopId: 3, shopName: "红河水乡店" } });
    expect(w.text()).toContain("到店预约");
    await w.find(".booking-entry").trigger("click");
    expect(w.emitted("click")?.length).toBe(1);
  });

  it("点击不冒泡到宿主（@click.stop，防止同时触发店铺卡片跳转）", async () => {
    const parentClick = vi.fn();
    const Host = {
      components: { BookingEntry },
      methods: { parentClick },
      template: '<view class="host" @click="parentClick"><BookingEntry :shop-id="1" /></view>',
    };
    const w = mount(Host);
    await w.find(".booking-entry").trigger("click");
    expect(parentClick).not.toHaveBeenCalled();
  });
});

describe("首页店铺卡片接线", () => {
  it("点「到店预约」→ 导航 pages/booking/index?shopId=&shopName=（名称 URL 编码）；不触发卡片自身的 demoDetail 跳转", async () => {
    h.shops = [{ id: 7, displayName: "红河水乡 店", displayNameEn: "HongHe", homeImage: "https://cdn.example/a.png" }];
    const w = mount(IndexPage, { global: { components: { "wd-loading": StubLoading } } });
    await flush();
    await w.vm.$nextTick();
    const entry = w.find(".booking-entry");
    expect(entry.exists()).toBe(true);
    await entry.trigger("click");
    expect(h.navigateToCalls).toEqual([{ url: "/pages/booking/index?shopId=7&shopName=" + encodeURIComponent("红河水乡 店") }]);
  });
});

describe("平台作用域守卫（仅微信端）", () => {
  const pagesJson = read("src/pages.json");

  it("预约两页只在微信端路由集内；抖音/小红书端路由集不含", () => {
    const wx = expectedRoutesForPlatform(pagesJson, "mp-weixin");
    expect(wx).toContain("pages/booking/index");
    expect(wx).toContain("pages/myBookings/index");
    for (const p of ["mp-toutiao", "mp-xhs"] as const) {
      const routes = expectedRoutesForPlatform(pagesJson, p);
      expect(routes, p).not.toContain("pages/booking/index");
      expect(routes, p).not.toContain("pages/myBookings/index");
    }
  });

  it("预约页注册块位于 `#ifdef MP-WEIXIN` 内（紧邻 AI 六页同块）", () => {
    const at = pagesJson.indexOf('"path": "pages/booking/index"');
    const before = pagesJson.slice(0, at);
    const lastIfdef = before.lastIndexOf("// #ifdef MP-WEIXIN");
    const lastEndif = before.lastIndexOf("// #endif");
    expect(lastIfdef).toBeGreaterThan(-1);
    expect(lastIfdef).toBeGreaterThan(lastEndif); // 最近一个条件块仍未关闭 ⇒ 处于微信宏内
  });

  it("跳转 URL 字面量只存在于 BookingEntry 的 `#ifdef MP-WEIXIN` 脚本块；首页源码不含预约路径（抖音/小红书产物零残留）", () => {
    expect(read("src/pages/index/index.vue")).not.toContain("pages/booking");
    const src = read("src/components/BookingEntry/BookingEntry.vue");
    const at = src.lastIndexOf("/pages/booking/index"); // 注释里也会提到路径，取最后一处（代码中的字面量）
    expect(at).toBeGreaterThan(-1);
    const before = src.slice(0, at);
    const lastIfdef = before.lastIndexOf("// #ifdef MP-WEIXIN");
    expect(lastIfdef).toBeGreaterThan(-1);
    expect(lastIfdef).toBeGreaterThan(before.lastIndexOf("// #endif"));
  });

  it("mine 页 /pages/myBookings 路径字面量只在 `#ifdef MP-WEIXIN` 脚本块内（抖音/小红书产物零残留）", () => {
    const src = read("src/pages/mine/index.vue");
    const code = src.replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/(?!\s*#(?:ifdef|endif)).*$/gm, "");
    const at = code.indexOf("/pages/myBookings/index");
    expect(at).toBeGreaterThan(-1);
    const before = code.slice(0, at);
    const lastIfdef = before.lastIndexOf("// #ifdef MP-WEIXIN");
    expect(lastIfdef).toBeGreaterThan(-1);
    expect(lastIfdef).toBeGreaterThan(before.lastIndexOf("// #endif")); // 最近的条件块仍未关闭 ⇒ 在微信宏内
    expect(code.split("/pages/myBookings/index").length - 1).toBe(1); // 且全文件仅此一处
  });

  it("逻辑层零 #ifdef：domain/application/composables/repositories 新文件无条件编译", () => {
    for (const f of [
      "src/domain/booking.ts",
      "src/domain/booking-deposit.ts",
      "src/application/booking-flow.ts",
      "src/application/booking-deposit-pay.ts",
      "src/application/booking-deposit-submit.ts",
      "src/composables/use-my-bookings.ts",
      "src/infrastructure/repositories/bookings.ts",
    ]) {
      expect(read(f), f).not.toMatch(/#ifn?def/);
    }
  });

  it("对外文案合规：预约两页与入口源码（去注释后）不出现「定金」「押金」字样，保证金一律称「预约保证金」（主人 2026-11-05 决议 4）", () => {
    for (const f of [
      "src/pages/booking/index.vue",
      "src/pages/myBookings/index.vue",
      "src/components/BookingEntry/BookingEntry.vue",
      "src/domain/booking-deposit.ts",
      "src/domain/booking.ts",
      "src/application/booking-deposit-submit.ts",
    ]) {
      const code = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/\s\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/定金|押金/);
    }
  });

  it("预约页源码不含 emoji / 文字图标（项目规范：图标用 IconPark 方案）", () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const f of ["src/pages/booking/index.vue", "src/pages/myBookings/index.vue", "src/components/BookingEntry/BookingEntry.vue"]) {
      expect(read(f), f).not.toMatch(emoji);
    }
  });
});
