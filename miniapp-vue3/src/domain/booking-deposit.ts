// 到店预约「预约保证金」领域纯函数（零依赖——不 import 基础设施/平台层）。
// 对外文案一律称「预约保证金」，不得出现「定金」「押金」字样（代码标识符/注释内部用 deposit 允许）。
// 契约事实源（冻结，字段名不得改）：docs/蓝梅云_到店预约定金技术方案.md §10.2 / §10.3（2026-11-05 主人拍板）。
//   · 金额一律整数「分」，字段名以 Fen 结尾；展示由本层格式化。
//   · 时间字符串 `YYYY-MM-DD HH:mm:ss`（UTC+8）。
//   · refundTrigger ∈ manual | auto_on_complete。

/** 保证金状态（§10.2，字符串对外）：pending 待支付／paid 已支付／refunding 退还中／refunded 已退还／forfeited 已扣除／closed 已关闭／refund_abnormal 退款异常（对用户仍显示「退款处理中」） */
export type DepositStatus =
  | "pending"
  | "paid"
  | "refunding"
  | "refunded"
  | "forfeited"
  | "closed"
  | "refund_abnormal";

/** 结算原因（§10.3）：completed 已完成全退／cancel_free 免费取消／cancel_late 迟取消／no_show 爽约／merchant_cancel 商家取消／hold_expired 待支付超时关闭／auto_grace 兜底自动全退 */
export type SettleReason =
  | "completed"
  | "cancel_free"
  | "cancel_late"
  | "no_show"
  | "merchant_cancel"
  | "hold_expired"
  | "auto_grace"
  | "";

/** 退款触发时机：manual 人工一键退／auto_on_complete 完成时自动全退 */
export type RefundTrigger = "manual" | "auto_on_complete";

/** 保证金视图（§10.3 公共类型，逐字遵循）：
 *  refundFen/forfeitFen 仅结算后有值（否则 0）；payExpireTime 仅 status=pending 时有值（否则 ""）；settleReason 未结算为 ""。 */
export interface DepositView {
  status: DepositStatus;
  amountFen: number;
  refundFen: number;
  forfeitFen: number;
  /** 待支付截止时间 `YYYY-MM-DD HH:mm:ss`（UTC+8），仅 pending 有值，否则 "" */
  payExpireTime: string;
  settleReason: SettleReason;
}

/** 微信 JSAPI 支付参数（§10.3；与现有 CreditRechargeOrder 字段一致，可被 PaymentsPort.requestPayment 直接接收） */
export interface PayParams {
  outTradeNo: string;
  prepayId: string;
  appId: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: string;
  paySign: string;
}

/** 门店保证金规则（§10.3 GET /api/shops/:id/booking-config 的 deposit 段） */
export interface DepositRuleView {
  enabled: boolean;
  amountFen: number;
  /** 迟取消窗口（小时，§3.1 `free_cancel_hours`）：距开始不足该时长内取消视为「迟取消」，按 lateCancelForfeitPct 扣除；
   *  更早取消全额退。0 表示没有迟取消窗口（开始前取消均全额退）。 */
  freeCancelHours: number;
  /** 迟取消（在免费窗口内取消）扣除百分比 0..100 */
  lateCancelForfeitPct: number;
  /** 爽约扣除百分比 0..100 */
  noShowForfeitPct: number;
  refundTrigger: RefundTrigger;
}

/** 门店预约配置（§10.3 GET /api/shops/:id/booking-config 整体） */
export interface BookingConfig {
  deposit: DepositRuleView;
  /** 待支付保留分钟数（5..30） */
  payHoldMinutes: number;
  /** 订阅模板 ID（后端下发，未配置为 ""；不得写死） */
  subscribeTemplates: {
    result: string;
    done: string;
  };
}

/** 取消预览（§10.3 GET /api/bookings/:id/cancel-preview）：reason 取 settleReason 值；无保证金时全 0、reason="" */
export interface CancelPreview {
  refundFen: number;
  forfeitFen: number;
  reason: SettleReason;
}

