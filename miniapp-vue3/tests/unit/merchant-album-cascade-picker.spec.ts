// 相册页分类选择改为级联（一级 → 二级）+ 真实 BasePicker/wd-picker-view 联动（issue #14 · m2b 真机批次 1）。
// 本文件把真实相册页、真实 BasePicker、真实 wot wd-picker-view 串起来，仅替换「无宿主的原生 picker-view 标签」与 BasePopup 层（等价透传插槽），
// 用原生 picker-view 的真实 change 载荷 { detail: { value: [行号...] } } 驱动——修复前这条链路因载荷解包错误，确认永远不生效。
// 变异靶点：①所属分类仍用平铺 ②页面按 Number(v[0]) 解包（取到的是一级 id）③筛选「全部分类」不能选回 ④没有二级的一级出现在选项里。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

const hh = vi.hoisted(() => ({
  onLoad: [] as Array<(o?: Record<string, unknown>) => void>,
  onShow: [] as Array<() => void>,
  store: new Map<string, string>(),
  albumQueries: [] as Array<Record<string, string> | undefined>,
}));
vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => hh.onLoad.push(fn),
  onShow: (fn: () => void) => hh.onShow.push(fn),
  onHide: () => undefined,
  onReachBottom: () => undefined,
  onPullDownRefresh: () => undefined,
}));
const cat = (id: number, name: string, parentId = 0) => ({ id, name, sortOrder: 0, shopId: 1, parentId, depth: (parentId === 0 ? 1 : 2) as 1 | 2 });
vi.mock("../../src/platform/uni/transport", () => ({
  createUniTransport: () => ({
    request: async (req: { url: string; query?: Record<string, string> }) => {
      const ok = (data: unknown) => ({ ok: true, value: { status: 200, businessCode: 200, message: undefined, requestId: null, data } });
      if (req.url === "/shop/parent/list") return ok([cat(5, "外景"), cat(6, "内景"), cat(7, "空一级")]);
      if (req.url === "/shop/sub/get-by-parent") {
        const p = req.query?.parentId;
        return ok(p === "5" ? [cat(9, "海边", 5), cat(10, "古城", 5)] : p === "6" ? [cat(11, "影棚", 6)] : []);
      }
      if (req.url === "/photo-albums/photo") {
        hh.albumQueries.push(req.query);
        return ok([]);
      }
      return ok({});
    },
    cancel: () => undefined,
  }),
}));

import AlbumListPage from "../../src/pkg-merchant/album/list.vue";
import BasePicker from "../../src/ui/BasePicker.vue";
import WdPickerView from "../../node_modules/@wot-ui/ui/components/wd-picker-view/wd-picker-view.vue";
import { __resetMerchantRuntime } from "../../src/pkg-merchant/application/merchant-runtime";
import { MERCHANT_PROFILE_KEY, MERCHANT_SESSION_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";
import { buildCategoryTree, cascadeFilterOptions, cascadePathOfSub, cascadeSubOptions, subIdFromCascadeValue } from "../../src/pkg-merchant/domain/merchant-category-tree";

const PopupSpy = defineComponent({ name: "BasePopup", props: ["show", "position", "zIndex", "rootPortal"], emits: ["cancel", "update:show"], setup: (p, { slots }) => () => (p.show ? h("div", { class: "popup-spy" }, slots.default?.()) : null) });
const PV = defineComponent({ name: "picker-view", emits: ["change", "pickstart", "pickend"], setup: (_p, { slots }) => () => h("div", { class: "native-picker-view" }, slots.default?.()) });
const PVC = defineComponent({ name: "picker-view-column", setup: (_p, { slots }) => () => h("div", { class: "native-picker-view-column" }, slots.default?.()) });
const Block = defineComponent({ name: "block", setup: (_p, { slots }) => () => slots.default?.() });
const GLOBAL = {
  components: { "wd-picker-view": WdPickerView, "picker-view": PV, "picker-view-column": PVC, block: Block },
  stubs: { PullRefreshIndicator: true, BaseFeedback: true, BaseDialog: true, PageFooter: true, CustomNavBar: true, MerchantNeedLogin: true, BasePopup: PopupSpy, BaseField: true, BaseProgress: true },
};

beforeEach(() => {
  hh.onLoad.length = 0;
  hh.onShow.length = 0;
  hh.store.clear();
  hh.albumQueries.length = 0;
  __resetMerchantRuntime();
  hh.store.set(MERCHANT_SESSION_KEY, JSON.stringify({ userId: "7", token: "m-token", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }));
  hh.store.set(MERCHANT_PROFILE_KEY, JSON.stringify({ adminId: 7, merchantId: 1, username: "a", role: "merchant", displayName: "A", roleName: "", permissions: ["album", "category"], shopList: [{ id: 1, name: "A店", merchantName: "", status: 1 }] }));
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => hh.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => hh.store.set(k, v),
    removeStorageSync: (k: string) => hh.store.delete(k),
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    getMenuButtonBoundingClientRect: () => ({ left: 280, width: 87 }),
    stopPullDownRefresh: () => undefined,
    showToast: () => undefined,
    upx2px: (n: number) => n / 2,
  };
});

