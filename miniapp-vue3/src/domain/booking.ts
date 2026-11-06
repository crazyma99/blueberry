// T8 到店预约 MVP：纯逻辑（状态映射／日期窗口／手机号与表单校验）。
// 契约事实源（backend-dev 并行冻结，字段名不得改——详见 PR/任务说明）：
//   GET  /api/shops/:id/slots?date=YYYY-MM-DD          → {date, slots:[{slotId,startTime,endTime,capacity,used,remaining,bookable,reason}]}
//   POST /api/bookings                                  → booking 视图
//   GET  /api/bookings?status=&page=&pageSize=          → {list, total, page, pageSize}
//   POST /api/bookings/:id/cancel                       → booking 视图
// booking 视图：{id,shopId,shopName,slotId,startTime,endTime,date,customerName,customerPhone,guestCount,remark,status,channel,createTime,deposit}
// 产品规则（主人已确认）：可约窗口＝今天起 14 天（含今天）；人数用步进器 1..20（主人拍板：5+ 用步进器更简单，不做"5+"离散档）。
// 预约保证金（2026-11-05 §10 冻结契约）：门店可配「是否开启预约保证金」；开启的门店下单进入 awaiting_payment（待支付、已占档期），
//   支付链路与保证金展示由 domain/booking-deposit.ts（纯函数）承载，本文件只负责预约 status 本身。未开启的门店行为与此前的免保证金预约完全一致。
export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "expired" | "awaiting_payment" | "no_show";

export const BOOKING_STATUSES: readonly BookingStatus[] = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "expired",
  "awaiting_payment",
  "no_show",
];

export interface BookingStatusMeta {
  readonly label: string;
  /** 色阶 token 键（遵循现有设计 token：action=金色强调／muted=弱化／danger=警示） */
  readonly tone: "action" | "muted" | "danger";
}

const STATUS_META: Record<BookingStatus, BookingStatusMeta> = {
  pending: { label: "待确认", tone: "action" },
  confirmed: { label: "已确认", tone: "action" },
  completed: { label: "已完成", tone: "muted" },
  cancelled: { label: "已取消", tone: "danger" },
  expired: { label: "已过期", tone: "muted" },
  // 待支付：需要用户继续支付预约保证金 ⇒ 用 action（金色强调）引导其完成支付，与 pending/confirmed 同档的「需用户行动」语义
  awaiting_payment: { label: "待支付", tone: "action" },
  // 已爽约：到店预约未履约（按规则可能已扣除保证金），属负向终态 ⇒ 用 danger（与「已取消」同为警示色，和中性的「已完成/已过期」区分开）
  no_show: { label: "已爽约", tone: "danger" },
};

/** 状态 → 展示文案＋色阶；未知状态安全回落为「已过期」档（muted，不假装成功态） */
export function describeBookingStatus(status: string): BookingStatusMeta {
  return (STATUS_META as Record<string, BookingStatusMeta>)[status] ?? { label: status, tone: "muted" };
}

/**
 * 可取消态：pending/confirmed（既有）＋ awaiting_payment（待支付——用户可放弃支付并取消占位，仅释放档期、无结算）。
 * 其余态（已完成/已取消/已过期/已爽约）按钮不出现。no_show 为履约终态，不可由用户主动取消。
 */
export function isCancellableStatus(status: string): boolean {
  return status === "pending" || status === "confirmed" || status === "awaiting_payment";
}

export interface DateWindowDay {
  /** YYYY-MM-DD（本地日期，非 UTC） */
  date: string;
  /** 月-日展示（如 "11-05"） */
  label: string;
  /** 星期展示（如 "周三"） */
  weekLabel: string;
  isToday: boolean;
}

const WEEK_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

/** 本地日期格式化为 YYYY-MM-DD（不经 UTC 转换，避免跨时区错位——日期窗口是"自然日"概念） */
export function formatLocalDate(d: Date): string {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

/**
 * 生成「今天起 14 天（含今天）」的日期窗口，可注入 now（测试用；默认 new Date()）。
 * 纯函数：仅按本地年/月/日推进，天然处理跨月/跨年（Date 对象 setDate 溢出会自动进位）。
 */
export function buildDateWindow(now: Date = new Date(), days = 14): DateWindowDay[] {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const result: DateWindowDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    result.push({
      date: formatLocalDate(d),
      label: pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()),
      weekLabel: i === 0 ? "今天" : WEEK_LABELS[d.getDay()],
      isToday: i === 0,
    });
  }
  return result;
}

/** tab 页常驻后的静默重拉间隔：onShow 距上次拉取档期不足该值则不重拉（避免来回切 Tab 狂打接口） */
export const BOOKING_SILENT_REFRESH_INTERVAL_MS = 30_000;
/** 成功页保留时长：onShow 发现距成功已超过该值，回到可继续预约的表单态 */
export const BOOKING_SUCCESS_MAX_AGE_MS = 60_000;

