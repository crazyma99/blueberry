// 商家端预约单测（issue #14 · M1 预约批）：查询映射 / 可用操作状态机 / 取消文案 / 仓储契约 / 防重 / 越界禁区。
// 变异靶点：①availableActions 对 expired 仍给 confirm ②取消文案去掉保证金提示 ③runner 去掉 busy 防重
//          ④仓储 act 去掉 replayPolicy never / 带了 body ⑤buildBookingQuery 去掉 pageSize 上限收敛。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTION_LABEL,
  BOOKING_MAX_PAGE_SIZE,
  CANCEL_DEPOSIT_NOTICE,
  EMPTY_BOOKING_FILTER,
  STATUS_TABS,
  actionConfirmCopy,
  availableActions,
  buildBookingQuery,
  QUICK_DATE_TABS,
  activeQuickTab,
  localDateOffset,
  resolveFilterDate,
  withQuickDate,
  withSpecificDate,
  describeMerchantStatus,
  normalizeMerchantBooking,
} from "../../src/pkg-merchant/domain/merchant-booking";
import { createMerchantBookingRepository } from "../../src/pkg-merchant/infrastructure/merchant-bookings";
import { createBookingActionRunner, createBookingListFetch } from "../../src/pkg-merchant/application/merchant-booking-flow";
import { createPagedListViewModel } from "../../src/pkg-merchant/composables/use-merchant-list";
import { MERCHANT_ENTRIES, visibleEntries } from "../../src/pkg-merchant/domain/merchant-auth";
import { MERCHANT_ACTION_UNKNOWN_TEXT } from "../../src/pkg-merchant/domain/merchant-error";
import type { ClientRequestInput, ClientResult } from "../../src/infrastructure/http/client";
import type { AppError } from "../../src/infrastructure/http/errors";
import type { RequestContext } from "../../src/ports/context";

const root = resolve(__dirname, "../..");
const ctx = { requestId: "r" } as RequestContext;
const page = readFileSync(resolve(root, "src/pkg-merchant/booking/list.vue"), "utf-8");

const err = (kind: AppError["kind"], message = "", businessCode: number | null = null): AppError => ({ kind, businessCode, message, requestId: null, retryable: false });
function fakeClient(responder: (i: ClientRequestInput) => ClientResult<unknown> | Promise<ClientResult<unknown>>) {
  const seen: ClientRequestInput[] = [];
  return { seen, client: { request: async <T,>(i: ClientRequestInput) => { seen.push(i); return (await responder(i)) as ClientResult<T>; } } };
}

describe("buildBookingQuery（筛选/分页 → 查询参数）", () => {
  it("空筛选只带 page/pageSize；有值才带 status/date/channel", () => {
    expect(buildBookingQuery(EMPTY_BOOKING_FILTER, 1, 20)).toEqual({ page: "1", pageSize: "20" });
    expect(buildBookingQuery({ status: "pending", date: "2026-11-09", channel: "wx" }, 2, 20)).toEqual({
      status: "pending", date: "2026-11-09", channel: "wx", page: "2", pageSize: "20",
    });
  });
  it("⭐pageSize 上限 50（后端上限）；page/pageSize 非法值收敛；非 YYYY-MM-DD 的日期不传", () => {
    expect(buildBookingQuery(EMPTY_BOOKING_FILTER, 1, 999).pageSize).toBe(String(BOOKING_MAX_PAGE_SIZE));
    expect(buildBookingQuery(EMPTY_BOOKING_FILTER, 0, 0)).toEqual({ page: "1", pageSize: "20" });
    expect(buildBookingQuery(EMPTY_BOOKING_FILTER, Number.NaN, -3)).toEqual({ page: "1", pageSize: "20" });
    expect(buildBookingQuery({ status: "", date: "11/09", channel: "" }, 1, 20).date).toBeUndefined();
    expect(buildBookingQuery(EMPTY_BOOKING_FILTER, 2.9, 20.7)).toEqual({ page: "2", pageSize: "20" });
  });
  it("状态筛选闭集 == 后端 validStatusFilters（含 awaiting_payment/no_show/expired），且含「全部」", () => {
    expect(STATUS_TABS.map((t) => t.value).sort()).toEqual(["", "awaiting_payment", "cancelled", "completed", "confirmed", "expired", "no_show", "pending"]);
  });
});

