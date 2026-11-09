// BaseField maxlength 语义（issue #14 · m2c CR 🟡）：原生 <input> 的 maxlength 微信默认 140，旧 wd-input 默认不限 ⇒ 长文本（套餐说明上限 500）
// 会在 140 字被**静默截断**。修复：BaseField 新增 maxlength（默认 -1＝不限，保持旧行为）+ 可选计数提示；页面按业务常量传（与 domain 校验同源）。
// 后端核对（lanmei-backend-golang database-schema.md）：photo_albums.title varchar(128)、package_desc text、categories.name varchar(64)，
// 无额外长度校验；前端业务上限（标题 100 / 说明 500 / 分类名 50）均不超过库字段，故以业务常量为准。
// 变异靶点：①maxlength 不透传 ②默认值改成 140（旧坑）③计数/警示不显示 ④页面硬写数字而不是业务常量 ⑤排序号位数与 CATEGORY_SORT_MAX 脱钩。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BaseField from "../../src/ui/BaseField.vue";
import { ALBUM_DESC_MAX, ALBUM_TITLE_MAX } from "../../src/pkg-merchant/domain/merchant-album";
import { CATEGORY_NAME_MAX, CATEGORY_SORT_MAX } from "../../src/pkg-merchant/domain/merchant-category";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf-8");

describe("⭐BaseField maxlength：透传与默认", () => {
  it("默认 -1（不限，保持旧行为），且显式传给原生 input（否则微信默认 140）（变异：不透传/默认 140 即红）", () => {
    const w = mount(BaseField, { props: { modelValue: "" } });
    expect(w.find("input").attributes("maxlength")).toBe("-1");
  });
  it("传业务上限 ⇒ 原样给原生 input", () => {
    const w = mount(BaseField, { props: { modelValue: "", maxlength: ALBUM_DESC_MAX } });
    expect(w.find("input").attributes("maxlength")).toBe(String(ALBUM_DESC_MAX));
  });
  it("⭐500 字上限的说明：默认（不传）不会再被 140 截断——给 input 的是 -1 而非缺省", () => {
    const w = mount(BaseField, { props: { modelValue: "x".repeat(300) } });
    expect(w.find("input").attributes("maxlength")).not.toBe("140");
    expect(w.find("input").attributes("maxlength")).toBeDefined();
  });
});

describe("⭐计数与上限提示（原生截断无反馈，所以限制 + 可见提示一起做）", () => {
  it("show-count：显示 n/max；未到上限用弱色，到达上限显示「已达上限」并变警示色（变异：不显示即红）", () => {
    const a = mount(BaseField, { props: { modelValue: "abc", maxlength: 10, showCount: true } });
    expect(a.find(".base-field__count").text()).toBe("3/10");
    expect(a.find(".base-field__count").classes()).not.toContain("is-limit");
    const b = mount(BaseField, { props: { modelValue: "x".repeat(10), maxlength: 10, showCount: true } });
    expect(b.find(".base-field__count").text()).toContain("已达上限");
    expect(b.find(".base-field__count").text()).toContain("10/10");
    expect(b.find(".base-field__count").classes()).toContain("is-limit");
  });
  it("按码点计长：emoji 算 1 个（与 domain 校验 [...s].length 同口径）", () => {
    const w = mount(BaseField, { props: { modelValue: "😀😀😀", maxlength: 10, showCount: true } });
    expect(w.find(".base-field__count").text()).toBe("3/10");
  });
  it("不传 show-count 或 maxlength<=0 ⇒ 不渲染计数", () => {
    expect(mount(BaseField, { props: { modelValue: "a", maxlength: 10 } }).find(".base-field__count").exists()).toBe(false);
    expect(mount(BaseField, { props: { modelValue: "a", showCount: true } }).find(".base-field__count").exists()).toBe(false);
  });
  it("警示色用 token（$color-danger），不硬写色值", () => {
    const src = read("src/ui/BaseField.vue");
    const style = src.slice(src.indexOf("<style"));
    expect(style).toMatch(/\.base-field__count\.is-limit \{[^}]*color: \$color-danger/);
  });
});

describe("⭐type 与 maxlength 的交互（digit/number）", () => {
  it.each(["number", "digit", "idcard", "tel"] as const)("type=%s 与 maxlength 同时透传，互不覆盖", (t) => {
    const w = mount(BaseField, { props: { modelValue: "", type: t, maxlength: 4 } });
    expect(w.find("input").attributes("type")).toBe(t);
    expect(w.find("input").attributes("maxlength")).toBe("4");
  });
  it("digit 小数输入与 maxlength 并存：输入 '199.5' 照常 emit（上限由原生控件执行，组件不二次截断）", async () => {
    const w = mount(BaseField, { props: { modelValue: "", type: "digit", maxlength: 12 } });
    await w.find("input").trigger("input", { detail: { value: "199.5" } });
    expect(w.emitted("update:modelValue")?.[0]).toEqual(["199.5"]);
  });
});

describe("⭐页面按业务常量传上限（与 domain 校验同源，不硬写数字）", () => {
  const album = read("src/pkg-merchant/album/list.vue");
  const cat = read("src/pkg-merchant/category/list.vue");
  it("业务常量值（对照后端库字段：标题 varchar(128)、分类名 varchar(64)、说明 text）", () => {
    expect(ALBUM_TITLE_MAX).toBeLessThanOrEqual(128);
    expect(CATEGORY_NAME_MAX).toBeLessThanOrEqual(64);
    expect(ALBUM_DESC_MAX).toBe(500);
  });
  it("相册页：名称 / 套餐说明用 ALBUM_TITLE_MAX / ALBUM_DESC_MAX，且开启计数（变异：硬写数字/漏传即红）", () => {
    expect(album).toMatch(/<BaseField v-model="fTitle"[^>]*:maxlength="ALBUM_TITLE_MAX"[^>]*show-count/);
    expect(album).toMatch(/<BaseField v-model="fPackageDesc"[^>]*:maxlength="ALBUM_DESC_MAX"[^>]*show-count/);
    expect(album).toMatch(/import \{[^}]*ALBUM_DESC_MAX[^}]*ALBUM_TITLE_MAX[^}]*\} from "..\/domain\/merchant-album"/);
  });
  it("分类页：名称用 CATEGORY_NAME_MAX（计数），排序号位数由 CATEGORY_SORT_MAX 推出（变异：脱钩即红）", () => {
    expect(cat).toMatch(/<BaseField v-model="formName"[^>]*:maxlength="CATEGORY_NAME_MAX"[^>]*show-count/);
    expect(cat).toMatch(/<BaseField v-model="formSort"[^>]*:maxlength="SORT_DIGITS"/);
    expect(cat).toContain("const SORT_DIGITS = String(CATEGORY_SORT_MAX).length;");
    expect(String(CATEGORY_SORT_MAX).length).toBe(4);
  });
  it("商家端所有 BaseField 使用点都显式传 maxlength（防止再次落回原生 140 默认）", () => {
    for (const [name, src] of [["album/list.vue", album], ["category/list.vue", cat]] as const) {
      const tags = [...src.matchAll(/<BaseField\b[^>]*\/>/g)].map((m) => m[0]);
      expect(tags.length, name).toBeGreaterThan(0);
      // 价格（digit）上限由 parsePriceYuan 校验，不限制输入位数，显式豁免；其余文本类必须传
      for (const t of tags) if (!t.includes('type="digit"')) expect(t, name + ": " + t).toContain(":maxlength=");
    }
  });
});
