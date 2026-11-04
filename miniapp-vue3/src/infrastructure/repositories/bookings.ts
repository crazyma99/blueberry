// T8 到店预约 MVP repositories · 四个端点（backend-dev 并行冻结的 HTTP 契约；字段名不得改）。
// 信封沿用 {code,message,data}：成功 200；业务失败 HTTP200+code=500+message 中文可读（直接展示）；未登录 401。
// - GET  /api/shops/:id/slots?date=YYYY-MM-DD          公开 → {date, slots:[{slotId,startTime,endTime,capacity,used,remaining,bookable,reason}]}（reason 为后端追加字段，缺失兼容）
// - POST /api/bookings                                  需登录（状态变更，禁自动重放） → BookingView
// - GET  /api/bookings?status=&page=&pageSize=          需登录，仅本人 → {list,total,page,pageSize}
// - POST /api/bookings/:id/cancel                       需登录（状态变更，禁自动重放） → BookingView
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "./carousels";
import type { BookingStatus, SlotReason } from "../../domain/booking";
import { normalizeSlotReason } from "../../domain/booking";

export interface SlotView {
  slotId: number;
  startTime: string;
  endTime: string;
  capacity: number;
  used: number;
  remaining: number;
  /** false＝约满或当天已过时段 */
  bookable: boolean;
  /** 不可约原因（后端新增，向后兼容追加）："" 可约｜"past" 已过开始时间（优先）｜"full" 容量已满；旧后端缺失视为 "" */
  reason: SlotReason;
}

export interface SlotsResult {
  date: string;
  slots: SlotView[];
}

export interface BookingView {
  id: number;
  shopId: number;
  shopName: string;
  slotId: number;
  startTime: string;
  endTime: string;
  date: string;
  customerName: string;
  customerPhone: string;
  guestCount: number;
  remark: string;
  status: BookingStatus;
  channel: string;
  createTime: string;
}

export interface CreateBookingParams {
  shopId: number;
  slotId: number;
  date: string;
  customerName: string;
  customerPhone: string;
  guestCount: number;
  remark?: string;
}

export interface BookingListResult {
  list: BookingView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BookingListParams {
  status?: BookingStatus;
  page?: number;
  pageSize?: number;
}

export function createBookingRepository(deps: { client: ClientLike }) {
  return {
    /** 公开：某店某日的时段与余量（日期 YYYY-MM-DD） */
    getSlots(context: RequestContext, shopId: number, date: string): Promise<RepoResult<SlotsResult>> {
      return deps.client
        .request<SlotsResult>({
          method: "GET",
          url: "/api/shops/" + encodeURIComponent(String(shopId)) + "/slots",
          query: { date },
          replayPolicy: "idempotent",
          context,
        })
        .then((r) => {
          if (!r.ok) return r;
          const slots = Array.isArray(r.value?.slots) ? r.value.slots : [];
          // reason 缺失/非法（旧后端）归一为 ""，交由 domain 兜底推断
          return { ...r, value: { ...r.value, slots: slots.map((s) => ({ ...s, reason: normalizeSlotReason(s.reason) })) } };
        });
    },
    /** 提交预约（状态变更：never 重放；remark 为空则不传） */
    createBooking(context: RequestContext, params: CreateBookingParams): Promise<RepoResult<BookingView>> {
      const body: Record<string, unknown> = {
        shopId: params.shopId,
        slotId: params.slotId,
        date: params.date,
        customerName: params.customerName,
        customerPhone: params.customerPhone,
        guestCount: params.guestCount,
      };
      if (params.remark != null && params.remark !== "") body.remark = params.remark;
      return deps.client.request<BookingView>({
        method: "POST",
        url: "/api/bookings",
        body,
        authRequired: true,
        replayPolicy: "never",
        context,
      });
    },
    /** 我的预约（分页；status 可选） */
    listBookings(context: RequestContext, params?: BookingListParams): Promise<RepoResult<BookingListResult>> {
      const query: Record<string, string> = {
        page: String(params?.page ?? 1),
        pageSize: String(params?.pageSize ?? 20),
      };
      if (params?.status != null) query.status = params.status;
      return deps.client.request<BookingListResult>({
        method: "GET",
        url: "/api/bookings",
        query,
        authRequired: true,
        replayPolicy: "idempotent",
        context,
      });
    },
    /** 取消预约（仅本人且 pending/confirmed；状态变更：never 重放） */
    cancelBooking(context: RequestContext, bookingId: number): Promise<RepoResult<BookingView>> {
      return deps.client.request<BookingView>({
        method: "POST",
        url: "/api/bookings/" + encodeURIComponent(String(bookingId)) + "/cancel",
        authRequired: true,
        replayPolicy: "never",
        context,
      });
    },
  };
}