describe("⭐快捷日期：本地日历运算（跨月/跨年/闰年；不经 UTC）", () => {
  // 注意：Date(y, m, d, h, mi) 是**本地时间**构造；不论测试机时区如何，本地日历日都按构造值推进
  it("localDateOffset：今天/明天跨月、跨年、闰年 2 月 28→29→3-1、平年 2-28→3-1", () => {
    expect(localDateOffset(new Date(2026, 0, 31, 12), 0)).toBe("2026-01-31");
    expect(localDateOffset(new Date(2026, 0, 31, 12), 1)).toBe("2026-02-01"); // 跨月
    expect(localDateOffset(new Date(2026, 11, 31, 12), 1)).toBe("2027-01-01"); // 跨年
    expect(localDateOffset(new Date(2024, 1, 28, 12), 1)).toBe("2024-02-29"); // 闰年
    expect(localDateOffset(new Date(2024, 1, 29, 12), 1)).toBe("2024-03-01");
    expect(localDateOffset(new Date(2026, 1, 28, 12), 1)).toBe("2026-03-01"); // 平年
    expect(localDateOffset(new Date(2026, 3, 30, 12), 1)).toBe("2026-05-01"); // 30 天月
  });
  it("⭐本地日期边界：23:30 的「今天」仍是当天、「明天」是次日；00:30 的「今天」已是新的一天（变异：改用 UTC 日期即红）", () => {
    const late = new Date(2026, 10, 9, 23, 30); // 本地 11-09 23:30
    const early = new Date(2026, 10, 10, 0, 30); // 本地 11-10 00:30
    expect(localDateOffset(late, 0)).toBe("2026-11-09");
    expect(localDateOffset(late, 1)).toBe("2026-11-10");
    expect(localDateOffset(early, 0)).toBe("2026-11-10");
    expect(localDateOffset(early, 1)).toBe("2026-11-11");
  });
  it("resolveFilterDate：快捷现算；具体日期原样；都无 ⇒ 空串；quick 优先于残留 date", () => {
    const now = new Date(2026, 10, 9, 10);
    expect(resolveFilterDate({ date: "", quick: "today" }, now)).toBe("2026-11-09");
    expect(resolveFilterDate({ date: "", quick: "tomorrow" }, now)).toBe("2026-11-10");
    expect(resolveFilterDate({ date: "2026-12-25" }, now)).toBe("2026-12-25");
    expect(resolveFilterDate({ date: "" }, now)).toBe("");
    expect(resolveFilterDate({ date: "2026-12-25", quick: "today" }, now)).toBe("2026-11-09");
  });
  it("⭐buildBookingQuery 带快捷：today/tomorrow ⇒ query.date；默认「全部」不带 date（行为与加快捷前一致）", () => {
    const now = new Date(2026, 11, 31, 9);
    expect(buildBookingQuery({ ...EMPTY_BOOKING_FILTER, quick: "today" }, 1, 20, now).date).toBe("2026-12-31");
    expect(buildBookingQuery({ ...EMPTY_BOOKING_FILTER, quick: "tomorrow" }, 1, 20, now).date).toBe("2027-01-01");
    expect(buildBookingQuery(EMPTY_BOOKING_FILTER, 1, 20, now)).toEqual({ page: "1", pageSize: "20" });
  });
  it("快捷胶囊顺序与文案：全部 / 今天 / 明天", () => {
    expect(QUICK_DATE_TABS.map((t) => t.label)).toEqual(["全部", "今天", "明天"]);
  });
});

