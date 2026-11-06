// T8 到店预约 MVP：domain/booking 纯逻辑单测——状态映射／日期窗口（跨月/跨年/闰年）／手机号与表单校验／时段文案。
import { describe, expect, it } from "vitest";
import {
  BOOKING_AUTH_EXPIRED_TEXT,
  BOOKING_CREATE_NETWORK_TEXT,
  BOOKING_GENERIC_FAIL_TEXT,
  BOOKING_NETWORK_TEXT,
  BOOKING_STATUSES,
  bookingErrorMessage,
  classifyBookingError,
  GUEST_COUNT_MAX,
  GUEST_COUNT_MIN,
  BOOKING_SILENT_REFRESH_INTERVAL_MS,
  BOOKING_SUCCESS_MAX_AGE_MS,
  buildDateWindow,
  describeBookingStatus,
  describeSlotAvailability,
  normalizeSlotReason,
  formatLocalDate,
  isCancellableStatus,
  isNoBrandContextError,
  isValidPhone,
  planBookingShowRefresh,
  shouldLeaveSuccessState,
  clampGuestCount,
  maxGuestCountForSlot,
  validateBookingForm,
} from "../../src/domain/booking";

describe("domain/booking · 状态映射", () => {
  it("七个状态各有固定文案与色阶；文案为产品确认口径（含预约保证金新增的待支付/已爽约）", () => {
    expect(describeBookingStatus("pending")).toEqual({ label: "待确认", tone: "action" });
    expect(describeBookingStatus("confirmed")).toEqual({ label: "已确认", tone: "action" });
    expect(describeBookingStatus("completed")).toEqual({ label: "已完成", tone: "muted" });
    expect(describeBookingStatus("cancelled")).toEqual({ label: "已取消", tone: "danger" });
    expect(describeBookingStatus("expired")).toEqual({ label: "已过期", tone: "muted" });
    // 预约保证金（§10.2）新增：待支付（需用户行动 ⇒ action）／已爽约（负向终态 ⇒ danger）
    expect(describeBookingStatus("awaiting_payment")).toEqual({ label: "待支付", tone: "action" });
    expect(describeBookingStatus("no_show")).toEqual({ label: "已爽约", tone: "danger" });
    expect(BOOKING_STATUSES.length).toBe(7);
  });

  it("未知状态不抛错，原样展示、弱化色阶（不假装成功态）", () => {
    expect(describeBookingStatus("weird")).toEqual({ label: "weird", tone: "muted" });
  });

  it("仅 pending/confirmed/awaiting_payment 可取消（待支付可放弃占位；已爽约是履约终态不可取消）", () => {
    expect(isCancellableStatus("pending")).toBe(true);
    expect(isCancellableStatus("confirmed")).toBe(true);
    expect(isCancellableStatus("awaiting_payment")).toBe(true);
    for (const s of ["completed", "cancelled", "expired", "no_show", "", "x"]) expect(isCancellableStatus(s)).toBe(false);
  });
});

describe("domain/booking · 14 天日期窗口", () => {
  it("含今天共 14 天；首日标「今天」且 isToday，其余按星期标注", () => {
    const w = buildDateWindow(new Date(2026, 10, 4, 15, 30)); // 2026-11-04 周三
    expect(w.length).toBe(14);
    expect(w[0]).toEqual({ date: "2026-11-04", label: "11-04", weekLabel: "今天", isToday: true });
    expect(w[1].weekLabel).toBe("周四");
    expect(w[1].isToday).toBe(false);
    expect(w[13].date).toBe("2026-11-17");
    expect(w.filter((d) => d.isToday).length).toBe(1);
  });

  it("跨月：1 月 25 日起的窗口进位到 2 月", () => {
    const w = buildDateWindow(new Date(2026, 0, 25));
    expect(w[0].date).toBe("2026-01-25");
    expect(w[6].date).toBe("2026-01-31");
    expect(w[7].date).toBe("2026-02-01");
    expect(w[13].date).toBe("2026-02-07");
  });

  it("跨年：12 月 25 日起的窗口进位到次年 1 月", () => {
    const w = buildDateWindow(new Date(2026, 11, 25));
    expect(w[6].date).toBe("2026-12-31");
    expect(w[7].date).toBe("2027-01-01");
    expect(w[13].date).toBe("2027-01-07");
  });

  it("闰年 2 月 29 日存在（2028），平年（2027）直接 3 月 1 日", () => {
    const leap = buildDateWindow(new Date(2028, 1, 27));
    expect(leap.map((d) => d.date).slice(0, 4)).toEqual(["2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01"]);
    const common = buildDateWindow(new Date(2027, 1, 27));
    expect(common.map((d) => d.date).slice(0, 3)).toEqual(["2027-02-27", "2027-02-28", "2027-03-01"]);
  });

  it("按本地日期而非 UTC：本地 00:30 / 23:59 同属当天", () => {
    expect(buildDateWindow(new Date(2026, 5, 9, 0, 30))[0].date).toBe("2026-06-09");
    expect(buildDateWindow(new Date(2026, 5, 9, 23, 59))[0].date).toBe("2026-06-09");
    expect(formatLocalDate(new Date(2026, 0, 3))).toBe("2026-01-03"); // 个位月日补零
  });
});

