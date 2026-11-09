// 商家端预约仓储（issue #14 · M1）：列表 + confirm / complete / cancel。
// 信封沿用 {code,message,data}：成功 code=200；业务失败 HTTP200+code=500+中文 message（原样展示）；未登录 401；无权限 403。
// 动作接口**只发路径、不带 body**（状态机与金额全在服务端；绝不传金额）；状态敏感 ⇒ `replayPolicy:"never"`。
// **不实现** no-show / deposit/* / 保证金规则（资金权限，不在 M1 范围）。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "../../infrastructure/repositories/carousels";
import {
  buildBookingQuery,
  normalizeMerchantBooking,
  type MerchantBookingAction,
  type MerchantBookingFilter,
  type MerchantBookingView,
} from "../domain/merchant-booking";

export interface MerchantBookingPage {
  list: MerchantBookingView[];
  total: number;
  page: number;
  pageSize: number;
}

export function createMerchantBookingRepository(deps: { client: ClientLike; /** 注入时钟（测试用）；默认设备本地当前时间，**每次请求现取**，不缓存 */ now?: () => Date }) {
  return {
    /** 预约列表（幂等读；商家范围由服务端按 JWT 收敛，**不传 merchantId**） */
    async list(
      context: RequestContext,
      args: { filter: MerchantBookingFilter; page: number; pageSize: number },
    ): Promise<RepoResult<MerchantBookingPage>> {
      const res = await deps.client.request<{ list?: unknown; total?: unknown; page?: unknown; pageSize?: unknown }>({
        method: "GET",
        url: "/booking/bookings",
        query: buildBookingQuery(args.filter, args.page, args.pageSize, (deps.now ?? (() => new Date()))()),
        authRequired: true,
        replayPolicy: "idempotent",
        context,
      });
      if (!res.ok) return res;
      const v = res.value ?? {};
      const list = Array.isArray(v.list) ? v.list.map((b) => normalizeMerchantBooking(b)) : [];
      const total = typeof v.total === "number" && Number.isFinite(v.total) ? Math.trunc(v.total) : list.length;
      return { ok: true, value: { list, total, page: args.page, pageSize: args.pageSize } };
    },

    /** 状态变更：POST /booking/bookings/:id/{confirm|complete|cancel}（不带 body；never 重放） */
    async act(context: RequestContext, id: number, action: MerchantBookingAction): Promise<RepoResult<MerchantBookingView>> {
      const res = await deps.client.request<unknown>({
        method: "POST",
        url: "/booking/bookings/" + encodeURIComponent(String(id)) + "/" + action,
        authRequired: true,
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: normalizeMerchantBooking(res.value) };
    },
  };
}
