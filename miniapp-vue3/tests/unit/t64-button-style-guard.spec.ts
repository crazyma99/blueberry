// 守卫（2026-09-23 独立 CR 发现并已修的 🔴 的防回流版）：
// **wot base 变体的文字色不来自 `--wot-button-primary-color`**。
// 产物硬证（`dist/build/mp-weixin/node-modules/@wot-ui/ui/components/wd-button/wd-button.wxss`）：
//   `.wd-button.is-primary{background:var(--wot-button-primary-bg,…);color:var(--wot-button-main-color, …white)}`
// ⇒ 只写 `--wot-button-primary-color` 而**不写显式 `color:`** 时，`variant=base`（门面默认）按钮的文字会渲染成
//   wot 默认色（白）；该变量只对 `variant="plain"` 生效（lib `@wot-ui/ui@2.3.2 components/wd-button/index.scss:6-12`）。
// 口径：**门面 `BaseButton` 用的样式常量（`*_STYLE`）必须显式声明 `color:`**，且其值应与
//   `--wot-button-primary-color` 一致（后者仍保留：plain 变体／未来变体需要它）。
// 该缺陷曾同时存在于 12 个常量（`mine` 退出登录、`aiTryOnResult` 次要/图标/返回、`aiRecommendLoading` 主/返回、
//   `demoDetail`、`aiTryOn`、`targetPhotoDetail`、`QualityRejectSheet` ×2、`ProfilePopup`）——本用例防其复发。
import { readdirSync, readFileSync, statSync } from "node:fs";
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

/** 抽出所有 `const XXX_STYLE = \`…\`` 常量（门面样式常量约定命名） */
function styleConstants(src: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const re = /^const ([A-Z0-9_]*_STYLE) = `([^`]*)`/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push({ name: m[1], body: m[2] });
  return out;
}

/** 声明了哪些 CSS 属性（属性名精确匹配，避免把 `--x-color:` 误当成 `color:`） */
function declaredProps(body: string): string[] {
  return body
    .split(";")
    .filter((d) => d.includes(":"))
    .map((d) => d.split(":")[0].trim().toLowerCase());
}

describe("门面按钮样式常量守卫（显式 color，防 wot base 变体文字色失效）", () => {
  it("⭐每个 *_STYLE 常量都必须显式声明 `color:`（不得只依赖 --wot-button-primary-color）", () => {
    const bad: string[] = [];
    let checked = 0;
    for (const f of vueFiles(join(root, "src"))) {
      const src = readFileSync(f, "utf-8");
      for (const c of styleConstants(src)) {
        checked += 1;
        const props = declaredProps(c.body);
        if (!props.includes("color")) {
          bad.push(`${f.slice(root.length + 1)}: ${c.name}（缺显式 color；只有 --wot-button-primary-color=${c.body.includes("--wot-button-primary-color")}）`);
        }
      }
    }
    expect(checked, "未扫到任何 *_STYLE 常量，守卫生效性存疑").toBeGreaterThanOrEqual(10);
    expect(bad, `以下样式常量的文字色对 base 变体无效（wot 取 --wot-button-main-color＝白）：${JSON.stringify(bad)}`).toEqual([]);
  });

  it("口径检查：mine 退出登录与 aiTryOnResult 次要按钮的文字色已显式声明（本轮 🔴 的定点回归）", () => {
    const mine = readFileSync(join(root, "src/pages/mine/index.vue"), "utf-8");
    expect(mine).toMatch(/LOGOUT_BTN_STYLE = `[^`]*color: #ff6b6b;/);
    const res = readFileSync(join(root, "src/pages/aiTryOnResult/index.vue"), "utf-8");
    expect(res).toMatch(/SECONDARY_BTN_STYLE = `[^`]*color: #F1CD91;/);
  });
});
