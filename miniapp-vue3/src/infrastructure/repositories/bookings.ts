// T8 到店预约 MVP repositories · HTTP 契约（backend-dev 并行冻结的字段名不得改）。
// 信封沿用 {code,message,data}：成功 200；业务失败 HTTP200+code=500+message 中文可读（直接展示）；未登录 401。
// 【2026-11-06 预约商家收敛（契约《预约商家收敛_接口契约_20261106》§3）】预约归商家（1 码 = 1 商家 = 1 门店）：
//   商家由请求头 `X-Brand-Id`（MerchantCode）解析——**头由 http client 按 RequestContext.brandId 统一注入，本层不拼头**；
//   解析不到商家 → 业务失败「请先选择入驻门店」（code=500，message 直接展示）。
// - GET  /api/booking/slots?date=YYYY-MM-DD            公开（新）→ 形态同下方旧接口 {date, slots:[...]}
// - GET  /api/booking/config                           公开、幂等（新）→ 形态同旧 booking-config，**新增 merchantName**（缺失当 ""）
// - POST /api/bookings                                  需登录（状态变更，禁自动重放）；请求体**不再传 shopId**（后端可选并忽略，商家取自品牌头） → {...BookingView, pay: PayParams|null}
//   BookingView 新增 merchantId（缺失当 0）；shopId 对新预约恒为 0（历史字段，客户端不得依赖）；shopName 的值为商家名
// 旧接口（旧版小程序兼容，**本端页面不再调用**，方法保留）：
// - GET  /api/shops/:id/slots?date=YYYY-MM-DD          公开 → {date, slots:[{slotId,...,reason}]}（reason 缺失兼容）
// - GET  /api/bookings?status=&page=&pageSize=          需登录，仅本人 → {list,total,page,pageSize}
// - POST /api/bookings/:id/cancel                       需登录（状态变更，禁自动重放） → BookingView（deposit 带结算结果）
// 预约保证金扩展（§10.3 冻结）：
// - GET  /api/shops/:id/booking-config                  公开、幂等（旧，保留）→ {deposit:{...}, payHoldMinutes, subscribeTemplates}
// - POST /api/bookings/:id/pay                           需登录、禁重放 → {...BookingView, pay: PayParams}
// - GET  /api/bookings/:id                               需登录、幂等 → BookingView（含 deposit，用于支付后轮询）
// - GET  /api/bookings/:id/cancel-preview                需登录、幂等 → {refundFen, forfeitFen, reason}
// 防御性规整：deposit 缺失当 null、pay 缺失当 null、merchantId 缺失当 0、booking-config 缺字段给安全默认（enabled=false、merchantName=""）。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "./carousels";
import type { AppError } from "../http/errors";
import type { BookingStatus, SlotReason } from "../../domain/booking";
import { normalizeSlotReason } from "../../domain/booking";
import type {
  BookingConfig,
  CancelPreview,
  DepositRuleView,
  DepositView,
  PayParams,
  RefundTrigger,
} from "../../domain/booking-deposit";

export type { BookingConfig, CancelPreview, DepositRuleView, DepositView, PayParams } from "../../domain/booking-deposit";

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
  /** 历史字段：新预约恒为 0，客户端不得依赖 */
  shopId: number;
  /** 商家 ID（2026-11-06 新增；服务端缺失时仓储规整为 0） */
  merchantId: number;
  /** 字段名保留；值为商家名（预约商家收敛后），我的预约卡片直接展示 */
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
  /** 预约保证金（未开启保证金的预约恒为 null）。对外必填：仓储已对服务端缺失做防御性规整（缺失当 null） */
  deposit: DepositView | null;
}

/** POST /api/bookings／POST /api/bookings/:id/pay 的返回：BookingView ＋ 微信支付参数（未开启保证金时 pay:null） */
export type CreateBookingResult = BookingView & { pay: PayParams | null };

