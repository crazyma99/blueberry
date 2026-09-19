// T9a 支付协调器（Phase 3 共享支付前置，P3-01～P3-07）：把「下单 → 拉起支付 → 轮询到账 → **权益确认**」编成
// 单一出口，试衣/推荐/下载三池共用同一门闩与同一流程（phases：「不得各自再写一套支付门闩」，T8/T9b 只消费它）。
//
// 状态机（domain/payment-state.PaymentPhase）：idle → creatingOrder → awaitingUser → confirmingEntitlement → succeeded
//   用户取消 → cancelled；超时/业务错误 → failed；**终态一律释放门闩**（finally）。
// 纪律（phases :571-589 逐条落实）：
//  · P3-03 operationId：同 operationId 重复点击**复用同一在飞过程**，不创建第二笔订单（客户端去重 ≠ 服务端幂等，
//    仅作防重入；下单/兑换 POST 一律 replayPolicy=never，禁止自动重放）。
//  · P3-04 有限轮询：确认有截止时间（timeoutMs），**超时≠订单作废**——返回 outTradeNo，页面后续用 resume() 按
//    后端状态恢复，**不重新创建订单**。
//  · P3-05 权益口径：**面板 success ≠ 订单 paid ≠ 权益到账**。tryon/recommend 需订单 paid **且对应池 balance>0**；
//    download 需订单 paid **且服务端 taskBought=true**——不得「仅 paid 就本地置已解锁」。
import type { RequestContext } from "../ports/context";
import { isTerminalPhase, type PayGuard, type PaymentPhase } from "../domain/payment-state";
import type {
  CreditBalance,
  CreditRechargeOrder,
  CreditRechargeStatus,
} from "../infrastructure/repositories/credits";
import type { PaymentsPort } from "../platform/weixin/payments";

export interface RechargeParams {
  shopId: number;
  credits: number;
  /** 次数池：tryon（默认）/ recommend / download */
  feature?: string;
  /** feature=download 时绑定试衣任务（付款即永久买断该任务） */
  taskId?: number;
  /** 同 operationId 的重复点击复用同一在飞过程（不创建第二笔订单） */
  operationId?: string;
}

export type RechargeReason =
  | "busy"
  | "create-order-failed"
  | "cancelled"
  | "unsupported"
  | "payment-failed"
  | "timeout";

export interface RechargeOutcome {
  ok: boolean;
  phase: PaymentPhase;
  /** 到账且权益确认后的余额（succeeded 时） */
  balance?: number;
  credits?: number;
  /** 超时/失败时回传订单号：**超时≠作废**，可用 resume() 恢复 |
   * 面板成功后仍未确认权益时也会带上（便于页面提示「支付成功，权益确认中」） */
  outTradeNo?: string;
  reason?: RechargeReason;
  errorKind?: string;
}

type RepoOk<T> = { ok: true; value: T };
type RepoErr = { ok: false; error: { kind: string } };
export type RepoResult<T> = RepoOk<T> | RepoErr;

export interface CreditRepositoryLike {
  createRecharge(context: RequestContext, params: RechargeParams): Promise<RepoResult<CreditRechargeOrder>>;
  getRechargeStatus(context: RequestContext, outTradeNo: string): Promise<RepoResult<CreditRechargeStatus>>;
  /** P3-05：权益确认（余额/买断）——download 传 feature+taskId 查 taskBought；tryon/recommend 查 balance */
  getBalance(
    context: RequestContext,
    params?: { shopId?: number; feature?: string; taskId?: number },
  ): Promise<RepoResult<CreditBalance>>;
}

