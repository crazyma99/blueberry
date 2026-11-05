// 样式守卫（热修 H1：首页「到店预约」入口文字不在按钮正中）。
// 根因：容器无固定高度/行高，文字被父 view 默认字号的 strut 行盒按基线摆放 ⇒ 垂直偏离几何中心；
//       letter-spacing 另使末字右侧多留空白。
// 修法的不变量（源码文本断言，不伪造渲染；真机验收另行）：
//   ① 容器 flex 居中三件套 + box-sizing:border-box + 固定 height；
//   ② 文字 height 与 line-height 同值，且等于「容器 height − 2×描边」，即行盒恰好占满内框，不依赖默认行高；
//   ③ 文字无 letter-spacing（不依赖各端对末字尾随间距的处理）；
//   ④ 平铺选择器、无嵌套 CSS、不使用原生 button。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const file = resolve(__dirname, "../../src/components/BookingEntry/BookingEntry.vue");

function styleBlock(src: string): string {
  const m = /<style[^>]*>([\s\S]*?)<\/style>/.exec(src);
  if (!m) throw new Error("no <style>");
  return m[1].replace(/\/\*[\s\S]*?\*\//g, "");
}
function ruleBody(css: string, sel: string): string {
  const m = new RegExp("(?:^|\\})\\s*\\." + sel + "\\s*\\{([^{}]*)\\}").exec(css);
  if (!m) throw new Error("rule not found: ." + sel);
  return m[1];
}
function decl(body: string, prop: string): string | undefined {
  const m = new RegExp("(?:^|[;\\s])" + prop + "\\s*:\\s*([^;]+);").exec(body);
  return m?.[1].trim();
}
const rpx = (v: string | undefined): number => {
  const m = /^(-?\d+(?:\.\d+)?)rpx$/.exec(v ?? "");
  if (!m) throw new Error("not a rpx value: " + String(v));
  return Number(m[1]);
};

/** 供变异自证：对源码做一次文本变异后跑同一组断言 */
function checkInvariants(src: string): string[] {
  const css = styleBlock(src);
  const box = ruleBody(css, "booking-entry");
  const txt = ruleBody(css, "booking-entry-text");
  const errs: string[] = [];
  if (decl(box, "display") !== "flex") errs.push("container display:flex");
  if (decl(box, "align-items") !== "center") errs.push("container align-items:center");
  if (decl(box, "justify-content") !== "center") errs.push("container justify-content:center");
  if (decl(box, "box-sizing") !== "border-box") errs.push("container box-sizing:border-box");
  const boxH = decl(box, "height");
  const txtH = decl(txt, "height");
  const txtLH = decl(txt, "line-height");
  if (!boxH) errs.push("container fixed height");
  if (!txtLH) errs.push("text line-height (不得依赖默认行高)");
  if (!txtH) errs.push("text height");
  if (boxH && txtH && txtLH) {
    if (txtH !== txtLH) errs.push("text height === line-height");
    const border = /border\s*:\s*(\d+(?:\.\d+)?)rpx\b/.exec(box);
    const bw = border ? Number(border[1]) : 0;
    if (rpx(boxH) - 2 * bw !== rpx(txtH)) errs.push("text height === container inner height");
  }
  if (decl(txt, "letter-spacing")) errs.push("text must not set letter-spacing");
  return errs;
}

describe("BookingEntry 文字居中样式守卫（H1）", () => {
  const src = readFileSync(file, "utf-8");

  it("容器 flex 居中三件套 + 确定高度；文字 height === line-height === 容器内框高；无 letter-spacing", () => {
    expect(checkInvariants(src)).toEqual([]);
  });

  it("平铺选择器：<style> 内无嵌套规则；组件仍用 view/text，不引入原生 button", () => {
    const css = styleBlock(src);
    // 去掉最外层规则后不应再有 `{`：任意规则体内出现 `{` 即嵌套
    for (const m of css.matchAll(/\{([^{}]*\{[^{}]*)\}/g)) throw new Error("nested css: " + m[0].slice(0, 60));
    expect(src).not.toMatch(/<button\b/);
    expect(src).toMatch(/<view class="booking-entry"[^>]*hover-class="press-dim"[^>]*@click\.stop="onTap"/);
  });

  it("变异自证：删掉任一居中/行高要素，守卫必须变红", () => {
    const mutations: Array<[string, (s: string) => string]> = [
      ["删 align-items:center", (s) => s.replace(/\s*align-items:\s*center;/, "")],
      ["删 justify-content:center", (s) => s.replace(/\s*justify-content:\s*center;/, "")],
      ["删 display:flex", (s) => s.replace(/\s*display:\s*flex;/, "")],
      ["删文字 line-height", (s) => s.replace(/\s*line-height:\s*42rpx;/, "")],
      ["删容器 height", (s) => s.replace(/\s*height:\s*44rpx;/, "")],
      ["文字 line-height 与 height 不一致", (s) => s.replace(/line-height:\s*42rpx;/, "line-height: 40rpx;")],
      ["恢复 letter-spacing", (s) => s.replace(/(color:\s*\$color-action;)/, "$1\n  letter-spacing: 1rpx;")],
    ];
    for (const [name, mutate] of mutations) {
      const mutated = mutate(src);
      expect(mutated, name + "：变异未生效").not.toBe(src);
      expect(checkInvariants(mutated).length, name + "：守卫未变红").toBeGreaterThan(0);
    }
  });
});
