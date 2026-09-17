// T5（P2-01/P2-05）：HTTP 层错误模型。业务码映射复用 domain/payment-state 的 mapBusinessCode
// （4001→INSUFFICIENT_CREDITS 单一事实源），此处只补网络/认证/取消/超时维度。
import { mapBusinessCode, type BusinessError } from "../../domain/payment-state";

export type AppErrorKind =
  | BusinessError["kind"]
  | "NETWORK"
  | "AUTH_EXPIRED"
  | "CANCELLED"
  | "TIMEOUT";

export interface AppError {
  kind: AppErrorKind;
  businessCode: number | null;
  message: string;
  requestId: string | null;
  /** P2-05 重放策略输入：仅幂等读可据此重发；扣次/下单/兑换码类禁止自动重发 */
  retryable: boolean;
}

/** 传输层失败（无 HTTP 响应）：网络错误/超时/取消 */
export function mapTransportFailure(
  reason: "network" | "timeout" | "cancelled",
  requestId: string | null = null,
): AppError {
  const kind: AppErrorKind = reason === "network" ? "NETWORK" : reason === "timeout" ? "TIMEOUT" : "CANCELLED";
  // 传输失败对幂等读可重放；非幂等请求是否重放由调用方 replayPolicy 决定
  return { kind, businessCode: null, message: "transport failure: " + reason, requestId, retryable: true };
}

/** 业务信封解码：code===0 或 200 视为成功（旧端两种信封并存，P2-01 兼容要求） */
export function isBusinessSuccess(code: unknown): boolean {
  return code === 0 || code === 200;
}

/** 业务失败映射：4001→INSUFFICIENT_CREDITS；其余数字码→BUSINESS；一律不自动重放（P2-05） */
export function mapBusinessFailure(
  code: unknown,
  message = "",
  requestId: string | null = null,
): AppError {
  const base: BusinessError = mapBusinessCode(code, message, requestId);
  return {
    kind: base.kind,
    businessCode: base.businessCode,
    message: base.message,
    requestId: base.requestId,
    retryable: false,
  };
}
