// BasePicker 门面（issue #14 · m2b 真机批次 1）：真实 wot 载荷驱动 + 源码级契约守卫 + 级联。
// 教训：此前门面测试用「自造桩」（桩 emit('confirm', ['stub-value']) 的数组），而真实 wd-picker 的确认载荷是对象
// `{ value, selectedItems }`——桩与真实形状不一致，门面按数组解包 ⇒ 真机「选中后点完成」永远回传 []，测试却全绿。
// 本文件：①直接挂**真实 wd-picker-view**（wot 源码，非桩），用原生 picker-view 的真实 change 事件载荷 `{detail:{value:[行号...]}}` 驱动；
//        ②读 wot 源码断言关键形状仍存在（wot 升级后会红）；③级联、层级、主题、回归（旧对象载荷不得再被当数组）。
// 变异靶点：①门面按错误载荷解包（读 .value 而非 getSelectedValues）②confirm 不带 labels ③级联不补全默认路径 ④z-index 退回 15 ⑤cascade 不透传
//          ⑥级联树首项丢 children 键 ⑦主题样式不注入 ⑧抖音级联改一级不重置二级。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import BasePicker from "../../src/ui/BasePicker.vue";
import WdPickerView from "../../node_modules/@wot-ui/ui/components/wd-picker-view/wd-picker-view.vue";
import { setUiPlatformOverride } from "../../src/ui/ui-platform";
import { PICKER_VIEW_THEME_STYLE, PICKER_Z_INDEX, childrenOfValue, completeCascadePath, labelsOfPath } from "../../src/ui/picker-util";

const root = resolve(__dirname, "../..");
const wot = (p: string) => readFileSync(resolve(root, "node_modules/@wot-ui/ui/components", p), "utf-8");

afterEach(() => setUiPlatformOverride(null));

/** BasePopup 替身：只在 show 时渲染插槽，并把收到的 props 暴露出来（层级断言用）；不使用 wd-popup（其 root-portal 依赖 uni 运行时） */
const PopupSpy = defineComponent({
  name: "BasePopup",
  props: ["show", "position", "zIndex", "rootPortal"],
  emits: ["cancel", "update:show"],
  setup(p, { slots, emit }) {
    return () => (p.show ? h("div", { class: "popup-spy", "data-z": String(p.zIndex), "data-portal": String(p.rootPortal), "data-pos": String(p.position) }, [slots.default?.(), h("button", { class: "popup-spy-mask", onClick: () => { emit("update:show", false); emit("cancel"); } })]) : null);
  },
});
// 原生 picker-view / picker-view-column 在 vitest 里无宿主：用透明容器，真实 wd-picker-view 的模板与逻辑照常运行
const PV = defineComponent({ name: "picker-view", emits: ["change", "pickstart", "pickend"], setup: (_p, { slots }) => () => h("div", { class: "native-picker-view" }, slots.default?.()) });
const PVC = defineComponent({ name: "picker-view-column", setup: (_p, { slots }) => () => h("div", { class: "native-picker-view-column" }, slots.default?.()) });

// <block> 是小程序模板的透明包裹标签（wd-picker-view 模板用到），vitest 无宿主 ⇒ 透明替身
const Block = defineComponent({ name: "block", setup: (_p, { slots }) => () => slots.default?.() });

const GLOBAL = { components: { "wd-picker-view": WdPickerView, "picker-view": PV, "picker-view-column": PVC, block: Block }, stubs: { BasePopup: PopupSpy } };

/** 模拟用户滚动：原生 picker-view 的真实 change 载荷 ＝ { detail: { value: [每列选中行号] } }（微信文档；wd-picker-view.onChange 解构 detail.value） */
async function scrollTo(w: ReturnType<typeof mount>, rows: number[]) {
  const view = w.findComponent(PV);
  view.vm.$emit("change", { detail: { value: rows } });
  await flushPromises();
  await flushPromises();
}

const flat = [
  { label: "红河水乡店", value: 1 },
  { label: "昆明店", value: 2 },
  { label: "大理店", value: 3 },
];
const tree = [
  { label: "外景", value: 5, children: [{ label: "海边", value: 9 }, { label: "古城", value: 10 }] },
  { label: "内景", value: 6, children: [{ label: "影棚", value: 11 }] },
];

