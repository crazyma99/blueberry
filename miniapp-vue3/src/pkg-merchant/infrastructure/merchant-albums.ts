// 商家端相册仓储（issue #14 · M2）。信封 {code,message,data}；业务失败 HTTP200+code=500。
// ⚠️ shopId 参数名各接口不统一（见 domain/merchant-album.ts 头注释），本文件**逐接口按 handler 实际读取处**书写；
// 非 GET 的 query 参数一律拼进 url（共用传输层对非 GET 不发 query）。写接口 never 重放，读接口幂等。
// 不使用「相册详情」GET /photo-albums/:id（后端恒返回 null）。图片上传走 application/merchant-album-uploader（multipart，不经本仓储）。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "../../infrastructure/repositories/carousels";
import { withQuery } from "../domain/merchant-http";
import { normalizeAlbum, type AlbumForm, type MerchantAlbum } from "../domain/merchant-album";

function listOf(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

export function createMerchantAlbumRepository(deps: { client: ClientLike }) {
  return {
    /** 相册列表（query 为 shop_id / parent_id / child_id / keyword；全量返回，无分页） */
    async list(
      context: RequestContext,
      args: { shopId: number; parentId?: number; childId?: number; keyword?: string },
    ): Promise<RepoResult<MerchantAlbum[]>> {
      const query: Record<string, string> = { shop_id: String(args.shopId) };
      if (args.childId != null && args.childId > 0) query.child_id = String(args.childId);
      else if (args.parentId != null && args.parentId > 0) query.parent_id = String(args.parentId);
      const kw = (args.keyword ?? "").trim();
      if (kw !== "") query.keyword = kw;
      const res = await deps.client.request<unknown>({
        method: "GET",
        url: "/photo-albums/photo",
        query,
        authRequired: true,
        replayPolicy: "idempotent",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: listOf(res.value).map((a) => normalizeAlbum(a)) };
    },

    /** 新建：shop_id 在 query；body 含 title/childId/coverImageUrl/price/packageDesc/aiDesc/sortOrder */
    async create(context: RequestContext, shopId: number, form: AlbumForm): Promise<RepoResult<MerchantAlbum>> {
      const res = await deps.client.request<unknown>({
        method: "POST",
        url: withQuery("/photo-albums/add-photo", { shop_id: shopId }),
        body: { title: form.title, childId: form.childId, coverImageUrl: form.coverImageUrl, price: form.price, packageDesc: form.packageDesc, aiDesc: form.aiDesc, sortOrder: form.sortOrder },
        authRequired: true,
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: normalizeAlbum(res.value) };
    },

    /** 修改：⚠️ query 参数名是 **shopId**（不是 shop_id）；body 必须是全量字段（整条 Save，漏带会清零） */
    async update(context: RequestContext, shopId: number, id: number, form: AlbumForm): Promise<RepoResult<MerchantAlbum>> {
      const res = await deps.client.request<unknown>({
        method: "PUT",
        url: withQuery("/photo-albums/update/" + encodeURIComponent(String(id)), { shopId }),
        body: { title: form.title, childId: form.childId, coverImageUrl: form.coverImageUrl, price: form.price, packageDesc: form.packageDesc, aiDesc: form.aiDesc, sortOrder: form.sortOrder },
        authRequired: true,
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: normalizeAlbum(res.value) };
    },

    /** 删除（级联删 COS 文件、图片、AI 模板）：query 参数名是 shop_id */
    async remove(context: RequestContext, shopId: number, albumId: number): Promise<RepoResult<true>> {
      const res = await deps.client.request<unknown>({
        method: "DELETE",
        url: withQuery("/photo-albums/delete/" + encodeURIComponent(String(albumId)), { shop_id: shopId }),
        authRequired: true,
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: true };
    },
  };
}
