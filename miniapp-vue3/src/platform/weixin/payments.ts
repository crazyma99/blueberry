// T9a 平台支付适配：微信小程序 JSAPI 拉起（旧端 uni.requestPayment 语义）。
// 平台差异（fail-closed）：抖音/其他端无微信支付能力 ⇒ 明确返回 `unsupported`，**不假装成功**、不构造假单据。
// 容器安全：uni.requestPayment 不存在（测试环境/异常容器）同样 `unsupported`。
import type { CreditRechargeOrder } from "../../infrastructure/repositories/credits";
import { detectUiPlatform } from "../../ui/ui-platform";

export type PaymentRequestResult =
  | { ok: true }
  | { ok: false; reason: "cancelled" | "failed" | "unsupported"; message?: string };

export interface PaymentsPort {
  requestPayment(order: CreditRechargeOrder): Promise<PaymentRequestResult>;
}

export function createWeixinPayments(deps?: { isWeixin?: () => boolean }): PaymentsPort {
  // 默认按**构建期平台常量**推导（CR 🟡5）：抖音端也有 uni.requestPayment 方法，若不显式判定会得到 failed
  // 而非 unsupported；消费方（T8/T9b 页面）仍应显式传 isWeixin 以便测试注入。
  const isWeixin = deps?.isWeixin ?? (() => detectUiPlatform() === "mp-weixin");
  return {
    requestPayment(order: CreditRechargeOrder): Promise<PaymentRequestResult> {
      if (!isWeixin() || typeof uni === "undefined" || typeof uni.requestPayment !== "function") {
        return Promise.resolve({ ok: false, reason: "unsupported" });
      }
      return new Promise<PaymentRequestResult>((resolve) => {
        try {
          uni.requestPayment({
            provider: "wxpay",
            timeStamp: order.timeStamp,
            nonceStr: order.nonceStr,
            package: order.package,
            signType: order.signType as "MD5" | "HMAC-SHA256" | "RSA",
            paySign: order.paySign,
            success: () => resolve({ ok: true }),
            fail: (err: unknown) => {
              const raw = (err as { errMsg?: unknown } | null)?.errMsg;
              const message = typeof raw === "string" ? raw : "";
              // 用户主动取消（含 "cancel"）→ cancelled；其余 fail → failed（旧端同口径）
              resolve(message.includes("cancel") ? { ok: false, reason: "cancelled", message } : { ok: false, reason: "failed", message });
            },
          });
        } catch (e) {
          resolve({ ok: false, reason: "failed", message: String(e) });
        }
      });
    },
  };
}