describe("⭐真实 wd-picker-view 驱动：选中后点「确定」必须回传选中值（旧门面永远回传 []）", () => {
  it("平铺：滚到第 2 项 → 确定 ⇒ confirm([2], ['昆明店']) 且关闭（变异：门面按错误载荷解包即红）", async () => {
    const w = mount(BasePicker, { props: { show: true, options: flat, modelValue: [1] }, global: GLOBAL });
    await flushPromises();
    await scrollTo(w, [1]);
    await w.find(".base-picker-sheet__btn:last-child, .base-picker-sheet__bar > view:last-of-type").trigger("click");
    await flushPromises();
    expect(w.emitted("confirm")?.[0]).toEqual([[2], ["昆明店"]]);
    expect(w.emitted("update:show")?.[0]).toEqual([false]);
  });
  it("不滚动直接确定 ⇒ 回传当前受控值（不是空数组）", async () => {
    const w = mount(BasePicker, { props: { show: true, options: flat, modelValue: [3] }, global: GLOBAL });
    await flushPromises();
    await w.find(".base-picker-sheet__bar > view:last-of-type").trigger("click");
    await flushPromises();
    expect(w.emitted("confirm")?.[0]).toEqual([[3], ["大理店"]]);
  });
  it("无受控值时默认选中首项（同 wot 行为）：直接确定 ⇒ 回传首项", async () => {
    const w = mount(BasePicker, { props: { show: true, options: flat, modelValue: [] }, global: GLOBAL });
    await flushPromises();
    await w.find(".base-picker-sheet__bar > view:last-of-type").trigger("click");
    await flushPromises();
    expect(w.emitted("confirm")?.[0]).toEqual([[1], ["红河水乡店"]]);
  });
  it("旧调用方只收第一个参数：confirm 的第一个参数仍是纯值数组（数字保持数字）", async () => {
    const w = mount(BasePicker, { props: { show: true, options: flat, modelValue: [2] }, global: GLOBAL });
    await flushPromises();
    await w.find(".base-picker-sheet__bar > view:last-of-type").trigger("click");
    await flushPromises();
    const first = w.emitted("confirm")?.[0]?.[0] as unknown[];
    expect(Array.isArray(first)).toBe(true);
    expect(first).toEqual([2]);
    expect(typeof first[0]).toBe("number");
  });
  it("滚动中点确定：挂起，等 pickend 后再确认（不读到未更新的值）", async () => {
    const w = mount(BasePicker, { props: { show: true, options: flat, modelValue: [1] }, global: GLOBAL });
    await flushPromises();
    const view = w.findComponent(PV);
    view.vm.$emit("pickstart");
    await flushPromises();
    await w.find(".base-picker-sheet__bar > view:last-of-type").trigger("click");
    expect(w.emitted("confirm")).toBeUndefined();
    await scrollTo(w, [2]);
    view.vm.$emit("pickend");
    await flushPromises();
    expect(w.emitted("confirm")?.[0]).toEqual([[3], ["大理店"]]);
  });
  it("取消 ⇒ cancel + 关闭；遮罩点击 ⇒ cancel + 关闭（各一次）", async () => {
    const w = mount(BasePicker, { props: { show: true, options: flat, modelValue: [1] }, global: GLOBAL });
    await flushPromises();
    await w.find(".base-picker-sheet__bar > view:first-of-type").trigger("click");
    expect(w.emitted("cancel")?.length).toBe(1);
    expect(w.emitted("update:show")?.[0]).toEqual([false]);
    await w.find(".popup-spy-mask").trigger("click");
    expect(w.emitted("cancel")?.length).toBe(2);
  });
});

