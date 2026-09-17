// P2-01 repositories · 点赞（旧端实测：GET /api/like/status?albumIds →
// Array<{albumId,liked,likeCount}>；POST /api/like {albumId} → {liked,likeCount}）。
// P2-05：toggleLike 为状态变更，replayPolicy=never（无 provider 幂等保证禁止自动重发）。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "./carousels";

export interface LikeStatusItem {
  albumId: number;
  liked: boolean;
  likeCount: number;
}
export interface ToggleLikeResult {
  liked: boolean;
  likeCount: number;
}

export function createLikeRepository(deps: { client: ClientLike }) {
  return {
    /** 公开读：不要求登录（未登录按未点赞返回） */
    getLikeStatus(context: RequestContext, albumIds: string): Promise<RepoResult<LikeStatusItem[]>> {
      return deps.client.request<LikeStatusItem[]>({
        method: "GET",
        url: "/api/like/status",
        query: { albumIds },
        replayPolicy: "idempotent",
        context,
      });
    },
    /** 用户动作：需登录；状态变更禁止自动重放 */
    toggleLike(context: RequestContext, albumId: number): Promise<RepoResult<ToggleLikeResult>> {
      return deps.client.request<ToggleLikeResult>({
        method: "POST",
        url: "/api/like",
        body: { albumId },
        authRequired: true,
        replayPolicy: "never",
        context,
      });
    },
  };
}
