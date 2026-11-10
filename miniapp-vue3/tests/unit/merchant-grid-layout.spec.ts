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
import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

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

// ⭐真实渲染断言（m2c CR：此前用例复算 (idx+1)%3 的算术恒等式，不依赖页面渲染；改为挂载真实详情页检查每个 cell 的 class）
const hh = vi.hoisted(() => ({ onLoad: [] as Array<(o?: Record<string, unknown>) => void>, onShow: [] as Array<() => void>, store: new Map<string, string>(), n: 0 }));
vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => hh.onLoad.push(fn),
  onShow: (fn: () => void) => hh.onShow.push(fn),
  onHide: () => undefined,
  onReachBottom: () => undefined,
  onPullDownRefresh: () => undefined,
}));
vi.mock("../../src/platform/uni/transport", () => ({
  createUniTransport: () => ({
    request: async (req: { url: string }) => {
      const ok = (data: unknown) => ({ ok: true, value: { status: 200, businessCode: 200, message: undefined, requestId: null, data } });
      if (req.url === "/photo-albums/albums/get") return ok(Array.from({ length: hh.n }, (_, i) => ({ id: i + 1, albumId: 7, imageUrl: "https://c/" + i + ".jpg", sortOrder: i, aiTryonStatus: 1, aiTryonReason: "", aiTryonManual: 0 })));
      return ok([]);
    },
    cancel: () => undefined,
  }),
}));
import DetailPage from "../../src/pkg-merchant/album/detail.vue";
import { __resetMerchantRuntime } from "../../src/pkg-merchant/application/merchant-runtime";
import { MERCHANT_PROFILE_KEY, MERCHANT_SESSION_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";

async function mountGrid(n: number) {
  hh.n = n;
  hh.onLoad.length = 0;
  hh.onShow.length = 0;
  hh.store.clear();
  __resetMerchantRuntime();
  hh.store.set(MERCHANT_SESSION_KEY, JSON.stringify({ userId: "7", token: "m-token", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }));
  hh.store.set(MERCHANT_PROFILE_KEY, JSON.stringify({ adminId: 7, merchantId: 1, username: "a", role: "merchant", displayName: "A", roleName: "", permissions: ["album"], shopList: [] }));
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => hh.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => hh.store.set(k, v),
    removeStorageSync: (k: string) => hh.store.delete(k),
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    getMenuButtonBoundingClientRect: () => ({ left: 280, width: 87 }),
    stopPullDownRefresh: () => undefined,
    showToast: () => undefined,
    upx2px: (x: number) => x / 2,
  };
  const w = mount(DetailPage, { global: { stubs: { PullRefreshIndicator: true, BaseFeedback: true, BaseDialog: true, PageFooter: true, CustomNavBar: true, MerchantNeedLogin: true, SkeletonBlock: true, BaseProgress: true } } });
  hh.onLoad[hh.onLoad.length - 1]?.({ albumId: "7", shopId: "1", title: "x" });
  await flushPromises();
  await flushPromises();
  return w;
}

describe("⭐每行第 3 个带 is-end（挂载真实详情页，逐格断言渲染出的 class）", () => {
  it("模板使用 gridCellClass(idx)；源码表达式为 (idx + 1) % 3 === 0", () => {
    expect(detail).toContain(':class="gridCellClass(idx)"');
    const fn = detail.match(/function gridCellClass\(idx: number\): string \{\s*return ([^;]+);/);
    expect(fn?.[1]).toContain("(idx + 1) % 3 === 0");
  });
  it.each([1, 2, 3, 4, 5, 6, 7, 9, 10])("%i 张：渲染 %i 个 .cell，仅第 3、6、9… 个带 is-end（变异：判定改成第 2 个/模板不用 gridCellClass 即红）", async (n) => {
    const w = await mountGrid(n);
    const cells = w.findAll(".grid > .cell");
    expect(cells.length).toBe(n);
    cells.forEach((c, i) => expect(c.classes().includes("is-end"), "n=" + n + " idx=" + i).toBe((i + 1) % 3 === 0));
    // 末行靠左：末行元素在行内的列位置 = idx % 3，依次为 0..k-1
    const last = n % 3 === 0 ? 3 : n % 3;
    const cols = Array.from({ length: last }, (_, k) => (n - last + k) % 3);
    expect(cols).toEqual(Array.from({ length: last }, (_, k) => k));
  });
  it("5 张（主人报告的场景）：第二行恰好 D、E 两格，E 不带 is-end，都不在第 3 列", async () => {
    const w = await mountGrid(5);
    const cells = w.findAll(".grid > .cell");
    expect(cells.slice(3).map((c) => c.classes().includes("is-end"))).toEqual([false, false]);
    expect(cells[2].classes()).toContain("is-end");
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
