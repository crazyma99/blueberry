// T8 S2 基础组件测试：AppSegment／AppSelector／AppPhotoPicker／BottomActionBar
// 契约（旧端逐字核对）：Segment change(index:number)；Selector change(e.detail.value)；PhotoPicker click()；BottomActionBar 默认插槽。
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import AppSegment from "../../src/components/AppSegment/AppSegment.vue";
import AppSelector from "../../src/components/AppSelector/AppSelector.vue";
import AppPhotoPicker from "../../src/components/AppPhotoPicker/AppPhotoPicker.vue";
import BottomActionBar from "../../src/components/BottomActionBar/BottomActionBar.vue";

describe("AppSegment（体型选择）", () => {
  it("渲染选项并高亮当前下标；点击 emit change(index)", async () => {
    const w = mount(AppSegment, { props: { options: ["瘦", "微胖", "胖"], currentIndex: 1 } });
    const items = w.findAll(".app-segment-item");
    expect(items.length).toBe(3);
    expect(items[1].classes()).toContain("is-active");
    expect(items[0].classes()).not.toContain("is-active");
    await items[2].trigger("click");
    expect(w.emitted("change")?.[0]).toEqual([2]);
  });
});

describe("AppSelector（年龄选择：picker 透传 detail.value）", () => {
  it("展示当前项文案；空数组回落「请选择」；picker change 透传 value", async () => {
    const w = mount(AppSelector, { props: { options: ["18-25", "26-35"], valueIndex: 1 } });
    expect(w.find(".app-selector-text").text()).toBe("26-35");
    await w.find("picker").trigger("change", { detail: { value: 0 } });
    expect(w.emitted("change")?.[0]).toEqual([0]);
    const empty = mount(AppSelector, { props: { options: [], valueIndex: 0 } });
    expect(empty.find(".app-selector-text").text()).toBe("请选择");
  });
});

describe("AppPhotoPicker（照片选择：组件只转发点击）", () => {
  it("无图渲染占位提示；点击 emit click（无参数）", async () => {
    const w = mount(AppPhotoPicker, { props: { photoUrl: "", busy: false } });
    expect(w.find(".picker-placeholder").exists()).toBe(true);
    expect(w.find(".picker-image").exists()).toBe(false);
    await w.find(".app-photo-picker").trigger("click");
    expect(w.emitted("click")?.length).toBe(1);
  });

  it("有图渲染预览；busy 渲染「上传中...」遮罩；busy 时仍可点（业务由页面判定）", async () => {
    const w = mount(AppPhotoPicker, { props: { photoUrl: "https://cos.example/p.png", busy: true } });
    expect(w.find(".picker-image").attributes("src")).toBe("https://cos.example/p.png");
    expect(w.find(".picker-mask").exists()).toBe(true);
    expect(w.find(".picker-mask-text").text()).toBe("上传中...");
    await w.find(".app-photo-picker").trigger("click");
    expect(w.emitted("click")?.length).toBe(1);
  });
});

describe("BottomActionBar（底部按钮栏：默认插槽）", () => {
  it("渲染插槽内容", () => {
    const w = mount(BottomActionBar, { slots: { default: '<view class="my-btn">生成效果</view>' } });
    expect(w.find(".my-btn").text()).toBe("生成效果");
  });
});
