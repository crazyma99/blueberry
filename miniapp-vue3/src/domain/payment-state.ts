// 支付门闩状态机 ＋ 业务错误码冻结（领域规则，纯 TS）
// 移植来源：旧端 src/utils/payGuard.uts（2026-09-14 统一支付门闩）
// P1-09 冻结：HTTP 业务码 4001 → INSUFFICIENT_CREDITS（保留 businessCode/message/requestId）；
//           普通 BUSINESS 错误不得拉起支付。

export type PayGuardState = "idle" | "paying" | "confirming";

export class PayGuard {
  private state: PayGuardState = "idle";
  private lastTriggerAt = 0;
  private minIntervalMs = 800;
  private now: () => number;

  /** minIntervalMs<=0 或缺省时回落 800；now 可注入（测试用固定时钟） */
  constructor(minIntervalMs?: number, now?: () => number) {
    if (minIntervalMs != null && minIntervalMs > 0) {
      this.minIntervalMs = minIntervalMs;
    }
    this.now = now ?? (() => Date.now());
  }

  /** 尝试进入支付流程：空闲且超过防抖间隔才放行 */
  tryBegin(): boolean {
    if (this.state !== "idle") return false;
    const t = this.now();
    if (t - this.lastTriggerAt < this.minIntervalMs) return false;
    this.lastTriggerAt = t;
    this.state = "paying";
    return true;
  }

  /** 支付面板已拉起：进入「到账确认中」 */
  toConfirming(): void {
    this.state = "confirming";
  }

  /** 结束本次支付流程（成功/失败/取消/超时后调用） */
  end(): void {
    this.state = "idle";
  }

  isBusy(): boolean {
    return this.state !== "idle";
  }

  getState(): PayGuardState {
    return this.state;
  }
}

export type BusinessErrorKind =
  | "INSUFFICIENT_CREDITS"
  | "BUSINESS"
  | "UNKNOWN"
  /** 2026-09-23：AI 试衣照片质量拦截（后端 `code=4002`，`data.check_code` 见 `application/photo-gate.ts`） */
  | "QUALITY_REJECTED";

/**
 * T9a 支付协调状态机（phases Phase 3 冻结）：
 *   idle → creatingOrder → awaitingUser → confirmingEntitlement → succeeded
 *   用户取消 → cancelled；超时/业务错误 → failed（**均释放前端门闩**，终态不再 busy）
 * 与 PayGuard 的分工：PayGuard＝防抖门闩（同一时刻只允许一个支付流程）；本状态机＝流程可观测阶段。
 */
export type PaymentPhase =
  | "idle"
  | "creatingOrder"
  | "awaitingUser"
  | "confirmingEntitlement"
  | "succeeded"
  | "cancelled"
  | "failed";

/** 终态：succeeded / cancelled / failed（进入终态即释放门闩） */
export function isTerminalPhase(p: PaymentPhase): boolean {
  return p === "succeeded" || p === "cancelled" || p === "failed";
}

export interface BusinessError {
  kind: BusinessErrorKind;
  businessCode: number | null;
  message: string;
  requestId: string | null;
}

/** HTTP 业务码 → 领域错误：4001 必须映射 INSUFFICIENT_CREDITS，其余数字码 BUSINESS，缺失 UNKNOWN */
export function mapBusinessCode(code: unknown, message = "", requestId: string | null = null): BusinessError {
  if (code === 4001) {
    return { kind: "INSUFFICIENT_CREDITS", businessCode: 4001, message, requestId };
  }
  if (code === 4002) {
    // 照片质量拦截：**不扣次数、不扣费**（后端在扣次前判定）⇒ 前端不得走充值/退次路径
    return { kind: "QUALITY_REJECTED", businessCode: 4002, message, requestId };
  }
  if (typeof code === "number") {
    return { kind: "BUSINESS", businessCode: code, message, requestId };
  }
  return { kind: "UNKNOWN", businessCode: null, message, requestId };
}

/** 仅 INSUFFICIENT_CREDITS 允许走充值支付路径；普通 BUSINESS 错误不得拉起支付 */
export function mayTriggerRecharge(err: BusinessError): boolean {
  return err.kind === "INSUFFICIENT_CREDITS";
}
