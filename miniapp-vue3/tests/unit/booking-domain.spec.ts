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
  buildDateWindow,
  describeBookingStatus,
  describeSlotAvailability,
  normalizeSlotReason,
  formatLocalDate,
  isCancellableStatus,
  isValidPhone,
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
