// 守卫（主人 2026-09-23「按钮组件要覆盖所有其他按钮 …… 后续全部要使用组件来做」的反馈通道版）：
// **AI 六页的轻提示/加载态必须走门面**（`ui/BaseFeedback`＝wot `wd-toast`／`ui/BaseLoadingPopup`＝wot popup+loading），
// 不得再直接使用 `platform/uni/feedback` 的原生实现。
//
// 口径（与 docs/plans/button-facade-inventory.md §B2 一致）：
//   ① 页面**不得**从 `platform/uni/feedback` 直接 import `toast`/`showLoading`/`hideLoading`
//      —— 只允许 `toast as nativeToast` 这类**别名**（作为门面未就绪时的回落通道）；`showModal`/`navigateTo` 不在此限。
//   ② 凡调用 `showLoading(` 的页面必须挂载 `<BaseLoadingPopup`；
//   ③ 凡调用 `toast(` 的页面必须挂载 `<BaseFeedback`，且带 `ref="feedbackRef"`（页面自持门面实例，回落判据）。
//
// 注：本文件是**源码级守卫**（与 `t45-t9b-discipline` 同族）；行为级覆盖见 `t47`/`t46`/`t30`
// 的门面桩用例（每页均以「桩改空实现 ⇒ 变红」自证过）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf-8");

/** AI 六页（微信端注册；抖音端由 pages.json `#ifdef MP-WEIXIN` 排除，不构建） */
const AI_PAGES = [
  "src/pages/aiTryOn/index.vue",
  "src/pages/aiRecommend/index.vue",
  "src/pages/aiRecommendLoading/index.vue",
  "src/pages/aiRecommendResult/index.vue",
  "src/pages/aiTryOnResult/index.vue",
  "src/pages/aiTryOnHistory/index.vue",
];

/** 取 `platform/uni/feedback` 的具名导入（无则返回空数组） */
function feedbackImports(src: string): string[] {
  const m = /import\s*\{([^}]*)\}\s*from\s*"[^"]*platform\/uni\/feedback"/.exec(src);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

describe("AI 六页反馈通道守卫（新增页面必须走门面）", () => {
  it("①不得直接导入原生 toast/showLoading/hideLoading（只允许 `as nativeXxx` 别名）", () => {
    const bad: string[] = [];
    for (const p of AI_PAGES) {
      for (const name of feedbackImports(read(p))) {
        // "toast as nativeToast" ⇒ 原名 "toast"、别名 "nativeToast"（别名＝回落通道，按口径放行）
        const parts = name.split(/\s+as\s+/);
        const raw = parts[0].trim();
        const aliased = parts.length > 1 && parts[1].trim().length > 0;
        if (["toast", "showLoading", "hideLoading"].includes(raw) && !aliased) bad.push(`${p}: ${name}`);
      }
    }
    expect(bad, `以下页面仍在直接用原生反馈实现（请改走 ui/BaseFeedback｜ui/BaseLoadingPopup）：${JSON.stringify(bad)}`).toEqual([]);
  });

  it("②调用 loading 的页面必须挂载 BaseLoadingPopup；③调用 toast 的页面必须挂载 BaseFeedback(ref=feedbackRef)", () => {
    const missing: string[] = [];
    for (const p of AI_PAGES) {
      const src = read(p);
      // 去行注释后判定调用（避免注释里的字样误判）
      const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
      if (/\bshowLoading\(/.test(code) && !code.includes("<BaseLoadingPopup")) missing.push(`${p}: 有 showLoading( 但未挂 <BaseLoadingPopup`);
      if (/\btoast\(/.test(code) && !code.includes("<BaseFeedback")) missing.push(`${p}: 有 toast( 但未挂 <BaseFeedback`);
      if (code.includes("<BaseFeedback") && !code.includes('ref="feedbackRef"')) missing.push(`${p}: <BaseFeedback 缺 ref="feedbackRef"`);
    }
    expect(missing, `反馈门面未接线：${JSON.stringify(missing)}`).toEqual([]);
  });

  it("门面契约未回退：BaseFeedback 暴露 show/hide；BaseLoadingPopup 受控 show/text", () => {
    const fb = read("src/ui/BaseFeedback.vue");
    expect(fb).toContain("defineExpose<{ show:");
    const lp = read("src/ui/BaseLoadingPopup.vue");
    expect(lp).toMatch(/show\s*:/);
    expect(lp).toMatch(/text\s*:/);
  });

  it("原生通道仍在（回落路径可用）：platform/uni/feedback 导出 toast/showLoading/hideLoading", () => {
    const mod = read("src/platform/uni/feedback.ts");
    for (const fn of ["toast", "showLoading", "hideLoading"]) {
      expect(mod, `缺少导出 ${fn}`).toMatch(new RegExp(`export\\s+(async\\s+)?function\\s+${fn}|export\\s+const\\s+${fn}`));
    }
  });
});