describe("⭐快捷日期：选中态高亮 / 互斥 / 叠加", () => {
  it("默认「全部」高亮；选今天/明天高亮对应项；选具体日期 ⇒ 三个都不高亮（null）（变异：具体日期仍高亮「全部」即红）", () => {
    expect(activeQuickTab(EMPTY_BOOKING_FILTER)).toBe("");
    expect(activeQuickTab({ date: "", quick: "today" })).toBe("today");
    expect(activeQuickTab({ date: "", quick: "tomorrow" })).toBe("tomorrow");
    expect(activeQuickTab({ date: "2026-12-25" })).toBeNull();
  });
  it("withQuickDate / withSpecificDate 互斥：点快捷清具体日期；选具体日期清快捷；点「全部」回到无日期", () => {
    const base = { status: "pending" as const, date: "2026-12-25", channel: "wx" as const };
    const q = withQuickDate(base, "today");
    expect(q).toEqual({ status: "pending", date: "", channel: "wx", quick: "today" });
    const d = withSpecificDate(q, "2026-12-26");
    expect(d).toEqual({ status: "pending", date: "2026-12-26", channel: "wx" });
    expect("quick" in d).toBe(false);
    const all = withQuickDate(q, "");
    expect(all).toEqual({ status: "pending", date: "", channel: "wx" });
    expect("quick" in all).toBe(false);
    expect(withSpecificDate(d, "")).toEqual({ status: "pending", date: "", channel: "wx" }); // 清除日期 ⇒ 回到「全部」
  });
  it("⭐叠加：快捷日期与状态、渠道同时生效（query 三者齐全）", () => {
    const f = withQuickDate({ status: "confirmed", date: "", channel: "tt" }, "tomorrow");
    expect(buildBookingQuery(f, 3, 20, new Date(2026, 1, 28, 12))).toEqual({ status: "confirmed", date: "2026-03-01", channel: "tt", page: "3", pageSize: "20" });
  });
});

describe("⭐快捷日期 × 列表壳：切换回到第 1 页、迟到响应丢弃、刷新取新的今天", () => {
  const rows = (n: number, start: number) => Array.from({ length: n }, (_, i) => ({ id: start + i }));
  it("已翻到第 2 页后点「今天」⇒ 重置为第 1 页并带新筛选；筛选对象是意图（quick），不是缓存的日期串", async () => {
    const calls: Array<{ filter: unknown; page: number }> = [];
    const vm = createPagedListViewModel<{ id: number }, import("../../src/pkg-merchant/domain/merchant-booking").MerchantBookingFilter>(
      { fetch: async (_c, a) => { calls.push({ filter: a.filter, page: a.page }); return { ok: true, value: { list: rows(2, a.page * 10), total: 10 } }; } },
      { pageSize: 2, initialFilter: { ...EMPTY_BOOKING_FILTER } },
    );
    await vm.loadFirst(ctx);
    await vm.loadMore(ctx);
    expect(vm.page.value).toBe(2);
    await vm.loadFirst(ctx, withQuickDate(vm.filter.value, "today"));
    expect(vm.page.value).toBe(1);
    expect(calls[calls.length - 1]).toEqual({ filter: { status: "", date: "", channel: "", quick: "today" }, page: 1 });
    expect(vm.items.value.length).toBe(2); // 不是 4：列表被重置
  });
  it("迟到响应丢弃：点「今天」后立刻点「明天」，今天的晚到响应不覆盖明天", async () => {
    let releaseToday!: () => void;
    const gate = new Promise<void>((res) => { releaseToday = res; });
    const vm = createPagedListViewModel<{ id: number }, import("../../src/pkg-merchant/domain/merchant-booking").MerchantBookingFilter>(
      {
        fetch: async (_c, a) => {
          if (a.filter.quick === "today") { await gate; return { ok: true, value: { list: rows(3, 100), total: 3 } }; }
          return { ok: true, value: { list: rows(1, 200), total: 1 } };
        },
      },
      { initialFilter: { ...EMPTY_BOOKING_FILTER } },
    );
    const pToday = vm.loadFirst(ctx, withQuickDate(vm.filter.value, "today"));
    await vm.loadFirst(ctx, withQuickDate(vm.filter.value, "tomorrow"));
    releaseToday();
    await pToday;
    expect(vm.items.value).toEqual([{ id: 200 }]);
    expect(vm.filter.value.quick).toBe("tomorrow");
  });
  it("⭐跨零点后刷新取新的今天：同一个 quick=today 筛选，两次请求时钟不同 ⇒ query.date 不同（仓储每次现取时钟）（变异：缓存首次日期即红）", async () => {
    let clock = new Date(2026, 10, 9, 23, 59);
    const f = fakeClient(() => ({ ok: true, value: { list: [], total: 0 } }));
    const repo = createMerchantBookingRepository({ client: f.client, now: () => clock });
    const filter = withQuickDate(EMPTY_BOOKING_FILTER, "today");
    await repo.list(ctx, { filter, page: 1, pageSize: 20 });
    clock = new Date(2026, 10, 10, 0, 1); // 跨零点后下拉刷新（沿用同一筛选对象）
    await repo.list(ctx, { filter, page: 1, pageSize: 20 });
    expect(f.seen.map((s) => s.query?.date)).toEqual(["2026-11-09", "2026-11-10"]);
  });
  it("页面接线：快捷项（日期弹层内）走 withQuickDate、具体日期走 withSpecificDate、状态/渠道/重置走 submitFilter→loadFirst；默认筛选仍是 EMPTY（保持「全部」）", () => {
    const code = page.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).toContain('v-for="q in QUICK_DATE_TABS"');
    expect(code).toContain("withQuickDate(vm.filter.value, value)");
    expect(code).toContain("withSpecificDate(vm.filter.value");
    expect(code).toContain("activeQuickTab(vm.filter.value)");
    expect(code).toContain("vm.loadFirst(rt.nextContext(), next)");
    expect(code).toContain("initialFilter: { ...EMPTY_BOOKING_FILTER }");
  });
});

