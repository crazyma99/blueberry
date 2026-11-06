// 底部 Tab 图标规范守卫（到店预约 Tab，2026-11-06）：四个 Tab × 线性/面性两态 = 8 个 SVG，
// 统一 IconPark 画布与描边规范（手绘仿 IconPark 风格，非官方库文件）：
//   48×48 画布；描边 4、圆角端点/拐角；仅品牌金 #F1CD91 与页面底色 #160F04 两色；
//   线性态不铺面（除价目表的小圆孔点），面性态必须铺品牌金底面。
// custom-tab-bar 引用文件存在性见 tab-bar-consistency.spec.ts。
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const dir = resolve(root, "src/static/iconpark");
const TABS = ["home", "booking", "price", "mine"] as const;
const GOLD = "#F1CD91";
const DARK = "#160F04";

const read = (name: string) => readFileSync(resolve(dir, name), "utf-8");

describe("Tab 图标：四枚 × 两态规范", () => {
  for (const tab of TABS) {
    for (const [state, file] of [
      ["线性（未选中）", `${tab}.svg`],
      ["面性（选中）", `${tab}-filled.svg`],
    ] as const) {
      it(`${file}（${state}）：48×48 画布、描边 4、圆角、仅两色`, () => {
        expect(existsSync(resolve(dir, file)), file + " 存在").toBe(true);
        const svg = read(file);
        expect(svg).toContain('width="48" height="48" viewBox="0 0 48 48"');
        const widths = new Set([...svg.matchAll(/stroke-width="([^"]+)"/g)].map((m) => m[1]));
        expect([...widths]).toEqual(["4"]);
        expect(svg).toContain('stroke-linejoin="round"');
        const colors = new Set([...svg.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase()));
        for (const c of colors) expect([GOLD, DARK], file + " 颜色 " + c).toContain(c);
        expect(colors.has(GOLD), file + " 含品牌金").toBe(true);
      });
    }
    it(`${tab}：面性态铺品牌金底面；线性态不铺大面（最多一个 r≤3 的圆孔点）`, () => {
      expect(read(`${tab}-filled.svg`)).toContain(`fill="${GOLD}" stroke="${GOLD}"`);
      const outline = read(`${tab}.svg`);
      const fills = [...outline.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)];
      expect(fills.length).toBeLessThanOrEqual(1);
      if (fills.length === 1) expect(outline).toMatch(/<circle[^>]*r="3"[^>]*fill="#F1CD91"/);
    });
  }

  it("price.svg / mine.svg 另被 priceList 占位图与头像占位（AVATAR_PLACEHOLDER）复用：同名文件必须保持有效", () => {
    expect(existsSync(resolve(dir, "price.svg"))).toBe(true);
    expect(existsSync(resolve(dir, "mine.svg"))).toBe(true);
    expect(readFileSync(resolve(root, "src/domain/avatar-url.ts"), "utf-8")).toContain("/static/iconpark/mine.svg");
    expect(readFileSync(resolve(root, "src/pages/priceList/index.vue"), "utf-8")).toContain("/static/iconpark/price.svg");
  });
});