// ———————————————————————————————————————————————————————————————
// 金额格式化：整数分 → ¥x.xx。整数运算，不使用浮点累加（Math.trunc + 整除/取余 + padStart）。
// 非有限数/负数/小数一律安全处理（不抛）：负数取 0，小数向零截断。
// ———————————————————————————————————————————————————————————————
export function formatFen(fen: number): string {
  // 非有限数（NaN/Infinity/非数字）→ 0；负数 → 0；小数向零截断为整数分
  const safe = typeof fen === "number" && Number.isFinite(fen) && fen > 0 ? Math.trunc(fen) : 0;
  const yuan = Math.trunc(safe / 100);
  const cents = safe % 100;
  // cents 用整除/取余得到，padStart 补零（避免 5 → "5" 被当成 ¥x.50）
  return "¥" + String(yuan) + "." + String(cents).padStart(2, "0");
}

// ———————————————————————————————————————————————————————————————
// 保证金状态 → 展示文案＋色阶。refund_abnormal 对用户显示「退款处理中」（不暴露异常细节）。
// 未知状态原样 label + muted。
// ———————————————————————————————————————————————————————————————
export interface DepositStatusMeta {
  label: string;
  tone: "action" | "muted" | "danger";
}

const DEPOSIT_STATUS_META: Record<DepositStatus, DepositStatusMeta> = {
  pending: { label: "待支付", tone: "action" },
  paid: { label: "已支付", tone: "action" },
  refunding: { label: "退还中", tone: "muted" },
  refunded: { label: "已退还", tone: "muted" },
  forfeited: { label: "已扣除", tone: "danger" },
  closed: { label: "已关闭", tone: "muted" },
  // refund_abnormal：后端退款异常/卡单，对用户统一显示「退款处理中」，不暴露异常态
  refund_abnormal: { label: "退款处理中", tone: "muted" },
};

export function describeDepositStatus(status: string): DepositStatusMeta {
  // 未知状态（服务端新增了本端未识别的值）：不得把英文原串展示给用户 ⇒ 统一「处理中」、弱化色阶
  return (DEPOSIT_STATUS_META as Record<string, DepositStatusMeta>)[status] ?? { label: "处理中", tone: "muted" };
}

// ———————————————————————————————————————————————————————————————
// 结算原因 → 用户可读短语（供「已扣除」行补充说明）。未知回落空串。
// ———————————————————————————————————————————————————————————————
const SETTLE_REASON_TEXT: Record<Exclude<SettleReason, "">, string> = {
  completed: "已完成",
  cancel_free: "免费取消",
  cancel_late: "迟取消",
  no_show: "爽约",
  merchant_cancel: "商家取消",
  hold_expired: "超时未支付",
  auto_grace: "超期自动退还",
};

export function describeSettleReason(reason: string): string {
  if (reason === "") return "";
  return (SETTLE_REASON_TEXT as Record<string, string>)[reason] ?? "";
}

// ———————————————————————————————————————————————————————————————
// 列表/详情用的一行保证金文案。null ⇒ ""（无保证金的预约不展示任何金额）。
// ———————————————————————————————————————————————————————————————
export function describeDepositLine(deposit: DepositView | null): string {
  if (deposit == null) return "";
  const amount = formatFen(deposit.amountFen);
  const reasonText = describeSettleReason(deposit.settleReason);
  // 部分扣除的补充段：结算后 forfeitFen>0 时（迟取消/爽约按比例扣除，退还部分走 refunding→refunded）必须同时说明扣除金额与原因
  const forfeitTail =
    deposit.forfeitFen > 0 ? "，已扣除 " + formatFen(deposit.forfeitFen) + (reasonText !== "" ? "（" + reasonText + "）" : "") : "";
  switch (deposit.status) {
    case "pending":
      return "保证金 " + amount + " · 待支付";
    case "paid":
      return "保证金 " + amount + " · 已支付";
    case "refunding":
      // 已结算（refundFen 有值）：展示实退金额；否则展示原保证金。
      // 带扣除时不以「保证金 ¥x」开头（会被读成原保证金金额）：写成「退还 ¥x（退还中），已扣除 ¥y（原因）」
      if (deposit.refundFen > 0 && deposit.forfeitFen > 0) return "退还 " + formatFen(deposit.refundFen) + "（退还中）" + forfeitTail;
      return deposit.refundFen > 0
        ? "保证金 " + formatFen(deposit.refundFen) + " · 退还中"
        : "保证金 " + amount + " · 退还中" + forfeitTail;
    case "refunded":
      // 用 refundFen（实退金额）而非 amountFen；部分扣除时一并展示扣除金额与原因
      return formatFen(deposit.refundFen) + " 已原路退还" + forfeitTail;
    case "forfeited": {
      const forfeit = formatFen(deposit.forfeitFen);
      // 全额扣除（无需退款）：只显示扣除；若 refundFen>0（防御）同时显示退还
      const base = deposit.refundFen > 0 ? "已扣除 " + forfeit + "，退还 " + formatFen(deposit.refundFen) : "已扣除 " + forfeit;
      return reasonText !== "" ? base + "（" + reasonText + "）" : base;
    }
    case "closed":
      return "保证金 " + amount + " · 已关闭";
    case "refund_abnormal":
      return "保证金 " + amount + " · 退款处理中";
    default:
      // 未知状态（服务端新增值）：不展示英文原串，也不留空行
      return "保证金 " + amount + " · 处理中";
  }
}

