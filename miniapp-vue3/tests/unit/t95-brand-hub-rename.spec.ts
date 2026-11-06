// T95（2026-11-06）：「品牌馆」对外改名「入驻门店」——页面标题、首页悬浮球无障碍文案；内部命名/数据键不改。
// 口径（契约 §6）：`brand_hub` 配置键、brandHub 路径/变量/组件名、`/api/brands` 等一律不动，只改用户可见文案。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: () => undefined,
  onShow: () => undefined,
  onShareAppMessage: () => undefined,
  onShareTimeline: () => undefined,
  onPullDownRefresh: () => undefined,
}));

import StubWdToast from "../stubs/wot/wd-toast/wd-toast.vue";
import BrandHubPage from "../../src/pages/brandHub/index.vue";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf-8");
/** 去掉注释，仅留可能对外展示的源码 */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");

describe("t95 · 品牌馆 → 入驻门店", () => {
  it("⭐品牌馆页导航标题渲染为「入驻门店」（不再是「品牌馆」）", () => {
    (globalThis as { uni?: unknown }).uni = { getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }) };
    const w = mount(BrandHubPage, { global: { components: { "wd-toast": StubWdToast } } });
    expect(w.text()).toContain("入驻门店");
    expect(w.text()).not.toContain("品牌馆");
  });

  it("⭐pages.json 中 brandHub 的 navigationBarTitleText 与页面标题一致（含抖音系统栏）", () => {
    const pagesJson = read("src/pages.json");
    const at = pagesJson.indexOf('"path": "pages/brandHub/index"');
    expect(at).toBeGreaterThan(-1);
    const block = pagesJson.slice(at, pagesJson.indexOf("}", pagesJson.indexOf('"style"', at)));
    expect(block).toContain('"navigationBarTitleText": "入驻门店"');
    expect(block).not.toContain("品牌馆");
  });

  it("⭐首页悬浮球带无障碍文案 aria-label=「入驻门店」；视觉不变（仍是 home-btn + shop.svg 图标，无新增文字节点）", () => {
    const src = read("src/pages/index/index.vue");
    const m = /<view\s+v-if="brandHubOn"([\s\S]*?)>\s*<image class="home-btn-icon"[^>]*\/>\s*<\/view>/.exec(src);
    expect(m, "悬浮球结构").not.toBeNull();
    expect(m![1]).toContain('aria-label="入驻门店"');
    expect(m![1]).toContain('class="home-btn"');
    expect(src).toContain('src="/static/iconpark/shop.svg"');
  });

  it("⭐用户可见源码（去注释后）不再出现「品牌馆」：brandHub 页、首页、pages.json", () => {
    for (const f of ["src/pages/brandHub/index.vue", "src/pages/index/index.vue", "src/pages.json"]) {
      const code = f.endsWith(".json") ? read(f).replace(/^\s*\/\/.*$/gm, "") : strip(read(f));
      expect(code, f).not.toContain("品牌馆");
    }
  });

  it("⭐内部命名/数据键不改：brand_hub、brandHub 路径、goBrandHub 仍在", () => {
    expect(read("src/pages/index/index.vue")).toContain("/pages/brandHub/index");
    expect(read("src/pages/index/index.vue")).toContain("goBrandHub");
    expect(read("src/pages.json")).toContain('"path": "pages/brandHub/index"');
    expect(read("src/domain/brand-hub.ts")).toContain("brand_hub");
  });
});
