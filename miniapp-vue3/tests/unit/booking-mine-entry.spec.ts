// 到店预约 MVP：「我的」页新增「我的预约」菜单行——微信端渲染、未登录先弹登录窗、已登录导航到 myBookings。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  onShowCalls: [] as Array<() => void>,
  store: new Map<string, string>(),
  navigateToCalls: [] as Array<{ url: string }>,
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoadCalls.push(fn),
  onShow: (fn: () => void) => h.onShowCalls.push(fn),
}));

vi.mock("../../src/components/LoginPopup/LoginPopup.vue", () => ({
  default: { name: "LoginPopup", template: '<view class="stub-login-popup" />' },
}));
vi.mock("../../src/components/ProfilePopup/ProfilePopup.vue", () => ({
  default: { name: "ProfilePopup", template: '<view class="stub-profile-popup" />' },
}));
vi.mock("../../src/components/BottomActionBarSecondary/BottomActionBarSecondary.vue", () => ({
  default: { name: "BottomActionBarSecondary", props: ["bottomOffset"], template: '<view class="stub-bottom-bar"><slot /></view>' },
}));

import MinePage from "../../src/pages/mine/index.vue";

const flush = () => new Promise((r) => setTimeout(r, 20));

function seedLoggedIn(): void {
  h.store.set(
    "lm.session.v1",
    JSON.stringify({ userId: "1", token: "tk", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }),
  );
  h.store.set("lm.userinfo.v1", JSON.stringify({ id: 1, openid: "o1", phone: "", nickname: "马老师", avatarUrl: null }));
}

beforeEach(() => {
  h.onLoadCalls.length = 0;
  h.onShowCalls.length = 0;
  h.store.clear();
  h.navigateToCalls.length = 0;
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => h.store.set(k, v),
    removeStorageSync: (k: string) => h.store.delete(k),
    navigateTo: (o: { url: string }) => h.navigateToCalls.push(o),
  };
});

describe("pages/mine · 「我的预约」入口（到店预约 MVP，仅微信端）", () => {
  it("菜单渲染「我的预约」一行", async () => {
    const w = mount(MinePage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    const titles = w.findAll(".menu-title").map((n) => n.text());
    expect(titles).toContain("我的预约");
  });

  it("未登录点击「我的预约」：弹登录窗，不导航", async () => {
    const w = mount(MinePage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    const row = w.findAll(".menu-row").find((r) => r.text().includes("我的预约"))!;
    await row.trigger("click");
    await w.vm.$nextTick();
    expect(w.find(".stub-login-popup").exists()).toBe(true);
    expect(h.navigateToCalls.length).toBe(0);
  });

  it("已登录点击「我的预约」：导航到 /pages/myBookings/index", async () => {
    seedLoggedIn();
    const w = mount(MinePage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    const row = w.findAll(".menu-row").find((r) => r.text().includes("我的预约"))!;
    await row.trigger("click");
    await w.vm.$nextTick();
    expect(h.navigateToCalls).toEqual([{ url: "/pages/myBookings/index" }]);
  });
});