export interface BookingShowRefreshInput {
  /** 当前时刻（可注入，测试用） */
  now: Date;
  /** 页面当前日期窗口第一格的日期（YYYY-MM-DD，即建窗时的「今天」） */
  windowFirstDate: string;
  /** 页面当前选中的日期 */
  selectedDate: string;
  /** 上次拉取档期的时间戳（毫秒） */
  lastRefreshAt: number;
  intervalMs?: number;
  days?: number;
}

export interface BookingShowRefreshPlan {
  /** 跨日：窗口第一格已不是今天，需用 buildDateWindow(now) 重建 */
  rebuildWindow: boolean;
  /** 重建（或沿用）后的窗口里，选中日期的下标；原选中日期被挤出窗口时纠偏为 0（今天） */
  selectedDateIndex: number;
  /** 选中日期被挤出窗口、已纠偏到另一天（此时旧档期与选中时段都不可再用，需回骨架重拉） */
  selectedDateChanged: boolean;
  /** 需要重拉当前选中日期的档期（跨日，或距上次拉取已达间隔） */
  refetch: boolean;
}

/**
 * onShow 的「是否重建日期窗口／重拉档期」判定（纯函数，可注入 now）。
 * 「今天」口径沿用本文件的 formatLocalDate／buildDateWindow（本地自然日），不另造时区逻辑。
 * 时钟回拨（elapsed<0）或 lastRefreshAt 非有限数一律视为到期，宁可多拉一次也不展示陈旧余量。
 */
export function planBookingShowRefresh(input: BookingShowRefreshInput): BookingShowRefreshPlan {
  const { now } = input;
  const rebuildWindow = input.windowFirstDate !== formatLocalDate(now);
  const win = buildDateWindow(now, input.days ?? 14);
  const idx = win.findIndex((d) => d.date === input.selectedDate);
  const elapsed = now.getTime() - input.lastRefreshAt;
  const intervalDue = !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= (input.intervalMs ?? BOOKING_SILENT_REFRESH_INTERVAL_MS);
  return {
    rebuildWindow,
    selectedDateIndex: idx >= 0 ? idx : 0,
    selectedDateChanged: idx < 0,
    refetch: rebuildWindow || intervalDue,
  };
}

/**
 * 成功页是否应回到表单态：已展示成功态，且（页面曾被切走 或 距成功已达 maxAgeMs）。
 * 时钟回拨（elapsed<0）按到期处理。
 */
export function shouldLeaveSuccessState(input: {
  nowMs: number;
  successAt: number | null;
  wasHidden: boolean;
  maxAgeMs?: number;
}): boolean {
  if (input.successAt == null) return false;
  if (input.wasHidden) return true;
  const elapsed = input.nowMs - input.successAt;
  return !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= (input.maxAgeMs ?? BOOKING_SUCCESS_MAX_AGE_MS);
}

/** 服务端「解析不到商家」的业务失败文案（契约《预约商家收敛》§3：code=500，message 原样展示）。确定性错误，重试无意义 */
export const NO_BRAND_CONTEXT_MESSAGE = "请先选择入驻门店";

/** 是否「无品牌上下文」：仅匹配业务失败 + 契约固定文案 */
export function isNoBrandContextError(err: { kind: string; message?: string }): boolean {
  return err.kind === "BUSINESS" && typeof err.message === "string" && err.message.trim() === NO_BRAND_CONTEXT_MESSAGE;
}

/** 手机号校验：11 位、1 开头（前端先校验，服务端仍会二次校验并回「手机号格式不正确」） */
export function isValidPhone(phone: string): boolean {
  // String() 兜底：`<input type="number">` 的 v-model 在部分容器会得到 number，不能假定一定是 string
  return /^1\d{10}$/.test(String(phone ?? "").trim());
}

export interface BookingFormInput {
  customerName: string;
  customerPhone: string;
  guestCount: number;
  remark?: string;
}

export interface FormFieldError {
  field: "customerName" | "customerPhone" | "guestCount" | "remark";
  message: string;
}

/** 人数步进器边界（主人拍板：用步进器 1..20 代替"5+"离散档） */
export const GUEST_COUNT_MIN = 1;
export const GUEST_COUNT_MAX = 20;

/**
 * 到店人数上限（2026-11 主人口径：档期容量＝席位＝可预约的总人数；slot.remaining 即剩余席位数）。
 * 上限 = min(GUEST_COUNT_MAX, 所选档期 remaining)，下限不低于 GUEST_COUNT_MIN（remaining<=0 的档期本就不可选，仅作防御）。
 * 未选档期（null/undefined）或 remaining 非有限数（旧后端/缺字段）⇒ 回落为 GUEST_COUNT_MAX，由服务端兜底校验。
 */
export function maxGuestCountForSlot(slot: { remaining: number } | null | undefined): number {
  if (slot == null || typeof slot.remaining !== "number" || !Number.isFinite(slot.remaining)) return GUEST_COUNT_MAX;
  return Math.max(GUEST_COUNT_MIN, Math.min(GUEST_COUNT_MAX, Math.floor(slot.remaining)));
}

