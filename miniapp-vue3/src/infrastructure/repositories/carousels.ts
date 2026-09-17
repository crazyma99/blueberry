// P2-01 repositories · 轮播（getImage：旧端实测 GET /wechat/carousels，可传 method 覆盖）。
// 合同冻结见 docs/migration/contracts.md；结构未逐字段登记项随 T6 补。
import type { RequestContext } from "../../ports/context";
import type { ClientRequestInput, ClientResult } from "../http/client";
import type { AppError } from "../http/errors";

export interface ClientLike {
  request: <T>(input: ClientRequestInput) => Promise<ClientResult<T>>;
}
export type RepoResult<T> = { ok: true; value: T } | { ok: false; error: AppError };

export interface CarouselItem {
  [key: string]: unknown;
}

export function createCarouselRepository(deps: { client: ClientLike }) {
  return {
    /** 旧端签名：getImage(method, params)；GET 时 params 走 query */
    getImage(
      context: RequestContext,
      options?: { method?: "GET" | "POST"; params?: Record<string, string> },
    ): Promise<RepoResult<CarouselItem[]>> {
      const method = (options?.method ?? "GET").toUpperCase() as "GET" | "POST";
      return deps.client.request<CarouselItem[]>({
        method,
        url: "/wechat/carousels",
        query: method === "GET" ? options?.params : undefined,
        body: method === "GET" ? undefined : options?.params,
        replayPolicy: "idempotent",
        context,
      });
    },
  };
}
