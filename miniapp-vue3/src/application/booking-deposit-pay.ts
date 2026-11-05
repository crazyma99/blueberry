// 预约保证金支付流程（应用层）：拉起微信支付 → **只信服务端状态**（支付回调不作依据）→ 轮询 getBooking 直到 deposit.status=paid。
// 纪律（对标 payment-coordinator，但不改其行为、不改 payment-coordinator.ts）：
//  · 支付面板 success/fail/cancel 回调**一律不作到账依据**——回调后统一轮询服务端；仅 deposit.status==='paid' 才算成功。
//  · 并发防抖：同一 bookingId 在飞时再次调用返回 {ok:false, reason:'busy'}（选 busy 语义，不复用在飞 Promise，
//    以便页面对"重复点击"给明确反馈）。
//  · 轮询可注入 sleep/now（单测可快速运行，不真正 setTimeout）。
//  · 轮询常量对标积分充值（payment-coordinator.ts）：间隔 1000ms、总超时 30000ms；requestPayment 兜底超时 120000ms。
import type { RequestContext } from "../ports/context";
import type { PayGuard } from "../domain/payment-state";
import type { PaymentsPort, PaymentRequestResult } from "../platform/weixin/payments";
import type { BookingView, CreateBookingResult, PayParams } from "../infrastructure/repositories/bookings";

type RepoOk<T> = { ok: true; value: T };
type RepoErr = { ok: false; error: { kind: string } };
type RepoResult<T> = RepoOk<T> | RepoErr;

/** payAndConfirm 的最小仓储依赖：只用 getBooking 轮询服务端真实状态 */
export interface BookingReaderLike {
  getBooking(context: RequestContext, bookingId: number): Promise<RepoResult<BookingView>>;
}

export type DepositPayReason =
  | "busy"
  | "unsupported"
  | "cancelled"
  | "payment-failed"
  | "timeout"
  | "closed"
  | "authExpired";

export interface DepositPayOutcome {
  ok: boolean;
  /** 仅成功时为 'paid'（服务端确认 deposit.status==='paid'） */
  phase?: "paid";
  reason?: DepositPayReason;
  /** 最近一次拿到的服务端快照（成功/留在待支付/被关闭时回带，便于页面刷新展示） */
  booking?: BookingView;
}

/** 已离开 pending 且不是 paid 的保证金状态（白名单）：这笔支付已被服务端结算/终结 */
const SETTLED_NON_PAID: ReadonlySet<string> = new Set(["closed", "refunded", "refunding", "forfeited", "refund_abnormal"]);

// 轮询/兜底常量（对标 payment-coordinator.ts：intervalMs=1000、timeoutMs=30000、payTimeoutMs=120000）
const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_PAY_TIMEOUT_MS = 120000;

