// T8 S2：AiTemplatePicker 测试——提示条/主图 750/缩略 200、swiper 联动、缩略条折叠与选中态、体型/年龄事件转发。
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AiTemplatePicker from "../../src/components/AiTemplatePicker/AiTemplatePicker.vue";

const TEMPLATES = [
  { id: 1, imageUrl: "https://lanmeiimgstore-1311468332.cos.ap-shanghai.myqcloud.com/a.png" },
  { id: 2, imageUrl: "https://lanmei66.cloud/b.png" },
];

function mountPicker(extra: Record<string, unknown> = {}) {
  return mount(AiTemplatePicker, {
    props: {
      templates: TEMPLATES,
      currentIndex: 1,
      bodyIndex: 0,
      ageOptions: ["18-25", "26-35"],
      ageIndex: 0,
      ...extra,
    },
  });
}

describe("AiTemplatePicker（T8 S2 模板与身形/年龄选择）", () => {
  it("渲染提示条、主图 swiper 与缩略条计数；COS 主图 750、缩略 200", () => {
    const w = mountPicker();
    expect(w.find(".tip-text").text()).toBe("左右横向滑动支持切换模板");
    expect(w.findAll("swiper-item").length).toBe(2);
    expect(w.find(".thumb-strip-label").text()).toBe("模板快速选择（2）");
    // COS 主域：主图拼 750 缩略、缩略图拼 200
    expect(w.findAll(".template-img")[1].attributes("src")).toContain("thumbnail/750x");
    expect(w.findAll(".thumb-img")[1].attributes("src")).toContain("thumbnail/200x");
  });

  it("swiper change → emit change(下标)；当前下标对应的缩略项高亮", async () => {
    const w = mountPicker();
    const items = w.findAll(".thumb-item");
    expect(items[1].classes()).toContain("thumb-item-active");
    expect(items[0].classes()).not.toContain("thumb-item-active");
    // swiper 事件 detail.current
    w.findComponent(AiTemplatePicker);
    await w.find("swiper").trigger("change", { detail: { current: 0 } });
    expect(w.emitted("change")?.[0]).toEqual([0]);
  });

  it("点击缩略图 → emit select(下标)（主图联动由页面 :current 完成）", async () => {
    const w = mountPicker();
    await w.findAll(".thumb-item")[0].trigger("click");
    expect(w.emitted("select")?.[0]).toEqual([0]);
  });

  it("缩略条折叠：默认展开；点击头部折叠并 emit toggle-strip", async () => {
    const w = mountPicker();
    expect(w.find(".thumb-scroll").exists()).toBe(true);
    await w.find(".thumb-strip-head").trigger("click");
    expect(w.find(".thumb-scroll").exists()).toBe(false);
    expect(w.emitted("toggle-strip")?.length).toBe(1);
    await w.find(".thumb-strip-head").trigger("click"); // 再点展开
    expect(w.find(".thumb-scroll").exists()).toBe(true);
    expect(w.emitted("toggle-strip")?.length).toBe(2);
  });

  it("体型/年龄：子组件事件原样转发（Segment 下标／Selector 原生值）", async () => {
    const w = mountPicker();
    const segItems = w.findAll(".app-segment-item");
    await segItems[2].trigger("click");
    expect(w.emitted("body-change")?.[0]).toEqual([2]);
    await w.find("picker").trigger("change", { detail: { value: 1 } });
    expect(w.emitted("age-change")?.[0]).toEqual([1]);
  });

  it("空模板：主图 0 项、计数（0），不崩", () => {
    const w = mountPicker({ templates: [], currentIndex: 0 });
    expect(w.findAll("swiper-item").length).toBe(0);
    expect(w.find(".thumb-strip-label").text()).toBe("模板快速选择（0）");
  });
});
