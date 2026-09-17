// T6 首页冒烟：初始骨架→加载收敛（容器无 uni ⇒ 网络失败路径）→错误态可重试；品牌馆入口默认不渲染。
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

// uni 生命周期在非页面容器不可用（vue.injectHook 崩溃）——mock 后页面可挂载
vi.mock("@dcloudio/uni-app", () => ({
  onShow: () => {},
}));

import IndexPage from "../../src/pages/index/index.vue";

const flush = () => new Promise((r) => setTimeout(r, 20));

describe("pages/index（T6 首页冒烟）", () => {
  it("初始渲染骨架；加载收敛后骨架撤下、错误态出现（双侧失败路径）、品牌馆入口默认不渲染", async () => {
    const w = mount(IndexPage);
    // 挂载瞬间：ready=false → 骨架屏在
    expect(w.find(".sk-container").exists()).toBe(true);
    await flush(); // onMounted 的 init() 完成（uni 缺失 → 传输 network 失败）
    await w.vm.$nextTick();
    expect(w.find(".sk-container").exists()).toBe(false);
    expect(w.text()).toContain("加载失败");
    expect(w.find(".home-error").exists()).toBe(true);
    expect(w.find(".home-btn").exists()).toBe(false); // 开关默认关
  });
  it("无 banner 时不渲染 swiper（空态）", async () => {
    const w = mount(IndexPage);
    await flush();
    await w.vm.$nextTick();
    expect(w.find("swiper").exists()).toBe(false);
  });
});
