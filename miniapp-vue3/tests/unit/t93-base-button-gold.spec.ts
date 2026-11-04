// t93：BaseButton 品牌金主题（纯 CSS 变量经 custom-style 注入 wd-button，不改 wot 源码）。
// 事实源：node_modules/@wot-ui/ui/components/wd-button/index.scss——base 变体文字取 --wot-button-main-color（plain 才取 primary-color）；
// 按压态背景取 --wot-button-primary-bg-active；docs/plans/button-facade-inventory.md 第 13 条。
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import BaseButton from "../../src/ui/BaseButton.vue";
import StubButton from "../stubs/wot/wd-button/wd-button.vue";
import { PRIMARY_BUTTON_STYLE, PRIMARY_GOLD_GRADIENT, defaultButtonStyle } from "../../src/ui/button-theme";
import * as buttonTheme from "../../src/ui/button-theme";
import * as toastTheme from "../../src/ui/toast-theme";
import { tokens } from "../../src/generated/tokens";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const global = { components: { "wd-button": StubButton } };

describe("t93 · BaseButton 金色主题", () => {
  it("①默认 primary：customStyle 含金色渐变＋墨色 main-color（文字）＋按压态变量＋胶囊圆角", () => {
    const w = mount(BaseButton, { props: { label: "重试" }, global });
    const style = w.findComponent(StubButton).props("customStyle") as string;
    expect(style).toContain(`--wot-button-primary-bg: ${PRIMARY_GOLD_GRADIENT}`);
    expect(style).toContain(`--wot-button-main-color: ${tokens.semantic.colorActionText}`);
    expect(style).toContain("--wot-button-primary-bg-active:");
    expect(style).toContain("--wot-button-radius-main: 999rpx");
  });

  it("②所有 *_STYLE 常量显式含 `color:`（只写 primary-color 变量会让 base 变体文字仍为白）", () => {
    const consts = [...Object.entries(buttonTheme), ...Object.entries(toastTheme)].filter(([k]) => /_STYLE$/.test(k));
    expect(consts.length).toBeGreaterThanOrEqual(2);
    for (const [k, v] of consts) expect(String(v), k).toMatch(/(^|[\s;])color:/);
  });

  it("③颜色字面量与 token／全站 .btn-primary 一致（不另维护第二份）", () => {
    expect(PRIMARY_BUTTON_STYLE).toContain(tokens.primitive.gold);
    expect(PRIMARY_BUTTON_STYLE).toContain(tokens.primitive.ink);
    const app = read("src/App.vue");
    const m = app.match(/\.btn-primary\s*\{[^}]*?background:\s*(linear-gradient\([^;]+\));/);
    expect(m, "App.vue .btn-primary 渐变未找到").not.toBeNull();
    expect(PRIMARY_GOLD_GRADIENT).toBe(m![1]);
    expect(app).toMatch(/\.btn-primary\s*\{[^}]*?color:\s*#160F04/);
    expect(tokens.primitive.ink).toBe("#160F04");
  });

  it("④非 primary type 的 customStyle 为空（不改其它类型）；显式 customStyle 可覆盖", () => {
    for (const type of ["success", "info", "warning", "danger"] as const) {
      expect(defaultButtonStyle(type)).toBe("");
      const w = mount(BaseButton, { props: { label: "x", type }, global });
      expect(w.findComponent(StubButton).props("customStyle")).toBe("");
    }
    const w = mount(BaseButton, { props: { label: "x", customStyle: "--a: 1;" }, global });
    expect(w.findComponent(StubButton).props("customStyle")).toBe("--a: 1;");
  });

  it("⑤禁用态不覆盖任何 disabled 变量；busy 仍走 wot loading（透传 loading）", () => {
    expect(PRIMARY_BUTTON_STYLE).not.toMatch(/disabled/);
    const w = mount(BaseButton, { props: { label: "x", busy: true }, global });
    expect(w.findComponent(StubButton).props("loading")).toBe(true);
  });
});
