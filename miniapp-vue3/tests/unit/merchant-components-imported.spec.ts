// 守卫（issue #14 · m2b 真机）：商家端页面模板里用到的每个 PascalCase 自定义组件，都必须在 <script> 里显式 import。
// 真因：`slot/list.vue` 用了 `<BasePicker>` 却没 import——uni-app 的 easycom 只自动注册 `components/<Name>/<Name>.vue`，
// **不会**扫 `src/ui/`；未 import ⇒ 构建产物 list.json 的 usingComponents 里没有 base-picker ⇒ 真机上「选择日期」弹层根本不渲染
// （vitest 里因组件被 stub/不渲染而看不出来）。
// 变异靶点：删掉任一页面的某个组件 import ⇒ 本测试红。
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
const BUILTIN = new Set(["Template", "Component", "Transition", "TransitionGroup", "KeepAlive", "Teleport", "Suspense", "Slot"]);
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const TAG_RE = /<([A-Z][A-Za-z0-9]+)[\s/>]/g;

describe("商家端页面/组件：模板用到的自定义组件必须显式 import（easycom 不扫 src/ui）", () => {
  const files = vueFiles(resolve(root, "src/pkg-merchant"));
  it("至少扫到页面文件", () => expect(files.length).toBeGreaterThan(5));
  for (const f of files) {
    const rel = f.slice(root.length + 1).split("\\").join("/");
    it(rel, () => {
      const src = readFileSync(f, "utf-8");
      const at = src.indexOf("<template>");
      const tpl = src.slice(at, src.lastIndexOf("</template>")).replace(COMMENT_RE, "");
      const script = src.slice(0, at);
      const used = new Set([...tpl.matchAll(TAG_RE)].map((m) => m[1]).filter((n) => !BUILTIN.has(n)));
      const missing = [...used].filter((n) => !new RegExp("import\\s+" + n + "\\s+from\\s+").test(script));
      expect(missing, rel + " 模板使用了未 import 的组件：" + missing.join(",")).toEqual([]);
    });
  }
});
