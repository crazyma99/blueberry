// 预约保证金「提交」编排（预约页用）：勾选守卫 → 订阅授权 → 创建预约 → 拉起支付 → 以服务端状态确认到账。
// 工序（顺序不可换，守卫由单测变异自证）：
//   ① 开启保证金的门店：用户未勾选「同意规则」⇒ 直接 blocked，**零请求、零授权弹窗、零支付**；
//   ② 表单校验／登录前置通过后，**同步**触发订阅授权（仍在点击手势的同步调用栈内；wx.requestSubscribeMessage 仅允许点击行为调用），
//      授权失败／拒绝一律放行，不阻断提交；**未开启保证金的门店不弹授权**；
//   ③ createBooking（创建失败原样透传给页面处理，沿用既有 validation／login-required／auth-expired／business 分支）；
//   ④ 返回带 pay ⇒ 仅当用户确实看过规则并同意时才拉起支付；否则不自动支付（预约已保留，引导去「我的预约」）；
//   ⑤ 拉起支付后**只信服务端**（轮询 getBooking 至 deposit.status=paid），requestPayment 成功回调不作依据（见 booking-deposit-pay）。
// 未开启保证金（pay=null 且非 awaiting_payment）：outcome=created，行为与此前免保证金预约完全一致。
import type { RequestContext } from "../ports/context";
import type { BookingView, CreateBookingResult, PayParams } from "../infrastructure/repositories/bookings";
import type { SubmitBookingParams, SubmitBookingResult, SubmitBookingHooks } from "./booking-flow";
import type { DepositPayOutcome, DepositPayReason } from "./booking-deposit-pay";
import { retainMinutes, type DepositUnpaidReason } from "../domain/booking-deposit";

type SubmitFailure = Exclude<SubmitBookingResult, { ok: true }>;

export type DepositSubmitOutcome =
  /** 开启保证金但用户未勾选同意：未发任何请求 */
  | { kind: "blocked"; reason: "agreement-required" }
  /** 创建前即失败（校验／未登录／会话失效／业务失败）：页面按既有分支处理 */
  | { kind: "failed"; result: SubmitFailure }
  /** 未开启保证金：预约已创建，行为同既有免保证金预约 */
  | { kind: "created"; booking: BookingView }
  /** 服务端确认保证金已到账（预约已转 pending） */
  | { kind: "paid"; booking: BookingView }
  /** 预约已创建并保留，但保证金未支付成功：留在待支付态，用户可去「我的预约」继续支付 */
  | { kind: "unpaid"; reason: DepositUnpaidReason; booking: BookingView; retainMinutes: number };

export interface DepositSubmitOptions {
  /** 门店是否开启保证金（来自 booking-config；false 时完全走旧流程，不弹授权） */
  depositEnabled: boolean;
  /** 用户是否已勾选同意保证金规则 */
  agreed: boolean;
  /** 后端下发的订阅模板 ID（空串跳过；不得写死） */
  templates: { result: string; done: string };
  /** 配置的待支付保留分钟（payExpireTime 缺失时的兜底） */
  payHoldMinutes: number;
}

export interface DepositSubmitDeps {
  submitUc: {
    submit(input: SubmitBookingParams, hooks?: SubmitBookingHooks): Promise<SubmitBookingResult>;
  };
  payFlow: {
    payAndConfirm(context: RequestContext, args: { bookingId: number; pay: PayParams }): Promise<DepositPayOutcome>;
  };
  /** 订阅授权（注入 platform/weixin/capabilities.requestSubscribe；返回值不使用） */
  subscribe: (tmplIds: string[]) => Promise<unknown>;
  context: () => RequestContext;
  now?: () => number;
}

/** 把 createBooking 的返回收口成 BookingView（去掉 pay，避免调用方误用过期的支付参数） */
function stripPay(b: CreateBookingResult): BookingView {
  const { pay: _pay, ...rest } = b;
  return rest;
}

export function createDepositSubmitFlow(deps: DepositSubmitDeps) {
  const now = deps.now ?? (() => Date.now());

  async function submit(input: SubmitBookingParams, opts: DepositSubmitOptions): Promise<DepositSubmitOutcome> {
    // ① 勾选守卫（先于一切副作用）
    if (opts.depositEnabled && !opts.agreed) return { kind: "blocked", reason: "agreement-required" };

    // ② 订阅授权钩子：仅开启保证金时挂；模板 ID 全空则不挂（不弹空授权）
    const tmplIds = [opts.templates.result, opts.templates.done].filter((t) => typeof t === "string" && t.trim() !== "");
    const hooks: SubmitBookingHooks | undefined =
      opts.depositEnabled && tmplIds.length > 0 ? { beforeCreate: () => deps.subscribe(tmplIds) } : undefined;

    // ③ 创建（订阅授权在 submit 内、createBooking 之前同步触发）
    const res = await deps.submitUc.submit(input, hooks);
    if (!res.ok) return { kind: "failed", result: res };

    const created = res.value;
    const booking = stripPay(created);

    // 无支付参数：未开启保证金 ⇒ created；服务端却返回了待支付预约但缺 pay（异常）⇒ 保留待支付、不假装成功
    if (created.pay == null) {
      if (created.status === "awaiting_payment") {
        return unpaid("no-pay-params", booking);
      }
      return { kind: "created", booking };
    }

    // ④ 服务端要求支付但用户未曾看到规则（配置过期等竞态）：不自动拉起支付
    if (!opts.depositEnabled || !opts.agreed) return unpaid("rules-unseen", booking);

    // ⑤ 拉起支付并以服务端状态确认
    let outcome: DepositPayOutcome;
    try {
      outcome = await deps.payFlow.payAndConfirm(deps.context(), { bookingId: booking.id, pay: created.pay });
    } catch {
      outcome = { ok: false, reason: "payment-failed" };
    }
    if (outcome.ok) return { kind: "paid", booking: outcome.booking ?? booking };
    const snapshot = outcome.booking ?? booking;
    return unpaid(outcome.reason ?? "payment-failed", snapshot);

    function unpaid(reason: DepositPayReason | "no-pay-params" | "rules-unseen", snap: BookingView): DepositSubmitOutcome {
      return {
        kind: "unpaid",
        reason,
        booking: snap,
        retainMinutes: retainMinutes(snap.deposit, now(), opts.payHoldMinutes),
      };
    }
  }

  return { submit };
}