/** 人数收敛：超出上限收敛到上限、低于下限收敛到下限、非有限数回落下限；合法值（含取整）原样保留 */
export function clampGuestCount(count: number, max: number = GUEST_COUNT_MAX): number {
  const hi = Number.isFinite(max) ? Math.max(GUEST_COUNT_MIN, Math.min(GUEST_COUNT_MAX, Math.floor(max))) : GUEST_COUNT_MAX;
  if (!Number.isFinite(count)) return GUEST_COUNT_MIN;
  return Math.max(GUEST_COUNT_MIN, Math.min(hi, Math.floor(count)));
}

/** 表单校验：姓名(1-32)／手机号(11位1开头)／人数(1-20)／备注(<=255)。返回首个命中的错误，全部通过返回 null。 */
export function validateBookingForm(input: BookingFormInput): FormFieldError | null {
  const name = String(input.customerName ?? "").trim();
  if (name.length < 1 || name.length > 32) {
    return { field: "customerName", message: "请填写姓名（1-32 个字符）" };
  }
  if (!isValidPhone(input.customerPhone)) {
    return { field: "customerPhone", message: "请填写正确的手机号" };
  }
  if (!Number.isInteger(input.guestCount) || input.guestCount < GUEST_COUNT_MIN || input.guestCount > GUEST_COUNT_MAX) {
    return { field: "guestCount", message: "到店人数需在 1-20 之间" };
  }
  const remark = input.remark ?? "";
  if (remark.length > 255) {
    return { field: "remark", message: "备注不能超过 255 个字符" };
  }
  return null;
}

/** 后端 slot.reason：""＝可约｜"past"＝已过开始时间｜"full"＝容量已满 */
export type SlotReason = "" | "past" | "full";

/** 归一化 reason：仅认 "past"/"full"；缺失/未知/旧后端一律视为 "" */
export function normalizeSlotReason(reason: unknown): SlotReason {
  return reason === "past" || reason === "full" ? reason : "";
}

/**
 * 时段格子的可点性与文案。
 * 优先级：bookable=true ⇒ 可点；否则优先用后端 reason（past→「已过时」，full→「已约满」；past 与 full 同时成立时后端给 past）；
 * reason 缺失/为空而 bookable=false（旧后端）⇒ 推断兜底：remaining<=0 ⇒「已约满」，否则「已过时」。
 */
export function describeSlotAvailability(slot: { remaining: number; bookable: boolean; reason?: SlotReason | string }): {
  clickable: boolean;
  badge: string;
} {
  if (slot.bookable) return { clickable: true, badge: "剩余" + slot.remaining + "席" };
  if (slot.reason === "past") return { clickable: false, badge: "已过时" };
  if (slot.reason === "full") return { clickable: false, badge: "已约满" };
  if (slot.remaining <= 0) return { clickable: false, badge: "已约满" };
  return { clickable: false, badge: "已过时" };
}

// —— 错误文案映射（纯函数）——
// http 层对非业务失败返回的是英文技术串（"unauthorized"／"transport failure: timeout"／"login required: …"），
// 不得展示给用户。这里按 `error.kind`（infrastructure/http/errors.ts AppErrorKind 的字符串取值）归类并给出中文文案；
// 只依赖结构化的 `{kind, message}`，不 import 基础设施层（domain 零依赖）。
export type BookingErrorClass = "business" | "auth" | "network" | "other";

export const BOOKING_AUTH_EXPIRED_TEXT = "登录已失效，请重新登录";
export const BOOKING_NETWORK_TEXT = "网络不太稳定，请稍后重试";
export const BOOKING_GENERIC_FAIL_TEXT = "操作失败，请稍后重试";
/** 仅「创建预约」遇网络/超时失败时使用：请求可能已到达服务端，提示先核对再决定是否重提（replayPolicy 仍为 never） */
export const BOOKING_CREATE_NETWORK_TEXT = "网络不太稳定。若稍后在「我的预约」里看到该预约，说明已提交成功，请勿重复提交";

/** AppError.kind → 归类：BUSINESS 业务失败｜AUTH_EXPIRED 登录失效｜NETWORK/TIMEOUT 网络类｜其余（含 UNKNOWN／CANCELLED 等）other */
export function classifyBookingError(err: { kind: string }): BookingErrorClass {
  if (err.kind === "BUSINESS") return "business";
  if (err.kind === "AUTH_EXPIRED") return "auth";
  if (err.kind === "NETWORK" || err.kind === "TIMEOUT") return "network";
  return "other";
}

/**
 * 面向用户的失败文案：业务失败保留服务端中文 message 原样（为空时用 `businessFallback`），
 * 登录失效／网络类／其它各用固定中文，绝不透出 http 层英文技术串。
 */
export function bookingErrorMessage(err: { kind: string; message: string }, businessFallback = BOOKING_GENERIC_FAIL_TEXT): string {
  switch (classifyBookingError(err)) {
    case "business": {
      const m = typeof err.message === "string" ? err.message.trim() : "";
      return m !== "" ? err.message : businessFallback;
    }
    case "auth":
      return BOOKING_AUTH_EXPIRED_TEXT;
    case "network":
      return BOOKING_NETWORK_TEXT;
    default:
      return BOOKING_GENERIC_FAIL_TEXT;
  }
}