// ———————————————————————————————————————————————————————————————
// 待支付倒计时：按 UTC+8 解析 payExpireTime，返回剩余秒数（可注入 now）。
// 不依赖运行环境时区：手工拼 ISO（`${date}T${time}+08:00`）——注意 iOS 不兼容带空格的 `YYYY-MM-DD HH:mm:ss`，故不直接 new Date(空格串)。
// 空串/非法返回 0；不返回负数。
// ———————————————————————————————————————————————————————————————
const EXPIRE_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

/** payExpireTime（`YYYY-MM-DD HH:mm:ss`，UTC+8）→ 绝对毫秒时间戳；空串/非法 → 0（不依赖运行环境时区） */
export function expireAtMs(payExpireTime: string): number {
  if (typeof payExpireTime !== "string") return 0;
  const m = EXPIRE_RE.exec(payExpireTime.trim());
  if (m == null) return 0;
  // UTC+8 固定：拼成 `2026-11-05T12:00:00+08:00`，与运行环境本地时区无关
  const t = Date.parse(m[1] + "T" + m[2] + "+08:00");
  return Number.isFinite(t) ? t : 0;
}

export function remainingPaySeconds(payExpireTime: string, nowMs: number, capSeconds?: number): number {
  const t = expireAtMs(payExpireTime);
  if (t === 0) return 0;
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs)) return 0;
  const remainMs = t - nowMs;
  if (remainMs <= 0) return 0;
  const sec = Math.floor(remainMs / 1000);
  // 设备时钟偏慢时本地剩余会大于真实保留期：有上限则取 min(本地剩余, 上限)，不向用户夸大剩余时间
  return typeof capSeconds === "number" && Number.isFinite(capSeconds) && capSeconds > 0 ? Math.min(sec, Math.trunc(capSeconds)) : sec;
}

/** 契约（§10.3）里待支付保留分钟的上界（5..30）：我的预约页拿不到门店配置时用它封顶倒计时 */
export const MAX_PAY_HOLD_MINUTES = 30;

/** 秒 → "mm:ss"（非有限/负数回落 0；超过 99 分钟仍按实际分钟展示，不截断） */
export function formatCountdown(sec: number): string {
  const safe = typeof sec === "number" && Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
}

// ———————————————————————————————————————————————————————————————
// 规则摘要：返回字符串数组（每元素为一行，便于页面分行展示；B/C 依赖此签名）。
// 必须说清：何时全额退还、何时扣除多少、款项原路退回。
//   · 迟取消扣 0% → 「可免费取消」；其余比例统一写「扣除 N% 保证金」（100% 也如此，与爽约行同口径）。
//   · freeCancelHours=0 → 没有迟取消窗口：写「开始前取消，可免费取消」，不说「开始前 0 小时内」。
//   · 爽约 0% → 「爽约不扣除」。
//   · refundTrigger 决定「完成后」一行是自动退还还是由门店确认退还。
// ———————————————————————————————————————————————————————————————
/** 把 0..100 的百分比归一到整数、裁剪到 [0,100]（防脏数据） */
function clampPct(pct: number): number {
  const n = typeof pct === "number" && Number.isFinite(pct) ? Math.trunc(pct) : 0;
  return n < 0 ? 0 : n > 100 ? 100 : n;
}