describe("domain/booking · 手机号与表单校验", () => {
  it("手机号：11 位、1 开头", () => {
    expect(isValidPhone("13800138000")).toBe(true);
    expect(isValidPhone(" 13800138000 ")).toBe(true); // 首尾空白容忍
    for (const bad of ["", "1380013800", "138001380001", "23800138000", "1380013800a", "12345678901 2"]) {
      expect(isValidPhone(bad), bad).toBe(false);
    }
  });

  const ok = { customerName: "张三", customerPhone: "13800138000", guestCount: 2, remark: "" };

  it("合法表单返回 null", () => {
    expect(validateBookingForm(ok)).toBeNull();
    expect(validateBookingForm({ ...ok, remark: undefined })).toBeNull();
  });

  it("姓名：空/纯空白/超 32 报错；32 字边界通过", () => {
    expect(validateBookingForm({ ...ok, customerName: "" })?.field).toBe("customerName");
    expect(validateBookingForm({ ...ok, customerName: "   " })?.field).toBe("customerName");
    expect(validateBookingForm({ ...ok, customerName: "a".repeat(33) })?.field).toBe("customerName");
    expect(validateBookingForm({ ...ok, customerName: "a".repeat(32) })).toBeNull();
  });

  it("手机号错误给出字段与提示", () => {
    const e = validateBookingForm({ ...ok, customerPhone: "123" });
    expect(e).toEqual({ field: "customerPhone", message: "请填写正确的手机号" });
  });

  it("人数：步进器 1..20 边界；0/21/小数/NaN 拒绝", () => {
    expect(GUEST_COUNT_MIN).toBe(1);
    expect(GUEST_COUNT_MAX).toBe(20);
    expect(validateBookingForm({ ...ok, guestCount: 1 })).toBeNull();
    expect(validateBookingForm({ ...ok, guestCount: 20 })).toBeNull();
    for (const bad of [0, 21, 1.5, Number.NaN, -1]) {
      expect(validateBookingForm({ ...ok, guestCount: bad })?.field, String(bad)).toBe("guestCount");
    }
  });

  it("备注：255 边界通过，256 报错", () => {
    expect(validateBookingForm({ ...ok, remark: "x".repeat(255) })).toBeNull();
    expect(validateBookingForm({ ...ok, remark: "x".repeat(256) })?.field).toBe("remark");
  });

  it("多处出错时按 姓名→手机号→人数→备注 顺序返回首个", () => {
    expect(validateBookingForm({ customerName: "", customerPhone: "1", guestCount: 0, remark: "x".repeat(300) })?.field).toBe(
      "customerName",
    );
  });
});

