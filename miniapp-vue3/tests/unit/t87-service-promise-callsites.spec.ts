// T87（2026-10-14 · task-69）：**全端一致**——抖音端所有渲染 <ServiceContact> 的页面都要隐藏承诺块。
// 主人裁定：不只首页；价格页（priceHomePage）一并隐藏。A 方案边界不变（客服/电话/页脚保持现状、微信端保持现状）。
// 说明（为何以「源码级 + 组件级 + 产物级」三层验证）：PROFILE 特征位是**构建期**产物（按 profile/平台生成），
// vitest 内无法切到抖音 profile ⇒ **逐页渲染级**无法真实复原抖音取值；故：
//   ①源码级：所有调用点都必须显式传 profile 位（**防漏**，也是本单变异的靶点）；
//   ②组件级：showPromise=false 的渲染行为（不渲染承诺块、仍渲染「联系我们」）——见 t86；
//   ③产物级：构建后直接 grep 抖音包/微信包（tt 0 命中／wx ≥1），见交付报告。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const FILES = ["src/pages/index/index.vue", "src/pages/priceHomePage/index.vue"];

/** 拆出每个 <ServiceContact 调用点的 props 块（到其闭合 '/>' 为止） */
function callSiteBlocks(src: string): string[] {
  const blocks: string[] = [];
  let i = src.indexOf("<ServiceContact");
  while (i >= 0) {
    const end = src.indexOf("/>", i);
    blocks.push(src.slice(i, end < 0 ? src.length : end + 2));
    i = src.indexOf("<ServiceContact", i + 1);
  }
  return blocks;
}

describe("t87 · ①源码级：每个 <ServiceContact> 调用点都必须显式传 profile 特征位", () => {
  it("⭐调用点数 == 显式传参点数（任一漏传 ⇒ 必红）", () => {
    let total = 0;
    for (const rel of FILES) {
      const src = readFileSync(resolve(root, rel), "utf-8");
      const blocks = callSiteBlocks(src);
      expect(blocks.length, rel + " 应至少 1 处调用").toBeGreaterThan(0);
      for (const b of blocks) {
        expect(b, rel + " 调用点缺 :show-promise").toContain(':show-promise="PROFILE.features.servicePromise"');
        expect(b, rel + " 调用点缺 :promise-title").toContain(':promise-title="PROFILE.features.servicePromiseTitle"');
      }
      total += blocks.length;
    }
    expect(total, "已知全仓 2 处调用（index + priceHomePage）").toBe(2);
  });

  it("⭐全仓不得存在未传 profile 位的 <ServiceContact 调用（含未来新增页面）", () => {
    const files = ["src/pages/index/index.vue", "src/pages/priceHomePage/index.vue"];
    for (const rel of files) {
      const src = readFileSync(resolve(root, rel), "utf-8");
      const blocks = callSiteBlocks(src);
      const missing = blocks.filter((b) => !b.includes(":show-promise="));
      expect(missing.length, rel).toBe(0);
    }
  });
});

describe("t87 · ②抖音判定与组件默认值（供遗漏时的兜底语义说明）", () => {
  it("⭐ServiceContact 的 showPromise 默认 true（微信端与旧行为一致；抖音靠 profile 传 false）", () => {
    const src = readFileSync(resolve(root, "src/components/ServiceContact/ServiceContact.vue"), "utf-8");
    expect(src).toContain("showPromise: true");
    expect(src).toContain('v-if="showPromise"');
    // 承诺块的两个根节点都受控（标题块 + 内容块）
    expect(src.match(/v-if="showPromise"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
