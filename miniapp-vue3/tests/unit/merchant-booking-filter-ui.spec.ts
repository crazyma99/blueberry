// 商家预约筛选区重新设计单测（issue #14 · M1 真机反馈「筛选器太乱，都用的标签」）：
// 状态 = 横滑分段（常用在前）；日期/渠道/重置 = 一行筛选条（日期走底部弹层：快捷项 + 具体日期，互斥；渠道走 BasePicker）；结果摘要。
// 行为不变：默认「全部」、快捷日期按本地时间现算、点击回第 1 页、迟到响应丢弃、与状态叠加；filter 结构与 buildBookingQuery 不改（本文件也断言这一点）。
// 变异靶点：①状态顺序/下标映射 ②日期按钮文案 ③重置按钮显隐 ④摘要文案/total 未知不显示 ⑤弹层快捷项与具体日期互斥 ⑥渠道选择
//          ⑦页面不再接线某入口 ⑧结果摘要日期带当前生效具体日期 ⑨组件 change 载荷。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount } from "@vue/test-utils";

type Reply = { status?: number; code?: number | null; message?: string; data?: unknown };
const h = vi.hoisted(() => ({
  onLoad: [] as Array<(o?: Record<string, unknown>) => void>,
  onShow: [] as Array<() => void>,
  store: new Map<string, string>(),
  responder: ((_u: string, _q: Record<string, string> | undefined) => ({ status: 200, code: 200, data: { list: [], total: 0 } })) as (u: string, q: Record<string, string> | undefined) => Reply,
  requests: [] as Array<{ url: string; query?: Record<string, string> }>,
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoad.push(fn),
  onShow: (fn: () => void) => h.onShow.push(fn),
  onReachBottom: () => undefined,
  onPullDownRefresh: () => undefined,
}));
vi.mock("../../src/platform/uni/transport", () => ({
  createUniTransport: () => ({
    request: async (req: { url: string; query?: Record<string, string> }) => {
      h.requests.push({ url: req.url, query: req.query });
      const r = h.responder(req.url, req.query);
      return { ok: true, value: { status: r.status ?? 200, businessCode: r.code === undefined ? 200 : r.code, message: r.message, requestId: null, data: r.data } };
    },
    cancel: () => undefined,
  }),
}));

import BookingPage from "../../src/pkg-merchant/booking/list.vue";
import ScrollSegment from "../../src/pkg-merchant/components/ScrollSegment.vue";
import { __resetMerchantRuntime } from "../../src/pkg-merchant/application/merchant-runtime";
import { MERCHANT_PROFILE_KEY, MERCHANT_SESSION_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";
import {
  channelButtonLabel,
  dateButtonLabel,
  filterSummary,
  hasActiveFilter,
  isChannelFiltered,
  isDateFiltered,
  orderedStatusTabs,
  resetFilter,
  statusIndexOf,
} from "../../src/pkg-merchant/domain/merchant-booking-filter-ui";
import { EMPTY_BOOKING_FILTER, STATUS_TABS, buildBookingQuery, withQuickDate, withSpecificDate } from "../../src/pkg-merchant/domain/merchant-booking";
import { __setLoadTimeoutMsForTest } from "../../src/pkg-merchant/composables/load-guard";

const root = resolve(__dirname, "../..");
const GLOBAL = { stubs: { PullRefreshIndicator: true, BaseFeedback: true, BaseDialog: true, PageFooter: true, BasePopup: { name: "BasePopup", template: "<div class='stub-popup' :data-show='String(show)'><slot v-if='show' /></div>", props: ["show"] }, BasePicker: true } };
const row = (id: number) => ({ id, status: "pending", rawStatus: "pending", date: "2026-11-09", startTime: "10:00", endTime: "11:00", customerName: "张三", customerPhone: "***********", guestCount: 2, remark: "", channel: "wx", channelLabel: "微信", createTime: "", deposit: null });

beforeEach(() => {
  __setLoadTimeoutMsForTest(2000);
  h.onLoad.length = 0;
  h.onShow.length = 0;
  h.requests.length = 0;
  h.store.clear();
  h.responder = () => ({ data: { list: [row(1), row(2)], total: 2 } });
  __resetMerchantRuntime();
  h.store.set(MERCHANT_SESSION_KEY, JSON.stringify({ userId: "7", token: "m", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }));
  h.store.set(MERCHANT_PROFILE_KEY, JSON.stringify({ adminId: 7, merchantId: 1, username: "a", role: "merchant", displayName: "A", roleName: "", permissions: ["booking"], shopList: [] }));
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => h.store.set(k, v),
    removeStorageSync: (k: string) => h.store.delete(k),
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    getMenuButtonBoundingClientRect: () => ({ left: 280, width: 87 }),
    stopPullDownRefresh: () => undefined,
    showToast: () => undefined,
    upx2px: (n: number) => n / 2,
  };
});
afterEach(() => __setLoadTimeoutMsForTest(null));

