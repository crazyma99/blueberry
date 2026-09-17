// 端口层：HTTP（纯 TS 接口；实现在 platform 层，业务域只依赖此合同）
import type { RequestContext, Result } from "./context";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface HttpRequest {
  readonly method: HttpMethod;
  readonly url: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly timeoutMs: number;
  /** requestContext 快照：请求发起时捕获，中途切品牌/环境不追溯改写 */
  readonly context: RequestContext;
  /** 重放策略：仅幂等请求可重放；非幂等默认 never */
  readonly replayPolicy: "never" | "idempotent";
}

export interface HttpResponse<T> {
  readonly status: number;
  readonly businessCode: number | null;
  readonly requestId: string | null;
  readonly data: T;
}

export interface HttpPort {
  request<T>(req: HttpRequest): Promise<Result<HttpResponse<T>>>;
  /** 取消：按 requestId 中止在飞请求，取消后不得写回页面状态 */
  cancel(requestId: string): void;
}
