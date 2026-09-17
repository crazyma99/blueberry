// P2-20 repositories · 入驻品牌列表（旧端实测 GET /api/brands，公开读）。
// 旧端 api.uts:833-845：{code, message, data: BrandBrief[]}；BrandBrief（api.uts:847-854）
// brandId/brandName/logoUrl/coverImageUrl/description/sortOrder。
// 页面侧按 brandId !== 'PLATFORM' 过滤超管占位品牌（旧 brandHub:102）。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "./carousels";

export interface BrandBrief {
  brandId: string;
  brandName: string;
  logoUrl: string;
  coverImageUrl: string;
  description: string;
  sortOrder: number;
}

export function createBrandRepository(deps: { client: ClientLike }) {
  return {
    /** 旧端 getBrands()：GET /api/brands（公开，无需登录） */
    getBrands(context: RequestContext): Promise<RepoResult<BrandBrief[]>> {
      return deps.client.request<BrandBrief[]>({
        method: "GET",
        url: "/api/brands",
        replayPolicy: "idempotent",
        context,
      });
    },
  };
}