describe("domain/booking · 时段可点性文案", () => {
  it("bookable=true → 可点、显示剩余 N 席", () => {
    expect(describeSlotAvailability({ remaining: 3, bookable: true })).toEqual({ clickable: true, badge: "剩余3席" });
  });
  it("bookable=false 且无余量 → 已约满", () => {
    expect(describeSlotAvailability({ remaining: 0, bookable: false })).toEqual({ clickable: false, badge: "已约满" });
  });
  it("bookable=false 但有余量（当天已过时段）→ 已过时", () => {
    expect(describeSlotAvailability({ remaining: 2, bookable: false })).toEqual({ clickable: false, badge: "已过时" });
  });

  it("reason=past → 已过时（即使 remaining>0）", () => {
    expect(describeSlotAvailability({ remaining: 2, bookable: false, reason: "past" })).toEqual({ clickable: false, badge: "已过时" });
  });
  it("reason=full → 已约满", () => {
    expect(describeSlotAvailability({ remaining: 0, bookable: false, reason: "full" })).toEqual({ clickable: false, badge: "已约满" });
  });
  it("past 与 full 同时成立（remaining=0 且后端给 past）→ 以后端为准显示已过时", () => {
    expect(describeSlotAvailability({ remaining: 0, bookable: false, reason: "past" })).toEqual({ clickable: false, badge: "已过时" });
  });
  it("reason=full 但 remaining>0（后端为准）→ 已约满", () => {
    expect(describeSlotAvailability({ remaining: 3, bookable: false, reason: "full" })).toEqual({ clickable: false, badge: "已约满" });
  });
  it("reason 为空串/缺失 + bookable=false → 走推断兜底", () => {
    expect(describeSlotAvailability({ remaining: 0, bookable: false, reason: "" })).toEqual({ clickable: false, badge: "已约满" });
    expect(describeSlotAvailability({ remaining: 2, bookable: false, reason: "" })).toEqual({ clickable: false, badge: "已过时" });
    expect(describeSlotAvailability({ remaining: 0, bookable: false })).toEqual({ clickable: false, badge: "已约满" });
    expect(describeSlotAvailability({ remaining: 2, bookable: false })).toEqual({ clickable: false, badge: "已过时" });
  });
  it("bookable=true 时忽略 reason", () => {
    expect(describeSlotAvailability({ remaining: 1, bookable: true, reason: "" })).toEqual({ clickable: true, badge: "剩余1席" });
  });
  it("normalizeSlotReason：仅认 past/full，其余（缺失/未知/非字符串）→ 空串", () => {
    expect(normalizeSlotReason("past")).toBe("past");
    expect(normalizeSlotReason("full")).toBe("full");
    for (const v of [undefined, null, "", "x", 1, {}]) expect(normalizeSlotReason(v)).toBe("");
  });
});

describe("domain/booking · 错误文案映射（按 AppError.kind）", () => {
  const TECH = ["unauthorized", "transport failure: timeout", "transport failure: network", "login required: no-session", "stale session: authRevision mismatch"];

  it("BUSINESS：保留服务端中文 message 原样；message 为空/空白时用调用方 fallback（默认通用文案）", () => {
    expect(bookingErrorMessage({ kind: "BUSINESS", message: "该时段已约满" })).toBe("该时段已约满");
    expect(bookingErrorMessage({ kind: "BUSINESS", message: "" }, "预约提交失败，请重试")).toBe("预约提交失败，请重试");
    expect(bookingErrorMessage({ kind: "BUSINESS", message: "   " })).toBe(BOOKING_GENERIC_FAIL_TEXT);
  });

  it("AUTH_EXPIRED：一律‘登录已失效，请重新登录’，不透出 unauthorized／login required／stale session", () => {
    for (const m of ["unauthorized", "login required: no-session", "stale session: authRevision mismatch"]) {
      expect(bookingErrorMessage({ kind: "AUTH_EXPIRED", message: m })).toBe("登录已失效，请重新登录");
    }
    expect(BOOKING_AUTH_EXPIRED_TEXT).toBe("登录已失效，请重新登录");
  });

  it("NETWORK／TIMEOUT：一律‘网络不太稳定，请稍后重试’，不透出 transport failure", () => {
    expect(bookingErrorMessage({ kind: "NETWORK", message: "transport failure: network" })).toBe("网络不太稳定，请稍后重试");
    expect(bookingErrorMessage({ kind: "TIMEOUT", message: "transport failure: timeout" })).toBe("网络不太稳定，请稍后重试");
    expect(BOOKING_NETWORK_TEXT).toBe("网络不太稳定，请稍后重试");
  });

  it("其它（UNKNOWN／CANCELLED／INSUFFICIENT_CREDITS／QUALITY_REJECTED／未见过的 kind）：‘操作失败，请稍后重试’", () => {
    for (const kind of ["UNKNOWN", "CANCELLED", "INSUFFICIENT_CREDITS", "QUALITY_REJECTED", "SOMETHING_NEW"]) {
      expect(bookingErrorMessage({ kind, message: "whatever english" })).toBe("操作失败，请稍后重试");
    }
  });

  it("归类函数：BUSINESS→business｜AUTH_EXPIRED→auth｜NETWORK/TIMEOUT→network｜其余→other", () => {
    expect(classifyBookingError({ kind: "BUSINESS" })).toBe("business");
    expect(classifyBookingError({ kind: "AUTH_EXPIRED" })).toBe("auth");
    expect(classifyBookingError({ kind: "NETWORK" })).toBe("network");
    expect(classifyBookingError({ kind: "TIMEOUT" })).toBe("network");
    expect(classifyBookingError({ kind: "CANCELLED" })).toBe("other");
  });

  it("任何非 BUSINESS 的 kind，输出都不含英文技术串", () => {
    for (const kind of ["AUTH_EXPIRED", "NETWORK", "TIMEOUT", "CANCELLED", "UNKNOWN"]) {
      for (const m of TECH) expect(bookingErrorMessage({ kind, message: m })).not.toMatch(/[A-Za-z]{4,}/);
    }
  });

  it("创建预约遇网络类失败的专属文案（含‘请勿重复提交’与‘我的预约’）", () => {
    expect(BOOKING_CREATE_NETWORK_TEXT).toBe("网络不太稳定。若稍后在「我的预约」里看到该预约，说明已提交成功，请勿重复提交");
  });
});

