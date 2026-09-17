// P1-24 门面测试：按钮禁用/忙态不重复提交；弹层取消；picker 选中/取消/清空；反馈受控显示。
// 桩 emit 名与真实 Wot 源码 grep 事实一致（tests/stubs/wot/*），测的是本项目门面合同。
// 门面模板经 easycom 使用 wd-*；vitest 无 easycom，故以 global.components 注册桩。
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BaseButton from "../../src/ui/BaseButton.vue";
import BaseField from "../../src/ui/BaseField.vue";
import BasePopup from "../../src/ui/BasePopup.vue";
import BasePicker from "../../src/ui/BasePicker.vue";
import BaseFeedback from "../../src/ui/BaseFeedback.vue";
import StubButton from "../stubs/wot/wd-button/wd-button.vue";
import StubInput from "../stubs/wot/wd-input/wd-input.vue";
import StubPopup from "../stubs/wot/wd-popup/wd-popup.vue";
import StubPicker from "../stubs/wot/wd-picker/wd-picker.vue";
import StubToast from "../stubs/wot/wd-toast/wd-toast.vue";

const globalWith = {
  components: {
    "wd-button": StubButton,
    "wd-input": StubInput,
    "wd-popup": StubPopup,
    "wd-picker": StubPicker,
    "wd-toast": StubToast,
  },
};

describe("BaseButton（P1-24 禁用/忙态不重复提交）", () => {
  it("正常态 click 放行一次", async () => {
    const w = mount(BaseButton, { props: { label: "提交" }, global: globalWith });
    await w.findComponent(StubButton).vm.$emit("click");
    expect(w.emitted("click")?.length).toBe(1);
  });
  it("disabled 时桩触发 click 也不放行（门面守卫）", async () => {
    const w = mount(BaseButton, { props: { label: "提交", disabled: true }, global: globalWith });
    await w.findComponent(StubButton).vm.$emit("click");
    expect(w.emitted("click")).toBeUndefined();
  });
  it("busy 时连续触发两次都不放行（防重复提交）", async () => {
    const w = mount(BaseButton, { props: { label: "提交", busy: true }, global: globalWith });
    const stub = w.findComponent(StubButton);
    await stub.vm.$emit("click");
    await stub.vm.$emit("click");
    expect(w.emitted("click")).toBeUndefined();
  });
  it("label 走默认插槽渲染", () => {
    const w = mount(BaseButton, { props: { label: "去生成" }, global: globalWith });
    expect(w.text()).toContain("去生成");
  });
});

describe("BaseField（value 流与标准事件）", () => {
  it("输入透传 update:modelValue（字符串化）", async () => {
    const w = mount(BaseField, { props: { modelValue: "", placeholder: "请输入手机号" }, global: globalWith });
    const input = w.findComponent(StubInput).find("input");
    await input.setValue("13800000000");
    expect(w.emitted("update:modelValue")?.[0]).toEqual(["13800000000"]);
  });
  it("blur/clear 事件转发", async () => {
    const w = mount(BaseField, { props: { modelValue: "x" }, global: globalWith });
    const stub = w.findComponent(StubInput);
    await stub.find("input").trigger("blur");
    expect(w.emitted("blur")?.length).toBe(1);
    await stub.vm.$emit("clear");
    expect(w.emitted("clear")?.length).toBe(1);
  });
});

describe("BasePopup（取消语义单一出口）", () => {
  it("关闭动作 → cancel ＋ update:show false，且只发一次", async () => {
    const w = mount(BasePopup, { props: { show: true, title: "标题" }, global: globalWith });
    await w.findComponent(StubPopup).find(".stub-close").trigger("click");
    expect(w.emitted("cancel")?.length).toBe(1);
    expect(w.emitted("update:show")?.[0]).toEqual([false]);
  });
});

describe("BasePicker（选中/取消/清空）", () => {
  const options = [
    { label: "红河水乡店", value: 1 },
    { label: "昆明店", value: 2 },
  ];
  it("confirm 回传纯值数组并收起（不透传 Wot 内部对象）", async () => {
    const w = mount(BasePicker, { props: { show: true, options, modelValue: [] }, global: globalWith });
    await w.findComponent(StubPicker).find(".stub-confirm").trigger("click");
    expect(w.emitted("confirm")?.[0]).toEqual([["stub-value"]]);
    expect(w.emitted("update:show")?.[0]).toEqual([false]);
  });
  it("cancel 回传并收起", async () => {
    const w = mount(BasePicker, { props: { show: true, options, modelValue: [1] }, global: globalWith });
    await w.findComponent(StubPicker).find(".stub-cancel").trigger("click");
    expect(w.emitted("cancel")?.length).toBe(1);
    expect(w.emitted("update:show")?.[0]).toEqual([false]);
  });
  it("clearable 且有值时出现清空；点击 → clear ＋ update:modelValue []", async () => {
    const w = mount(BasePicker, { props: { show: true, options, modelValue: [1], clearable: true }, global: globalWith });
    const clearBtn = w.find(".base-picker__clear");
    expect(clearBtn.exists()).toBe(true);
    await clearBtn.trigger("click");
    expect(w.emitted("clear")?.length).toBe(1);
    expect(w.emitted("update:modelValue")?.[0]).toEqual([[]]);
  });
  it("无值时清空入口不出现", () => {
    const w = mount(BasePicker, { props: { show: true, options, modelValue: [], clearable: true }, global: globalWith });
    expect(w.find(".base-picker__clear").exists()).toBe(false);
  });
});

describe("BaseFeedback（受控 toast）", () => {
  it("show 后渲染文案（含图片失败态用法），hide 后消失", async () => {
    const w = mount(BaseFeedback, { global: globalWith });
    expect(w.findComponent(StubToast).find(".stub-wd-toast").exists()).toBe(false);
    (w.vm as unknown as { show: (t: string, i?: string) => void }).show("图片加载失败", "error");
    await w.vm.$nextTick();
    expect(w.findComponent(StubToast).text()).toContain("图片加载失败");
    (w.vm as unknown as { hide: () => void }).hide();
    await w.vm.$nextTick();
    expect(w.findComponent(StubToast).find(".stub-wd-toast").exists()).toBe(false);
  });
});