describe("⭐availableActions：按落库 rawStatus + 对外 status 判定（对齐后端 bookingTransitions）", () => {
  const acts = (status: string, rawStatus: string) => availableActions({ status: status as never, rawStatus });
  it("pending → 接单+取消；confirmed → 核销+取消", () => {
    expect(acts("pending", "pending")).toEqual(["confirm", "cancel"]);
    expect(acts("confirmed", "confirmed")).toEqual(["complete", "cancel"]);
  });
  it("⭐已过期的待确认单：后端拒绝 confirm ⇒ 不给接单，仍可取消（变异：对 expired 仍给 confirm 即红）", () => {
    expect(acts("expired", "pending")).toEqual(["cancel"]);
  });
  it("已过期的已确认单：仍可核销/取消（运营收尾，后端允许）", () => {
    expect(acts("expired", "confirmed")).toEqual(["complete", "cancel"]);
  });
  it("⭐终态/待支付/未到店：一律无操作（未到店绝不给入口）", () => {
    for (const s of ["completed", "cancelled", "awaiting_payment", "no_show"]) expect(acts(s, s), s).toEqual([]);
  });
  it("rawStatus 缺失回落 status；未知状态无操作（fail-closed）", () => {
    expect(availableActions({ status: "pending", rawStatus: "" })).toEqual(["confirm", "cancel"]);
    expect(acts("weird", "weird")).toEqual([]);
  });
  it("⭐任何状态的可用操作里都不存在 no-show / refund 等资金动作（类型闭集 + 文案表）", () => {
    expect(Object.keys(ACTION_LABEL).sort()).toEqual(["cancel", "complete", "confirm"]);
  });
});

