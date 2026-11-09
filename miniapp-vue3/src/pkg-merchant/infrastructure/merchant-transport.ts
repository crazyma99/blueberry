// 商家端传输装饰器（M1 · issue #14）：把「HTTP 状态」补进 businessCode，保证 HTTP 状态与 body.code 两条线都被处理。
//
// 为什么需要：共用 `createHttpClient` 只对 HTTP 401 做特判，其余一律看 `businessCode`（取自 body.code）。
// 后端管理端的 403（无权限）／429（登录限流，按 IP 5 次/分钟）是「HTTP 状态 + body.code 同值」的形态，
// 但网关层（如 nginx 429/502）可能返回**非 JSON** 响应体 ⇒ businessCode 为 null ⇒ client 会把它当 UNKNOWN。
// 本装饰器在 `businessCode == null` 且 HTTP 状态 ≥ 400 且 ≠ 401 时，把 businessCode 补成 HTTP 状态；
// 已有 body.code 的响应**原样透传**（后端自己的 code 优先）。401 不动（client 已特判并触发 expireSession）。
// 只包商家 client 的传输，**不改共用 client / 共用 transport**。
import type { HttpPort, HttpRequest, HttpResponse } from "../../ports/http";
import type { Result } from "../../ports/context";

export function createMerchantTransport(inner: HttpPort): HttpPort {
  return {
    async request<T>(req: HttpRequest): Promise<Result<HttpResponse<T>>> {
      const res = await inner.request<T>(req);
      if (!res.ok) return res;
      const http = res.value;
      if (http.businessCode == null && http.status >= 400 && http.status !== 401) {
        return { ok: true, value: { ...http, businessCode: http.status } };
      }
      return res;
    },
    cancel: (requestId) => inner.cancel(requestId),
  };
}
