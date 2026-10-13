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
        // ⭐2026-10-13（CR ④ 收口 · **真 bug 修复**）：原写法 `authRequired: context.platform === "mp-weixin"` 是为
        // 「抖音登录未落地」做的临时边界——现抖音登录已落地（契约见 wx-auth.ts），若继续匿名则：
        //   ⒜ 即便有 full 会话也不带 Bearer ⇒ 后端 JWTOptional 让 `liked` 恒 false ⇒ **已赞爱心不亮**；
        //   ⒝ `use-like.replayPending` 依赖本查询判断「服务端是否已收藏」，查询恒 false ⇒ 回落盲 `toggle()`
        //      ⇒ **可能把服务端已有收藏翻成未收藏**（误取消）。
        // ⇒ 改为**带登录态**（与微信端同口径；无会话时 client 侧 fail-closed 返回 AUTH_EXPIRED，不发请求）。
        // 未登记平台（mp-xhs）无登录契约 ⇒ 同样 fail-closed（不会因此产生额外请求）。
        authRequired: true,
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
