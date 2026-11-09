// 商家端预约管理：纯逻辑（筛选/查询映射/可用操作/确认文案）· issue #14 M1。**纯函数**，无平台依赖。
//
// 后端契约（只读核对 lanmei-backend-golang `internal/admin/handler/booking.go`、`internal/service/booking.go`）：
//   · GET  /booking/bookings?date&status&channel&depositStatus&page&pageSize（pageSize 默认 20、上限 50；status 闭集见下）
//   · POST /booking/bookings/:id/confirm|complete|cancel，权限键 booking；对象级商家范围校验在服务端；
//   · 状态机（落库 rawStatus）：confirm: pending→confirmed；complete: confirmed→completed；cancel: pending|confirmed→cancelled；
//     awaiting_payment / no_show / completed / cancelled 不在任何动作 from 集合内；
//   · 对外 status 另有派生值 expired（pending/confirmed 且已过档期结束时间）：confirm 对 expired 明确拒绝（「预约已过期，无法确认」），
//     complete / cancel 仍允许（运营收尾）⇒ 可用操作以 **rawStatus** 为准、并对 expired 禁用 confirm；
//   · 重复点击（状态已变）返回**业务错误 HTTP200+code=500**，不是幂等成功 ⇒ 前端按钮置灰防重 + 失败后刷新列表并展示后端 message；
//   · 商家 cancel：有保证金时触发**全额微信退款**，且只需 booking 权限（无资金权限）⇒ 确认框必须明示；
//   · **不做** no-show、deposit/refund/preview/retry、保证金规则（资金权限，主人 2026-11-09 拍板）。
import type { BookingStatus } from "../../domain/booking";
import { formatLocalDate } from "../../domain/booking";
import { describeDepositLine } from "../../domain/booking-deposit";
import type { DepositView } from "../../domain/booking-deposit";

export type MerchantBookingAction = "confirm" | "complete" | "cancel";
export type MerchantChannel = "" | "wx" | "tt" | "xhs";

/** 快捷日期：不缓存具体日期串，只记「意图」；真实日期在**每次请求时**按设备本地时间解析（跨零点刷新自动取新的今天） */
export type QuickDate = "today" | "tomorrow";

export interface MerchantBookingFilter {
  status: BookingStatus | "";
  /** 用户在日期选择器里选的**具体日期** YYYY-MM-DD；空串＝没有具体日期。与 quick 互斥（选其一会清掉另一个） */
  date: string;
  channel: MerchantChannel;
  /** 快捷日期（今天/明天）；缺省＝未选。默认「全部」＝quick 缺省且 date 为空，行为与加快捷前完全一致 */
  quick?: QuickDate;
}

export const EMPTY_BOOKING_FILTER: MerchantBookingFilter = { status: "", date: "", channel: "" };

/**
 * 设备**本地**自然日 + offset 天 → YYYY-MM-DD。用本地年月日构造 Date 再做日历运算（Date 自动进位），
 * 跨月/跨年/闰年 2 月都正确；**不经 UTC**（凌晨 00:30 不会错成前一天，晚上 23:30 也不会错成后一天）。可注入 now。
 */
export function localDateOffset(now: Date, offsetDays: number): string {
  return formatLocalDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays));
}

export const QUICK_DATE_TABS: ReadonlyArray<{ value: "" | QuickDate; label: string }> = [
  { value: "", label: "全部" },
  { value: "today", label: "今天" },
  { value: "tomorrow", label: "明天" },
];

/** 生效的日期：快捷 ⇒ 按 now 现算；否则取具体日期；都没有 ⇒ ""（不带 date） */
export function resolveFilterDate(filter: Pick<MerchantBookingFilter, "date" | "quick">, now: Date): string {
  if (filter.quick === "today") return localDateOffset(now, 0);
  if (filter.quick === "tomorrow") return localDateOffset(now, 1);
  return filter.date;
}

/** 高亮哪个快捷胶囊：选了具体日期 ⇒ 三个都不高亮；选了快捷 ⇒ 对应项；否则「全部」 */
export function activeQuickTab(filter: Pick<MerchantBookingFilter, "date" | "quick">): "" | QuickDate | null {
  if (filter.quick !== undefined) return filter.quick;
  return filter.date !== "" ? null : "";
}

