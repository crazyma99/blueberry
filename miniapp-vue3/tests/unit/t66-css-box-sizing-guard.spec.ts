// 守卫（主人 2026-09-23 报「AI 推荐底部按钮宽度紧贴屏幕两侧、没有 margin」的防回流版）：
// **`width: 100%` 且带横向 padding 的元素必须显式 `box-sizing: border-box`**。
// 根因（本仓迁移系统性坑）：旧端 **uvue 默认 `border-box`**，而 WXSS/浏览器默认 **content-box**
// ⇒ 照搬旧端 CSS 时「`width:100%` ＋ 左右 padding」会把容器撑宽，子元素（`width:100%`）随之溢出到屏幕两侧、
// 视觉上像「没有 margin」。已实测命中并修复：`pages/aiRecommend` 的 `.action-btn-wrap`（旧端 :644-649 逐值）。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function vueFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "dist" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...vueFiles(p));
    else if (p.endsWith(".vue")) out.push(p);
  }
  return out;
}

/** 横向 padding 是否非零：2 值简写（第 1 值）/ 3、4 值简写（第 2、4 值）/ padding-left|right */
function hasHorizontalPadding(body: string): boolean {
  const sh = /padding\s*:\s*([^;]+);/.exec(body);
  if (sh) {
    const parts = sh[1].trim().split(/\s+/);
    if (parts.length === 1) return parts[0] !== "0" && parts[0] !== "0rpx";
    if (parts.length === 2) return parts[1] !== "0" && parts[1] !== "0rpx";
    if (parts.length >= 3) return [parts[1], parts[3] ?? parts[1]].some((v) => v && v !== "0" && v !== "0rpx");
  }
  for (const side of ["padding-left", "padding-right"]) {
    const m = new RegExp(side + "\\s*:\\s*([^;]+);").exec(body);
    if (m && m[1].trim() !== "0" && m[1].trim() !== "0rpx") return true;
  }
  return false;
}

describe("CSS 盒模型守卫（旧端 uvue 默认 border-box ⇒ 迁移后 width:100%+横向 padding 必须显式 border-box）", () => {
  it("⭐规则内 `width: 100%` ＋ 非零横向 padding ⇒ 必须声明 box-sizing", () => {
    const bad: string[] = [];
    let checked = 0;
    for (const f of vueFiles(join(root, "src"))) {
      const src = readFileSync(f, "utf-8");
      const m = /<style[^>]*>([\s\S]*)<\/style>/.exec(src);
      if (!m) continue;
      for (const r of m[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sel = r[1].trim().split("\n").pop()?.trim() ?? "";
        const body = r[2];
        if (!/width\s*:\s*100%/.test(body)) continue;
        checked += 1;
        if (hasHorizontalPadding(body) && !/box-sizing\s*:/.test(body)) bad.push(`${f.slice(root.length + 1)} → ${sel}`);
      }
    }
    expect(checked, "未扫到任何 width:100% 规则，守卫生效性存疑").toBeGreaterThan(10);
    expect(bad, `以下规则缺 box-sizing（旧端 uvue 默认 border-box，迁移后会溢出）：${JSON.stringify(bad)}`).toEqual([]);
  });

  it("定点回归：AI 推荐底部按钮容器已显式 border-box（本轮主人报的位置）", () => {
    const src = readFileSync(join(root, "src/pages/aiRecommend/index.vue"), "utf-8");
    const m = /\.action-btn-wrap\s*\{([^}]*)\}/.exec(src);
    expect(m, "未找到 .action-btn-wrap").toBeTruthy();
    expect(m![1]).toMatch(/box-sizing\s*:\s*border-box/);
  });
});
