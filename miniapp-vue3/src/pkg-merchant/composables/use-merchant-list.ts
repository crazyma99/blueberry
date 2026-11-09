// 商家端分页列表壳（M1 · issue #14）：筛选 + 分页 + 迟到响应丢弃 + 失败保留，预约列表等复用。
// 约定（沿用 use-my-bookings 已验证的纪律）：
// - noMore 以服务端 total 判定（已加载数 ≥ total 或本页不满）；
// - 切换筛选/下拉刷新＝loadFirst（重置并重拉第一页），触底＝loadMore；
// - 用 seq 丢弃迟到响应（连续切换筛选时旧请求晚到不覆盖新结果）；
// - 失败保留：loadFirst 失败时保留已有列表（仅首次为空或切换了筛选才清空——旧列表属于别的筛选，留着会误导）；
//   loadMore 失败单独记 loadMoreError，不动 noMore/page，再次触底仍可重试；
// - authExpired：任一请求遇登录失效置位，页面据此回到「请从商家专属入口登录」态。
import { ref } from "vue";
import type { RequestContext } from "../../ports/context";

export type PagedFetchResult<T> =
  | { ok: true; value: { list: T[]; total: number } }
  | { ok: false; message: string; authExpired?: boolean };

export interface PagedFetchArgs<F> {
  filter: F;
  page: number;
  pageSize: number;
}

export function createPagedListViewModel<T, F>(
  deps: { fetch: (context: RequestContext, args: PagedFetchArgs<F>) => Promise<PagedFetchResult<T>> },
  options: { pageSize?: number; initialFilter: F },
) {
  const pageSize = options.pageSize ?? 20;
  const items = ref<T[]>([]) as { value: T[] };
  const filter = ref<F>(options.initialFilter) as { value: F };
  const page = ref(0);
  const total = ref(0);
  const noMore = ref(false);
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref<string | null>(null);
  const loadMoreError = ref<string | null>(null);
  const authExpired = ref(false);
  let seq = 0;

  async function loadFirst(
    context: RequestContext,
    nextFilter?: F,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const filterChanged = nextFilter !== undefined && nextFilter !== filter.value;
    if (nextFilter !== undefined) filter.value = nextFilter;
    const mySeq = ++seq;
    loading.value = true;
    loadingMore.value = false;
    error.value = null;
    loadMoreError.value = null;
    try {
      const r = await deps.fetch(context, { filter: filter.value, page: 1, pageSize });
      if (mySeq !== seq) return { ok: true }; // 迟到响应：已被更新的一次请求取代
      if (!r.ok) {
        error.value = r.message;
        if (r.authExpired === true) authExpired.value = true;
        if (filterChanged || items.value.length === 0) {
          items.value = [];
          total.value = 0;
          page.value = 0;
          noMore.value = true;
        }
        return { ok: false, message: r.message };
      }
      authExpired.value = false;
      items.value = r.value.list;
      total.value = r.value.total;
      page.value = 1;
      noMore.value = items.value.length >= total.value || r.value.list.length < pageSize;
      return { ok: true };
    } finally {
      if (mySeq === seq) loading.value = false;
    }
  }

  async function loadMore(context: RequestContext): Promise<void> {
    if (loading.value || loadingMore.value || noMore.value) return;
    const mySeq = seq; // 复用当前代次：期间若重置（loadFirst 自增 seq）则本次结果作废
    loadingMore.value = true;
    loadMoreError.value = null;
    try {
      const nextPage = page.value + 1;
      const r = await deps.fetch(context, { filter: filter.value, page: nextPage, pageSize });
      if (mySeq !== seq) return;
      if (!r.ok) {
        loadMoreError.value = r.message;
        if (r.authExpired === true) authExpired.value = true;
        return;
      }
      items.value = items.value.concat(r.value.list);
      total.value = r.value.total;
      page.value = nextPage;
      noMore.value = items.value.length >= total.value || r.value.list.length < pageSize;
    } finally {
      if (mySeq === seq) loadingMore.value = false;
    }
  }

  return { items, filter, page, total, noMore, loading, loadingMore, error, loadMoreError, authExpired, pageSize, loadFirst, loadMore };
}