describe("⭐级联（一级 → 二级）：路径数组 + label 路径", () => {
  it("树形 options + cascade：默认定位到受控值所属一级；滚到二级后确定 ⇒ [一级值, 二级值]（变异：cascade 不透传即红）", async () => {
    const w = mount(BasePicker, { props: { show: true, options: tree, modelValue: [5, 10], cascade: true }, global: GLOBAL });
    await flushPromises();
    // 真实 wd-picker-view 铺出两列：一级(2) + 二级(外景下 2 项)
    expect(w.findAll(".native-picker-view-column").length).toBe(2);
    expect(w.text()).toContain("古城");
    await w.find(".base-picker-sheet__bar > view:last-of-type").trigger("click");
    await flushPromises();
    expect(w.emitted("confirm")?.[0]).toEqual([[5, 10], ["外景", "古城"]]);
  });
  it("切换一级 ⇒ 二级列刷新并默认第一个；确定回传新路径", async () => {
    const w = mount(BasePicker, { props: { show: true, options: tree, modelValue: [5, 9], cascade: true }, global: GLOBAL });
    await flushPromises();
    await scrollTo(w, [1, 0]); // 第 1 列滚到「内景」
    await w.find(".base-picker-sheet__bar > view:last-of-type").trigger("click");
    await flushPromises();
    expect(w.emitted("confirm")?.[0]).toEqual([[6, 11], ["内景", "影棚"]]);
  });
  it("⭐空受控值也补全默认路径（wot 对空值只铺第一列）：直接确定 ⇒ [首个一级, 其首个二级]（变异：不补全即红）", async () => {
    const w = mount(BasePicker, { props: { show: true, options: tree, modelValue: [], cascade: true }, global: GLOBAL });
    await flushPromises();
    await w.find(".base-picker-sheet__bar > view:last-of-type").trigger("click");
    await flushPromises();
    expect(w.emitted("confirm")?.[0]).toEqual([[5, 9], ["外景", "海边"]]);
  });
  it("⭐传给 wot 的树首项必带 children 键（wot 以 `childrenKey in columns[0]` 判定树形；缺则级联失效）（变异：丢 children 键即红）", async () => {
    const noChildren = [{ label: "单级", value: 1 }, { label: "另一个", value: 2 }];
    const w = mount(BasePicker, { props: { show: true, options: noChildren, modelValue: [], cascade: true }, global: GLOBAL });
    await flushPromises();
    const cols = w.findComponent(WdPickerView).props("columns") as Array<Record<string, unknown>>;
    expect("children" in cols[0]).toBe(true);
  });
  it("不改调用方传入的 options（深拷贝后再交给 wot）", async () => {
    const opts = JSON.parse(JSON.stringify(tree));
    const before = JSON.stringify(opts);
    mount(BasePicker, { props: { show: true, options: opts, modelValue: [], cascade: true }, global: GLOBAL });
    await flushPromises();
    expect(JSON.stringify(opts)).toBe(before);
  });
});

describe("纯函数：级联路径 / label 路径", () => {
  it("completeCascadePath：补全/纠偏", () => {
    expect(completeCascadePath(tree, [])).toEqual([5, 9]);
    expect(completeCascadePath(tree, [6])).toEqual([6, 11]);
    expect(completeCascadePath(tree, [5, 10])).toEqual([5, 10]);
    expect(completeCascadePath(tree, [999])).toEqual([5, 9]);
    expect(completeCascadePath(tree, [5, 999])).toEqual([5, 9]);
    expect(completeCascadePath([], [1])).toEqual([]);
    expect(completeCascadePath(flat, [2])).toEqual([2]);
  });
  it("labelsOfPath / childrenOfValue", () => {
    expect(labelsOfPath(tree, [6, 11])).toEqual(["内景", "影棚"]);
    expect(labelsOfPath(tree, [6, 999])).toEqual(["内景"]);
    expect(childrenOfValue(tree, 5).map((o) => o.value)).toEqual([9, 10]);
    expect(childrenOfValue(tree, 999)).toEqual([]);
    expect(childrenOfValue(tree, "5").length).toBe(2);
  });
});

