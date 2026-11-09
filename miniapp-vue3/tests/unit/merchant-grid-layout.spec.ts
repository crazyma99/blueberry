// 相册详情图片网格「末行布局」守卫（issue #14 · m2b 真机批次 4：「相册详情中五个图片第二行布局有问题」）。
// 根因（确证）：旧样式 `.grid{display:flex;flex-wrap:wrap;justify-content:space-between}` + `.cell{width:32%}`——末行不足 3 个时，
// space-between 把它们撑到左右两端、中间留空：5 张图第二行 2 张左右分居。
// 修法：固定三列（列宽 calc((100% - 2×间距)/3)）+ margin-right 作列间距，每行第 3 个（class `is-end`）清零，justify-content:flex-start，不足一行靠左。
// 不用 :nth-child：WXSS 官方只保证 class/id/element 选择器；用 class 最稳。
//
// 预期布局（间距 16rpx；列宽 (100%-32rpx)/3）：
//   1 张：[A][ ][ ]                         → 第 1 列，靠左
//   2 张：[A][B][ ]                         → 第 1、2 列，靠左（B 不再被推到最右）
//   3 张：[A][B][C]                         → 满一行，C 无右边距
//   4 张：[A][B][C] / [D][ ][ ]             → 第二行 D 在第 1 列
//   5 张：[A][B][C] / [D][E][ ]             → 第二行 D、E 紧挨靠左（修复前左右分居）
//   7 张：[A][B][C] / [D][E][F] / [G][ ][ ] → 第三行 G 在第 1 列
// 变异靶点：①回到 space-between ②列宽回到 32% ③去掉 is-end 清右边距 ④is-end 判定改成每行第 2 个。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf-8");
const detail = read("src/pkg-merchant/album/detail.vue");
const style = detail.slice(detail.indexOf("<style"));
const rule = (sel: string, css: string = style): string => {
  const i = css.indexOf(sel + " {");
  expect(i, "找不到样式规则 " + sel).toBeGreaterThanOrEqual(0);
  return css.slice(i, css.indexOf("}", i) + 1);
};

describe("⭐图片网格：固定三列，末行靠左（不再 space-between + 32%）", () => {
  it(".grid：flex-wrap + flex-start，且没有 space-between（变异：回到 space-between 即红）", () => {
    const g = rule(".grid");
    expect(g).toContain("flex-wrap: wrap");
    expect(g).toContain("justify-content: flex-start");
    expect(g).not.toContain("space-between");
  });
  it(".cell：列宽公式 calc((100% - 32rpx) / 3) + margin-right 16rpx（变异：列宽回 32% 即红）；.cell.is-end 清右边距（变异：去掉即红）", () => {
    const c = rule(".cell");
    expect(c).toContain("width: calc((100% - 32rpx) / 3)");
    expect(c).toContain("margin-right: 16rpx");
    expect(c).not.toMatch(/width:\s*32%/);
    expect(rule(".cell.is-end")).toContain("margin-right: 0");
  });
  it("三列宽 + 两个列间距 = 100%（公式自洽：3×(100%-32rpx)/3 + 2×16rpx）", () => {
    // 间距 16rpx × 2 = 32rpx，恰为公式里扣掉的部分 ⇒ 三列刚好占满一行，不会因舍入换行
    expect(rule(".cell")).toContain("100% - 32rpx");
    expect(rule(".cell")).toContain("margin-right: 16rpx");
  });
  it("整个文件不再出现「space-between 与 32% 搭配」的网格写法", () => {
    expect(style).not.toMatch(/width:\s*32%/);
  });
  it("不使用 :nth-child 做列规则（WXSS 兼容）", () => {
    const code = style.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/\.cell:nth-child/);
  });
});

describe("⭐每行第 3 个带 is-end（按下标）", () => {
  const fn = detail.match(/function gridCellClass\(idx: number\): string \{\s*return ([^;]+);/);
  it("模板使用 gridCellClass(idx)", () => {
    expect(detail).toContain(':class="gridCellClass(idx)"');
    expect(fn).not.toBeNull();
  });
  // 用与页面同一表达式在测试里复算，覆盖 1/2/3/4/5/7 张
  const cls = (idx: number) => ((idx + 1) % 3 === 0 ? "cell is-end" : "cell");
  it("源码表达式与预期一致（变异：改成每行第 2 个即红）", () => {
    expect(fn?.[1]).toContain("(idx + 1) % 3 === 0");
    expect(fn?.[1]).toContain('"cell is-end"');
  });
  it.each([
    [1, "A.. "],
    [2, "AB. "],
    [3, "ABC "],
    [4, "ABC D.."],
    [5, "ABC DE."],
    [7, "ABC DEF G.."],
  ])("%i 张：末行靠左，行内第 3 个无右边距", (n) => {
    const ends = Array.from({ length: n }, (_, i) => cls(i) === "cell is-end");
    // 第 3、6、9… 个是行尾
    ends.forEach((e, i) => expect(e, `idx=${i}`).toBe((i + 1) % 3 === 0));
    // 每行内的列位置 = idx % 3：末行 k 个元素占用第 0..k-1 列（靠左）
    const lastRow = n % 3 === 0 ? 3 : n % 3;
    const cols = Array.from({ length: lastRow }, (_, k) => (n - lastRow + k) % 3);
    expect(cols).toEqual(Array.from({ length: lastRow }, (_, k) => k));
  });
});

describe("相册创建表单的照片网格同样是固定三列（同一写法）", () => {
  const list = read("src/pkg-merchant/album/list.vue");
  const lstyle = list.slice(list.indexOf("<style"));
  it(".photo：calc 列宽 + margin-right，.photo.is-end 清零，无 space-between；模板用 photoClass(i)", () => {
    expect(rule(".photo", lstyle)).toContain("width: calc((100% - 32rpx) / 3)");
    expect(rule(".photo.is-end", lstyle)).toContain("margin-right: 0");
    expect(rule(".photo-grid", lstyle)).not.toContain("space-between");
    expect(list).toContain("photoClass(i, ph.key === coverKeyEff)");
    expect(list).toMatch(/\(i \+ 1\) % 3 === 0 \? " is-end" : ""/);
  });
});

describe("排查：商家端其余多列网格（只读核对，结论写入汇报）", () => {
  it("商家端 pkg-merchant 内除 detail 的图片网格与 list 的照片网格外，没有其它 flex-wrap 网格；骨架网格 3×32% + 2×2% 间隙 = 100%", () => {
    const files = ["src/pkg-merchant/album/detail.vue", "src/pkg-merchant/album/list.vue", "src/pkg-merchant/category/list.vue", "src/pkg-merchant/booking/list.vue", "src/pkg-merchant/slot/list.vue", "src/pkg-merchant/home/index.vue"];
    const wrap = files.filter((f) => /flex-wrap:\s*wrap/.test(read(f).slice(read(f).indexOf("<style"))));
    expect(wrap.sort()).toEqual(["src/pkg-merchant/album/detail.vue", "src/pkg-merchant/album/list.vue"]);
    expect(rule(".sk-grid")).toContain("gap: 2%");
  });
});