/** 点快捷：设置/清除 quick，并清掉具体日期（互斥）；其余筛选原样保留（可叠加） */
export function withQuickDate(filter: MerchantBookingFilter, quick: "" | QuickDate): MerchantBookingFilter {
  const next: MerchantBookingFilter = { ...filter, date: "" };
  if (quick === "") delete next.quick;
  else next.quick = quick;
  return next;
}

/** 选具体日期：清掉快捷；传空串＝清除日期（回到「全部」） */
export function withSpecificDate(filter: MerchantBookingFilter, date: string): MerchantBookingFilter {
  const next: MerchantBookingFilter = { ...filter, date };
  delete next.quick;
  return next;
}

/** 后端 pageSize 上限（超出被服务端截断，客户端先行收敛） */
export const BOOKING_MAX_PAGE_SIZE = 50;
export const BOOKING_DEFAULT_PAGE_SIZE = 20;

export interface StatusTab {
  value: BookingStatus | "";
  label: string;
}
/** 筛选项：「未到店」仅作筛选/展示，**不给任何操作入口**；「待支付」是保证金语义，商家也需要看到（客人已占档期但未付款） */
export const STATUS_TABS: readonly StatusTab[] = [
  { value: "", label: "全部" },
  { value: "pending", label: "待确认" },
  { value: "confirmed", label: "已确认" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "已取消" },
  { value: "expired", label: "已过期" },
  { value: "awaiting_payment", label: "待支付" },
  { value: "no_show", label: "未到店" },
];