describe("⭐取消确认框文案（主人拍板：必须明示保证金全额退还）", () => {
  const b = { customerName: "张三", date: "2026-11-09", startTime: "10:00", endTime: "11:00", deposit: null };
  const dep = { ...b, deposit: { status: "paid", amountFen: 5000, refundFen: 0, forfeitFen: 0, payExpireTime: "", settleReason: "" } as never };
  it("任何取消（含无保证金）确认框都带「有保证金的预约取消后将全额退还客人保证金」（变异：删掉即红）", () => {
    expect(actionConfirmCopy("cancel", b).msg).toContain(CANCEL_DEPOSIT_NOTICE);
    expect(actionConfirmCopy("cancel", dep).msg).toContain(CANCEL_DEPOSIT_NOTICE);
  });
  it("本单有保证金 ⇒ 额外明示「本单已收取保证金，取消后将全额退还」；无保证金不出现该句", () => {
    expect(actionConfirmCopy("cancel", dep).msg).toContain("本单已收取保证金");
    expect(actionConfirmCopy("cancel", b).msg).not.toContain("本单已收取保证金");
  });
  it("接单/核销文案；核销对有保证金的单提示按规则结算", () => {
    expect(actionConfirmCopy("confirm", b).title).toBe("接单确认");
    expect(actionConfirmCopy("complete", b).msg).not.toContain("保证金");
    expect(actionConfirmCopy("complete", dep).msg).toContain("保证金");
  });
});

describe("normalizeMerchantBooking / describeMerchantStatus", () => {
  it("缺字段安全默认；手机号原样不脱敏；deposit 非对象 ⇒ null；rawStatus 缺失回落 status", () => {
    const v = normalizeMerchantBooking({ id: 5, status: "confirmed", customerPhone: "13800138000", customerName: "李四", guestCount: 2, deposit: "x" });
    expect(v.customerPhone).toBe("13800138000");
    expect(v.rawStatus).toBe("confirmed");
    expect(v.deposit).toBeNull();
    expect(normalizeMerchantBooking(null).id).toBe(0);
  });
  it("deposit 对象规整；status 缺失 ⇒ unknown（不冒出可操作态）", () => {
    const v = normalizeMerchantBooking({ id: 1, status: "pending", deposit: { amountFen: 3000.9 } });
    expect(v.deposit).toMatchObject({ status: "unknown", amountFen: 3000 });
  });
  it("状态文案：no_show 展示为「未到店」；未知状态原样 muted", () => {
    expect(describeMerchantStatus("no_show").label).toBe("未到店");
    expect(describeMerchantStatus("zzz")).toEqual({ label: "zzz", tone: "muted" });
  });
});

describe("商家预约仓储契约", () => {
  it("⭐list：GET /booking/bookings，authRequired，幂等，query 由 buildBookingQuery 生成，**不带 merchantId**", async () => {
    const f = fakeClient(() => ({ ok: true, value: { list: [{ id: 1, status: "pending", customerPhone: "13800138000" }], total: 1 } }));
    const repo = createMerchantBookingRepository({ client: f.client });
    const r = await repo.list(ctx, { filter: { status: "pending", date: "", channel: "" }, page: 1, pageSize: 20 });
    expect(f.seen[0]).toMatchObject({ method: "GET", url: "/booking/bookings", authRequired: true, replayPolicy: "idempotent" });
    expect(f.seen[0].query).toEqual({ status: "pending", page: "1", pageSize: "20" });
    expect(f.seen[0].query && "merchantId" in f.seen[0].query).toBe(false);
    expect(r.ok && r.value.list[0].customerPhone).toBe("13800138000");
  });
  it("list：list 非数组当 []，total 缺失回落条数", async () => {
    const repo = createMerchantBookingRepository({ client: fakeClient(() => ({ ok: true, value: {} })).client });
    const r = await repo.list(ctx, { filter: EMPTY_BOOKING_FILTER, page: 1, pageSize: 20 });
    expect(r.ok && r.value).toMatchObject({ list: [], total: 0 });
  });
  it("⭐act：POST /booking/bookings/:id/{confirm|complete|cancel}，不带 body，authRequired，never 重放（变异：带 body/改 replay 即红）", async () => {
    for (const a of ["confirm", "complete", "cancel"] as const) {
      const f = fakeClient(() => ({ ok: true, value: { id: 9, status: "confirmed" } }));
      const repo = createMerchantBookingRepository({ client: f.client });
      await repo.act(ctx, 9, a);
      expect(f.seen[0]).toMatchObject({ method: "POST", url: "/booking/bookings/9/" + a, authRequired: true, replayPolicy: "never" });
      expect(f.seen[0].body).toBeUndefined();
    }
  });
  it("仓储对象上不存在 no-show / deposit / refund / retry 方法（越界禁区）", () => {
    const repo = createMerchantBookingRepository({ client: fakeClient(() => ({ ok: true, value: {} })).client });
    expect(Object.keys(repo).sort()).toEqual(["act", "list"]);
  });
});

