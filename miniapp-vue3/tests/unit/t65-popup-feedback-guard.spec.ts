// 守卫（主人 2026-09-23 反馈：「Popup 内的按钮缺少震动反馈和按压效果，一致性问题很严重」）：
// **弹层/对话框内的可点元素必须与全站口径一致**——①`hover-class="press-dim"`（按压反馈，`App.vue` 全局类）
// ②点击路径调用 `hapticTap()`（触感反馈，`application/haptics` → `uni.vibrateShort({type:"light"})`，失败静默）。
//
// 覆盖范围（本仓弹层族）：`components/QualityRejectSheet`（上传照片质量拦截弹层，试衣与推荐共用）、
// `components/LoginPopup`、`components/ProfilePopup`、`ui/BaseDialog`（抖音自绘分支）、`ui/BasePicker`（抖音自绘分支），
// 以及门面 `ui/BaseButton`（门面按钮统一带触感 ⇒ 所有走门面的按钮自动一致）。
//
// 该守卫为**存在性断言**（源码级）：能拦住「整块反馈被删/被回退」，但不能证明每一处都覆盖；如需逐元素强约束，
// 应在标签级扫描（同 `t62` 思路）上继续加码。已知例外：`ui/BasePicker` 自绘分支的「取消/确定」是 `<text>`，
// 微信不支持 `hover-class`（该分支仅抖音端使用）⇒ 仅要求触感，不要求 hover-class。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf-8");

/** 弹层族（必须「触感」覆盖；除注明的 text 态外亦须「按压」覆盖） */
const POPUP_FILES = [
  "src/components/QualityRejectSheet/QualityRejectSheet.vue",
  "src/components/LoginPopup/LoginPopup.vue",
  "src/components/ProfilePopup/ProfilePopup.vue",
  "src/ui/BaseDialog.vue",
  "src/ui/BasePicker.vue",
];

describe("弹层内按钮反馈守卫（触感 + 按压）", () => {
  it("①门面按钮统一触感：ui/BaseButton 的点击路径调用 hapticTap()", () => {
    const src = read("src/ui/BaseButton.vue");
    expect(src, "BaseButton 未引入 hapticTap").toContain('from "../application/haptics"');
    expect(src, "BaseButton 点击未调用 hapticTap()").toMatch(/onClick\(\)[\s\S]{0,200}hapticTap\(\)/);
  });

  it("②弹层族均引入并调用 hapticTap（触感反馈）", () => {
    const bad: string[] = [];
    for (const f of POPUP_FILES) {
      const src = read(f);
      if (!src.includes("application/haptics")) bad.push(`${f}: 未引入 haptics`);
      if (!/hapticTap\(\);/.test(src)) bad.push(`${f}: 未调用 hapticTap()`);
    }
    expect(bad, `以下弹层缺少触感反馈：${JSON.stringify(bad)}`).toEqual([]);
  });

  it("③弹层族均含 hover-class 按压反馈（BasePicker 的 <text> 按钮除外，已在文件头注明）", () => {
    const bad: string[] = [];
    for (const f of POPUP_FILES) {
      const src = read(f);
      if (!src.includes('hover-class="press-dim"')) bad.push(`${f}: 缺 hover-class 按压反馈`);
    }
    expect(bad, `以下弹层缺少按压反馈：${JSON.stringify(bad)}`).toEqual([]);
  });

  it("④定点回归：质量拦截弹层两个按钮同时具备按压类与触感包装（本轮主人报的核心位置）", () => {
    const src = read("src/components/QualityRejectSheet/QualityRejectSheet.vue");
    expect(src).toMatch(/qr-btn--primary"[^>]*hover-class="press-dim"[^>]*@click="onRetry"/);
    expect(src).toMatch(/qr-btn--ghost"[^>]*hover-class="press-dim"[^>]*@click="onClose"/);
    expect(src, "onRetry 未触感").toMatch(/function onRetry\(\): void \{\s*hapticTap\(\);/);
    expect(src, "onClose 未触感").toMatch(/function onClose\(\): void \{\s*hapticTap\(\);/);
  });

  it("⑤按压类确实存在（App.vue 全局提供 .press-dim，否则加了也没效果）", () => {
    const app = read("src/App.vue");
    expect(app).toMatch(/\.press-dim\s*\{/);
  });
});
