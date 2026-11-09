// 商家预约筛选区：展示逻辑（issue #14 · M1 真机反馈「筛选器太乱，都用的标签」重新设计）。**纯函数**，无平台依赖。
// 只做「怎么展示/怎么摘要」，**不改**筛选数据结构 MerchantBookingFilter 与 buildBookingQuery（行为保持：默认「全部」、快捷日期按本地时间现算、
// 与状态/渠道叠加、点击回到第 1 页）。
import {
  CHANNEL_TABS,
  EMPTY_BOOKING_FILTER,
  STATUS_TABS,
  resolveFilterDate,
  type MerchantBookingFilter,
  type StatusTab,
} from "./merchant-booking";

/** 状态分段的显示顺序：常用在前（全部/待确认/已确认/已完成），低频靠后；数据仍取自 STATUS_TABS（单一事实源），不另造状态闭集 */
const STATUS_ORDER: ReadonlyArray<StatusTab["value"]> = ["", "pending", "confirmed", "completed", "cancelled", "expired", "awaiting_payment", "no_show"];

export function orderedStatusTabs(): StatusTab[] {
  const byValue = new Map(STATUS_TABS.map((t) => [t.value, t] as const));
  const ordered = STATUS_ORDER.map((v) => byValue.get(v)).filter((t): t is StatusTab => t != null);
  // 兜底：STATUS_TABS 里新增了本表没列到的状态，也要显示（追加到末尾），不能因为排序表漏了就让筛选项消失
  for (const t of STATUS_TABS) if (!ordered.includes(t)) ordered.push(t);
  return ordered;
}

/** 当前状态在分段里的下标（找不到 ⇒ 0＝全部） */
export function statusIndexOf(status: StatusTab["value"]): number {
  const i = orderedStatusTabs().findIndex((t) => t.value === status);
  return i < 0 ? 0 : i;
}

export function dateButtonLabel(filter: Pick<MerchantBookingFilter, "date" | "quick">): string {
  if (filter.quick === "today") return "今天";
  if (filter.quick === "tomorrow") return "明天";
  return filter.date !== "" ? filter.date : "日期";
}
export function channelButtonLabel(filter: Pick<MerchantBookingFilter, "channel">): string {
  if (filter.channel === "") return "渠道";
  return CHANNEL_TABS.find((c) => c.value === filter.channel)?.label ?? "渠道";
}

export function isDateFiltered(filter: Pick<MerchantBookingFilter, "date" | "quick">): boolean {
  return filter.quick !== undefined || filter.date !== "";
}
export function isChannelFiltered(filter: Pick<MerchantBookingFilter, "channel">): boolean {
  return filter.channel !== "";
}
/** 有任一非默认筛选（含状态）⇒ 显示「重置」 */
export function hasActiveFilter(filter: MerchantBookingFilter): boolean {
  return filter.status !== "" || isDateFiltered(filter) || isChannelFiltered(filter);
}
/** 「重置」回到的默认筛选（每次返回新对象，避免共享引用被改） */
export function resetFilter(): MerchantBookingFilter {
  return { ...EMPTY_BOOKING_FILTER };
}

/**
 * 结果摘要：「共 N 条」；有筛选时追加条件，如「共 3 条 · 待确认 · 今天(2026-11-09) · 微信」。
 * 日期带上**当前生效的具体日期**（快捷项现算），让商家看得到「今天」到底是哪天（跨零点后一目了然）。
 * total 未知（加载中/失败）⇒ 返回空串（不显示假数字）。
 */
export function filterSummary(filter: MerchantBookingFilter, total: number | null, now: Date = new Date()): string {
  if (total == null || !Number.isFinite(total) || total < 0) return "";
  const parts: string[] = [`共 ${Math.trunc(total)} 条`];
  if (filter.status !== "") {
    const label = STATUS_TABS.find((t) => t.value === filter.status)?.label;
    if (label) parts.push(label);
  }
  if (isDateFiltered(filter)) {
    const d = resolveFilterDate(filter, now);
    const q = filter.quick === "today" ? "今天" : filter.quick === "tomorrow" ? "明天" : "";
    parts.push(q !== "" ? `${q}(${d})` : d);
  }
  if (isChannelFiltered(filter)) parts.push(channelButtonLabel(filter));
  return parts.join(" · ");
}

/** 日期弹层里快捷项的选中态：全部/今天/明天；选了具体日期 ⇒ 三个都不高亮（null）。与列表页旧 activeQuickTab 同口径，复用之。 */
export { activeQuickTab } from "./merchant-booking";
