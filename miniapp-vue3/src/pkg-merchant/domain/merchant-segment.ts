// 商家端列表「分段渲染 + 触底自动加载」的共用内核（issue #14 · UX P0 批次2-①）。**纯函数/工厂**，无平台依赖。
// 背景：相册/分类/档期/图片网格的后端接口都是**全量返回**（无服务端分页），所谓「加载更多」只是客户端多渲染一段（nextVisibleCount）。
// 触底（页面级 onReachBottom）与「显示更多」按钮共用同一个加载器——**按钮保留作为兜底入口**。
// 防重复触发：①加载中 / 弹层打开 / 无权限等 `isBlocked()` 为真时忽略；②没有更多时忽略；③触底入口带冷却（默认 300ms）——
// onReachBottom 在内容增长、布局抖动时可能连发，冷却避免一次滑动连翻多段；按钮点击不受冷却限制（用户显式操作）。
import { nextVisibleCount } from "./merchant-album";

/** 分段步长（条）：分类/档期列表（相册列表沿用 ALBUM_PAGE_STEP=20；图片网格是三列，用其 3 倍） */
export const SEGMENT_STEP = 20;
/** 触底冷却（ms） */
export const REACH_BOTTOM_COOLDOWN_MS = 300;

export interface SegmentLoaderDeps {
  /** 每次多显示几条 */
  step: number;
  getVisible: () => number;
  getTotal: () => number;
  setVisible: (n: number) => void;
  /** 加载中 / 弹层打开 / 无权限等：为真则忽略 */
  isBlocked: () => boolean;
  cooldownMs?: number;
  now?: () => number;
}

export function createSegmentLoader(deps: SegmentLoaderDeps) {
  let lastAt = -Infinity;
  const now = deps.now ?? (() => Date.now());
  const cooldown = deps.cooldownMs ?? REACH_BOTTOM_COOLDOWN_MS;
  return {
    /** 是否还有更多可显示 */
    hasMore: (): boolean => deps.getTotal() > deps.getVisible(),
    /**
     * 多显示一段。`viaScroll=true`（触底入口）才受冷却约束。返回是否真的增加了。
     * 无更多 / 被阻塞 / 冷却中 ⇒ 不改任何状态、返回 false。
     */
    loadMore(viaScroll = false): boolean {
      if (deps.isBlocked()) return false;
      const cur = deps.getVisible();
      const total = deps.getTotal();
      if (total <= cur) return false;
      const t = now();
      if (viaScroll && t - lastAt < cooldown) return false;
      const next = nextVisibleCount(cur, total, deps.step);
      if (next <= cur) return false;
      deps.setVisible(next);
      lastAt = t;
      return true;
    },
  };
}