describe("列表拉取适配：错误映射", () => {
  const mk = (e: AppError) => createBookingListFetch({ bookings: createMerchantBookingRepository({ client: fakeClient(() => ({ ok: false, error: e })).client }) });
  const args = { filter: EMPTY_BOOKING_FILTER, page: 1, pageSize: 20 };
  it("401 ⇒ authExpired；业务失败原样；网络固定文案", async () => {
    expect(await mk(err("AUTH_EXPIRED", "unauthorized"))(ctx, args)).toMatchObject({ ok: false, authExpired: true });
    expect(await mk(err("BUSINESS", "状态筛选不合法", 500))(ctx, args)).toMatchObject({ ok: false, message: "状态筛选不合法", authExpired: false });
    expect(await mk(err("NETWORK", "transport failure: network"))(ctx, args)).toMatchObject({ ok: false, message: "网络异常，请检查网络后重试" });
  });
});

describe("⭐状态变更执行器：防重 + 失败文案", () => {
  it("进行中再点（任何预约/任何操作）直接 busy，不发第二次请求（变异：去掉 busy 防重即红）", async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    const f = fakeClient(async () => { await gate; return { ok: true, value: { id: 1, status: "confirmed" } }; });
    const runner = createBookingActionRunner({ bookings: createMerchantBookingRepository({ client: f.client }) });
    const p1 = runner.run(ctx, 1, "confirm");
    expect(runner.busyId()).toBe(1);
    const second = await runner.run(ctx, 2, "cancel");
    expect(second).toMatchObject({ ok: false, kind: "busy" });
    release();
    expect((await p1).ok).toBe(true);
    expect(f.seen.length).toBe(1);
    expect(runner.busyId()).toBeNull(); // 完成后释放，可再次操作
  });
  it("后端业务错误（HTTP200+code=500，重复点击非幂等）⇒ failed + 原样后端文案；之后可再次操作", async () => {
    const f = fakeClient(() => ({ ok: false, error: err("BUSINESS", "当前状态（已确认）不可执行该操作", 500) }));
    const runner = createBookingActionRunner({ bookings: createMerchantBookingRunnerRepo(f) });
    const r = await runner.run(ctx, 3, "confirm");
    expect(r).toEqual({ ok: false, kind: "failed", message: "当前状态（已确认）不可执行该操作" });
    expect(runner.busyId()).toBeNull();
  });
  it("⭐资金类动作遇网络/超时 ⇒ unknown +「结果未知，请刷新核对」，**不得**提示重试（有保证金取消会同步发起微信退款；变异：改回通用文案即红）", async () => {
    for (const kind of ["NETWORK", "TIMEOUT"] as const) {
      for (const action of ["confirm", "complete", "cancel"] as const) {
        const f = fakeClient(() => ({ ok: false, error: err(kind, "transport failure: " + kind.toLowerCase()) }));
        const runner = createBookingActionRunner({ bookings: createMerchantBookingRunnerRepo(f) });
        const r = await runner.run(ctx, 1, action);
        expect(r, kind + action).toMatchObject({ ok: false, kind: "unknown", message: MERCHANT_ACTION_UNKNOWN_TEXT });
        if (!r.ok) {
          expect(r.message).toContain("结果未知");
          expect(r.message).toContain("刷新核对");
          expect(r.message).not.toMatch(/请重试|稍后重试/);
        }
        expect(f.seen.length).toBe(1); // 绝不自动重发
        expect(runner.busyId()).toBeNull(); // 失败后释放占位
      }
    }
  });
  it("网络/超时以外的失败不受影响：业务错误原样、403 固定文案", async () => {
    const f = fakeClient(() => ({ ok: false, error: err("BUSINESS", "预约状态已变化，请刷新后重试", 500) }));
    expect(await createBookingActionRunner({ bookings: createMerchantBookingRunnerRepo(f) }).run(ctx, 1, "cancel")).toEqual({ ok: false, kind: "failed", message: "预约状态已变化，请刷新后重试" });
  });
  it("401 ⇒ auth-expired；403 ⇒ 固定「无权限」文案", async () => {
    const mk = (e: AppError) => createBookingActionRunner({ bookings: createMerchantBookingRunnerRepo(fakeClient(() => ({ ok: false, error: e }))) });
    expect(await mk(err("AUTH_EXPIRED"))
      .run(ctx, 1, "complete")).toMatchObject({ ok: false, kind: "auth-expired" });
    expect(await mk(err("BUSINESS", "x", 403)).run(ctx, 1, "cancel")).toMatchObject({ ok: false, kind: "failed", message: "无权限执行此操作" });
  });
});
function createMerchantBookingRunnerRepo(f: ReturnType<typeof fakeClient>) {
  return createMerchantBookingRepository({ client: f.client });
}