describe("domain/booking · 席位口径的人数上限（档期容量＝席位＝可预约总人数）", () => {
  it("上限 = min(20, 剩余席位)：remaining 小于 20 取 remaining，大于等于 20 封顶 20", () => {
    expect(maxGuestCountForSlot({ remaining: 6 })).toBe(6);
    expect(maxGuestCountForSlot({ remaining: 1 })).toBe(1);
    expect(maxGuestCountForSlot({ remaining: 20 })).toBe(20);
    expect(maxGuestCountForSlot({ remaining: 35 })).toBe(GUEST_COUNT_MAX);
  });

  it("未选档期或 remaining 缺失/非有限数 ⇒ 回落 20（由服务端兜底）；remaining<=0 防御性不低于 1", () => {
    expect(maxGuestCountForSlot(null)).toBe(GUEST_COUNT_MAX);
    expect(maxGuestCountForSlot(undefined)).toBe(GUEST_COUNT_MAX);
    expect(maxGuestCountForSlot({ remaining: Number.NaN })).toBe(GUEST_COUNT_MAX);
    expect(maxGuestCountForSlot({ remaining: undefined as unknown as number })).toBe(GUEST_COUNT_MAX);
    expect(maxGuestCountForSlot({ remaining: 0 })).toBe(GUEST_COUNT_MIN);
    expect(maxGuestCountForSlot({ remaining: -3 })).toBe(GUEST_COUNT_MIN);
    expect(maxGuestCountForSlot({ remaining: 4.9 })).toBe(4); // 席位为整数，小数向下取整
  });

  it("人数收敛：超限收敛到上限、合法值原样、低于下限/非有限数回落 1", () => {
    expect(clampGuestCount(11, 6)).toBe(6);
    expect(clampGuestCount(6, 6)).toBe(6);
    expect(clampGuestCount(2, 6)).toBe(2);
    expect(clampGuestCount(0, 6)).toBe(GUEST_COUNT_MIN);
    expect(clampGuestCount(Number.NaN, 6)).toBe(GUEST_COUNT_MIN);
    expect(clampGuestCount(25)).toBe(GUEST_COUNT_MAX); // 缺省上限＝20
    expect(clampGuestCount(5, 0)).toBe(GUEST_COUNT_MIN); // 非法上限不低于 1
    expect(clampGuestCount(5, 99)).toBe(5); // 上限不超过 20 的全局封顶
    expect(clampGuestCount(30, 99)).toBe(GUEST_COUNT_MAX);
    expect(clampGuestCount(5, Number.NaN)).toBe(5);
  });
});