export function summarizeDepositRule(rule: DepositRuleView): string[] {
  const lines: string[] = [];
  if (rule == null || !rule.enabled) return lines;

  const hours = typeof rule.freeCancelHours === "number" && Number.isFinite(rule.freeCancelHours) && rule.freeCancelHours > 0
    ? Math.trunc(rule.freeCancelHours)
    : 0;
  const latePct = clampPct(rule.lateCancelForfeitPct);
  const noShowPct = clampPct(rule.noShowForfeitPct);

  // 迟取消段：
  //   · 有迟取消窗口且扣除比例>0 ⇒ 「开始前 N 小时内取消，扣除 X% 保证金」（更早取消全退，由收尾行说明）；
  //   · 扣除比例为 0（全退）或 freeCancelHours=0（没有迟取消窗口，§3.1）⇒ 整体可免费取消，写「开始前取消，可免费取消」，
  //     不写「开始前 N 小时内…可免费取消」（会被误读成只有窗口内才免费），也不说「开始前 0 小时内」。
  if (hours > 0 && latePct > 0) {
    // 迟取消规则只适用于「门店确认后」的预约；门店确认前（待确认）取消一律全额退还（后端 ComputeSettlement 口径）
    lines.push("门店确认后，开始前 " + hours + " 小时内取消，扣除 " + latePct + "% 保证金；门店确认前取消全额退还");
  } else {
    lines.push("开始前取消，可免费取消");
  }

  // 爽约段
  lines.push(noShowPct === 0 ? "爽约不扣除保证金" : "爽约扣除 " + noShowPct + "% 保证金");

  // 退还时机（refundTrigger）：不承诺具体到账时点，只说明由谁触发
  lines.push(rule.refundTrigger === "auto_on_complete" ? "预约完成后系统自动退还保证金" : "预约完成后由门店确认退还保证金");

  // 预约开始后用户不能自助取消（后端返回「预约已开始，如需处理请联系商家」）
  lines.push("预约开始后如需处理，请联系门店");

  // 全额退还 + 原路退回收尾（必须说清款项去向）
  lines.push("其余情形（含门店取消）全额退还，款项原路退回");
  return lines;
}

// ———————————————————————————————————————————————————————————————
// 取消确认文案（取消**前**，将来时）：
//   forfeit>0 → 「取消后将扣除 ¥x（迟取消），退还 ¥y」（reason 已知时追加原因，复用 describeSettleReason）；
//   forfeit=0 且 refund>0 → 「保证金 ¥x 将原路退回」；
//   都为 0 → 返回空串（调用方走原确认文案）。
// ———————————————————————————————————————————————————————————————
function toFen(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0;
}
function reasonSuffix(reason: unknown): string {
  const r = describeSettleReason(typeof reason === "string" ? reason : "");
  return r !== "" ? "（" + r + "）" : "";
}

export function cancelConfirmText(preview: { refundFen: number; forfeitFen: number; reason?: string }): string {
  const refund = toFen(preview?.refundFen);
  const forfeit = toFen(preview?.forfeitFen);
  if (forfeit > 0) {
    return "取消后将扣除 " + formatFen(forfeit) + reasonSuffix(preview?.reason) + "，退还 " + formatFen(refund);
  }
  if (refund > 0) {
    return "保证金 " + formatFen(refund) + " 将原路退回";
  }
  return "";
}

/** 取消**成功后**的提示（过去时，事情已发生）：「已取消预约，已扣除 ¥x（迟取消），退还 ¥y」／「已取消预约，保证金 ¥x 将原路退回」；无结算金额 ⇒ 「已取消预约」 */
export function cancelDoneText(settled: { refundFen: number; forfeitFen: number; reason?: string }): string {
  const refund = toFen(settled?.refundFen);
  const forfeit = toFen(settled?.forfeitFen);
  if (forfeit > 0) {
    return "已取消预约，已扣除 " + formatFen(forfeit) + reasonSuffix(settled?.reason) + "，退还 " + formatFen(refund);
  }
  if (refund > 0) {
    return "已取消预约，保证金 " + formatFen(refund) + " 将原路退回";
  }
  return "已取消预约";
}

// ———————————————————————————————————————————————————————————————
// 是否带有效保证金（deposit 非 null）。
// ———————————————————————————————————————————————————————————————
export function isDepositActive(booking: { deposit: DepositView | null }): boolean {
  return booking != null && booking.deposit != null;
}

