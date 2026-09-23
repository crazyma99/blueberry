// 守卫（主人 2026-09-23 目标）：「按钮组件要覆盖所有其他按钮 …… 后续全部要使用组件来做」。
// 口径（与 docs/plans/button-facade-inventory.md 一致）：模板内「带 @click/@tap 且 class 含 btn/button/cta」⇒ 自绘按钮；
// 原生 `<button>` 元素同样计入。**新增自绘按钮会被本用例拦下**：请改用 `ui/BaseButton`（门面已支持
// type/variant(base|plain|dashed|soft|subtle|text)/size/block/round/disabled/busy/customStyle）。
// B3 批次逐页替换时，同步下调本白名单；**全部替换完成后该白名单应为空**。
// 免替换口径（见 docs/plans/button-facade-inventory.md「免替换清单」）：①平台强制 `<button open-type=…>`（chooseAvatar／getPhoneNumber）
// ②门面内部自绘（ui/BasePicker 的抖音分支）③可交互但非按钮（卡片/选项卡/图标/导航）——本启发式天然不计入带 `open-type` 的原生按钮。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

/** 递归收集 .vue 文件（避开 node_modules/dist） */
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

/** 统计模板内自绘按钮（口径见文件头） */
function handDrawnButtons(src: string): number {
  const m = /<template>([\s\S]*)<\/template>/.exec(src);
  const tpl = m ? m[1] : "";
  let n = 0;
  for (const line of tpl.split("\n")) {
    if ((line.includes("@click") || line.includes("@tap")) && /class="[^"]*(btn|button|cta)[^"]*"/.test(line)) n += 1;
    else if (/<button\b/.test(line) && line.includes("@click")) n += 1;
  }
  return n;
}

/** 替换进行中的白名单（B3 完成后应清空） */
const ALLOWLIST = new Map<string, number>([
    ["src/pages/aiRecommendLoading/index.vue", 1], // 1 处为 back-btn-wrapper（可交互非按钮，免替换）
    ["src/pages/aiTryOn/index.vue", 2],
    ["src/pages/aiTryOnResult/index.vue", 9],
    ["src/ui/BaseDialog.vue", 1],
    ["src/ui/BasePicker.vue", 2],
]);

describe("按钮组件化守卫（新增自绘按钮 ⇒ 红）", () => {
  it("⭐自绘按钮集合与白名单严格一致（只减不增）", () => {
    const dirs = ["src/pages", "src/components", "src/ui"].map((d) => join(root, d));
    const actual = new Map<string, number>();
    for (const d of dirs) {
      for (const p of vueFiles(d)) {
        const rel = p.slice(root.length + 1);
        const n = handDrawnButtons(readFileSync(p, "utf-8"));
        if (n > 0) actual.set(rel, n);
      }
    }
    const added = [...actual.entries()].filter(([f, n]) => (ALLOWLIST.get(f) ?? 0) !== n);
    expect(added, `新增/增加的自绘按钮（请改用 ui/BaseButton）：${JSON.stringify(added)}`).toEqual([]);
  });

  it("门面自身（ui/**）不受限但需登记；已组件化的关键弹层不得回退", () => {
    const sheet = readFileSync(join(root, "src/components/QualityRejectSheet/QualityRejectSheet.vue"), "utf-8");
    expect(sheet).toContain("<BaseButton");
    expect(sheet).not.toMatch(/<view[^>]*class="[^"]*qr-btn/); // 弹层按钮不得退回自绘
  });
});