// —— tab 页常驻：onShow 的「重建窗口／重拉」判定（纯函数，注入 now）——
describe("domain/booking · planBookingShowRefresh（跨日重建／选中日纠偏／间隔重拉）", () => {
  const at = (y: number, m: number, d: number, hh = 10, mm = 0, ss = 0) => new Date(y, m - 1, d, hh, mm, ss);
  const T0 = at(2026, 11, 10).getTime();

  it("常量：静默重拉间隔 30s、成功页保留 60s", () => {
    expect(BOOKING_SILENT_REFRESH_INTERVAL_MS).toBe(30_000);
    expect(BOOKING_SUCCESS_MAX_AGE_MS).toBe(60_000);
  });

  type Case = {
    name: string;
    now: Date;
    windowFirst: string;
    selected: string;
    lastAt: number;
    expected: { rebuildWindow: boolean; selectedDateIndex: number; selectedDateChanged: boolean; refetch: boolean };
  };
  const cases: Case[] = [
    {
      name: "同日 + 间隔未到：不重建、不重拉",
      now: at(2026, 11, 10, 10, 0, 29),
      windowFirst: "2026-11-10",
      selected: "2026-11-12",
      lastAt: T0,
      expected: { rebuildWindow: false, selectedDateIndex: 2, selectedDateChanged: false, refetch: false },
    },
    {
      name: "同日 + 间隔恰好 30s：不重建、重拉（边界含等号）",
      now: at(2026, 11, 10, 10, 0, 30),
      windowFirst: "2026-11-10",
      selected: "2026-11-10",
      lastAt: T0,
      expected: { rebuildWindow: false, selectedDateIndex: 0, selectedDateChanged: false, refetch: true },
    },
    {
      name: "同日 + 间隔 29.999s：不重拉（边界）",
      now: new Date(T0 + 29_999),
      windowFirst: "2026-11-10",
      selected: "2026-11-10",
      lastAt: T0,
      expected: { rebuildWindow: false, selectedDateIndex: 0, selectedDateChanged: false, refetch: false },
    },
    {
      name: "同日 + 间隔已久：不重建、重拉",
      now: at(2026, 11, 10, 18, 0, 0),
      windowFirst: "2026-11-10",
      selected: "2026-11-15",
      lastAt: T0,
      expected: { rebuildWindow: false, selectedDateIndex: 5, selectedDateChanged: false, refetch: true },
    },
    {
      name: "跨日 + 间隔未到（刚拉过）：仍重建且重拉；选中日期仍在窗口内 ⇒ 保留日期、下标左移一格",
      now: at(2026, 11, 11, 0, 0, 5),
      windowFirst: "2026-11-10",
      selected: "2026-11-12",
      lastAt: at(2026, 11, 11, 0, 0, 1).getTime(),
      expected: { rebuildWindow: true, selectedDateIndex: 1, selectedDateChanged: false, refetch: true },
    },
    {
      name: "跨日 + 选中的是昨天（已被挤出窗口）：纠偏到今天（下标 0）并标记已变更",
      now: at(2026, 11, 11, 9, 0, 0),
      windowFirst: "2026-11-10",
      selected: "2026-11-10",
      lastAt: T0,
      expected: { rebuildWindow: true, selectedDateIndex: 0, selectedDateChanged: true, refetch: true },
    },
    {
      name: "跨日 + 选中窗口最后一天（新窗口末格仍包含）：保留",
      now: at(2026, 11, 11, 9, 0, 0),
      windowFirst: "2026-11-10",
      selected: "2026-11-23",
      lastAt: T0,
      expected: { rebuildWindow: true, selectedDateIndex: 12, selectedDateChanged: false, refetch: true },
    },
    {
      name: "跨月：10-31 → 11-01，选中 11-02 仍在窗口",
      now: at(2026, 11, 1, 8, 0, 0),
      windowFirst: "2026-10-31",
      selected: "2026-11-02",
      lastAt: at(2026, 10, 31, 23, 59, 0).getTime(),
      expected: { rebuildWindow: true, selectedDateIndex: 1, selectedDateChanged: false, refetch: true },
    },
    {
      name: "跨年：12-31 → 01-01，选中 12-31 被挤出 ⇒ 纠偏",
      now: at(2027, 1, 1, 8, 0, 0),
      windowFirst: "2026-12-31",
      selected: "2026-12-31",
      lastAt: at(2026, 12, 31, 23, 59, 0).getTime(),
      expected: { rebuildWindow: true, selectedDateIndex: 0, selectedDateChanged: true, refetch: true },
    },
    {
      name: "窗口首日为空串（异常）：视为需要重建",
      now: at(2026, 11, 10),
      windowFirst: "",
      selected: "2026-11-10",
      lastAt: T0,
      expected: { rebuildWindow: true, selectedDateIndex: 0, selectedDateChanged: false, refetch: true },
    },
    {
      name: "时钟回拨（now 早于上次拉取）：按到期重拉",
      now: new Date(T0 - 5_000),
      windowFirst: "2026-11-10",
      selected: "2026-11-10",
      lastAt: T0,
      expected: { rebuildWindow: false, selectedDateIndex: 0, selectedDateChanged: false, refetch: true },
    },
    {
      name: "从未拉取过（lastAt=NaN）：按到期重拉",
      now: new Date(T0),
      windowFirst: "2026-11-10",
      selected: "2026-11-10",
      lastAt: Number.NaN,
      expected: { rebuildWindow: false, selectedDateIndex: 0, selectedDateChanged: false, refetch: true },
    },
  ];
  for (const c of cases) {
    it(c.name, () => {
      expect(
        planBookingShowRefresh({ now: c.now, windowFirstDate: c.windowFirst, selectedDate: c.selected, lastRefreshAt: c.lastAt }),
      ).toEqual(c.expected);
    });
  }

  it("间隔可注入：intervalMs=5s 时 6s 即到期", () => {
    const p = planBookingShowRefresh({ now: new Date(T0 + 6_000), windowFirstDate: "2026-11-10", selectedDate: "2026-11-10", lastRefreshAt: T0, intervalMs: 5_000 });
    expect(p.refetch).toBe(true);
  });

  it("「今天」口径与 buildDateWindow／formatLocalDate 一致：窗口首日恰为 formatLocalDate(now) 时不判跨日", () => {
    const now = at(2026, 11, 10, 23, 59, 59);
    expect(buildDateWindow(now)[0].date).toBe(formatLocalDate(now));
    expect(planBookingShowRefresh({ now, windowFirstDate: buildDateWindow(now)[0].date, selectedDate: "2026-11-10", lastRefreshAt: now.getTime() }).rebuildWindow).toBe(false);
  });
});

