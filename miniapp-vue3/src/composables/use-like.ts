// P2-14 点赞乐观更新：按下即反馈（状态/计数先改后发）；seq 并发守卫防乱序覆盖；
// 服务端返回为准（防并发漂移）；失败回滚；计数不为负（旧端 demoDetail:660-693 忠实移植）。
// 2026-10-11 replayPending（登录后补发守卫，「亮又灭」根修）：未登录门控刻意隐藏真实收藏态
// （liked 恒显 false），登录成功后若盲 toggle，会把服务端本已存在的收藏翻成 false——
// 补发前先查真实态：已收藏只同步 UI 不再取反；未收藏以服务端计数为基线再 toggle。
import type { RequestContext } from "../ports/context";
import type { RepoResult } from "../infrastructure/repositories/carousels";
import type { LikeStatusItem, ToggleLikeResult } from "../infrastructure/repositories/likes";

export interface LikeableItem {
  id: number;
  liked?: boolean;
  likeCount?: number;
  /** 并发序号：每次点击递增，只有最后一次请求的响应被采纳 */
  likeSeq?: number;
}

export type ToggleOutcome = "confirmed" | "rolled-back" | "discarded-stale";
/** 补发结果：在 ToggleOutcome 上多加 already-liked＝服务端本已收藏（只同步 UI，未发 toggle） */
export type ReplayOutcome = ToggleOutcome | "already-liked";

export function createLikeToggler(deps: {
  likes: {
    toggleLike: (ctx: RequestContext, albumId: number) => Promise<RepoResult<ToggleLikeResult>>;
    /** 补发守卫必查真实态（CR 🟡-4：必填——可选化会让接线遗漏静默退化为盲 toggle＝原 bug 回归） */
    getLikeStatus: (ctx: RequestContext, albumIds: string) => Promise<RepoResult<LikeStatusItem[]>>;
  };
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
  /**
   * 登录成功后补发挂起点赞（2026-10-11「亮又灭」根修）：先查服务端真实点赞态——
   * 已收藏 ⇒ 用户意图已达成，只同步 UI 不再取反；未收藏 ⇒ 以服务端计数为基线走 toggle；
   * 查询失败/异常/无本 id 记录 ⇒ 回落原盲 toggle（保住挂起动作语义，同 09-28 补发口径）。
   * seq 守卫（CR 🔴-1）：补发窗口内用户又点了同一项 ⇒ likeSeq 已变，新动作已接管该 item，
   * 本次补发整体作废（既不同步也不再 toggle——否则双 toggle 相消/误删历史收藏，换形复现）。
   */
  async function replayPending(context: RequestContext, item: LikeableItem): Promise<ReplayOutcome> {
    const seqOf = (it: LikeableItem): number => (it.likeSeq == null ? 0 : it.likeSeq); // 与 toggle 同口径归一
    const seq0 = seqOf(item);
    let r: RepoResult<LikeStatusItem[]>;
    try {
      r = await deps.likes.getLikeStatus(context, String(item.id));
    } catch {
      // 查询异常与查询失败同口径（CR 🟡-3：repo 以异常失败时不得产生 unhandled rejection）
      return seqOf(item) === seq0 ? toggle(context, item) : "discarded-stale";
    }
    if (seqOf(item) !== seq0) return "discarded-stale";
    if (r.ok) {
      const s = r.value.find((x) => x.albumId === item.id);
      if (s != null) {
        item.liked = s.liked;
        item.likeCount = s.likeCount;
        if (s.liked) return "already-liked";
      }
    }
    return toggle(context, item);
  }
  return { toggle, replayPending };
}
