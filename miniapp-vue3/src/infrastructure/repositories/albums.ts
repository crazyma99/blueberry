// P2-01 repositories · 分类/相册（旧端实测：GET /wechat/categories?shopId、
// GET /wechat/albums（params 全量透传）、GET /wechat/album/detail（可传 method 覆盖））。
// 响应结构未逐字段冻结（contracts.md 标 pending），随 T6 迁移登记。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "./carousels";

export function createAlbumRepository(deps: { client: ClientLike }) {
  return {
    getCategories(context: RequestContext, shopId: string | number): Promise<RepoResult<Array<Record<string, unknown>>>> {
      return deps.client.request<Array<Record<string, unknown>>>({
        method: "GET",
        url: "/wechat/categories",
        query: { shopId: String(shopId) },
        replayPolicy: "idempotent",
        context,
      });
    },
    /** 旧端签名：getAlbumList(params) 参数全量透传（shopId/分类/分页，明细随 T6 登记） */
    getAlbumList(
      context: RequestContext,
      params: Record<string, string>,
    ): Promise<RepoResult<Record<string, unknown>>> {
      return deps.client.request<Record<string, unknown>>({
        method: "GET",
        url: "/wechat/albums",
        query: params,
        replayPolicy: "idempotent",
        context,
      });
    },
    /** 旧端签名：getalbumDetail(method, params)；targetPhotoDetail 用 idx/type 等入参 */
    getAlbumDetail(
      context: RequestContext,
      options: { method?: "GET" | "POST"; params?: Record<string, string> },
    ): Promise<RepoResult<Record<string, unknown>>> {
      const method = (options.method ?? "GET").toUpperCase() as "GET" | "POST";
      return deps.client.request<Record<string, unknown>>({
        method,
        url: "/wechat/album/detail",
        query: method === "GET" ? options.params : undefined,
        body: method === "GET" ? undefined : options.params,
        replayPolicy: "idempotent",
        context,
      });
    },
  };
}
