// 商家端预约用例（issue #14 · M1）：列表拉取适配 + 状态变更执行器（防重）。
// 纪律：仓储只回 Result 不抛；本层把 AppError 统一映射为面向商家的中文文案（domain/merchant-error），不透出 http 层英文技术串。
import type { RequestContext } from "../../ports/context";
import type { createMerchantBookingRepository, MerchantBookingPage } from "../infrastructure/merchant-bookings";
import type { PagedFetchArgs, PagedFetchResult } from "../composables/use-merchant-list";
import type { MerchantBookingAction, MerchantBookingFilter, MerchantBookingView } from "../domain/merchant-booking";
import { isMerchantAuthExpired, isMerchantNetworkFailure, merchantErrorMessage, MERCHANT_ACTION_UNKNOWN_TEXT } from "../domain/merchant-error";

type Repo = ReturnType<typeof createMerchantBookingRepository>;

/** 适配成列表壳的 fetch：失败带 message；登录失效带 authExpired */
export function createBookingListFetch(deps: { bookings: Repo }) {
  return async function fetchPage(
    context: RequestContext,
    args: PagedFetchArgs<MerchantBookingFilter>,
  ): Promise<PagedFetchResult<MerchantBookingView>> {
    const r = await deps.bookings.list(context, { filter: args.filter, page: args.page, pageSize: args.pageSize });
    if (!r.ok) {
      return { ok: false, message: merchantErrorMessage(r.error, "预约加载失败，请重试"), authExpired: isMerchantAuthExpired(r.error) };
    }
    const v: MerchantBookingPage = r.value;
    return { ok: true, value: { list: v.list, total: v.total } };
  };
}

export type BookingActionOutcome =
  | { ok: true; booking: MerchantBookingView }
  /** unknown＝网络/超时，**结果未知**（可能已生效）：页面必须刷新列表核对，且不得提示「请重试」 */
  | { ok: false; kind: "busy" | "failed" | "auth-expired" | "unknown"; message: string };

/**
 * 状态变更执行器。**防重**：任一变更进行中（busyId≠null）再点任何预约的任何操作一律拒绝——
 * 后端对重复变更返回业务错误（HTTP200+code=500，不是幂等成功），所以不能靠重试兜底，必须前端串行化。
 * 失败（含后端「当前状态不可…」「预约状态已变化，请刷新后重试」）原样给出后端文案，由调用方刷新列表对齐服务端状态。
 */
export function createBookingActionRunner(deps: { bookings: Repo }) {
  let busyId: number | null = null;
  return {
    /** 当前处理中的预约 id（页面据此置灰按钮/显示「处理中...」） */
    busyId: (): number | null => busyId,
    async run(context: RequestContext, bookingId: number, action: MerchantBookingAction): Promise<BookingActionOutcome> {
      if (busyId != null) return { ok: false, kind: "busy", message: "正在处理，请稍候" };
      busyId = bookingId;
      try {
        const r = await deps.bookings.act(context, bookingId, action);
        if (!r.ok) {
          if (isMerchantAuthExpired(r.error)) return { ok: false, kind: "auth-expired", message: merchantErrorMessage(r.error) };
          // 资金类动作遇网络/超时：结果未知（见 MERCHANT_ACTION_UNKNOWN_TEXT）；业务失败/403 等仍原样后端文案
          if (isMerchantNetworkFailure(r.error)) return { ok: false, kind: "unknown", message: MERCHANT_ACTION_UNKNOWN_TEXT };
          return { ok: false, kind: "failed", message: merchantErrorMessage(r.error, "操作失败，请重试") };
        }
        return { ok: true, booking: r.value };
      } finally {
        busyId = null;
      }
    },
  };
}