describe("domain/booking · shouldLeaveSuccessState（成功页回到表单态）", () => {
  const S = 1_000_000;
  const table: Array<[string, { nowMs: number; successAt: number | null; wasHidden: boolean }, boolean]> = [
    ["非成功态（successAt=null）：不处理", { nowMs: S + 999_999, successAt: null, wasHidden: true }, false],
    ["成功后未切走、未满 60s：保持成功页", { nowMs: S + 59_999, successAt: S, wasHidden: false }, false],
    ["成功后未切走、恰满 60s：回表单", { nowMs: S + 60_000, successAt: S, wasHidden: false }, true],
    ["成功后切走过（即便只过 1s）：回表单", { nowMs: S + 1_000, successAt: S, wasHidden: true }, true],
    ["时钟回拨：按到期处理", { nowMs: S - 1, successAt: S, wasHidden: false }, true],
  ];
  for (const [name, input, expected] of table) {
    it(name, () => expect(shouldLeaveSuccessState(input)).toBe(expected));
  }
});

describe("domain/booking · isNoBrandContextError", () => {
  it("仅业务失败 + 契约文案命中（容忍首尾空白）；其余一律不算", () => {
    expect(isNoBrandContextError({ kind: "BUSINESS", message: "请先选择入驻门店" })).toBe(true);
    expect(isNoBrandContextError({ kind: "BUSINESS", message: " 请先选择入驻门店 " })).toBe(true);
    expect(isNoBrandContextError({ kind: "BUSINESS", message: "该时段已约满" })).toBe(false);
    expect(isNoBrandContextError({ kind: "NETWORK", message: "请先选择入驻门店" })).toBe(false);
    expect(isNoBrandContextError({ kind: "BUSINESS" })).toBe(false);
  });
});
