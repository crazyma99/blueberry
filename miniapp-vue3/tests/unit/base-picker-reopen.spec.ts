// BasePicker「滚动 → 取消 → 重开」回归（issue #14 · m2c CR 阻断）。
// 根因：真实 wd-popup/wd-transition 关闭只是 display:none（lazyRender 一旦 inited 后子节点常驻），wd-picker-view 随之常驻；
// 它的 watch 只在 columns 内容变化时才重建列，否则沿用上次滚动后 updateCascadeColumns 留下的旧列 ⇒ 重开后列与受控值错位。
// ⚠️ 以往测试里的 PopupSpy 在 show=false 时直接卸载插槽，**恰好掩盖**了该缺陷；本文件的 KeepPopup 与真实行为一致：首次打开后内容常驻、关闭仅隐藏。
// 修复：每次打开给 wd-picker-view 绑自增 :key 整体重建（先有 columns 再有 modelValue）；picking 加 800ms 兜底（pickend 丢失不卡死「确定」）。
// 变异靶点：去掉 :key（①②③④ 全红）；去掉 watchdog（⑤红）；watchdog 复位后仍不执行挂起的确认（⑥红）；打开时不清 picking（⑦红）。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import BasePicker from "../../src/ui/BasePicker.vue";
import WdPickerView from "../../node_modules/@wot-ui/ui/components/wd-picker-view/wd-picker-view.vue";
import { setUiPlatformOverride } from "../../src/ui/ui-platform";
import { PICKING_WATCHDOG_MS } from "../../src/ui/picker-util";

afterEach(() => {
  setUiPlatformOverride(null);
  vi.useRealTimers();
});

/** 与真实 wd-popup 一致：首次打开后内容常驻，关闭只隐藏（v-show），不卸载 */
const KeepPopup = defineComponent({
  name: "BasePopup",
  props: ["show", "position", "zIndex", "rootPortal"],
  emits: ["cancel", "update:show"],
  setup(p, { slots }) {
    const inited = ref(false);
    return () => {
      if (p.show) inited.value = true;
      return inited.value ? h("div", { class: "keep-popup", style: { display: p.show ? "" : "none" } }, slots.default?.()) : null;
    };
  },
});
const PV = defineComponent({ name: "picker-view", emits: ["change", "pickstart", "pickend"], setup: (_p, { slots }) => () => h("div", { class: "native-picker-view" }, slots.default?.()) });
const PVC = defineComponent({ name: "picker-view-column", setup: (_p, { slots }) => () => h("div", { class: "native-picker-view-column" }, slots.default?.()) });
const Block = defineComponent({ name: "block", setup: (_p, { slots }) => () => slots.default?.() });
const GLOBAL = { components: { "wd-picker-view": WdPickerView, "picker-view": PV, "picker-view-column": PVC, block: Block }, stubs: { BasePopup: KeepPopup } };

const tree = [
  { label: "外景", value: 5, children: [{ label: "海边", value: 9 }, { label: "古城", value: 10 }] },
  { label: "内景", value: 6, children: [{ label: "影棚", value: 11 }] },
];
const treeWithAll = [{ label: "全部分类", value: 0, children: [] }, ...tree];
const flat = [{ label: "红河水乡店", value: 1 }, { label: "昆明店", value: 2 }, { label: "大理店", value: 3 }];

/** 受控宿主：像真实页面一样 v-model:show，并把 confirm 写回 modelValue（页面行为） */
function host(options: unknown[], initial: (string | number)[], cascade: boolean) {
  const show = ref(false);
  const model = ref<(string | number)[]>(initial);
  const confirms: Array<[(string | number)[], string[]]> = [];
  const comp = defineComponent({
    setup() {
      return () =>
        h(BasePicker, {
          show: show.value,
          modelValue: model.value,
          options: options as never,
          cascade,
          title: "t",
          "onUpdate:show": (v: boolean) => { show.value = v; },
          onConfirm: (v: (string | number)[], l: string[]) => { confirms.push([v, l]); model.value = v; },
        });
    },
  });
  const w = mount(comp, { global: GLOBAL });
  return { w, show, model, confirms };
}
const pv = (w: ReturnType<typeof mount>) => w.findComponent(PV);
async function scroll(w: ReturnType<typeof mount>, rows: number[]) {
  pv(w).vm.$emit("change", { detail: { value: rows } });
  await flushPromises();
  await flushPromises();
}
const okBtn = (w: ReturnType<typeof mount>) => w.find(".base-picker-sheet__bar > view:last-of-type");
const cancelBtn = (w: ReturnType<typeof mount>) => w.find(".base-picker-sheet__bar > view:first-of-type");
async function open(h_: ReturnType<typeof host>) {
  h_.show.value = true;
  await flushPromises();
  await flushPromises();
}
const colTexts = (w: ReturnType<typeof mount>) => w.findAll(".native-picker-view-column").map((c) => c.text());

