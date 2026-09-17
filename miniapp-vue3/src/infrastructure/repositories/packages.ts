// P2-17 repositories · 门店套餐（旧端实测 GET /wechat/packages?shopId=…，公开无需登录）。
// 旧端 api.uts:370-391：ShopPackageInfo{id,shopId,name,detail,photoDetail,price,imageUrl,sortOrder}；
// 后端仅启用按 sortOrder 升序下发；price 数值形态旧端直接渲染，保持 unknown 由展示层收窄。
// 套餐条目仅展示（2026-09-11 主人指示：价目表二级页渲染，店铺级 banner 同批废弃）。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "./carousels";

export interface ShopPackageInfo {
  id: number;
  shopId: number;
  name: string;
  detail: string;
  photoDetail: string;
  price: unknown;
  imageUrl: string;
  sortOrder: number;
}

export function createPackageRepository(deps: { client: ClientLike }) {
  return {
    /** 旧端 getPackages(shopId)：GET /wechat/packages，shopId 走 query */
    getPackages(context: RequestContext, shopId: string | number): Promise<RepoResult<ShopPackageInfo[]>> {
      return deps.client.request<ShopPackageInfo[]>({
        method: "GET",
        url: "/wechat/packages",
        query: { shopId: String(shopId) },
        replayPolicy: "idempotent",
        context,
      });
    },
  };
}
