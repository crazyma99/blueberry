// T8 到店预约 MVP：应用层用例——加载时段／提交预约（含登录前置）／加载我的预约（分页+状态过滤）／取消预约。
// 纪律：仓储只回 Result，不抛；本层不吞错误——失败态按 `error.kind` 经 domain 纯函数映射成中文文案：
// 业务失败（BUSINESS）把服务端中文 message 原样透传；登录失效／网络超时／其它用固定中文，
// 不把 http 层英文技术串（"unauthorized"／"transport failure: …"／"login required: …"）展示给用户。
import type { RequestContext } from "../ports/context";
import type {
  createBookingRepository,
  BookingView,
  CreateBookingResult,
  SlotsResult,
  BookingListResult,
  BookingConfig,
  CancelPreview,
  PayParams,
} from "../infrastructure/repositories/bookings";
import {
  BOOKING_CREATE_NETWORK_TEXT,
  bookingErrorMessage,
  classifyBookingError,
  isNoBrandContextError,
  validateBookingForm,
  type BookingFormInput,
  type FormFieldError,
} from "../domain/booking";
import type { BookingStatus } from "../domain/booking";
import { isFullSession } from "../infrastructure/storage/versioned";
import type { Session } from "../infrastructure/http/client";

type BookingRepo = ReturnType<typeof createBookingRepository>;

/** noBrand＝服务端判定「无品牌上下文」（请先选择入驻门店）：确定性业务错误，页面不应自动重试 */
export type LoadSlotsResult = { ok: true; value: SlotsResult } | { ok: false; message: string; noBrand?: true };

export function createLoadSlotsUseCase(deps: { bookings: BookingRepo }) {
  return {
    /** 当前品牌商家某日档期（商家由请求头 X-Brand-Id 解析，不再按 shopId） */
    async load(context: RequestContext, date: string): Promise<LoadSlotsResult> {
      const res = await deps.bookings.getMerchantSlots(context, date);
      if (res.ok) return { ok: true, value: res.value };
      const message = bookingErrorMessage(res.error, "时段加载失败，请重试");
      return isNoBrandContextError(res.error) ? { ok: false, message, noBrand: true } : { ok: false, message };
    },
  };
}

export type SubmitBookingResult =
  /** value 为 CreateBookingResult（含 deposit 与 pay）：开启保证金时 pay≠null 且 status=awaiting_payment，页面据此拉起支付；未开启 pay:null、deposit:null，行为同既有免保证金预约 */
  | { ok: true; value: CreateBookingResult }
  | { ok: false; kind: "validation"; error: FormFieldError }
  | { ok: false; kind: "login-required" }
  /** 服务端 401／会话失效：页面应沿用既有登录弹窗引导重新登录（登录成功后补发提交），并提示 message */
  | { ok: false; kind: "auth-expired"; message: string }
  /** 其余失败（业务失败／网络超时／未知）：message 已是面向用户的中文文案 */
  | { ok: false; kind: "business"; message: string };

export interface SubmitBookingParams extends BookingFormInput {
  slotId: number;
  date: string;
}

export interface SubmitBookingHooks {
  /**
   * 创建预约前的前置动作（预约保证金：订阅消息授权）。**同步触发**——在表单校验与登录前置都通过之后、第一个 await 之前调用，
   * 以便仍处于用户点击手势的同步调用栈内（wx.requestSubscribeMessage 仅允许在点击行为中调用）。
   * 返回的 Promise 会被等待；其拒绝/异常一律吞掉，**绝不阻断提交**（授权失败/拒绝都放行）；
   * 另设兜底超时（默认 30s，防 wx 个别容器既不 success 也不 fail 导致「提交中...」永久挂起），超时同样放行。
   */
  beforeCreate?: () => Promise<unknown>;
}

/**
 * 提交预约用例：先做前端表单校验 → 登录前置（只认 full 会话，未登录由调用方拉起登录弹窗后重试）
 * → （可选）beforeCreate 钩子 → 提交。登录前置复用 `isFullSession`（口径同 favorites/demoDetail 的点赞登录门，T7 既定纪律）。
 * 校验/登录失败时钩子**不触发**（不为必然失败的提交白弹授权框）。
 */