describe("⭐级联：滚动 → 取消 → 重开，列与受控值一致，确定回传受控路径（变异：去掉 :key 即红）", () => {
  it("① 受控 [外景,古城]；滚到「内景」→ 取消 → 重开：列恢复为 外景/{海边,古城}，确定回传 [5,10]", async () => {
    const H = host(tree, [5, 10], true);
    await open(H);
    expect(colTexts(H.w)[1]).toContain("古城");
    await scroll(H.w, [1, 0]); // 一级滚到「内景」，二级列被换成 {影棚}
    expect(colTexts(H.w)[1]).toContain("影棚");
    await cancelBtn(H.w).trigger("click");
    await flushPromises();
    expect(H.show.value).toBe(false);
    await open(H);
    // 列已重建：二级列是外景的子项，且仍含「古城」
    expect(colTexts(H.w)[1]).toContain("古城");
    expect(colTexts(H.w)[1]).not.toContain("影棚");
    await okBtn(H.w).trigger("click");
    await flushPromises();
    expect(H.confirms.at(-1)).toEqual([[5, 10], ["外景", "古城"]]);
  });
  it("③「全部分类」⇄「外景」列数增减后重开：滚到「外景」(2 列) → 取消 → 重开，回到受控 [0] 的 1 列，确定回传 [0]", async () => {
    const H = host(treeWithAll, [0], true);
    await open(H);
    expect(H.w.findAll(".native-picker-view-column").length).toBe(1);
    await scroll(H.w, [1]); // 滚到「外景」⇒ 二级列出现
    expect(H.w.findAll(".native-picker-view-column").length).toBe(2);
    await cancelBtn(H.w).trigger("click");
    await flushPromises();
    await open(H);
    expect(H.w.findAll(".native-picker-view-column").length).toBe(1);
    await okBtn(H.w).trigger("click");
    await flushPromises();
    expect(H.confirms.at(-1)?.[0]).toEqual([0]);
  });
  it("③b 反向：受控 [5,10]（2 列）→ 滚到「全部分类」(1 列) → 取消 → 重开：回到 2 列，确定回传 [5,10]", async () => {
    const H = host(treeWithAll, [5, 10], true);
    await open(H);
    expect(H.w.findAll(".native-picker-view-column").length).toBe(2);
    await scroll(H.w, [0, 0]);
    await cancelBtn(H.w).trigger("click");
    await flushPromises();
    await open(H);
    expect(H.w.findAll(".native-picker-view-column").length).toBe(2);
    await okBtn(H.w).trigger("click");
    await flushPromises();
    expect(H.confirms.at(-1)?.[0]).toEqual([5, 10]);
  });
  it("④ 新建相册后再新建（受控值从空变成首项/另一值）：重开按新受控值定位（变异：去掉 :key 即红）", async () => {
    const H = host(tree, [], true);
    await open(H);
    // 第一次：改选 内景/影棚 并确认（页面把值写回）
    await scroll(H.w, [1, 0]);
    await okBtn(H.w).trigger("click");
    await flushPromises();
    expect(H.confirms.at(-1)?.[0]).toEqual([6, 11]);
    // 页面「新建」表单重置：受控值回到空（默认路径=首项），重开
    H.model.value = [];
    await open(H);
    expect(colTexts(H.w)[1]).toContain("古城"); // 二级列是首个一级「外景」的子项
    await okBtn(H.w).trigger("click");
    await flushPromises();
    expect(H.confirms.at(-1)).toEqual([[5, 9], ["外景", "海边"]]);
  });
  it("确认后再次打开（受控值已更新为 [6,11]）：列与受控值一致，确定回传 [6,11]", async () => {
    const H = host(tree, [5, 9], true);
    await open(H);
    await scroll(H.w, [1, 0]);
    await okBtn(H.w).trigger("click");
    await flushPromises();
    await open(H);
    await okBtn(H.w).trigger("click");
    await flushPromises();
    expect(H.confirms.at(-1)?.[0]).toEqual([6, 11]);
  });
});