async function mountPage() {
  const w = mount(BookingPage, { global: GLOBAL });
  h.onLoad[h.onLoad.length - 1]?.();
  await flushPromises();
  await flushPromises();
  return w;
}
const bizReqs = () => h.requests.filter((r) => r.url === "/booking/bookings");
const lastQuery = () => bizReqs()[bizReqs().length - 1]?.query;

describe("展示逻辑（纯函数）", () => {
  it("⭐状态顺序：常用在前（全部/待确认/已确认/已完成），低频靠后；仍覆盖 STATUS_TABS 全部项（变异：漏项/乱序即红）", () => {
    const tabs = orderedStatusTabs();
    expect(tabs.map((t) => t.label)).toEqual(["全部", "待确认", "已确认", "已完成", "已取消", "已过期", "待支付", "未到店"]);
    expect([...tabs.map((t) => t.value)].sort()).toEqual([...STATUS_TABS.map((t) => t.value)].sort());
    expect(statusIndexOf("")).toBe(0);
    expect(statusIndexOf("confirmed")).toBe(2);
    expect(statusIndexOf("no_show")).toBe(7);
    expect(statusIndexOf("weird" as never)).toBe(0);
  });
  it("⭐兜底：排序表漏列的状态也必须出现（追加到末尾），不能因排序表漏项让筛选项消失（变异：去掉兜底追加即红）", () => {
    const src = readFileSync(resolve(root, "src/pkg-merchant/domain/merchant-booking-filter-ui.ts"), "utf-8");
    // 兜底循环存在：遍历 STATUS_TABS，把不在 ordered 里的项 push 进去
    expect(src).toMatch(/for \(const t of STATUS_TABS\) if \(!ordered\.includes\(t\)\) ordered\.push\(t\);/);
    // 行为：以「排序表」与「STATUS_TABS」的差集为空作为不变量（新增状态时必须同步或走兜底）
    const listed = new Set(["", "pending", "confirmed", "completed", "cancelled", "expired", "awaiting_payment", "no_show"]);
    for (const t of STATUS_TABS) expect(listed.has(t.value) || orderedStatusTabs().includes(t), t.value).toBe(true);
  });
  it("⭐日期/渠道按钮文案：默认「日期」「渠道」；选中后显示具体值（今天/明天/YYYY-MM-DD；渠道名）（变异：文案不变即红）", () => {
    expect(dateButtonLabel({ date: "", quick: undefined })).toBe("日期");
    expect(dateButtonLabel({ date: "", quick: "today" })).toBe("今天");
    expect(dateButtonLabel({ date: "", quick: "tomorrow" })).toBe("明天");
    expect(dateButtonLabel({ date: "2026-11-10" })).toBe("2026-11-10");
    expect(channelButtonLabel({ channel: "" })).toBe("渠道");
    expect(channelButtonLabel({ channel: "wx" })).toBe("微信");
    expect(channelButtonLabel({ channel: "tt" })).toBe("抖音");
    expect(channelButtonLabel({ channel: "xhs" })).toBe("小红书");
  });
  it("⭐「重置」显隐：仅当存在任一非默认筛选（状态/日期/渠道）时才出现；resetFilter 回到默认且每次新对象（变异：恒显示/恒隐藏即红）", () => {
    expect(hasActiveFilter(EMPTY_BOOKING_FILTER)).toBe(false);
    expect(hasActiveFilter({ ...EMPTY_BOOKING_FILTER, status: "pending" })).toBe(true);
    expect(hasActiveFilter({ ...EMPTY_BOOKING_FILTER, channel: "wx" })).toBe(true);
    expect(hasActiveFilter({ ...EMPTY_BOOKING_FILTER, date: "2026-11-10" })).toBe(true);
    expect(hasActiveFilter(withQuickDate(EMPTY_BOOKING_FILTER, "today"))).toBe(true);
    expect(isDateFiltered(EMPTY_BOOKING_FILTER)).toBe(false);
    expect(isChannelFiltered(EMPTY_BOOKING_FILTER)).toBe(false);
    const a = resetFilter();
    expect(a).toEqual(EMPTY_BOOKING_FILTER);
    expect(a).not.toBe(EMPTY_BOOKING_FILTER);
    expect(resetFilter()).not.toBe(a);
  });
  it("⭐结果摘要：「共 N 条」；有筛选追加条件，快捷日期带当前生效的具体日期；total 未知 ⇒ 空串（不显示假数字）", () => {
    const now = new Date(2026, 10, 9, 23, 30);
    expect(filterSummary(EMPTY_BOOKING_FILTER, 12, now)).toBe("共 12 条");
    expect(filterSummary({ ...EMPTY_BOOKING_FILTER, status: "pending" }, 3, now)).toBe("共 3 条 · 待确认");
    expect(filterSummary(withQuickDate({ ...EMPTY_BOOKING_FILTER, status: "pending", channel: "wx" }, "today"), 3, now)).toBe("共 3 条 · 待确认 · 今天(2026-11-09) · 微信");
    expect(filterSummary(withQuickDate(EMPTY_BOOKING_FILTER, "tomorrow"), 0, now)).toBe("共 0 条 · 明天(2026-11-10)");
    expect(filterSummary(withSpecificDate(EMPTY_BOOKING_FILTER, "2026-12-25"), 5, now)).toBe("共 5 条 · 2026-12-25");
    for (const bad of [null, Number.NaN, -1]) expect(filterSummary(EMPTY_BOOKING_FILTER, bad as never, now), String(bad)).toBe("");
  });
  it("⭐不改查询契约：buildBookingQuery 与 MerchantBookingFilter 结构原样（默认只带 page/pageSize；叠加筛选齐全）", () => {
    expect(buildBookingQuery(EMPTY_BOOKING_FILTER, 1, 20)).toEqual({ page: "1", pageSize: "20" });
    expect(buildBookingQuery({ status: "confirmed", date: "", channel: "tt", quick: "tomorrow" }, 2, 20, new Date(2026, 11, 31, 9))).toEqual({
      status: "confirmed", date: "2027-01-01", channel: "tt", page: "2", pageSize: "20",
    });
  });
});

