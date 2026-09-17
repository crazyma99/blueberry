// 平台传输适配（T5/T6 交界）：uni.request → ports HttpPort。
// baseUrl 由调用方从 PROFILE.apiBases[environment] 注入（P1-15 环境映射）；
// 业务信封解码（code/message/data）在此完成，client 只见 HttpResponse 合同。
// 容器无 uni.request 时按 network 失败返回（测试环境安全）。
import type { Result } from "../../ports/context";
import type { HttpRequest, HttpResponse, HttpPort } from "../../ports/http";

interface UniEnvelope {
  code?: unknown;
  message?: string;
  data?: unknown;
}
interface UniRes {
  statusCode: number;
  data: unknown;
}

export function createUniTransport(deps: { baseUrl: string }): HttpPort {
  return {
    request<T>(req: HttpRequest): Promise<Result<HttpResponse<T>>> {
      return new Promise((resolve) => {
        if (typeof uni === "undefined" || typeof uni.request !== "function") {
          resolve({ ok: false, reason: "network" });
          return;
        }
        uni.request({
          url: deps.baseUrl + req.url,
          method: req.method,
          // uni.request 的 data 期望 string|AnyObject|ArrayBuffer；body 为 unknown，按对象契约收窄后传入
          data: (req.method === "GET" ? req.query : req.body) as Record<string, unknown> | undefined,
          header: req.headers,
          timeout: req.timeoutMs,
          success: (res: UniRes) => {
            let envelope: UniEnvelope | null = null;
            if (typeof res.data === "string") {
              try {
                envelope = JSON.parse(res.data) as UniEnvelope;
              } catch {
                envelope = null;
              }
            } else if (res.data != null && typeof res.data === "object") {
              envelope = res.data as UniEnvelope;
            }
            resolve({
              ok: true,
              value: {
                status: res.statusCode,
                businessCode: typeof envelope?.code === "number" ? envelope.code : null,
                message: typeof envelope?.message === "string" ? envelope.message : undefined,
                requestId: null,
                data: (envelope?.data ?? envelope) as T,
              },
            });
          },
          fail: () => resolve({ ok: false, reason: "network" }),
        });
      });
    },
    cancel: () => {
      // uni.request 无统一取消句柄；取消语义由调用方代次治理（authRevision/scopeRevision）
    },
  };
}
