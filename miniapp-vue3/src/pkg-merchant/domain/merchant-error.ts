// 商家端错误文案与分类（M1 · issue #14）。**纯函数**。
//
// 后端口径（只读核对 lanmei-backend-golang `pkg/response`、`middleware/ratelimit.go`、`middleware/jwt.go`）：
//   · 业务失败＝HTTP 200 + body.code=500 + 中文 message（登录失败「用户名不存在、密码错误或账号已禁用」亦是此形态）；
//   · 登录限流＝HTTP 429（body.code=429，按 IP 5 次/分钟）；无权限＝HTTP 403（body.code=403）；未登录/过期＝HTTP 401；
//   · http client 已把 HTTP 401 映射为 AUTH_EXPIRED，其余按 body.code 映射为 BUSINESS(businessCode)——
//     所以「HTTP 状态」与「body.code」两条线都在此收口成面向商家的中文文案，绝不透出英文技术串。

export interface MerchantErrorLike {
  kind: string;
  message: string;
  businessCode?: number | null;
}

export const MERCHANT_AUTH_EXPIRED_TEXT = "登录已失效，请重新登录";
export const MERCHANT_FORBIDDEN_TEXT = "无权限执行此操作";
export const MERCHANT_RATE_LIMITED_TEXT = "操作过于频繁，请稍后再试";
export const MERCHANT_LOGIN_RATE_LIMITED_TEXT = "登录尝试过于频繁，请 1 分钟后再试";
export const MERCHANT_NETWORK_TEXT = "网络异常，请检查网络后重试";
export const MERCHANT_GENERIC_FAIL_TEXT = "服务繁忙，请稍后重试";
/**
 * 资金类状态变更（接单/核销/取消）遇网络/超时的文案：请求可能已在服务端生效（有保证金的取消会**同步发起微信全额退款**，
 * 10s 超时后结果未知），所以**不能**提示「请重试」——重复提交只会得到「状态已变化」类业务错误，且会让商家误判。
 * 参照 application/booking-flow.ts 的 BOOKING_CREATE_NETWORK_TEXT 口径：先刷新核对结果。
 */
export const MERCHANT_ACTION_UNKNOWN_TEXT = "网络不太稳定，操作结果未知。请下拉刷新核对该预约的最新状态，确认未生效后再操作";

/** 网络/超时类失败（请求可能已到达服务端，结果未知） */
export function isMerchantNetworkFailure(err: MerchantErrorLike): boolean {
  return err.kind === "NETWORK" || err.kind === "TIMEOUT";
}

/** 登录失效（HTTP 401 → AUTH_EXPIRED；容错：body.code=401 亦视为失效） */
export function isMerchantAuthExpired(err: MerchantErrorLike): boolean {
  return err.kind === "AUTH_EXPIRED" || (err.kind === "BUSINESS" && err.businessCode === 401);
}

/** 限流（HTTP 429 / body.code=429） */
export function isMerchantRateLimited(err: MerchantErrorLike): boolean {
  return err.kind === "BUSINESS" && err.businessCode === 429;
}

/** 无权限（HTTP 403 / body.code=403） */
export function isMerchantForbidden(err: MerchantErrorLike): boolean {
  return err.kind === "BUSINESS" && err.businessCode === 403;
}

/**
 * 面向商家的失败文案：
 *   登录失效／403／429／网络类各用固定中文；业务失败（code=500 等）原样展示后端 message（为空用 fallback）；其余通用文案。
 */
export function merchantErrorMessage(err: MerchantErrorLike, fallback = MERCHANT_GENERIC_FAIL_TEXT): string {
  if (isMerchantAuthExpired(err)) return MERCHANT_AUTH_EXPIRED_TEXT;
  if (isMerchantForbidden(err)) return MERCHANT_FORBIDDEN_TEXT;
  if (isMerchantRateLimited(err)) return MERCHANT_RATE_LIMITED_TEXT;
  if (err.kind === "BUSINESS") {
    const m = typeof err.message === "string" ? err.message.trim() : "";
    return m !== "" ? m : fallback;
  }
  if (err.kind === "NETWORK" || err.kind === "TIMEOUT") return MERCHANT_NETWORK_TEXT;
  return MERCHANT_GENERIC_FAIL_TEXT;
}
