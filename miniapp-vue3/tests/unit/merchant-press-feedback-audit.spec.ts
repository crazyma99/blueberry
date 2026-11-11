// 商家端「按压反馈一致性」巡检守卫（issue #14 · UX P0 批次2-⑥）：
// 凡是带 @click 的 <view>/<button> 交互元素都必须有 hover-class="press-dim"（App.vue 全局按压类）；
// 提交类按钮（含「提交中」「登录中」「处理中」等忙碌文案的）必须有忙碌态（禁用样式或文案切换）。
// 例外（需写明理由，新增例外 = 先过评审）：遮罩/容器类点击（@click.stop 阻断冒泡的内部元素）。
// 变异靶点：删掉任一元素的 hover-class ⇒ 红；删掉提交按钮的忙碌态 ⇒ 红。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
function vueFiles(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...vueFiles(p));
    else if (n.endsWith(".vue")) out.push(p);
  }
  return out;
}
const files = vueFiles(resolve(root, "src/pkg-merchant"));
const rel = (f: string) => f.slice(root.length + 1).split("\\").join("/");

/** 取模板里所有开始标签（含多行属性） */
function tags(src: string): string[] {
  const tpl = src.slice(src.indexOf("<template>"), src.lastIndexOf("</template>"));
  return [...tpl.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<(view|button)\b[^>]*>/g)].map((m) => m[0]);
}

/** 允许没有按压反馈的点击元素（逐条登记理由） */
const EXEMPT = [
  // 弹层内「点击空白关闭」类遮罩由 BasePopup/BaseDialog 门面承担，不在业务页出现
  /@click\.stop/, // 内部元素阻断冒泡（如照片角标 × 移除按钮在可点卡片内，卡片本身有按压反馈）
];

describe("⭐可点元素都有 hover-class=press-dim", () => {
  for (const f of files) {
    it(rel(f), () => {
      const bad = tags(readFileSync(f, "utf-8")).filter((t) => /@click="/.test(t) && !/hover-class="press-dim"/.test(t) && !EXEMPT.some((e) => e.test(t)));
      expect(bad, rel(f) + " 有可点元素缺少 hover-class=\"press-dim\"：\n" + bad.join("\n")).toEqual([]);
    });
  }
  it("至少扫到 5 个以上页面（防空跑）", () => expect(files.length).toBeGreaterThan(5));
});

describe("⭐提交类按钮有忙碌态", () => {
  const read = (p: string) => readFileSync(resolve(root, p), "utf-8");
  it("登录页：登录按钮 busy ⇒ is-busy 样式 + 「登录中...」文案 + onSubmit 防重入", () => {
    const s = read("src/pkg-merchant/login/index.vue");
    expect(s).toMatch(/:class="busy \? 'submit is-busy' : 'submit'"/);
    expect(s).toContain('busy ? "登录中..." : "登录"');
    expect(s).toMatch(/async function onSubmit\(\): Promise<void> \{\s*if \(busy\.value\) return;/);
  });
  it("相册/分类/档期 sheet 的提交按钮：working ⇒ is-disabled + 「提交中...」；submitForm 防重入", () => {
    for (const f of ["src/pkg-merchant/album/list.vue", "src/pkg-merchant/category/list.vue", "src/pkg-merchant/slot/list.vue"]) {
      const s = read(f);
      expect(s, f).toMatch(/:class="working[^"]*\? 'sheet-btn is-disabled' : 'sheet-btn'"/);
      expect(s, f).toContain("提交中...");
      expect(s, f).toMatch(/async function submitForm\(\): Promise<void> \{\s*if \(working\.value/);
    }
  });
  it("新增的「空态引导」按钮：working 时禁用样式（变异：去掉即红）", () => {
    for (const f of ["src/pkg-merchant/album/list.vue", "src/pkg-merchant/category/list.vue", "src/pkg-merchant/slot/list.vue"]) {
      expect(read(f), f).toMatch(/:class="working \? 'empty-cta is-disabled' : 'empty-cta'"/);
    }
  });
});