// ———————————————————————————————————————————————————————————————
// 预约保留剩余分钟（向上取整）：优先按 deposit.payExpireTime 与 now 的差计算（用户在支付面板停留过的时间不能算进「已保留」）；
// payExpireTime 缺失/非法时回落 fallbackMinutes（config.payHoldMinutes）；已过期返回 0。
// 设备时钟偏慢时本地剩余可能大于真实保留期 ⇒ 取 min(本地剩余, 保留期上限)：上限＝fallbackMinutes（>0 时），否则契约上界 MAX_PAY_HOLD_MINUTES。
// ———————————————————————————————————————————————————————————————
export function retainMinutes(deposit: DepositView | null, nowMs: number, fallbackMinutes: number): number {
  const fb = typeof fallbackMinutes === "number" && Number.isFinite(fallbackMinutes) && fallbackMinutes > 0 ? Math.trunc(fallbackMinutes) : 0;
  if (deposit == null || !EXPIRE_RE.test(String(deposit.payExpireTime ?? "").trim())) return fb;
  const cap = fb > 0 ? fb : MAX_PAY_HOLD_MINUTES;
  return Math.min(Math.ceil(remainingPaySeconds(deposit.payExpireTime, nowMs) / 60), cap);
}

// ———————————————————————————————————————————————————————————————
// 提交结果页文案（预约页「未完成支付 / 已支付」两类结果）。
//   · 取消支付／支付失败：必须告知「预约已保留 N 分钟，可在我的预约继续支付」。
//   · 超时（结果未知）：不得说失败——可能已扣款，提示稍后在「我的预约」查看、勿重复支付。
// ———————————————————————————————————————————————————————————————
export interface SubmitResultText {
  title: string;
  desc: string;
}

/** 未完成支付的原因（与 application/booking-deposit-pay 的 DepositPayReason 取值对齐，另加提交编排的两项） */
export type DepositUnpaidReason =
  | "cancelled"
  | "payment-failed"
  | "timeout"
  | "closed"
  | "unsupported"
  | "authExpired"
  | "busy"
  | "no-pay-params"
  | "rules-unseen"
  /** 创建后服务端下发的保证金金额与用户已同意的金额不一致（商家在页面打开后改了金额）：不自动付款 */
  | "amount-changed";

export function describeUnpaidResult(reason: string, minutes: number): SubmitResultText {
  const m = typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0 ? Math.trunc(minutes) : 0;
  const hold = m > 0 ? "预约已保留 " + m + " 分钟，可在「我的预约」继续支付" : "预约保留时间即将结束，未支付将自动取消，请尽快到「我的预约」查看";
  switch (reason) {
    case "cancelled":
      return { title: "预约已保留", desc: "已取消支付，" + hold };
    case "payment-failed":
      return { title: "预约已保留", desc: "支付未完成，" + hold };
    case "timeout":
      return {
        title: "支付结果确认中",
        desc: "暂未收到支付结果，请到「我的预约」查看支付结果，请勿重复支付",
      };
    case "closed":
      return { title: "预约已关闭", desc: "本次预约因未完成支付已关闭，如已扣款将原路退回。可重新预约" };
    case "unsupported":
      return { title: "预约已保留", desc: "当前环境暂不支持支付。" + hold };
    case "authExpired":
      return { title: "预约已保留", desc: "登录已失效，请重新登录后到「我的预约」继续支付。" + hold };
    case "amount-changed":
      return {
        title: "预约已保留",
        desc: "保证金金额已变化，请到「我的预约」查看后再支付" + (m > 0 ? "。预约已保留 " + m + " 分钟" : "。预约保留时间即将结束，请尽快查看"),
      };
    default:
      // no-pay-params / rules-unseen / 未知：不自动拉起支付，引导到「我的预约」查看保证金并自行决定
      return {
        title: "预约已保留",
        desc: m > 0 ? "预约已保留 " + m + " 分钟，请在「我的预约」查看保证金并完成支付" : "预约保留时间即将结束，请尽快到「我的预约」查看保证金",
      };
  }
}

export function describePaidResult(amountFen: number): SubmitResultText {
  return {
    title: "预约已提交",
    desc: "保证金 " + formatFen(amountFen) + " 已支付，等待门店确认。可在「我的预约」查看进度，保证金按规则原路退回",
  };
}