async function mountPage() {
  const w = mount(AlbumListPage, { global: GLOBAL });
  hh.onLoad[hh.onLoad.length - 1]?.();
  await flushPromises();
  await flushPromises();
  return w;
}
const picker = (w: ReturnType<typeof mount>, title: string) => w.findAllComponents(BasePicker).find((p) => p.props("title") === title)!;
async function scroll(w: ReturnType<typeof mount>, title: string, rows: number[]) {
  const p = picker(w, title);
  p.findComponent(PV).vm.$emit("change", { detail: { value: rows } });
  await flushPromises();
  await flushPromises();
}
async function confirm(w: ReturnType<typeof mount>, title: string) {
  await picker(w, title).find(".base-picker-sheet__bar > view:last-of-type").trigger("click");
  await flushPromises();
}

describe("领域：树 → 级联选项（纯函数）", () => {
  const tree = buildCategoryTree([cat(5, "外景"), cat(6, "内景"), cat(7, "空一级")], { 5: [cat(9, "海边", 5), cat(10, "古城", 5)], 6: [cat(11, "影棚", 6)], 7: [] });
  it("cascadeSubOptions：一级→二级；没有二级的一级不出现（变异：空一级出现即红）", () => {
    expect(cascadeSubOptions(tree)).toEqual([
      { label: "外景", value: 5, children: [{ label: "海边", value: 9 }, { label: "古城", value: 10 }] },
      { label: "内景", value: 6, children: [{ label: "影棚", value: 11 }] },
    ]);
  });
  it("cascadeFilterOptions：首项「全部分类」(0, 无下级) + 级联", () => {
    const f = cascadeFilterOptions(tree);
    expect(f[0]).toEqual({ label: "全部分类", value: 0, children: [] });
    expect(f.length).toBe(3);
  });
  it("cascadePathOfSub / subIdFromCascadeValue", () => {
    expect(cascadePathOfSub(tree, 10)).toEqual([5, 10]);
    expect(cascadePathOfSub(tree, 0)).toEqual([]);
    expect(cascadePathOfSub(tree, 999)).toEqual([]);
    expect(subIdFromCascadeValue([5, 10])).toBe(10);
    expect(subIdFromCascadeValue([0])).toBe(0);
    expect(subIdFromCascadeValue([5])).toBeNull(); // 只选了一级且无下级：非法
    expect(subIdFromCascadeValue([])).toBeNull();
    expect(subIdFromCascadeValue(["x"])).toBeNull();
  });
});

