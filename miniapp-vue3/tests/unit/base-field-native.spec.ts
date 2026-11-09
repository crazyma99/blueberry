// BaseField 门面（issue #14 · m2b 真机批次 2）：内部由 wd-input 改为原生 <input> + token 化样式。
// 事实源：微信 <input> 的 input/focus/blur 事件载荷是 { detail: { value } }（官方文档；ProfilePopup.onNicknameInput 同口径）；
//        type 取值 text/number/digit/idcard/tel；placeholder 颜色只能经 placeholder-style 属性。
// 变异靶点：①按错误载荷取值（读 e.target.value 而不是 detail.value 时微信上取到 undefined）②type 不透传 ③disabled 不透传
//          ④clearable 点击不清空 ⑤label 样式丢 margin-bottom/颜色 ⑥焦点态不加类 ⑦placeholder-style 不设。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BaseField from "../../src/ui/BaseField.vue";
import { INPUT_PLACEHOLDER_STYLE, valueFromInputEvent } from "../../src/ui/field-theme";

const root = resolve(__dirname, "../..");
const src = readFileSync(resolve(root, "src/ui/BaseField.vue"), "utf-8");
const style = src.slice(src.indexOf("<style"));

describe("valueFromInputEvent：小程序真实载荷 { detail: { value } }", () => {
  it("detail.value 优先；回落 target.value；空/非法 ⇒ ''；数字转字符串（变异：只读 target.value 即红）", () => {
    expect(valueFromInputEvent({ detail: { value: "abc" } })).toBe("abc");
    expect(valueFromInputEvent({ detail: { value: 12.5 } })).toBe("12.5");
    expect(valueFromInputEvent({ target: { value: "h5" } })).toBe("h5");
    expect(valueFromInputEvent({ detail: { value: "" }, target: { value: "x" } })).toBe("");
    expect(valueFromInputEvent(null)).toBe("");
    expect(valueFromInputEvent({})).toBe("");
  });
});

describe("⭐输入事件（微信真实载荷驱动）", () => {
  it("input 事件 { detail:{ value } } ⇒ update:modelValue（变异：按错误载荷取值即红）", async () => {
    const w = mount(BaseField, { props: { modelValue: "" } });
    await w.find("input").trigger("input", { detail: { value: "13800000000" } });
    expect(w.emitted("update:modelValue")?.[0]).toEqual(["13800000000"]);
  });
  it("输入 digit 小数：价格输入保持字符串（'199.5'）", async () => {
    const w = mount(BaseField, { props: { modelValue: "", type: "digit" } });
    await w.find("input").trigger("input", { detail: { value: "199.5" } });
    expect(w.emitted("update:modelValue")?.[0]).toEqual(["199.5"]);
  });
  it("blur 转发；focus/blur 切换焦点态类（变异：不加类即红）", async () => {
    const w = mount(BaseField, { props: { modelValue: "x" } });
    expect(w.find(".base-field__box").classes()).not.toContain("is-focused");
    await w.find("input").trigger("focus");
    expect(w.find(".base-field__box").classes()).toContain("is-focused");
    await w.find("input").trigger("blur");
    expect(w.find(".base-field__box").classes()).not.toContain("is-focused");
    expect(w.emitted("blur")?.length).toBe(1);
  });
});

describe("⭐type / disabled / placeholder 透传（变异：不透传即红）", () => {
  it.each(["text", "number", "digit", "idcard", "tel"] as const)("type=%s 原样给原生 input", (t) => {
    const w = mount(BaseField, { props: { modelValue: "", type: t } });
    expect(w.find("input").attributes("type")).toBe(t);
  });
  it("disabled ⇒ input disabled + 外框 is-disabled；不显示清空", () => {
    const w = mount(BaseField, { props: { modelValue: "abc", disabled: true, clearable: true } });
    expect(w.find("input").attributes("disabled")).toBeDefined();
    expect(w.find(".base-field__box").classes()).toContain("is-disabled");
    expect(w.find(".base-field__clear").exists()).toBe(false);
  });
  it("placeholder 文案 + placeholder-style(token 取值的 muted 金)", () => {
    const w = mount(BaseField, { props: { modelValue: "", placeholder: "请输入名称" } });
    expect(w.find("input").attributes("placeholder")).toBe("请输入名称");
    expect(INPUT_PLACEHOLDER_STYLE).toBe("color:rgba(241, 205, 145, 0.5)");
    expect(w.find("input").attributes("placeholder-style")).toBe(INPUT_PLACEHOLDER_STYLE);
  });
});