describe("ScrollSegment（横滑分段 · 复用 AppSegment 视觉口径）", () => {
  it("⭐渲染每个选项；选中项挂 is-active；点击 emit change 且载荷是纯下标 number（与 AppSegment 同口径；变异：载荷改成对象/文案即红）", async () => {
    const w = mount(ScrollSegment, { props: { options: ["全部", "待确认", "已确认"], currentIndex: 1 } });
    const items = w.findAll(".seg-item");
    expect(items.map((i) => i.text())).toEqual(["全部", "待确认", "已确认"]);
    expect(items.map((i) => i.classes().includes("is-active"))).toEqual([false, true, false]);
    await items[2].trigger("click");
    expect(w.emitted("change")).toEqual([[2]]);
    expect(typeof (w.emitted("change") as unknown[][])[0][0]).toBe("number");
  });
  it("样式沿用 AppSegment 的金色渐变选中态（不另造色值体系）；组件在 pkg-merchant 内（不进主包）", () => {
    const src = readFileSync(resolve(root, "src/pkg-merchant/components/ScrollSegment.vue"), "utf-8");
    expect(src).toContain("linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%)");
    expect(src).toContain("$color-action-text");
    expect(src).not.toMatch(/<wd-/);
    expect(src).not.toMatch(/\bwx\./);
  });
});