export function createPaymentCoordinator(deps: {
  credits: CreditRepositoryLike;
  payments: PaymentsPort;
  gate: PayGuard;
  poll?: { intervalMs?: number; timeoutMs?: number };
  /** 支付面板回调兜底超时（面板不回调时不长期持闩；默认 120s，CR 🟡5） */
  payTimeoutMs?: number;
  /** 阶段变更通知（2026-09-19 主人指示：loading 与原版一致——页面借此在进入 confirmingEntitlement 时挂「确认到账中...」） */
  onPhase?: (phase: PaymentPhase) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}) {
  const intervalMs = deps.poll?.intervalMs ?? 1000;
  const timeoutMs = deps.poll?.timeoutMs ?? 30000;
  const payTimeoutMs = deps.payTimeoutMs ?? 120000;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let phase: PaymentPhase = "idle";
  /** 阶段迁移唯一出口：赋值＋通知（onPhase 消费方据此挂/摘 loading） */
  function setPhase(p: PaymentPhase): void {
    phase = p;
    deps.onPhase?.(p);
  }
  /** operationId → 在飞过程（P3-03：重复点击复用，不创建第二笔订单） */
  const inFlight = new Map<string, Promise<RechargeOutcome>>();

  /** 权益确认（P3-05）：download 看 taskBought；其余池看 balance>0 */
  async function entitlementOk(context: RequestContext, params: RechargeParams): Promise<boolean> {
    const r = await deps.credits.getBalance(context, {
      shopId: params.shopId,
      feature: params.feature,
      taskId: params.taskId,
    });
    if (!r.ok) return false;
    if (params.feature === "download" && params.taskId != null) {
      return r.value.taskBought === true;
    }
    return r.value.balance > 0;
  }

  /** 轮询既有订单至终态（下单流程与 resume 共用；**不创建订单**） */
  async function confirm(
    context: RequestContext,
    params: RechargeParams,
    outTradeNo: string,
  ): Promise<RechargeOutcome> {
    setPhase("confirmingEntitlement");
    const startedAt = now();
    for (;;) {
      const st = await deps.credits.getRechargeStatus(context, outTradeNo);
      if (st.ok && st.value.paid) {
        // 面板/订单已 paid ≠ 权益到账：必须再过权益确认（P3-05）
        if (await entitlementOk(context, params)) {
          setPhase("succeeded");
          return { ok: true, phase, balance: st.value.balance, credits: st.value.credits, outTradeNo };
        }
      }
      if (now() - startedAt >= timeoutMs) {
        setPhase("failed");
        // 超时≠订单作废：回传订单号，页面用 resume() 恢复（P3-04）
        return { ok: false, phase, reason: "timeout", outTradeNo };
      }
      await sleep(intervalMs);
    }
  }

  /** 支付主流程：下单 → 拉起 → 到账＋权益确认 */
  async function run(context: RequestContext, params: RechargeParams): Promise<RechargeOutcome> {
    if (!deps.gate.tryBegin()) {
      // CR 🟡4：忙分支不回报**别的在飞流程**的阶段（可能非终态），固定 idle 以免消费方误判收尾
      return { ok: false, phase: "idle", reason: "busy" };
    }
    // 上一轮已终结时复位阶段观测值（isTerminalPhase 的唯一生产用途；消费方也用其判终态）
    if (isTerminalPhase(phase)) setPhase("idle");
    try {
      setPhase("creatingOrder");
      const order = await deps.credits.createRecharge(context, params);
      if (!order.ok) {
        setPhase("failed");
        return { ok: false, phase, reason: "create-order-failed", errorKind: order.error.kind };
      }

      setPhase("awaitingUser");
      // 面板回调兜底超时（CR 🟡5）：避免面板既不 success 也不 fail 时长期持闩；超时按 payment-failed 收口
      const pay = await Promise.race([
        deps.payments.requestPayment(order.value),
        new Promise<{ ok: false; reason: "failed"; message: string }>((resolve) => {
          setTimeout(() => resolve({ ok: false, reason: "failed", message: "payment-panel-timeout" }), payTimeoutMs);
        }),
      ]);
      if (!pay.ok) {
        if (pay.reason === "cancelled") {
          setPhase("cancelled");
          return { ok: false, phase, reason: "cancelled", outTradeNo: order.value.outTradeNo };
        }
        setPhase("failed");
        return {
          ok: false,
          phase,
          reason: pay.reason === "unsupported" ? "unsupported" : "payment-failed",
          outTradeNo: order.value.outTradeNo,
        };
      }

      return await confirm(context, params, order.value.outTradeNo);
    } catch (err) {
      console.error("[payment] 支付流程异常:", err);
      setPhase("failed");
      return { ok: false, phase, reason: "payment-failed", errorKind: "unknown" };
    } finally {
      deps.gate.end(); // ✅ 终态（含异常路径）一律释放前端门闩
    }
  }

  /** P3-03：同 operationId 复用在飞过程；无 operationId 直接执行 */
  function recharge(context: RequestContext, params: RechargeParams): Promise<RechargeOutcome> {
    const key = params.operationId;
    if (key == null || key === "") return run(context, params);
    const existing = inFlight.get(key);
    if (existing != null) return existing;
    const p = run(context, params).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, p);
    return p;
  }

  /** P3-04：超时后按后端状态恢复（不创建新订单、不重新扣费） */
  async function resume(
    context: RequestContext,
    params: RechargeParams & { outTradeNo: string },
  ): Promise<RechargeOutcome> {
    if (!deps.gate.tryBegin()) return { ok: false, phase, reason: "busy", outTradeNo: params.outTradeNo };
    try {
      return await confirm(context, params, params.outTradeNo);
    } catch (err) {
      console.error("[payment] resume 异常:", err);
      setPhase("failed");
      return { ok: false, phase, reason: "payment-failed", errorKind: "unknown", outTradeNo: params.outTradeNo };
    } finally {
      deps.gate.end();
    }
  }

  return {
    recharge,
    resume,
    get phase(): PaymentPhase {
      return phase;
    },
  };
}
