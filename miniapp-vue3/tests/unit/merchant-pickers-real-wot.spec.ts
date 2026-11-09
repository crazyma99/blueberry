// 其余 BasePicker 使用点在「真实 wd-picker-view + 真实页面」下确认选中后生效（issue #14 · m2b 真机批次 1，bug 2 的全量回归）。
// 覆盖：分类页/相册页「选系列」、预约页「按渠道筛选」、档期页「选择日期」。原生 picker-view 用真实 change 载荷 { detail:{ value:[行号] } } 驱动。
// 变异靶点：①门面回传 [] 时各页面均无反应（旧缺陷）②页面取值口径（Number(v[0]) / String(v[0])）被改坏。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

const hh = vi.hoisted(() => ({
  onLoad: [] as Array<(o?: Record<string, unknown>) => void>,
  onShow: [] as Array<() => void>,
  store: new Map<string, string>(),
  reqs: [] as Array<{ url: string; query?: Record<string, string> }>,
}));
vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => hh.onLoad.push(fn),
  onShow: (fn: () => void) => hh.onShow.push(fn),
  onHide: () => undefined,
  onReachBottom: () => undefined,
  onPullDownRefresh: () => undefined,
}));
vi.mock("../../src/platform/uni/transport", () => ({
  createUniTransport: () => ({
    request: async (req: { url: string; query?: Record<string, string> }) => {
      hh.reqs.push({ url: req.url, query: req.query });
      const ok = (data: unknown) => ({ ok: true, value: { status: 200, businessCode: 200, message: undefined, requestId: null, data } });
      if (req.url === "/booking/bookings") return ok({ list: [], total: 0 });
      return ok([]);
    },
    cancel: () => undefined,
  }),
}));

import CategoryPage from "../../src/pkg-merchant/category/list.vue";
import AlbumPage from "../../src/pkg-merchant/album/list.vue";
import BookingPage from "../../src/pkg-merchant/booking/list.vue";
import SlotPage from "../../src/pkg-merchant/slot/list.vue";
import BasePicker from "../../src/ui/BasePicker.vue";
import WdPickerView from "../../node_modules/@wot-ui/ui/components/wd-picker-view/wd-picker-view.vue";
import { __resetMerchantRuntime } from "../../src/pkg-merchant/application/merchant-runtime";
import { MERCHANT_PROFILE_KEY, MERCHANT_SESSION_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";
import { buildSlotDateOptions } from "../../src/pkg-merchant/domain/merchant-slot";

const PopupSpy = defineComponent({ name: "BasePopup", props: ["show", "position", "zIndex", "rootPortal"], emits: ["cancel", "update:show"], setup: (p, { slots }) => () => (p.show ? h("div", { class: "popup-spy" }, slots.default?.()) : null) });
const PV = defineComponent({ name: "picker-view", emits: ["change", "pickstart", "pickend"], setup: (_p, { slots }) => () => h("div", { class: "native-picker-view" }, slots.default?.()) });
const PVC = defineComponent({ name: "picker-view-column", setup: (_p, { slots }) => () => h("div", { class: "native-picker-view-column" }, slots.default?.()) });
const Block = defineComponent({ name: "block", setup: (_p, { slots }) => () => slots.default?.() });
const GLOBAL = {
  components: { "wd-picker-view": WdPickerView, "picker-view": PV, "picker-view-column": PVC, block: Block },
  stubs: { PullRefreshIndicator: true, BaseFeedback: true, BaseDialog: true, PageFooter: true, CustomNavBar: true, MerchantNeedLogin: true, BasePopup: PopupSpy, BaseField: true, BaseProgress: true, SkeletonBlock: true },
};

beforeEach(() => {
  hh.onLoad.length = 0;
  hh.onShow.length = 0;
  hh.store.clear();
  hh.reqs.length = 0;
  __resetMerchantRuntime();
  hh.store.set(MERCHANT_SESSION_KEY, JSON.stringify({ userId: "7", token: "m-token", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }));
  hh.store.set(
    MERCHANT_PROFILE_KEY,
    JSON.stringify({
      adminId: 7, merchantId: 1, username: "a", role: "merchant", displayName: "A", roleName: "",
      permissions: ["album", "category", "booking", "booking_slot", "booking_slot_template"],
      shopList: [{ id: 1, name: "A系列", merchantName: "", status: 1 }, { id: 2, name: "B系列", merchantName: "", status: 1 }],
    }),
  );
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

async function mountPage(comp: Parameters<typeof mount>[0]) {
  const w = mount(comp, { global: GLOBAL });
  hh.onLoad[hh.onLoad.length - 1]?.();
  await flushPromises();
  await flushPromises();
  return w;
}
const picker = (w: ReturnType<typeof mount>, title: string) => w.findAllComponents(BasePicker).find((p) => p.props("title") === title)!;
async function pick(w: ReturnType<typeof mount>, title: string, rows: number[]) {
  const p = picker(w, title);
  p.findComponent(PV).vm.$emit("change", { detail: { value: rows } });
  await flushPromises();
  await flushPromises();
  await p.find(".base-picker-sheet__bar > view:last-of-type").trigger("click");
  await flushPromises();
  await flushPromises();
}

describe("⭐选系列：选择 B 系列 ⇒ 页面切换并按新系列请求", () => {
  it("分类页：滚到第 2 项 → 确定 ⇒ 请求 shopId=2；系列名更新", async () => {
    const w = await mountPage(CategoryPage);
    hh.reqs.length = 0;
    await w.find(".shop-row").trigger("click");
    await flushPromises();
    await pick(w, "选择系列", [1]);
    expect(hh.reqs.some((r) => r.url === "/shop/parent/list" && r.query?.shopId === "2")).toBe(true);
    expect(w.find(".shop-value").text()).toBe("B系列");
  });
  it("相册页：滚到第 2 项 → 确定 ⇒ 相册请求 shop_id=2；系列名更新", async () => {
    const w = await mountPage(AlbumPage);
    hh.reqs.length = 0;
    await w.find(".shop-row").trigger("click");
    await flushPromises();
    await pick(w, "选择系列", [1]);
    expect(hh.reqs.some((r) => r.url === "/photo-albums/photo" && r.query?.shop_id === "2")).toBe(true);
    expect(w.find(".shop-value").text()).toBe("B系列");
  });
});

describe("⭐预约页：按渠道筛选", () => {
  it("滚到「抖音」(第 3 项) → 确定 ⇒ 预约列表请求带 channel=tt", async () => {
    const w = await mountPage(BookingPage);
    hh.reqs.length = 0;
    await w.findAll(".fb-item")[1].trigger("click"); // 筛选条：[日期, 渠道, 重置]
    await flushPromises();
    await pick(w, "按渠道筛选", [2]);
    const last = [...hh.reqs].reverse().find((r) => r.url === "/booking/bookings");
    expect(last?.query?.channel).toBe("tt");
  });
});

describe("⭐档期页：选择日期", () => {
  it("滚到「今天+2」→ 确定 ⇒ 档期请求带 date=该日；日期标签更新", async () => {
    const w = await mountPage(SlotPage);
    const opts = buildSlotDateOptions();
    const todayIdx = opts.findIndex((o) => o.label.endsWith("今天"));
    const target = opts[todayIdx + 2];
    hh.reqs.length = 0;
    await w.find(".date-row").trigger("click");
    await flushPromises();
    await pick(w, "选择日期", [todayIdx + 2]);
    const last = [...hh.reqs].reverse().find((r) => r.url === "/booking/slots");
    expect(last?.query?.date).toBe(target.value);
    expect(w.find(".date-value").text()).toBe(target.label);
  });
});