describe("⭐单列：滚动 → 取消 → 重开，选中行回到受控值（变异：去掉 :key 即红）", () => {
  it("② 受控 [2]；滚到第 3 项 → 取消 → 重开：直接确定回传 [2]（不是 [3]）", async () => {
    const H = host(flat, [2], false);
    await open(H);
    await scroll(H.w, [2]);
    await cancelBtn(H.w).trigger("click");
    await flushPromises();
    await open(H);
    await okBtn(H.w).trigger("click");
    await flushPromises();
    expect(H.confirms.at(-1)).toEqual([[2], ["昆明店"]]);
  });
  it("遮罩关闭（非取消按钮）后重开同样回到受控值", async () => {
    const H = host(flat, [1], false);
    await open(H);
    await scroll(H.w, [2]);
    H.show.value = false; // 页面/BasePopup 回写 show=false
    await flushPromises();
    await open(H);
    await okBtn(H.w).trigger("click");
    await flushPromises();
    expect(H.confirms.at(-1)?.[0]).toEqual([1]);
  });
});

describe("⭐picking 兜底：pickend 丢失不让「确定」卡死（变异：去掉 watchdog 即红）", () => {
  beforeEach(() => vi.useFakeTimers());
  it("⑤ pickstart 后未收到 pickend：点确定被挂起；超过 800ms 自动复位并执行挂起的确认，回传当前选中值", async () => {
    const H = host(flat, [1], false);
    await open(H);
    pv(H.w).vm.$emit("pickstart");
    await flushPromises();
    await scroll(H.w, [1]);
    await okBtn(H.w).trigger("click");
    expect(H.confirms.length).toBe(0); // 挂起中
    await vi.advanceTimersByTimeAsync(PICKING_WATCHDOG_MS - 10);
    expect(H.confirms.length).toBe(0);
    await vi.advanceTimersByTimeAsync(20);
    await flushPromises();
    expect(H.confirms.at(-1)?.[0]).toEqual([2]);
  });
  it("⑥ 兜底复位后，之后的「确定」不再被挂起（立即生效）", async () => {
    const H = host(flat, [1], false);
    await open(H);
    pv(H.w).vm.$emit("pickstart");
    await vi.advanceTimersByTimeAsync(PICKING_WATCHDOG_MS + 20);
    await okBtn(H.w).trigger("click");
    await flushPromises();
    expect(H.confirms.length).toBe(1);
  });
  it("正常路径：pickend 及时到达 ⇒ 兜底计时器被清除，不会二次确认", async () => {
    const H = host(flat, [1], false);
    await open(H);
    pv(H.w).vm.$emit("pickstart");
    await okBtn(H.w).trigger("click"); // 挂起
    pv(H.w).vm.$emit("pickend");
    await flushPromises();
    expect(H.confirms.length).toBe(1);
    await vi.advanceTimersByTimeAsync(PICKING_WATCHDOG_MS * 3);
    await flushPromises();
    expect(H.confirms.length).toBe(1); // 没有二次
  });
  it("⑦ 打开时复位 picking：上次滚动中被关闭（pickend 丢失）后重开，「确定」立即生效", async () => {
    const H = host(flat, [1], false);
    await open(H);
    pv(H.w).vm.$emit("pickstart"); // 之后关闭，pickend 丢失
    H.show.value = false;
    await flushPromises();
    await open(H);
    await okBtn(H.w).trigger("click");
    await flushPromises();
    expect(H.confirms.length).toBe(1);
  });
});

describe("抖音自绘分支：取消 → 重开，草稿回到受控值（同合同）", () => {
  it("级联：改一级 → 取消 → 重开：高亮与受控值一致，确定回传受控路径", async () => {
    setUiPlatformOverride("mp-toutiao");
    const H = host(tree, [5, 10], true);
    await open(H);
    await H.w.findAll(".base-picker-native__item:not(.base-picker-native__item--sub)")[1].trigger("click"); // 改选内景
    await H.w.find(".base-picker-native__btn").trigger("click"); // 取消
    await flushPromises();
    await open(H);
    await H.w.find(".base-picker-native__btn--ok").trigger("click");
    expect(H.confirms.at(-1)?.[0]).toEqual([5, 10]);
  });
});