describe("⭐层级：必须高于业务 sheet(2000)，从 sheet 内打开不被压住", () => {
  it("默认 z-index=2100（变异：退回 wot 默认 15 即红）；底部弹层；根传送默认开", async () => {
    const w = mount(BasePicker, { props: { show: true, options: flat, modelValue: [] }, global: GLOBAL });
    const spy = w.find(".popup-spy");
    expect(PICKER_Z_INDEX).toBe(2100);
    expect(spy.attributes("data-z")).toBe("2100");
    expect(spy.attributes("data-pos")).toBe("bottom");
    expect(spy.attributes("data-portal")).toBe("true");
    expect(Number(spy.attributes("data-z"))).toBeGreaterThan(2000);
  });
  it("zIndex / rootPortal 可由调用方覆盖", () => {
    const w = mount(BasePicker, { props: { show: true, options: flat, zIndex: 3000, rootPortal: false }, global: GLOBAL });
    expect(w.find(".popup-spy").attributes("data-z")).toBe("3000");
    expect(w.find(".popup-spy").attributes("data-portal")).toBe("false");
  });
  it("层级约定写在源码里：CustomNavBar 998 < BasePopup 1001 < 业务 sheet 2000 < BasePicker 2100（BasePopup 默认值与之相符）", () => {
    const popup = readFileSync(resolve(root, "src/ui/BasePopup.vue"), "utf-8");
    expect(popup).toMatch(/zIndex: 1001/);
    const picker = readFileSync(resolve(root, "src/ui/BasePicker.vue"), "utf-8");
    expect(picker).toContain("CustomNavBar 998");
    expect(picker).toContain("2100");
    // 页面里的自定义 sheet 都是 2000（商家端），picker 必须更高
    for (const f of ["src/pkg-merchant/album/list.vue", "src/pkg-merchant/category/list.vue"]) {
      for (const m of readFileSync(resolve(root, f), "utf-8").matchAll(/:z-index="(\d+)"/g)) expect(Number(m[1]), f).toBeLessThan(PICKER_Z_INDEX);
    }
  });
});

describe("⭐主题：深色金色（经 custom-style 注入 --wot-picker-view-*，数值取自 design token）", () => {
  it("主题样式含背景透明/文字金色/滚轮高亮，且被注入 wd-picker-view（变异：不注入即红）", async () => {
    const w = mount(BasePicker, { props: { show: true, options: flat, modelValue: [] }, global: GLOBAL });
    await flushPromises();
    expect(PICKER_VIEW_THEME_STYLE).toContain("--wot-picker-view-bg: transparent");
    expect(PICKER_VIEW_THEME_STYLE).toContain("--wot-picker-view-column-item-color: #F1CD91");
    expect(PICKER_VIEW_THEME_STYLE).toContain("--wot-picker-view-roller-bg:");
    expect(PICKER_VIEW_THEME_STYLE).toContain("rgba(38, 38, 38, 0.94)"); // 遮罩渐变取卡片色 #262626
    expect(w.findComponent(WdPickerView).props("customStyle")).toBe(PICKER_VIEW_THEME_STYLE);
    expect(w.find(".wd-picker-view").attributes("style") ?? "").toContain("--wot-picker-view-bg");
  });
  it("工具栏/卡片样式使用 token（SCSS 变量，不依赖 CSS 变量；抖音 TTSS 不支持）", () => {
    const src = readFileSync(resolve(root, "src/ui/BasePicker.vue"), "utf-8");
    const style = src.slice(src.indexOf("<style"));
    expect(style).toContain("background: $color-popup-card");
    expect(style).toMatch(/\.base-picker-sheet__btn-text--ok \{[^}]*color: \$color-action;/);
    expect(style).toMatch(/\.base-picker-sheet__title \{[^}]*color: \$color-text-strong/);
    expect(style).not.toMatch(/var\(--/);
  });
});

describe("抖音自绘分支：同合同；级联为左右两列", () => {
  it("平铺：点选 → 确定 ⇒ confirm([2], ['昆明店'])", async () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(BasePicker, { props: { show: true, options: flat, modelValue: [1] }, global: GLOBAL });
    const items = w.findAll(".base-picker-native__item");
    expect(items.length).toBe(3);
    await items[1].trigger("click");
    await w.find(".base-picker-native__btn--ok").trigger("click");
    expect(w.emitted("confirm")?.[0]).toEqual([[2], ["昆明店"]]);
    expect(w.emitted("update:show")?.[0]).toEqual([false]);
  });
  it("级联：左列一级 / 右列二级；改一级 ⇒ 二级重置为其首个孩子（变异：不重置即红）；确定回传 [一级, 二级]", async () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(BasePicker, { props: { show: true, options: tree, modelValue: [5, 10], cascade: true }, global: GLOBAL });
    expect(w.findAll(".base-picker-native__item:not(.base-picker-native__item--sub)").length).toBe(2);
    expect(w.findAll(".base-picker-native__item--sub").length).toBe(2); // 外景下 2 个
    await w.findAll(".base-picker-native__item--sub")[1].trigger("click"); // 古城(10) 已是当前，点它不变
    await w.findAll(".base-picker-native__item:not(.base-picker-native__item--sub)")[1].trigger("click"); // 改选「内景」
    expect(w.findAll(".base-picker-native__item--sub").length).toBe(1);
    expect(w.findAll(".base-picker-native__item--sub")[0].classes()).toContain("base-picker-native__item--active");
    await w.find(".base-picker-native__btn--ok").trigger("click");
    expect(w.emitted("confirm")?.[0]).toEqual([[6, 11], ["内景", "影棚"]]);
  });
  it("层级同样为 2100（style）", () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(BasePicker, { props: { show: true, options: flat }, global: GLOBAL });
    expect(w.find(".base-picker-native").attributes("style")).toContain("z-index: 2100");
  });
});

