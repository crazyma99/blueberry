// T6 组件移植测试（P2-13 布局基线）：PhotoGrid 占位卡/全宽/事件透传、CustomNavBar 平台分支、骨架/加载块。
import { describe, expect, it, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import SkeletonBlock from "../../src/components/SkeletonBlock/SkeletonBlock.vue";
import LoadingBlock from "../../src/components/LoadingBlock/LoadingBlock.vue";
import PhotoGrid from "../../src/components/PhotoGrid/PhotoGrid.vue";
import CustomNavBar from "../../src/components/CustomNavBar/CustomNavBar.vue";
import { setUiPlatformOverride } from "../../src/ui/ui-platform";

afterEach(() => setUiPlatformOverride(null));
const shop = (i: number) => ({ homeImage: "/img" + i + ".png", displayName: "店" + i, displayNameEn: "S" + i });

describe("SkeletonBlock／LoadingBlock", () => {
  it("骨架块默认与自定义尺寸（断言用可存活单位：happy-dom CSSOM 会丢弃 rpx，透传属 uni 运行时）", () => {
    const w1 = mount(SkeletonBlock);
    expect(w1.attributes("style")).toContain("width: 100%");
    const w2 = mount(SkeletonBlock, { props: { width: "50%", height: "10px", radius: "4px" } });
    expect(w2.attributes("style")).toContain("width: 50%");
    expect(w2.attributes("style")).toContain("height: 10px");
    expect(w2.attributes("style")).toContain("border-radius: 4px");
  });
  it("加载块：默认文案渲染；空串隐藏文字但保留旋转圈", () => {
    const w1 = mount(LoadingBlock);
    expect(w1.text()).toContain("加载中…");
    expect(w1.find(".loading-spinner").exists()).toBe(true);
    const w2 = mount(LoadingBlock, { props: { text: "" } });
    expect(w2.find(".loading-text").exists()).toBe(false);
    expect(w2.find(".loading-spinner").exists()).toBe(true);
  });
});

describe("PhotoGrid（P2-13 布局基线）", () => {
  it("单店整行铺满；两店非全宽且点击透传 shop-click", async () => {
    const w1 = mount(PhotoGrid, { props: { shopList: [shop(1)] } });
    expect(w1.find(".shopCard.full-width").exists()).toBe(true);
    const w2 = mount(PhotoGrid, { props: { shopList: [shop(1), shop(2)] } });
    expect(w2.find(".shopCard.full-width").exists()).toBe(false);
    await w2.findAll(".shopCard")[0].trigger("click");
    expect(w2.emitted("shop-click")?.[0]?.[0]).toMatchObject({ displayName: "店1" });
  });
  it("奇数(>1)补「敬请期待」占位卡且不可点；偶数不补", async () => {
    const w3 = mount(PhotoGrid, { props: { shopList: [shop(1), shop(2), shop(3)] } });
    expect(w3.find(".shopCard-placeholder").exists()).toBe(true);
    expect(w3.text()).toContain("敬请期待");
    await w3.find(".shopCard-placeholder").trigger("click");
    expect(w3.emitted("shop-click")).toBeUndefined();
    const w2 = mount(PhotoGrid, { props: { shopList: [shop(1), shop(2)] } });
    expect(w2.find(".shopCard-placeholder").exists()).toBe(false);
    const w1 = mount(PhotoGrid, { props: { shopList: [shop(1)] } });
    expect(w1.find(".shopCard-placeholder").exists()).toBe(false); // 单店全宽不补占位
  });
  it("空列表回退两张 demo 图，点击透传 demo-click 1/2", async () => {
    const w = mount(PhotoGrid, { props: { shopList: [] } });
    expect(w.findAll(".shopCard").length).toBe(2);
    await w.findAll(".shopCard")[0].trigger("click");
    await w.findAll(".shopCard")[1].trigger("click");
    expect(w.emitted("demo-click")).toEqual([[1], [2]]);
  });
});

describe("CustomNavBar（平台分支与返回语义）", () => {
  it("微信：标题渲染＋占位撑高；backFallbackUrl 时显示返回按钮", () => {
    const w = mount(CustomNavBar, { props: { title: "客片详情" } });
    expect(w.text()).toContain("客片详情");
    expect(w.find(".custom-navbar").exists()).toBe(true);
    expect(w.find(".custom-navbar-back").exists()).toBe(false); // 测试环境无页面栈
    const w2 = mount(CustomNavBar, { props: { title: "t", backFallbackUrl: "/pages/index/index" } });
    expect(w2.find(".custom-navbar-back").exists()).toBe(true);
  });
  it("抖音：系统默认导航栏接管——不自绘标题栏/占位，仅内联渲染 slot（2026-09-19 实测：抖音 navigationStyle custom 需平台「页面结构自定义」权限，未生效时自绘＝双标题双占位，回退）", () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(CustomNavBar, {
      props: { title: "客片详情" },
      slots: { default: '<view class="tt-slot-mark">搜索</view>' },
    });
    expect(w.find(".custom-navbar").exists()).toBe(false);
    expect(w.text()).not.toContain("客片详情");
    expect(w.find(".tt-slot-mark").exists()).toBe(true);
  });
  it("manualBack：点击只 emit back 不走导航；transparent 类生效", async () => {
    const w = mount(CustomNavBar, { props: { title: "t", backFallbackUrl: "/x", manualBack: true, transparent: true } });
    expect(w.find(".custom-navbar-transparent").exists()).toBe(true);
    await w.find(".custom-navbar-back").trigger("click");
    expect(w.emitted("back")?.length).toBe(1);
  });
});