export interface CreateBookingParams {
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

/** 把数字字段安全归一为整数（非有限/非数字 → 0） */
function toInt(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
}

/** 防御性规整 DepositView：缺失/非对象 → null；逐字段补安全默认。 */
function normalizeDeposit(raw: unknown): DepositView | null {
  if (raw == null || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  return {
    // status 缺失/非字符串：按「未知」处理（展示「处理中」，轮询不下结论），绝不默认成 pending（否则会冒出可点的「继续支付」）
    status: (typeof d.status === "string" && d.status !== "" ? d.status : "unknown") as DepositView["status"],
    amountFen: toInt(d.amountFen),
    refundFen: toInt(d.refundFen),
    forfeitFen: toInt(d.forfeitFen),
    payExpireTime: typeof d.payExpireTime === "string" ? d.payExpireTime : "",
    settleReason: (typeof d.settleReason === "string" ? d.settleReason : "") as DepositView["settleReason"],
  };
}

/** 防御性规整 PayParams：缺失/非对象/缺调起支付必需字段 → null（不构造半截假单据，避免拉起必然失败的支付） */
function normalizePay(raw: unknown): PayParams | null {
  if (raw == null || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  // wx.requestPayment 必需：timeStamp／nonceStr／package／signType／paySign；prepayId 用于校验单据完整
  for (const k of ["prepayId", "timeStamp", "nonceStr", "package", "signType", "paySign"] as const) {
    if (typeof p[k] !== "string" || p[k] === "") return null;
  }
  return {
    outTradeNo: typeof p.outTradeNo === "string" ? p.outTradeNo : "",
    prepayId: p.prepayId as string,
    appId: typeof p.appId === "string" ? p.appId : "",
    timeStamp: p.timeStamp as string,
    nonceStr: p.nonceStr as string,
    package: p.package as string,
    signType: p.signType as string,
    paySign: p.paySign as string,
  };
}

/** 规整 BookingView：deposit 缺失当 null、merchantId 缺失/非法当 0（其余字段原样保留；服务端已按契约返回） */
function normalizeBookingView(raw: unknown): BookingView {
  const b = (raw ?? {}) as Record<string, unknown>;
  return { ...(b as unknown as BookingView), merchantId: toInt(b.merchantId), deposit: normalizeDeposit(b.deposit) };
}

/** 规整 SlotsResult：slots 非数组当 []；reason 缺失/非法（旧后端）归一为 ""，交由 domain 兜底推断 */
function normalizeSlotsResult(raw: SlotsResult): SlotsResult {
  const slots = Array.isArray(raw?.slots) ? raw.slots : [];
  return { ...raw, slots: slots.map((s) => ({ ...s, reason: normalizeSlotReason(s.reason) })) };
}

/** 规整 CreateBookingResult（BookingView ＋ pay）：deposit 缺失当 null、pay 缺失当 null */
function normalizeCreateResult(raw: unknown): CreateBookingResult {
  const b = (raw ?? {}) as Record<string, unknown>;
  return { ...normalizeBookingView(b), pay: normalizePay(b.pay) };
}

/** 无效配置（enabled=true 但金额 ≤0）的错误：按业务失败文案走页面既有「重试」路径；retryable 让重试入口可用 */
const INVALID_CONFIG_ERROR: AppError = {
  kind: "BUSINESS",
  businessCode: null,
  message: "预约规则加载失败，请重试",
  requestId: null,
  retryable: true,
};

const DEFAULT_RULE: DepositRuleView = {
  enabled: false,
  amountFen: 0,
  freeCancelHours: 0,
  lateCancelForfeitPct: 0,
  noShowForfeitPct: 0,
  refundTrigger: "manual",
};

/** 防御性规整 BookingConfig：商家未开启/不存在/缺字段 → enabled=false 且其余为安全默认，模板缺失为 "" 。
 *  返回 null＝**无效配置**：enabled=true 但金额 ≤0（缺字段/脏数据）——不能渲染「¥0.00」，调用方按「拉取失败」同一条重试/拦截路径处理。 */
function normalizeBookingConfig(raw: unknown): BookingConfig | null {
  const c = (raw ?? {}) as Record<string, unknown>;
  const d = (c.deposit ?? {}) as Record<string, unknown>;
  const trigger: RefundTrigger = d.refundTrigger === "auto_on_complete" ? "auto_on_complete" : "manual";
  const tpl = (c.subscribeTemplates ?? {}) as Record<string, unknown>;
  const enabled = d.enabled === true;
  const amountFen = toInt(d.amountFen);
  if (enabled && amountFen <= 0) return null;
  return {
    // 商家名（新接口 /api/booking/config 新增；旧接口/缺失 → ""，页面标题回落「到店预约」）
    merchantName: typeof c.merchantName === "string" ? c.merchantName.trim() : "",
    deposit: {
      enabled,
      amountFen,
      freeCancelHours: toInt(d.freeCancelHours),
      lateCancelForfeitPct: toInt(d.lateCancelForfeitPct),
      noShowForfeitPct: toInt(d.noShowForfeitPct),
      refundTrigger: trigger,
    },
    payHoldMinutes: toInt(c.payHoldMinutes),
    subscribeTemplates: {
      result: typeof tpl.result === "string" ? tpl.result : "",
      done: typeof tpl.done === "string" ? tpl.done : "",
    },
  };
}

/** 防御性规整 CancelPreview：缺字段给 0，reason 缺失为 "" */
function normalizeCancelPreview(raw: unknown): CancelPreview {
  const p = (raw ?? {}) as Record<string, unknown>;
  return {
    refundFen: toInt(p.refundFen),
    forfeitFen: toInt(p.forfeitFen),
    reason: (typeof p.reason === "string" ? p.reason : "") as CancelPreview["reason"],
  };
}

/** 配置响应的统一规整：无效配置（开启但金额 ≤0）按拉取失败处理（页面走同一条重试/拦截路径），不渲染 ¥0.00 */
function toBookingConfigResult(r: RepoResult<BookingConfig>): RepoResult<BookingConfig> {
  if (!r.ok) return r;
  const value = normalizeBookingConfig(r.value);
  if (value == null) return { ok: false, error: INVALID_CONFIG_ERROR };
  return { ...r, value };
}

export function createBookingRepository(deps: { client: ClientLike }) {
  return {
    /** 公开（旧版兼容，页面不再使用）：某系列某日的时段与余量（日期 YYYY-MM-DD） */
    getSlots(context: RequestContext, shopId: number, date: string): Promise<RepoResult<SlotsResult>> {
      return deps.client
        .request<SlotsResult>({
          method: "GET",
          url: "/api/shops/" + encodeURIComponent(String(shopId)) + "/slots",
          query: { date },
          replayPolicy: "idempotent",
          context,
        })
        .then((r) => (r.ok ? { ...r, value: normalizeSlotsResult(r.value) } : r));
    },
    /** 公开（新）：当前品牌商家某日的时段与余量（商家由 X-Brand-Id 解析；日期 YYYY-MM-DD） */
    getMerchantSlots(context: RequestContext, date: string): Promise<RepoResult<SlotsResult>> {
      return deps.client
        .request<SlotsResult>({
          method: "GET",
          url: "/api/booking/slots",
          query: { date },
          replayPolicy: "idempotent",
          context,
        })
        .then((r) => (r.ok ? { ...r, value: normalizeSlotsResult(r.value) } : r));
    },
    /** 提交预约（状态变更：never 重放；remark 为空则不传）。开启保证金返回 pay:PayParams、未开启 pay:null */
    createBooking(context: RequestContext, params: CreateBookingParams): Promise<RepoResult<CreateBookingResult>> {
      // 不传 shopId：商家由请求头 X-Brand-Id 解析（契约 §3.2）
      const body: Record<string, unknown> = {
        slotId: params.slotId,
        date: params.date,
        customerName: params.customerName,
        customerPhone: params.customerPhone,
        guestCount: params.guestCount,
      };
      if (params.remark != null && params.remark !== "") body.remark = params.remark;
      return deps.client
        .request<CreateBookingResult>({
          method: "POST",
          url: "/api/bookings",
          body,
          authRequired: true,
          replayPolicy: "never",
          context,
        })
        .then((r) => (r.ok ? { ...r, value: normalizeCreateResult(r.value) } : r));
    },
    /** 我的预约（分页；status 可选）；列表项 deposit 缺失规整为 null */
    listBookings(context: RequestContext, params?: BookingListParams): Promise<RepoResult<BookingListResult>> {
      const query: Record<string, string> = {
        page: String(params?.page ?? 1),
        pageSize: String(params?.pageSize ?? 20),
      };
      if (params?.status != null) query.status = params.status;
      return deps.client
        .request<BookingListResult>({
          method: "GET",
          url: "/api/bookings",
          query,
          authRequired: true,
          replayPolicy: "idempotent",
          context,
        })
        .then((r) => {
          if (!r.ok) return r;
          const list = Array.isArray(r.value?.list) ? r.value.list.map((b) => normalizeBookingView(b)) : [];
          return { ...r, value: { ...r.value, list } };
        });
    },
    /** 取消预约（仅本人且 pending/confirmed/awaiting_payment；状态变更：never 重放）；deposit 带结算结果 */
    cancelBooking(context: RequestContext, bookingId: number): Promise<RepoResult<BookingView>> {
      return deps.client
        .request<BookingView>({
          method: "POST",
          url: "/api/bookings/" + encodeURIComponent(String(bookingId)) + "/cancel",
          authRequired: true,
          replayPolicy: "never",
          context,
        })
        .then((r) => (r.ok ? { ...r, value: normalizeBookingView(r.value) } : r));
    },
    /** 公开、幂等（旧版兼容，页面不再使用）：系列所属商家的预约配置。缺字段给安全默认（enabled=false） */
    getBookingConfig(context: RequestContext, shopId: number): Promise<RepoResult<BookingConfig>> {
      return deps.client
        .request<BookingConfig>({
          method: "GET",
          url: "/api/shops/" + encodeURIComponent(String(shopId)) + "/booking-config",
          replayPolicy: "idempotent",
          context,
        })
        .then(toBookingConfigResult);
    },
    /** 公开、幂等（新）：当前品牌商家的预约配置（含 merchantName、保证金规则、待支付保留分钟、订阅模板 ID）。缺字段给安全默认（enabled=false） */
    getMerchantBookingConfig(context: RequestContext): Promise<RepoResult<BookingConfig>> {
      return deps.client
        .request<BookingConfig>({
          method: "GET",
          url: "/api/booking/config",
          replayPolicy: "idempotent",
          context,
        })
        .then(toBookingConfigResult);
    },
    /** 本人单条（含 deposit）：用于支付后轮询状态。幂等 */
    getBooking(context: RequestContext, bookingId: number): Promise<RepoResult<BookingView>> {
      return deps.client
        .request<BookingView>({
          method: "GET",
          url: "/api/bookings/" + encodeURIComponent(String(bookingId)),
          authRequired: true,
          replayPolicy: "idempotent",
          context,
        })
        .then((r) => (r.ok ? { ...r, value: normalizeBookingView(r.value) } : r));
    },
    /** 继续支付（仅本人且 awaiting_payment 且未过截止）：返回 {...BookingView, pay: PayParams}。状态敏感：never 重放 */
    payBooking(context: RequestContext, bookingId: number): Promise<RepoResult<CreateBookingResult>> {
      return deps.client
        .request<CreateBookingResult>({
          method: "POST",
          url: "/api/bookings/" + encodeURIComponent(String(bookingId)) + "/pay",
          authRequired: true,
          replayPolicy: "never",
          context,
        })
        .then((r) => (r.ok ? { ...r, value: normalizeCreateResult(r.value) } : r));
    },
    /** 取消预览（本人、幂等）：取消前确认框展示 {refundFen, forfeitFen, reason} */
    getCancelPreview(context: RequestContext, bookingId: number): Promise<RepoResult<CancelPreview>> {
      return deps.client
        .request<CancelPreview>({
          method: "GET",
          url: "/api/bookings/" + encodeURIComponent(String(bookingId)) + "/cancel-preview",
          authRequired: true,
          replayPolicy: "idempotent",
          context,
        })
        .then((r) => (r.ok ? { ...r, value: normalizeCancelPreview(r.value) } : r));
    },
  };
}
