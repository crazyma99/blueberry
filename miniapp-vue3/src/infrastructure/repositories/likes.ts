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
    /** 读状态：**需带登录态**（后端 JWTOptional——无 token 时 liked 恒 false；旧端 http 层默认带 token） */
    getLikeStatus(context: RequestContext, albumIds: string): Promise<RepoResult<LikeStatusItem[]>> {
      return deps.client.request<LikeStatusItem[]>({
        method: "GET",
        url: "/api/like/status",
        // ⭐2026-09-20（CR 同根因）：后端为 JWTOptional——无 token 则 liked 恒 false（旧端 http 层「有 token 就带」）。
        // **跨端边界**：微信端要求带登录态（取回真实 liked）；抖音端登录尚未落地（占位）⇒ 保持匿名，避免触发登录流程。
        authRequired: context.platform === "mp-weixin",
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
