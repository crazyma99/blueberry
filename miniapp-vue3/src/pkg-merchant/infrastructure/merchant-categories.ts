// 商家端分类仓储（issue #14 · M2）。信封 {code,message,data}；业务失败 HTTP200+code=500（同名冲突等文案原样展示）。
// 参数位置**以后端各接口实际读取处为准**（见 domain/merchant-category.ts 头注释）；非 GET 的 query 参数一律拼进 url（共用传输层对非 GET 不发 query）。
// 写接口 `replayPolicy:"never"`；读接口幂等。**不使用 GET /shop/sub/list**（裸数组、N+1）。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "../../infrastructure/repositories/carousels";
import { withQuery } from "../domain/merchant-http";
import { normalizeCategory, type MerchantCategory } from "../domain/merchant-category";

function listOf(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

export function createMerchantCategoryRepository(deps: { client: ClientLike }) {
  return {
    /** 某系列的一级分类（幂等读） */
    async listParents(context: RequestContext, shopId: number): Promise<RepoResult<MerchantCategory[]>> {
      const res = await deps.client.request<unknown>({
        method: "GET",
        url: "/shop/parent/list",
        query: { shopId: String(shopId) },
        authRequired: true,
        replayPolicy: "idempotent",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: listOf(res.value).map((c) => normalizeCategory(c, 1)) };
    },

    /** 某一级分类下的二级分类（get-by-parent；幂等读） */
    async listSubs(context: RequestContext, parentId: number): Promise<RepoResult<MerchantCategory[]>> {
      const res = await deps.client.request<unknown>({
        method: "GET",
        url: "/shop/sub/get-by-parent",
        query: { parentId: String(parentId) },
        authRequired: true,
        replayPolicy: "idempotent",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: listOf(res.value).map((c) => normalizeCategory(c, 2)) };
    },

    async createParent(context: RequestContext, body: { shopId: number; name: string; sortOrder: number }): Promise<RepoResult<MerchantCategory>> {
      const res = await deps.client.request<unknown>({
        method: "POST",
        url: "/shop/parent/create",
        body: { shopId: body.shopId, name: body.name, sortOrder: body.sortOrder },
        authRequired: true,
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: normalizeCategory(res.value, 1) };
    },

    /** 改一级：id 在 query（拼进 url），body 为 name/sortOrder */
    async updateParent(context: RequestContext, id: number, body: { name: string; sortOrder: number }): Promise<RepoResult<MerchantCategory>> {
      const res = await deps.client.request<unknown>({
        method: "PUT",
        url: withQuery("/shop/parent/update", { id }),
        body: { name: body.name, sortOrder: body.sortOrder },
        authRequired: true,
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: normalizeCategory(res.value, 1) };
    },

    /** 删一级（级联）：id、shopId 都在 query */
    async deleteParent(context: RequestContext, id: number, shopId: number): Promise<RepoResult<true>> {
      const res = await deps.client.request<unknown>({
        method: "DELETE",
        url: withQuery("/shop/parent/delete", { id, shopId }),
        authRequired: true,
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: true };
    },

    async createSub(context: RequestContext, body: { parentId: number; name: string; sortOrder: number }): Promise<RepoResult<MerchantCategory>> {
      const res = await deps.client.request<unknown>({
        method: "POST",
        url: "/shop/sub/create",
        body: { parentId: body.parentId, name: body.name, sortOrder: body.sortOrder },
        authRequired: true,
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: normalizeCategory(res.value, 2) };
    },

    /** 改二级：id 在 query；body **必须带 parentId**（后端必填；这里不做移动，传原父分类） */
    async updateSub(context: RequestContext, id: number, body: { parentId: number; name: string; sortOrder: number }): Promise<RepoResult<MerchantCategory>> {
      const res = await deps.client.request<unknown>({
        method: "PUT",
        url: withQuery("/shop/sub/update", { id }),
        body: { parentId: body.parentId, name: body.name, sortOrder: body.sortOrder },
        authRequired: true,
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: normalizeCategory(res.value, 2) };
    },

    /** 删二级（级联删相册和图片）：id 在 query */
    async deleteSub(context: RequestContext, id: number): Promise<RepoResult<true>> {
      const res = await deps.client.request<unknown>({
        method: "DELETE",
        url: withQuery("/shop/sub/delete", { id }),
        authRequired: true,
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: true };
    },
  };
}