describe("清空入口不变", () => {
  it("clearable 且有值 → clear + update:modelValue []", async () => {
    const w = mount(BasePicker, { props: { show: false, options: flat, modelValue: [1], clearable: true }, global: GLOBAL });
    await w.find(".base-picker__clear").trigger("click");
    expect(w.emitted("clear")?.length).toBe(1);
    expect(w.emitted("update:modelValue")?.[0]).toEqual([[]]);
  });
});

describe("⭐wot 契约守卫（读源码；wot 升级改动关键形状后这里会红，提醒复核门面）", () => {
  it("wd-picker-view：expose 含 getSelectedValues/getSelectedLabels；change 载荷含 selectedValues；原生 change 取 detail.value", () => {
    const src = wot("wd-picker-view/wd-picker-view.vue");
    expect(src).toMatch(/defineExpose<PickerViewExpose>\(\{[\s\S]*getSelectedValues[\s\S]*getSelectedLabels/);
    expect(src).toContain("selectedValues: selectedValues.value");
    expect(src).toContain("function onChange({ detail: { value } }");
    expect(src).toMatch(/emit\('pickstart'\)/);
    expect(src).toMatch(/emit\('pickend'\)/);
  });
  it("wd-picker-view 级联：以 `childrenKey in firstItem` 判定树形；props 含 cascade/childrenKey/customStyle", () => {
    const sel = wot("wd-picker-view/useSelection.ts");
    expect(sel).toMatch(/childrenKey in firstItem/);
    expect(sel).toContain("function updateCascadeColumns");
    const types = wot("wd-picker-view/types.ts");
    expect(types).toContain("cascade: makeBooleanProp(false)");
    expect(types).toContain("childrenKey: makeStringProp('children')");
    expect(wot("wd-picker-view/wd-picker-view.vue")).toContain(":style=\"customStyle\"");
  });
  it("旧缺陷的证据：wd-picker 的 confirm 载荷是**对象** { value, selectedItems }（不是数组）——所以门面不再依赖它", () => {
    const src = wot("wd-picker/wd-picker.vue");
    expect(src).toMatch(/emit\('confirm', \{\s*value: values,\s*selectedItems: selects\s*\}\)/);
    const types = wot("wd-picker/types.ts");
    expect(types).toMatch(/zIndex: makeNumberProp\(15\)/); // 默认层级 15 ⇒ 会被 2000 的业务 sheet 压住
  });
  it("门面不再使用整个 wd-picker（避免对象载荷/层级 15/无法主题化三连坑）", () => {
    const src = readFileSync(resolve(root, "src/ui/BasePicker.vue"), "utf-8");
    const tpl = src.slice(src.indexOf("<template>"), src.indexOf("<style"));
    expect(tpl).not.toMatch(/<wd-picker[\s>]/);
    expect(tpl).toContain("<wd-picker-view");
  });
  it("wd-picker-view 的主题变量名仍存在于 wot 样式（注入的 --wot-picker-view-* 不是空设）", () => {
    const scss = wot("wd-picker-view/index.scss");
    for (const k of ["--wot-picker-view-bg", "--wot-picker-view-mask-start-color", "--wot-picker-view-mask-end-color", "--wot-picker-view-column-item-color", "--wot-picker-view-column-item-font-size", "--wot-picker-view-roller-bg", "--wot-picker-view-roller-border-radius", "--wot-picker-view-column-item-font-weight-active", "--wot-picker-view-column-item-disabled-color"]) {
      expect(scss, k).toContain(k);
      expect(PICKER_VIEW_THEME_STYLE, k).toContain(k);
    }
  });
});
