// T8 到店预约 MVP：「我的预约」列表 VM——状态过滤＋分页＋取消后刷新。
// 约定：
// - 分页以服务端 total 判定 noMore（page*pageSize>=total 或本页不满）；
// - 切换过滤/下拉刷新＝loadFirst（重置并重拉第一页），触底＝loadMore；
// - 用 seq 丢弃迟到响应（先后连续切换状态筛选时，旧请求晚到不覆盖新结果）；
// - 取消成功后**重拉当前列表第一页**——保证 status/total 与服务端一致、分页器不错位；
//   但重拉失败不得清空列表、也不得让 cancelBooking 返回失败：先在本地把该条标记为已取消
//   （当前筛选是「全部／已取消」则改状态，否则从当前筛选摘除），再尝试重拉覆盖；
// - 失败保留策略：loadFirst（含下拉刷新）失败时**保留已有列表**，仅「首次加载（列表本来为空）」或「切换了筛选」
//   （旧列表属于别的筛选，留着会误导）失败才清空；loadMore 失败单独记 loadMoreError（页面底部「加载失败，点击重试」），
//   不动 noMore，所以再次触底仍可重试；
// - authExpired：任一请求遇登录失效（401）置位，页面据此回到「请先登录 / 去登录」态。
import { ref } from "vue";
import type { RequestContext } from "../ports/context";
import type { BookingView } from "../infrastructure/repositories/bookings";
import type { BookingStatus } from "../domain/booking";
import type { createMyBookingsUseCase, createCancelBookingUseCase } from "../application/booking-flow";

type ListUseCase = ReturnType<typeof createMyBookingsUseCase>;
type CancelUseCase = ReturnType<typeof createCancelBookingUseCase>;

export function createMyBookingsViewModel(
  deps: { list: ListUseCase; cancel: CancelUseCase },
  options?: { pageSize?: number },
) {
  const pageSize = options?.pageSize ?? 20;
  const items = ref<BookingView[]>([]);
  const status = ref<BookingStatus | "">("");
  const page = ref(0);
  const total = ref(0);
  const noMore = ref(false);
  const loading = ref(false);
  const loadingMore = ref(false);
  /** 最近一次 loadFirst 的失败文案（成功/开始新的 loadFirst 时清空）；页面仅在列表为空时据此展示「加载失败」空态 */
  const error = ref<string | null>(null);
  /** 最近一次 loadMore 的失败文案（再次 loadMore／loadFirst 开始时清空）；页面在列表底部展示「加载失败，点击重试」 */
  const loadMoreError = ref<string | null>(null);
  /** 登录失效（401）：页面应展示「请先登录 / 去登录」 */
  const authExpired = ref(false);
  const cancellingId = ref<number | null>(null);
  let seq = 0;

  function statusParam(): BookingStatus | undefined {
    return status.value === "" ? undefined : status.value;
  }

  /** 返回本次是否成功及失败文案，供页面决定 toast（列表非空时失败只保留旧列表、不出空态，需另行提示） */
  async function loadFirst(
    context: RequestContext,
    nextStatus?: BookingStatus | "",
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const filterChanged = nextStatus !== undefined && nextStatus !== status.value;
    if (nextStatus !== undefined) status.value = nextStatus;
    const mySeq = ++seq;
    loading.value = true;
    loadingMore.value = false;
    error.value = null;
    loadMoreError.value = null;
    try {
      const r = await deps.list.load(context, { status: statusParam(), page: 1, pageSize });
      if (mySeq !== seq) return { ok: true }; // 迟到响应：已被更新的一次请求取代（由取代者负责结果）
      if (!r.ok) {
        error.value = r.message;
        if (r.authExpired === true) authExpired.value = true;
        // 保留已有列表（下拉刷新／取消后重拉失败不清空）；切换筛选时旧列表属于别的筛选，清掉以免误导
        if (filterChanged || items.value.length === 0) {
          items.value = [];
          total.value = 0;
          page.value = 0;
          noMore.value = true;
        }
        return { ok: false, message: r.message };
      }
      authExpired.value = false;
      items.value = r.value.list ?? [];
      total.value = r.value.total ?? 0;
      page.value = 1;
      noMore.value = items.value.length >= total.value || (r.value.list ?? []).length < pageSize;
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
      const r = await deps.list.load(context, { status: statusParam(), page: nextPage, pageSize });
      if (mySeq !== seq) return;
      if (!r.ok) {
        // 不改 noMore/page：下次触底或点底部「点击重试」仍可再拉同一页
        loadMoreError.value = r.message;
        if (r.authExpired === true) authExpired.value = true;
        return;
      }
      const batch = r.value.list ?? [];
      items.value = items.value.concat(batch);
      total.value = r.value.total ?? total.value;
      page.value = nextPage;
      noMore.value = items.value.length >= total.value || batch.length < pageSize;
    } finally {
      if (mySeq === seq) loadingMore.value = false;
    }
  }

  /** 取消成功后的本地收口：当前筛选含「已取消」则改状态，否则从当前筛选摘除（total 同步减 1） */
  function applyLocalCancelled(bookingId: number): void {
    if (status.value === "" || status.value === "cancelled") {
      items.value = items.value.map((b) => (b.id === bookingId ? { ...b, status: "cancelled" as const } : b));
      return;
    }
    const before = items.value.length;
    items.value = items.value.filter((b) => b.id !== bookingId);
    if (items.value.length < before) total.value = Math.max(0, total.value - 1);
  }

  /**
   * 取消：成功后先本地收口，再重拉第一页（保持当前筛选）以对齐服务端 status/total；
   * 重拉失败不影响返回值（取消本身已成功）、不清空列表。进行中不重入。
   */
  async function cancelBooking(
    context: RequestContext,
    bookingId: number,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    if (cancellingId.value != null) return { ok: false, message: "正在处理，请稍候" };
    cancellingId.value = bookingId;
    try {
      const r = await deps.cancel.cancel(context, bookingId);
      if (!r.ok) {
        if (r.authExpired === true) authExpired.value = true;
        return { ok: false, message: r.message };
      }
      applyLocalCancelled(bookingId);
      await loadFirst(context); // 失败已在 loadFirst 内保留旧列表；此处不看结果
      return { ok: true };
    } finally {
      cancellingId.value = null;
    }
  }

  return {
    items, status, page, total, noMore, loading, loadingMore, error, loadMoreError, authExpired, cancellingId, pageSize,
    loadFirst, loadMore, cancelBooking,
  };
}