describe("工作台入口 / 页面接线（源码级）", () => {
  it("预约入口按 booking 权限显隐", () => {
    expect(MERCHANT_ENTRIES.map((e) => e.key)).toContain("booking");
    expect(visibleEntries({ permissions: ["booking"] }).map((e) => e.key)).toEqual(["booking"]);
    // 无关权限不显示预约入口（相册入口随 M2 出现，所以不再断言整体为空，只断言「不含预约」）
    expect(visibleEntries({ permissions: ["album"] }).map((e) => e.key)).not.toContain("booking");
    expect(visibleEntries({ permissions: ["unrelated"] })).toEqual([]);
    expect(visibleEntries(null)).toEqual([]);
  });
  it("页面：取消走 BaseDialog 确认、拨号走 platform dialer、不直调 uni.makePhoneCall / wx.*", () => {
    expect(page).toContain("dialogRef.value?.confirm");
    expect(page).toContain("createUniDialer");
    expect(page).not.toMatch(/uni\.makePhoneCall|\bwx\./);
  });
  it("⭐页面代码/模板里没有 no-show / 退款 / deposit 预览 / 重试 的入口或调用（主人拍板：不做资金动作；注释里的说明不算）", () => {
    // 去掉 JS 行/块注释与 HTML 注释：头注释会解释「不做什么」，守卫只看真实代码与模板
    const code = page.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const bad of ["no-show", "noShow", "deposit/refund", "deposit/preview", "deposit/retry", "markNoShow"]) expect(code, bad).not.toContain(bad);
  });
  it("⭐页面：只有 auth-expired 提前返回；其它失败（含 unknown 结果未知）也要走 reload() 刷新列表核对；不含死代码 disposed", () => {
    const fn = page.slice(page.indexOf("async function onActionTap"), page.indexOf("async function onCallTap"));
    expect(fn.match(/return;/g)?.length).toBe(3); // 防重 / 取消确认 / auth-expired；unknown 与 failed 不得 return
    const afterRun = fn.slice(fn.indexOf("runner.run("));
    expect(afterRun.slice(afterRun.indexOf("auth-expired"), afterRun.indexOf("await reload()"))).not.toContain("unknown");
    expect(afterRun).toContain("await reload()");
    expect(page).not.toContain("disposed");
  });
  it("页面注册：booking/list 启用下拉刷新与触底距离，且位于商家分包内", () => {
    const pj = readFileSync(resolve(root, "src/pages.json"), "utf-8");
    const at = pj.indexOf('"path": "booking/list"');
    expect(at).toBeGreaterThan(pj.indexOf('"root": "pkg-merchant"'));
    expect(pj.slice(at, at + 260)).toContain('"enablePullDownRefresh": true');
  });
});
