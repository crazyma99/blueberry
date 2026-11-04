// T8 到店预约 MVP：应用层用例——加载时段／提交预约（含登录前置）／加载我的预约（分页+状态过滤）／取消预约。
// 纪律：仓储只回 Result，不抛；本层不吞错误——失败态按 `error.kind` 经 domain 纯函数映射成中文文案：
// 业务失败（BUSINESS）把服务端中文 message 原样透传；登录失效／网络超时／其它用固定中文，
// 不把 http 层英文技术串（"unauthorized"／"transport failure: …"／"login required: …"）展示给用户。
import type { RequestContext } from "../ports/context";
import type { createBookingRepository, BookingView, SlotsResult, BookingListResult } from "../infrastructure/repositories/bookings";
import {
  BOOKING_CREATE_NETWORK_TEXT,
  bookingErrorMessage,
  classifyBookingError,
  validateBookingForm,
  type BookingFormInput,
  type FormFieldError,
} from "../domain/booking";
import type { BookingStatus } from "../domain/booking";
import { isFullSession } from "../infrastructure/storage/versioned";
import type { Session } from "../infrastructure/http/client";

type BookingRepo = ReturnType<typeof createBookingRepository>;

export type LoadSlotsResult = { ok: true; value: SlotsResult } | { ok: false; message: string };

export function createLoadSlotsUseCase(deps: { bookings: BookingRepo }) {
  return {
    async load(context: RequestContext, shopId: number, date: string): Promise<LoadSlotsResult> {
      const res = await deps.bookings.getSlots(context, shopId, date);
      if (res.ok) return { ok: true, value: res.value };
      return { ok: false, message: bookingErrorMessage(res.error, "时段加载失败，请重试") };
    },
  };
}

export type SubmitBookingResult =
  | { ok: true; value: BookingView }
  | { ok: false; kind: "validation"; error: FormFieldError }
  | { ok: false; kind: "login-required" }
  /** 服务端 401／会话失效：页面应沿用既有登录弹窗引导重新登录（登录成功后补发提交），并提示 message */
  | { ok: false; kind: "auth-expired"; message: string }
  /** 其余失败（业务失败／网络超时／未知）：message 已是面向用户的中文文案 */
  | { ok: false; kind: "business"; message: string };

export interface SubmitBookingParams extends BookingFormInput {
  shopId: number;
  slotId: number;
  date: string;
}

/**
 * 提交预约用例：先做前端表单校验 → 登录前置（只认 full 会话，未登录由调用方拉起登录弹窗后重试）
 * → 提交。登录前置复用 `isFullSession`（口径同 favorites/demoDetail 的点赞登录门，T7 既定纪律）。
 */
export function createSubmitBookingUseCase(deps: {
  bookings: BookingRepo;
  loadSession: () => Session | null;
  context: () => RequestContext;
}) {
  return {
    async submit(input: SubmitBookingParams): Promise<SubmitBookingResult> {
      const formError = validateBookingForm(input);
      if (formError != null) return { ok: false, kind: "validation", error: formError };
      if (!isFullSession(deps.loadSession())) return { ok: false, kind: "login-required" };
      const res = await deps.bookings.createBooking(deps.context(), {
        shopId: input.shopId,
        slotId: input.slotId,
        date: input.date,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.trim(),
        guestCount: input.guestCount,
        remark: input.remark != null && input.remark.trim() !== "" ? input.remark.trim() : undefined,
      });
      if (res.ok) return { ok: true, value: res.value };
      const cls = classifyBookingError(res.error);
      if (cls === "auth") return { ok: false, kind: "auth-expired", message: bookingErrorMessage(res.error) };
      // 创建请求遇网络/超时：请求可能已落库（replayPolicy 仍为 never，不自动重发）⇒ 专属文案提示先去「我的预约」核对
      if (cls === "network") return { ok: false, kind: "business", message: BOOKING_CREATE_NETWORK_TEXT };
      return { ok: false, kind: "business", message: bookingErrorMessage(res.error, "预约提交失败，请重试") };
    },
  };
}

export type LoadMyBookingsResult =
  | { ok: true; value: BookingListResult }
  /** authExpired 仅在登录失效时出现（值恒为 true）：页面据此回到「请先登录」态 */
  | { ok: false; message: string; authExpired?: true };

export function createMyBookingsUseCase(deps: { bookings: BookingRepo }) {
  return {
    async load(
      context: RequestContext,
      params?: { status?: BookingStatus; page?: number; pageSize?: number },
    ): Promise<LoadMyBookingsResult> {
      const res = await deps.bookings.listBookings(context, params);
      if (res.ok) return { ok: true, value: res.value };
      return failure(res.error, "加载我的预约失败，请重试");
    },
  };
}

export type CancelBookingResult = { ok: true; value: BookingView } | { ok: false; message: string; authExpired?: true };

function failure(error: { kind: string; message: string }, businessFallback: string): { ok: false; message: string; authExpired?: true } {
  const message = bookingErrorMessage(error, businessFallback);
  return classifyBookingError(error) === "auth" ? { ok: false, message, authExpired: true } : { ok: false, message };
}

/**
 * 取消预约用例。调用方在取消成功后应**重新拉取当前页**（而非本地摘除），因为服务端是
 * 「仅本人且 pending/confirmed」才允许取消，重拉能同时拿到最新 status 与 total，
 * 避免本地乐观摘除与服务端分页 total 不一致（分页器错位）。
 */
export function createCancelBookingUseCase(deps: { bookings: BookingRepo }) {
  return {
    async cancel(context: RequestContext, bookingId: number): Promise<CancelBookingResult> {
      const res = await deps.bookings.cancelBooking(context, bookingId);
      if (res.ok) return { ok: true, value: res.value };
      return failure(res.error, "取消失败，请重试");
    },
  };
}