describe("⭐clearable", () => {
  it("有值且可用 ⇒ 显示 ×；点击 ⇒ update:modelValue '' + clear（变异：不清空即红）", async () => {
    const w = mount(BaseField, { props: { modelValue: "abc", clearable: true } });
    expect(w.find(".base-field__clear").exists()).toBe(true);
    await w.find(".base-field__clear").trigger("click");
    expect(w.emitted("update:modelValue")?.[0]).toEqual([""]);
    expect(w.emitted("clear")?.length).toBe(1);
  });
  it("无值 ⇒ 不显示；非 clearable ⇒ 不显示", () => {
    expect(mount(BaseField, { props: { modelValue: "", clearable: true } }).find(".base-field__clear").exists()).toBe(false);
    expect(mount(BaseField, { props: { modelValue: "abc" } }).find(".base-field__clear").exists()).toBe(false);
  });
});

describe("label", () => {
  it("有 label 才渲染", () => {
    expect(mount(BaseField, { props: { modelValue: "", label: "名称" } }).find(".base-field__label").text()).toBe("名称");
    expect(mount(BaseField, { props: { modelValue: "" } }).find(".base-field__label").exists()).toBe(false);
  });
});

describe("⭐样式守卫（源码级，token 化；深色 sheet 上可读 + 与输入框有间距 + 圆角金边，不再是白底直角）", () => {
  it("label：次要文字色 token + 下边距（变异：丢 margin-bottom/颜色即红）", () => {
    expect(style).toMatch(/\.base-field__label \{[^}]*margin-bottom: 12rpx/);
    expect(style).toMatch(/\.base-field__label \{[^}]*color: \$color-text-secondary/);
    expect(style).toMatch(/\.base-field__label \{[^}]*font-size: \$font-size-caption/);
  });
  it("输入框：圆角、金色细边框、半透明金底、焦点金边、文字 token 色；无硬编码白/黑底", () => {
    expect(style).toMatch(/\.base-field__box \{[^}]*border-radius: 18rpx/);
    expect(style).toMatch(/\.base-field__box \{[^}]*border: 2rpx solid \$color-border/);
    expect(style).toMatch(/\.base-field__box \{[^}]*background: rgba\(241, 205, 145, 0\.06\)/);
    expect(style).toMatch(/\.base-field__box\.is-focused \{[^}]*border-color: \$color-action/);
    expect(style).toMatch(/\.base-field__input \{[^}]*color: \$color-text-primary/);
    expect(style).toMatch(/\.base-field__input \{[^}]*font-size: \$font-size-body/);
    expect(style).not.toMatch(/#fff\b|#ffffff|white/i);
    expect(style).not.toMatch(/var\(--/); // 抖音 TTSS 不支持 CSS 变量
  });
  it("门面不再使用 wd-input（白底直角来源）", () => {
    const tpl = src.slice(src.indexOf("<template>"), src.indexOf("<style"));
    expect(tpl).not.toContain("wd-input");
    expect(tpl).toContain("<input");
  });
});

describe("⭐商家端其余原生输入框：placeholder 与门面同色（风格一致）", () => {
  const strip = (p: string) => readFileSync(resolve(root, p), "utf-8");
  for (const f of ["src/pkg-merchant/login/index.vue", "src/pkg-merchant/slot/list.vue", "src/pkg-merchant/album/list.vue"]) {
    it(f + "：每个 <input> 都带 placeholder-style", () => {
      const s = strip(f);
      const tags = [...s.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]);
      expect(tags.length).toBeGreaterThan(0);
      for (const t of tags) expect(t, t).toContain(':placeholder-style="INPUT_PLACEHOLDER_STYLE"');
    });
  }
});