export interface ChannelTab {
  value: MerchantChannel;
  label: string;
}
export const CHANNEL_TABS: readonly ChannelTab[] = [
  { value: "", label: "全部渠道" },
  { value: "wx", label: "微信" },
  { value: "tt", label: "抖音" },
  { value: "xhs", label: "小红书" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 筛选 + 分页 → 查询参数：空值不传；page/pageSize 收敛到 [1,∞)/[1,50] 的整数 */
export function buildBookingQuery(filter: MerchantBookingFilter, page: number, pageSize: number, now: Date = new Date()): Record<string, string> {
  const q: Record<string, string> = {};
  if (filter.status !== "") q.status = filter.status;
  const date = resolveFilterDate(filter, now);
  if (DATE_RE.test(date)) q.date = date;
  if (filter.channel !== "") q.channel = filter.channel;
  q.page = String(Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1);
  const ps = Number.isFinite(pageSize) && pageSize >= 1 ? Math.trunc(pageSize) : BOOKING_DEFAULT_PAGE_SIZE;
  q.pageSize = String(Math.min(ps, BOOKING_MAX_PAGE_SIZE));
  return q;
}

/** 商家侧预约视图（后台 AdminBookingView 的前端子集；deposit 缺失当 null） */
export interface MerchantBookingView {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  customerName: string;
  /** 客人手机号：**不脱敏**，原样展示（产品拍板），支持一键拨打 */
  customerPhone: string;
  guestCount: number;
  remark: string;
  /** 对外状态（含派生 expired） */
  status: BookingStatus;
  /** 落库状态（不含 expired）；缺失时回落 status */
  rawStatus: string;
  channel: string;
  channelLabel: string;
  createTime: string;
  deposit: DepositView | null;
}

const STATUS_LABEL: Record<string, { label: string; tone: "action" | "muted" | "danger" }> = {
  pending: { label: "待确认", tone: "action" },
  confirmed: { label: "已确认", tone: "action" },
  completed: { label: "已完成", tone: "muted" },
  cancelled: { label: "已取消", tone: "danger" },
  expired: { label: "已过期", tone: "muted" },
  awaiting_payment: { label: "待支付", tone: "action" },
  no_show: { label: "未到店", tone: "danger" },
};

/** 状态 → 文案+色阶；未知状态原样展示（muted），不假装成功态 */
export function describeMerchantStatus(status: string): { label: string; tone: "action" | "muted" | "danger" } {
  return STATUS_LABEL[status] ?? { label: status === "" ? "未知" : status, tone: "muted" };
}

/**
 * 当前可用操作（按钮显隐的唯一事实源）。以落库 rawStatus 为准：
 *   · confirm：rawStatus=pending 且对外状态不是 expired（后端对已过期待确认单明确拒绝确认）；
 *   · complete：rawStatus=confirmed（含已过期的已确认单——运营收尾）；
 *   · cancel：rawStatus=pending|confirmed（含已过期，同上）。
 * awaiting_payment / no_show / completed / cancelled 一律无操作；「未到店」绝不给入口。
 */
export function availableActions(b: Pick<MerchantBookingView, "status" | "rawStatus">): MerchantBookingAction[] {
  const raw = b.rawStatus !== "" ? b.rawStatus : b.status;
  const actions: MerchantBookingAction[] = [];
  if (raw === "pending" && b.status !== "expired") actions.push("confirm");
  if (raw === "confirmed") actions.push("complete");
  if (raw === "pending" || raw === "confirmed") actions.push("cancel");
  return actions;
}

export const ACTION_LABEL: Record<MerchantBookingAction, string> = {
  confirm: "接单",
  complete: "核销完成",
  cancel: "取消预约",
};

/** 取消确认框里**必须明示**的保证金提示（主人 2026-11-09 拍板；商家 cancel 只需 booking 权限即触发全额退款） */
export const CANCEL_DEPOSIT_NOTICE = "有保证金的预约取消后将全额退还客人保证金";

export function actionConfirmCopy(action: MerchantBookingAction, b: Pick<MerchantBookingView, "customerName" | "date" | "startTime" | "endTime" | "deposit">): { title: string; msg: string } {
  const who = `${b.customerName || "该客人"} ${b.date} ${b.startTime}-${b.endTime}`;
  switch (action) {
    case "confirm":
      return { title: "接单确认", msg: `确认接下「${who}」的预约？确认后状态变为「已确认」。` };
    case "complete":
      return {
        title: "核销确认",
        msg:
          `确认客人已到店并完成「${who}」？` +
          (b.deposit != null ? "该预约已收取保证金，将按商家的保证金规则结算。" : ""),
      };
    case "cancel":
      return {
        title: "取消预约",
        msg:
          `确认取消「${who}」的预约？取消后不可恢复。` +
          CANCEL_DEPOSIT_NOTICE +
          "。" +
          (b.deposit != null ? "本单已收取保证金，取消后将全额退还给客人（微信原路退回）。" : ""),
      };
  }
}

export const ACTION_DONE_TEXT: Record<MerchantBookingAction, string> = {
  confirm: "已接单",
  complete: "已核销完成",
  cancel: "已取消预约",
};

/** 保证金一行文案（商家视角；无保证金 ⇒ ""） */
export function depositLineOf(b: Pick<MerchantBookingView, "deposit">): string {
  return describeDepositLine(b.deposit);
}

function toInt(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
}
function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** 规整服务端 AdminBookingView：缺字段给安全默认；deposit 缺失/非对象 ⇒ null */
export function normalizeMerchantBooking(raw: unknown): MerchantBookingView {
  const b = (raw ?? {}) as Record<string, unknown>;
  const d = b.deposit;
  let deposit: DepositView | null = null;
  if (d != null && typeof d === "object") {
    const x = d as Record<string, unknown>;
    deposit = {
      status: (toStr(x.status) !== "" ? toStr(x.status) : "unknown") as DepositView["status"],
      amountFen: toInt(x.amountFen),
      refundFen: toInt(x.refundFen),
      forfeitFen: toInt(x.forfeitFen),
      payExpireTime: toStr(x.payExpireTime),
      settleReason: toStr(x.settleReason) as DepositView["settleReason"],
    };
  }
  const status = toStr(b.status) as BookingStatus;
  return {
    id: toInt(b.id),
    date: toStr(b.date),
    startTime: toStr(b.startTime),
    endTime: toStr(b.endTime),
    customerName: toStr(b.customerName),
    customerPhone: toStr(b.customerPhone),
    guestCount: toInt(b.guestCount),
    remark: toStr(b.remark),
    status,
    rawStatus: toStr(b.rawStatus) !== "" ? toStr(b.rawStatus) : status,
    channel: toStr(b.channel),
    channelLabel: toStr(b.channelLabel),
    createTime: toStr(b.createTime),
    deposit,
  };
}
