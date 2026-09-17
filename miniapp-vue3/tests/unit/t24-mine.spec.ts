// T7 P2-18：我的页冒烟＋忠实性回归（mock uni 生命周期＋弹窗组件 stub；驱动方式同 t18/t19/t22/t23）。
// 关键回归点：①登录两态（昵称/副标题三态文案）②未登录无头像 image ③退出按钮仅已登录渲染
// ④needLogin 菜单未登录拦截弹窗 ⑤退出后会话清除回未登录态。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  onShowCalls: [] as Array<() => void>,
  store: new Map<string, string>(),
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => {
    h.onLoadCalls.push(fn);
  },
  onShow: (fn: () => void) => {
    h.onShowCalls.push(fn);
  },
}));

// 弹窗组件 stub（契约由子代理迁移实现，本测试只验页面接线）
vi.mock("../../src/components/LoginPopup/LoginPopup.vue", () => ({
  default: { name: "LoginPopup", template: '<view class="stub-login-popup" />' },
}));
vi.mock("../../src/components/ProfilePopup/ProfilePopup.vue", () => ({
  default: { name: "ProfilePopup", template: '<view class="stub-profile-popup" />' },
}));
vi.mock("../../src/components/BottomActionBarSecondary/BottomActionBarSecondary.vue", () => ({
  default: {
    name: "BottomActionBarSecondary",
    props: ["bottomOffset"],
    template: '<view class="stub-bottom-bar"><slot /></view>',
  },
}));

import MinePage from "../../src/pages/mine/index.vue";

const flush = () => new Promise((r) => setTimeout(r, 20));

/** 模拟已登录：版本化会话键＋用户信息键（platform/profileKey 必须匹配 PROFILE，否则 loadSession 校验拒绝） */
function seedLoggedIn(nickname: string | null, avatarUrl: string | null): void {
  h.store.set(
    "lm.session.v1",
    JSON.stringify({
      userId: "1",
      token: "tk-test",
      platform: "mp-weixin",
      profileKey: "blueberry",
      authRevision: 1,
    }),
  );
  h.store.set(
    "lm.userinfo.v1",
    JSON.stringify({ id: 1, openid: "o1", phone: "13800000000", nickname, avatarUrl }),
  );
}

beforeEach(() => {
  h.store.clear();
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => {
      h.store.set(k, v);
    },
    removeStorageSync: (k: string) => {
      h.store.delete(k);
    },
  };
});

describe("pages/mine（T7 P2-18 我的页）", () => {
  it("未登录：昵称「点击立即登陆」＋副标题登录引导；无头像 image；无退出按钮；点击用户卡弹 LoginPopup", async () => {
    const w = mount(MinePage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".nickname").text()).toBe("点击立即登陆");
    expect(w.find(".user-sub").text()).toBe("登录后可收藏与体验AI试衣");
    expect(w.find(".avatar-img").exists()).toBe(false);
    expect(w.find(".logout-btn").exists()).toBe(false);
    expect(w.find(".stub-login-popup").exists()).toBe(false);
    await w.find(".user-card").trigger("click");
    await w.vm.$nextTick();
    expect(w.find(".stub-login-popup").exists()).toBe(true);
  });

  it("已登录有昵称头像：显示昵称＋欢迎回来；头像 image 渲染；退出按钮渲染", async () => {
    seedLoggedIn("马老师", "https://cos.example/av.png");
    const w = mount(MinePage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".nickname").text()).toBe("马老师");
    expect(w.find(".user-sub").text()).toBe("欢迎回来，蓝梅旅拍");
    expect(w.find(".avatar-img").attributes("src")).toBe("https://cos.example/av.png");
    expect(w.find(".logout-btn").exists()).toBe(true);
  });

  it("已登录缺昵称：「点击获取用户信息」＋完善引导（旧端 :153-157/:38 三态分支）", async () => {
    seedLoggedIn(null, null);
    const w = mount(MinePage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".nickname").text()).toBe("点击获取用户信息");
    expect(w.find(".user-sub").text()).toBe("完善头像昵称，获得完整体验");
    expect(w.find(".avatar-img").exists()).toBe(false);
  });

  it("needLogin 菜单未登录拦截：点菜单弹 LoginPopup 不导航；退出后回未登录态（会话清除）", async () => {
    seedLoggedIn("马老师", "https://cos.example/av.png");
    const w = mount(MinePage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    // 已登录点用户卡 → ProfilePopup（而非 LoginPopup）
    await w.find(".user-card").trigger("click");
    await w.vm.$nextTick();
    expect(w.find(".stub-profile-popup").exists()).toBe(true);
    // 清会话模拟登出后 onShow 刷新（旧端 :177 updateLoginState）
    h.store.clear();
    h.onShowCalls[h.onShowCalls.length - 1]();
    await w.vm.$nextTick();
    expect(w.find(".nickname").text()).toBe("点击立即登陆");
    expect(w.find(".logout-btn").exists()).toBe(false);
    // 未登录点 needLogin 菜单 → LoginPopup 拦截
    await w.findAll(".menu-row")[0].trigger("click");
    await w.vm.$nextTick();
    expect(w.find(".stub-login-popup").exists()).toBe(true);
  });
});
