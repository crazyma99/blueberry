// P2-14 点赞乐观更新：按下即反馈（状态/计数先改后发）；seq 并发守卫防乱序覆盖；
// 服务端返回为准（防并发漂移）；失败回滚；计数不为负（旧端 demoDetail:660-693 忠实移植）。
import type { RequestContext } from "../ports/context";
import type { RepoResult } from "../infrastructure/repositories/carousels";
import type { ToggleLikeResult } from "../infrastructure/repositories/likes";

export interface LikeableItem {
  id: number;
  liked?: boolean;
  likeCount?: number;
  /** 并发序号：每次点击递增，只有最后一次请求的响应被采纳 */
  likeSeq?: number;
}

export type ToggleOutcome = "confirmed" | "rolled-back" | "discarded-stale";

export function createLikeToggler(deps: {
  likes: { toggleLike: (ctx: RequestContext, albumId: number) => Promise<RepoResult<ToggleLikeResult>> };
}) {
  async function toggle(context: RequestContext, item: LikeableItem): Promise<ToggleOutcome> {
    const prevLiked = item.liked === true;
    const prevCount = item.likeCount == null ? 0 : item.likeCount;
    const seq = (item.likeSeq == null ? 0 : item.likeSeq) + 1;
    item.likeSeq = seq;
    const nextLiked = !prevLiked;
    item.liked = nextLiked;
    item.likeCount = nextLiked ? prevCount + 1 : prevCount > 0 ? prevCount - 1 : 0;
    try {
      const r = await deps.likes.toggleLike(context, item.id);
      if (item.likeSeq !== seq) return "discarded-stale"; // 期间又点过：丢弃旧响应
      if (r.ok) {
        item.liked = r.value.liked;
        item.likeCount = r.value.likeCount;
        return "confirmed";
      }
      item.liked = prevLiked;
      item.likeCount = prevCount;
      return "rolled-back";
    } catch {
      if (item.likeSeq !== seq) return "discarded-stale";
      item.liked = prevLiked;
      item.likeCount = prevCount;
      return "rolled-back";
    }
  }
  return { toggle };
}
