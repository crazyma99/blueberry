// P2-01 repositories · 店铺（旧端实测 GET /api/shops → data: ShopInfo[]）。
import type { RequestContext } from "../../ports/context";
import type { RepoResult } from "./carousels";
import type { ClientLike } from "./carousels";

export interface ShopBrief {
  [key: string]: unknown;
}

export function createShopRepository(deps: { client: ClientLike }) {
  return {
    getShops(context: RequestContext): Promise<RepoResult<ShopBrief[]>> {
      return deps.client.request<ShopBrief[]>({
        method: "GET",
        url: "/api/shops",
        replayPolicy: "idempotent",
        context,
      });
    },
  };
}