export function createSubmitBookingUseCase(deps: {
  bookings: BookingRepo;
  loadSession: () => Session | null;
  context: () => RequestContext;
  /** beforeCreate 钩子兜底超时毫秒（默认 30000；测试可注入） */
  hookTimeoutMs?: number;
}) {
  return {
    async submit(input: SubmitBookingParams, hooks?: SubmitBookingHooks): Promise<SubmitBookingResult> {
      const formError = validateBookingForm(input);
      if (formError != null) return { ok: false, kind: "validation", error: formError };
      if (!isFullSession(deps.loadSession())) return { ok: false, kind: "login-required" };
      if (hooks?.beforeCreate != null) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          // 注意：hooks.beforeCreate() 在此**同步**被调用（Promise.race 的实参先求值），仍处于点击手势的同步调用栈内
          await Promise.race([
            hooks.beforeCreate(),
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, deps.hookTimeoutMs ?? 30000);
            }),
          ]);
        } catch {
          /* 前置动作（订阅授权）失败一律放行：不阻断提交 */
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      }
      const res = await deps.bookings.createBooking(deps.context(), {
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

// ———————————————————————————————————————————————————————————————
// 预约保证金用例扩展（工作流 A）。B 会据下列签名/返回联合类型开发页面。
// ———————————————————————————————————————————————————————————————

export type LoadBookingConfigResult =
  /** 成功：透传商家预约配置（含保证金规则与订阅模板） */
  | { ok: true; value: BookingConfig }
  /** 失败：带 failed 标记（authExpired 仅登录失效时置位）。
   *  纪律：**不做静默降级**——配置拉取失败时如实返回 ok:false，页面自行决定（提交前可能需要再拉一次/提示重试），
   *  避免在"可能需要保证金"的门店把用户当成"无保证金"直接提交。 */
  | { ok: false; message: string; failed: true; authExpired?: true; noBrand?: true };

/**
 * 加载商家预约配置用例。失败如实返回 {ok:false, failed:true}（不静默降级为 enabled=false 放行）。
 */
export function createLoadBookingConfigUseCase(deps: { bookings: BookingRepo }) {
  return {
    /** 当前品牌商家的预约配置（商家由请求头 X-Brand-Id 解析，不再按 shopId） */
    async load(context: RequestContext): Promise<LoadBookingConfigResult> {
      const res = await deps.bookings.getMerchantBookingConfig(context);
      if (res.ok) return { ok: true, value: res.value };
      const message = bookingErrorMessage(res.error, "配置加载失败，请重试");
      if (isNoBrandContextError(res.error)) return { ok: false, message, failed: true, noBrand: true };
      return classifyBookingError(res.error) === "auth"
        ? { ok: false, message, failed: true, authExpired: true }
        : { ok: false, message, failed: true };
    },
  };
}

export type CancelPreviewResult = { ok: true; value: CancelPreview } | { ok: false; message: string; authExpired?: true };

/** 取消预览用例：取消前拉 {refundFen, forfeitFen, reason} 供确认框展示 */
export function createCancelPreviewUseCase(deps: { bookings: BookingRepo }) {
  return {
    async preview(context: RequestContext, bookingId: number): Promise<CancelPreviewResult> {
      const res = await deps.bookings.getCancelPreview(context, bookingId);
      if (res.ok) return { ok: true, value: res.value };
      return failure(res.error, "无法获取取消信息，请重试");
    },
  };
}

export type ContinuePayResult = { ok: true; value: CreateBookingResult } | { ok: false; message: string; authExpired?: true };

/** 继续支付用例：对 awaiting_payment 的预约重新取 PayParams（调 payBooking） */
export function createContinuePayUseCase(deps: { bookings: BookingRepo }) {
  return {
    async pay(context: RequestContext, bookingId: number): Promise<ContinuePayResult> {
      const res = await deps.bookings.payBooking(context, bookingId);
      if (res.ok) return { ok: true, value: res.value };
      return failure(res.error, "发起支付失败，请重试");
    },
  };
}

// 便于 B 复用 PayParams 类型（从 application 层统一出口）
export type { PayParams };
