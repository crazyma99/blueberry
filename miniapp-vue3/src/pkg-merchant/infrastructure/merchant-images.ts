// 商家端相册图片仓储（issue #14 · M2）：列表 / 排序 / 删除 / 试衣开关。上传走 application/merchant-album-uploader（multipart，不经本仓储）。
// ⚠️ 本组接口的 shopId 参数名统一是 **shopId**（相册 CRUD 里是 shop_id，别混）；非 GET 的 query 一律拼进 url。
// 排序/删除对无效项**静默成功** ⇒ 调用方提交后必须以刷新结果为准，不能只信 code=200。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "../../infrastructure/repositories/carousels";
import { withQuery } from "../domain/merchant-http";
import { normalizeImage, type MerchantImage } from "../domain/merchant-image";

export function createMerchantImageRepository(deps: { client: ClientLike }) {
  return {
    /** 相册图片（query：albumId、shopId；幂等读） */
    async list(context: RequestContext, shopId: number, albumId: number): Promise<RepoResult<MerchantImage[]>> {
      const res = await deps.client.request<unknown>({
        method: "GET",
        url: "/photo-albums/albums/get",
        query: { albumId: String(albumId), shopId: String(shopId) },
        authRequired: true,
        replayPolicy: "idempotent",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: Array.isArray(res.value) ? res.value.map((i) => normalizeImage(i)) : [] };
    },

    /** 排序：body 为数组 [{id,sortOrder}]（无效项后端静默跳过）；shopId 在 query */
    async sort(context: RequestContext, shopId: number, items: ReadonlyArray<{ id: number; sortOrder: number }>): Promise<RepoResult<true>> {
      const res = await deps.client.request<unknown>({
        method: "PUT",
        url: withQuery("/photo-albums/albums/sort", { shopId }),
        body: items.map((x) => ({ id: x.id, sortOrder: x.sortOrder })),
        authRequired: true,
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: true };
    },

    /** 删除单张（对不存在/无权静默成功）：id 在路径、shopId 在 query */
    async remove(context: RequestContext, shopId: number, imageId: number): Promise<RepoResult<true>> {
      const res = await deps.client.request<unknown>({
        method: "DELETE",
        url: withQuery("/photo-albums/albums/delete/" + encodeURIComponent(String(imageId)), { shopId }),
        authRequired: true,
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: true };
    },

    /**
     * 单图试衣开关：**PUT** …/:id/tryon-status?shopId=，body {status:0|1}。
     * 为什么是 PUT 而不是后端原有的 PATCH：wx.request / uni.request 官方合法 method 不含 PATCH（真机大概率被拒）；
     * 后端新增了 PUT 别名（复用同一 handler、同权限，原 PATCH 保留）。⚠️ 部署顺序依赖：别名未部署到目标环境前，开关会失败（预期），
     * 不要回退到 PATCH。
     */
    async setTryon(context: RequestContext, shopId: number, imageId: number, status: 0 | 1): Promise<RepoResult<MerchantImage>> {
      const res = await deps.client.request<unknown>({
        method: "PUT",
        url: withQuery("/photo-albums/albums/" + encodeURIComponent(String(imageId)) + "/tryon-status", { shopId }),
        body: { status },
        authRequired: true,
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: normalizeImage(res.value) };
    },
  };
}