describe("⭐页面 × 真实 BasePicker × 真实 wd-picker-view：所属分类级联选择后点「确定」生效", () => {
  it("新建相册 → 所属分类：两列(一级/二级)；滚到 外景/古城 → 确定 ⇒ 表单显示「外景 / 古城」（变异：页面按 v[0] 解包/仍平铺即红）", async () => {
    const w = await mountPage();
    await w.find(".add").trigger("click");
    await flushPromises();
    expect(w.find(".sheet").exists()).toBe(true);
    await w.find(".pick-row").trigger("click");
    await flushPromises();
    const p = picker(w, "所属分类");
    expect(p.props("cascade")).toBe(true);
    expect(p.props("zIndex")).toBe(2100); // 默认值，高于新建相册 sheet 的 2000
    // 选项里没有「空一级」
    const opts = p.props("options") as Array<{ label: string }>;
    expect(opts.map((o) => o.label)).toEqual(["外景", "内景"]);
    // 真实 wd-picker-view：一级 2 行 + 二级(外景下)2 行
    expect(p.findAll(".native-picker-view-column").length).toBe(2);
    await scroll(w, "所属分类", [0, 1]); // 外景 / 古城
    await confirm(w, "所属分类");
    expect(w.find(".pick-value").text()).toBe("外景 / 古城");
  });
  it("改选一级 内景 → 二级自动为 影棚；确定 ⇒ 「内景 / 影棚」", async () => {
    const w = await mountPage();
    await w.find(".add").trigger("click");
    await flushPromises();
    await w.find(".pick-row").trigger("click");
    await flushPromises();
    await scroll(w, "所属分类", [1, 0]);
    await confirm(w, "所属分类");
    expect(w.find(".pick-value").text()).toBe("内景 / 影棚");
  });
  it("⭐受控值定位：已选 内景/影棚 后再次打开所属分类，直接确定仍是「内景 / 影棚」（不被重置为首项）（变异：受控路径恒空即红）", async () => {
    const w = await mountPage();
    await w.find(".add").trigger("click");
    await flushPromises();
    await w.find(".pick-row").trigger("click");
    await flushPromises();
    await scroll(w, "所属分类", [1, 0]);
    await confirm(w, "所属分类");
    expect(w.find(".pick-value").text()).toBe("内景 / 影棚");
    expect(picker(w, "所属分类").props("modelValue")).toEqual([6, 11]);
    await w.find(".pick-row").trigger("click");
    await flushPromises();
    await confirm(w, "所属分类");
    expect(w.find(".pick-value").text()).toBe("内景 / 影棚");
  });
  it("⭐按分类筛选：级联；选 外景/海边 ⇒ 相册请求带 child_id=9；再选「全部分类」⇒ 不带 child_id（变异：全部不能选回即红）", async () => {
    const w = await mountPage();
    hh.albumQueries.length = 0;
    await w.find(".filter").trigger("click");
    await flushPromises();
    const p = picker(w, "按分类筛选");
    expect(p.props("cascade")).toBe(true);
    expect((p.props("options") as Array<{ label: string }>)[0].label).toBe("全部分类");
    // 初始是「全部分类」(无下级) ⇒ 真实 wot 只铺 1 列，原生 picker-view 此时只会上报 1 个行号：滚到第 2 行（外景）后 wot 才铺出二级列并默认首项(海边)
    await scroll(w, "按分类筛选", [1]);
    await confirm(w, "按分类筛选");
    await flushPromises();
    expect(hh.albumQueries.at(-1)?.child_id).toBe("9");
    expect(w.find(".filter-text").text()).toContain("外景 / 海边");
    // 再打开：受控值应定位到 [5,9]；滚回「全部分类」
    await w.find(".filter").trigger("click");
    await flushPromises();
    await scroll(w, "按分类筛选", [0, 0]); // 此时是 2 列（外景/海边）；第 1 列滚回「全部分类」
    await confirm(w, "按分类筛选");
    await flushPromises();
    expect(hh.albumQueries.at(-1)?.child_id).toBeUndefined();
    expect(w.find(".filter-text").text()).toContain("全部分类");
  });
});