describe("⭐页面交互：分层筛选（真实页面 + 可控传输层）", () => {
  it("初始：状态分段 8 项且默认选中「全部」；筛选条为「日期 ▾ / 渠道 ▾」；无「重置」；有结果摘要「共 2 条」", async () => {
    const w = await mountPage();
    expect(w.findAll(".seg-item").map((i) => i.text())).toEqual(["全部", "待确认", "已确认", "已完成", "已取消", "已过期", "待支付", "未到店"]);
    expect(w.findAll(".seg-item")[0].classes()).toContain("is-active");
    expect(w.findAll(".fb-item").map((i) => i.text())).toEqual(["日期 ▾", "渠道 ▾"]);
    expect(w.find(".fb-reset").exists()).toBe(false);
    expect(w.find(".summary-text").text()).toBe("共 2 条");
    expect(lastQuery()).toEqual({ page: "1", pageSize: "20" }); // 默认「全部」：不带任何筛选
    expect(w.find(".chip").exists()).toBe(false); // 旧的 17 个同款胶囊已不存在
  });
  it("⭐选状态：点「已确认」⇒ 请求带 status=confirmed、回第 1 页；分段高亮跟随；出现「重置」；摘要带条件", async () => {
    const w = await mountPage();
    await w.findAll(".seg-item")[2].trigger("click");
    await flushPromises();
    expect(lastQuery()).toEqual({ status: "confirmed", page: "1", pageSize: "20" });
    expect(w.findAll(".seg-item")[2].classes()).toContain("is-active");
    expect(w.find(".fb-reset").exists()).toBe(true);
    expect(w.find(".summary-text").text()).toBe("共 2 条 · 已确认");
  });
  it("⭐日期弹层：快捷「今天」⇒ 请求带本地今天；按钮文案变「今天 ▾」并高亮；弹层关闭；快捷与具体日期互斥", async () => {
    const w = await mountPage();
    await w.findAll(".fb-item")[0].trigger("click"); // 打开日期弹层
    const quick = w.findAll(".sheet-chip");
    expect(quick.map((q) => q.text())).toEqual(["全部", "今天", "明天"]);
    await quick[1].trigger("click");
    await flushPromises();
    const q = lastQuery()!;
    expect(q.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(w.findAll(".fb-item")[0].text()).toBe("今天 ▾");
    expect(w.findAll(".fb-item")[0].classes()).toContain("is-on");
    expect(w.find(".summary-text").text()).toContain("今天(" + q.date + ")");
    // 选具体日期（picker change）⇒ 清掉快捷，按钮显示具体日期
    await w.findAll(".fb-item")[0].trigger("click");
    await w.find("picker").trigger("change", { detail: { value: "2026-12-25" } });
    await flushPromises();
    expect(lastQuery()!.date).toBe("2026-12-25");
    expect(w.findAll(".fb-item")[0].text()).toBe("2026-12-25 ▾");
    // 此时快捷项全部不高亮
    await w.findAll(".fb-item")[0].trigger("click");
    expect(w.findAll(".sheet-chip").some((c) => c.classes().includes("is-active"))).toBe(false);
  });
  const popupShown = (w: ReturnType<typeof mount>) => w.find(".stub-popup").attributes("data-show") === "true";
  it("⭐弹层开合：点「日期」才打开；点快捷项后关闭；选具体日期后关闭（变异：快捷项/具体日期不关弹层即红）", async () => {
    const w = await mountPage();
    expect(popupShown(w)).toBe(false);
    expect(w.findAll(".sheet-chip").length).toBe(0); // 未打开时内容不渲染
    await w.findAll(".fb-item")[0].trigger("click");
    expect(popupShown(w)).toBe(true);
    expect(w.findAll(".sheet-chip").length).toBe(3);
    await w.findAll(".sheet-chip")[1].trigger("click");
    await flushPromises();
    expect(popupShown(w), "点快捷项后弹层应关闭").toBe(false);
    await w.findAll(".fb-item")[0].trigger("click");
    expect(popupShown(w)).toBe(true);
    await w.find("picker").trigger("change", { detail: { value: "2026-12-25" } });
    await flushPromises();
    expect(popupShown(w), "选具体日期后弹层应关闭").toBe(false);
  });
  it("⭐先选具体日期再点快捷项 ⇒ 具体日期被清掉（互斥）：请求不再带该具体日期、按钮显示快捷文案、弹层里「具体日期」不再标已选（变异：不清即红）", async () => {
    const w = await mountPage();
    await w.findAll(".fb-item")[0].trigger("click");
    await w.find("picker").trigger("change", { detail: { value: "2026-12-25" } });
    await flushPromises();
    expect(lastQuery()!.date).toBe("2026-12-25");
    await w.findAll(".fb-item")[0].trigger("click");
    expect(w.find(".sheet-date").text()).toContain("已选日期 2026-12-25");
    const before = bizReqs().length;
    await w.findAll(".sheet-chip")[2].trigger("click"); // 明天
    await flushPromises();
    expect(bizReqs().length).toBe(before + 1);
    expect(lastQuery()!.date).not.toBe("2026-12-25");
    expect(lastQuery()!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(w.findAll(".fb-item")[0].text()).toBe("明天 ▾");
    await w.findAll(".fb-item")[0].trigger("click"); // 再打开：具体日期应已被清
    expect(w.find(".sheet-date").text()).toBe("选择具体日期");
    expect(w.find(".sheet-date").classes()).not.toContain("is-active");
  });
  it("⭐渠道：BasePicker confirm ⇒ 请求带 channel；按钮文案变渠道名并高亮；与状态叠加", async () => {
    const w = await mountPage();
    await w.findAll(".seg-item")[1].trigger("click");
    await flushPromises();
    const picker = w.findComponent({ name: "BasePicker" });
    picker.vm.$emit("confirm", ["wx"]);
    await flushPromises();
    expect(lastQuery()).toEqual({ status: "pending", channel: "wx", page: "1", pageSize: "20" });
    expect(w.findAll(".fb-item")[1].text()).toBe("微信 ▾");
    expect(w.findAll(".fb-item")[1].classes()).toContain("is-on");
    expect(w.find(".summary-text").text()).toBe("共 2 条 · 待确认 · 微信");
  });
  it("⭐重置：一键回到默认（全部），重置按钮消失、请求不再带任何筛选、分段回到「全部」", async () => {
    const w = await mountPage();
    await w.findAll(".seg-item")[3].trigger("click");
    await flushPromises();
    w.findComponent({ name: "BasePicker" }).vm.$emit("confirm", ["tt"]);
    await flushPromises();
    expect(w.find(".fb-reset").exists()).toBe(true);
    await w.find(".fb-reset").trigger("click");
    await flushPromises();
    expect(lastQuery()).toEqual({ page: "1", pageSize: "20" });
    expect(w.find(".fb-reset").exists()).toBe(false);
    expect(w.findAll(".seg-item")[0].classes()).toContain("is-active");
    expect(w.findAll(".fb-item").map((i) => i.text())).toEqual(["日期 ▾", "渠道 ▾"]);
  });
  it("加载失败时不显示结果摘要（不给假数字）", async () => {
    h.responder = () => ({ status: 200, code: 500, message: "状态筛选不合法" });
    const w = await mountPage();
    expect(w.text()).toContain("加载失败");
    expect(w.find(".summary-text").exists()).toBe(false);
  });
});

describe("源码级纪律", () => {
  const page = readFileSync(resolve(root, "src/pkg-merchant/booking/list.vue"), "utf-8");
  const code = page.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  it("⭐模板事件一律具名方法：不含箭头/IIFE/带参内联调用（@click=\"foo(x)\" 仅允许列表项取循环变量的具名函数）", () => {
    const tpl = code.slice(code.indexOf("<template>"));
    expect(tpl).not.toMatch(/@(click|change|confirm)="[^"]*(=>|function\s*\()/);
    for (const m of tpl.matchAll(/@(click|change|confirm)="([^"]+)"/g)) {
      expect(m[2], "事件表达式 " + m[2]).toMatch(/^[A-Za-z_]\w*(\([A-Za-z_][\w.]*(,\s*[A-Za-z_][\w.]*)*\))?$/);
    }
    // 筛选区不再出现旧的内联对象字面量写法 applyFilter({ ... })
    expect(tpl).not.toMatch(/applyFilter\(\{/);
  });
  it("筛选区分层：ScrollSegment（状态）+ filter-bar（日期/渠道/重置）+ summary；无旧版 chip 样式", () => {
    expect(code).toContain("<ScrollSegment");
    expect(code).toContain('class="filter-bar"');
    expect(code).toContain('class="summary"');
    expect(code).not.toMatch(/class="chip\b|'chip is-active'/);
    expect(code).not.toMatch(/\.chip\s*\{/);
  });
  it("首屏仍走 guardedLoad + showSkeleton；不写 !ready；日期弹层用 BasePopup、渠道用 BasePicker；零 wd-*/wx.*", () => {
    expect(code).toContain("guardedLoad(");
    expect(code).toContain('v-if="showSkeleton"');
    expect(code).not.toContain('v-if="!ready"');
    expect(code).toContain("<BasePopup");
    expect(code).toContain("<BasePicker");
    expect(code).not.toMatch(/<wd-/);
    expect(code).not.toMatch(/\bwx\./);
  });
  it("档期页（slot/list）：只有一个日期选择控件，无多胶囊堆叠 ⇒ 保持不动（本次未改该文件）", () => {
    const slot = readFileSync(resolve(root, "src/pkg-merchant/slot/list.vue"), "utf-8");
    expect(slot).not.toMatch(/class="chip\b|'chip is-active'/);
    expect((slot.match(/class="date-row"/g) ?? []).length).toBe(1);
  });
});