export function createDepositPayFlow(deps: {
  bookings: BookingReaderLike;
  /** 类型/注入用（来自 platform/weixin/payments）；本层不直接调 uni */
  payments: PaymentsPort;
  poll?: { intervalMs?: number; timeoutMs?: number };
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** 可选前端防抖门闩（参照 payment-coordinator gate 用法，但不修改 payment-coordinator.ts） */
  gate?: PayGuard;
  /** requestPayment 面板回调兜底超时（默认 120s） */
  payTimeoutMs?: number;
}) {
  const intervalMs = deps.poll?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = deps.poll?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const payTimeoutMs = deps.payTimeoutMs ?? DEFAULT_PAY_TIMEOUT_MS;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  /** 本进程内在飞的 bookingId 集合（并发防抖；与 gate 互补：gate 防全局支付重入，这里防同一笔重复发起） */
  const inFlight = new Set<number>();

  /** 终态分类：读取服务端 booking 判断保证金是否到账/被关闭/仍待支付 */
  type Phase = "paid" | "closed" | "pending";
  function classify(b: BookingView): Phase {
    const d = b.deposit;
    // 预约已被取消/过期：订单终结，不能再当作预约成功（含「支付到账时保留期已过 ⇒ 服务端自动全退」的竞态：此时 deposit 可能仍短暂为 paid）
    const bookingDead = b.status === "cancelled" || b.status === "expired";
    if (d != null && d.status === "paid") return bookingDead ? "closed" : "paid";
    // 保证金已离开 pending 且不是 paid（白名单：closed 超时关单／refunded／refunding／forfeited／refund_abnormal）：已被服务端结算或终结
    if (d != null && SETTLED_NON_PAID.has(d.status)) return "closed";
    if (bookingDead) return "closed";
    // pending 以及**未知状态**（服务端日后新增的值）：不下结论，继续轮询，最终落到 timeout 的「结果确认中」文案，不误报「已关闭」
    return "pending";
  }

  /**
   * 轮询服务端至 paid/closed 或超时。
   *  · 单次请求网络失败不终止，继续到超时。
   *  · auth 类错误（AUTH_EXPIRED）立即终止并带 authExpired。
   *  · 超时返回 timeout（不当作失败订单——页面提示"支付结果确认中，可在我的预约查看"）。
   */
  async function pollUntilSettled(
    context: RequestContext,
    bookingId: number,
  ): Promise<DepositPayOutcome> {
    const startedAt = now();
    let last: BookingView | undefined;
    for (;;) {
      const r = await deps.bookings.getBooking(context, bookingId);
      if (r.ok) {
        last = r.value;
        const phase = classify(r.value);
        if (phase === "paid") return { ok: true, phase: "paid", booking: r.value };
        if (phase === "closed") return { ok: false, reason: "closed", booking: r.value };
      } else if (r.error.kind === "AUTH_EXPIRED") {
        // 登录失效：终止轮询（页面引导重新登录）
        return { ok: false, reason: "authExpired", booking: last };
      }
      // 网络抖动（非 auth 的 ok:false）：不终止，继续轮询
      if (now() - startedAt >= timeoutMs) {
        return { ok: false, reason: "timeout", booking: last };
      }
      await sleep(intervalMs);
    }
  }

  /**
   * 有限次短轮询（用户取消/失败支付后用）：确认服务端是否其实已付（回调报 fail 但实际成功的情形）。
   * 命中 paid → 返回 paid；命中 closed → closed；否则（仍 pending）返回 null 由调用方按取消/失败收口。
   */
  async function shortConfirm(
    context: RequestContext,
    bookingId: number,
    tries = 3,
  ): Promise<DepositPayOutcome | null> {
    let last: BookingView | undefined;
    for (let i = 0; i < tries; i++) {
      const r = await deps.bookings.getBooking(context, bookingId);
      if (r.ok) {
        last = r.value;
        const phase = classify(r.value);
        if (phase === "paid") return { ok: true, phase: "paid", booking: r.value };
        if (phase === "closed") return { ok: false, reason: "closed", booking: r.value };
      } else if (r.error.kind === "AUTH_EXPIRED") {
        return { ok: false, reason: "authExpired", booking: last };
      }
      if (i < tries - 1) await sleep(intervalMs);
    }
    return null;
  }

  async function run(
    context: RequestContext,
    args: { bookingId: number; pay: PayParams },
  ): Promise<DepositPayOutcome> {
    // 拉起支付面板（PayParams 与 CreditRechargeOrder 字段一致，可被 PaymentsPort.requestPayment 直接接收）。
    // 面板回调兜底超时：避免既不 success 也不 fail 时长期挂起（对标 payment-coordinator payTimeoutMs）；
    // 与 payment-coordinator 不同之处：面板先返回时清掉兜底定时器，不留 120s 悬挂计时器。
    let panelTimer: ReturnType<typeof setTimeout> | undefined;
    let panelTimedOut = false;
    let pay: PaymentRequestResult;
    try {
      pay = await Promise.race([
        deps.payments.requestPayment(args.pay),
        new Promise<PaymentRequestResult>((resolve) => {
          panelTimer = setTimeout(() => {
            panelTimedOut = true;
            resolve({ ok: false, reason: "failed", message: "pay-panel-timeout" });
          }, payTimeoutMs);
        }),
      ]);
    } finally {
      if (panelTimer !== undefined) clearTimeout(panelTimer);
    }

    // 兜底超时 ≠ 支付失败：真实面板可能仍悬着、用户随时可能付款。结果未知 ⇒ 先向服务端确认一次，仍 pending 则回 timeout（页面提示「结果确认中，请勿重复支付」）
    if (panelTimedOut) {
      const c = await shortConfirm(context, args.bookingId);
      return c ?? { ok: false, reason: "timeout" };
    }

    // unsupported（抖音/非微信端/容器无能力）：不轮询，直接回 unsupported
    if (!pay.ok && pay.reason === "unsupported") {
      return { ok: false, reason: "unsupported" };
    }

    // 回调成功：**不作依据**，一律轮询服务端（守卫：只有 deposit.status==='paid' 才算成功）
    if (pay.ok) {
      return await pollUntilSettled(context, args.bookingId);
    }

    // 回调取消/失败：先有限次短轮询确认（用户可能其实已付——回调 fail 但服务端已到账）
    const confirmed = await shortConfirm(context, args.bookingId);
    if (confirmed != null) return confirmed;
    // 仍 pending：留在待支付，按回调原因收口
    return {
      ok: false,
      reason: pay.reason === "cancelled" ? "cancelled" : "payment-failed",
    };
  }

  /**
   * 拉起保证金支付并确认到账。返回 DepositPayOutcome（联合见上）。
   * 并发防抖：同一 bookingId 在飞时再次调用直接返回 {ok:false, reason:'busy'}（不重复拉起支付）。
   */
  async function payAndConfirm(
    context: RequestContext,
    args: { bookingId: number; pay: PayParams },
  ): Promise<DepositPayOutcome> {
    if (inFlight.has(args.bookingId)) return { ok: false, reason: "busy" };
    // gate 防全局支付重入（与积分充值共用一把门闩的页面可传入）
    if (deps.gate != null && !deps.gate.tryBegin()) return { ok: false, reason: "busy" };
    inFlight.add(args.bookingId);
    try {
      return await run(context, args);
    } finally {
      inFlight.delete(args.bookingId);
      deps.gate?.end();
    }
  }

  return { payAndConfirm };
}

/** 便于页面复用 CreateBookingResult（提交/继续支付的返回带 pay） */
export type { CreateBookingResult, PayParams };
