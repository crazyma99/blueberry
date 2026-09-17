// 端口层：支付（纯 TS 接口）
// PaymentPort 只提供平台面板结果，不改业务余额——余额/次数到账以后端订单状态为准。
import type { Result } from "./context";

export interface PaymentPanelResult {
  readonly orderId: string;
  readonly panelOutcome: "success" | "cancel" | "fail" | "unknown";
}

export interface PaymentPort {
  /** 拉起平台支付面板；返回面板结果，不承诺到账 */
  launch(orderId: string): Promise<Result<PaymentPanelResult>>;
}
