// T9a repositories · AI 次数与支付（旧端 api.uts:678-780 实测冻结；四端点**均需登录**）。
// 旧端事实：credit 接口成功 code===200；**4001＝次数不足（HTTP 200 返回）**；三池独立（feature：tryon 默认/recommend/download）。
// - GET  /api/aiface/credit/balance?shopId&feature&taskId → {balance,inited,priceFenPerCredit,taskBought?}
// - POST /api/aiface/credit/recharge {shopId,credits,feature?,taskId?} → 微信 JSAPI 拉起参数（下单，非幂等）
// - GET  /api/aiface/credit/recharge/status?outTradeNo → {outTradeNo,status,paid,credits,balance}（轮询到账）
// - POST /api/aiface/credit/redeem {code} → {creditsAdded,balance}（兑换码，非幂等）
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "./carousels";

export interface CreditBalance {
  balance: number;
  inited: boolean;
  priceFenPerCredit: number;
  /** feature=download 且传 taskId 时：该任务是否已永久买断 */
  taskBought?: boolean;
}

export interface CreditRechargeOrder {
  outTradeNo: string;
  prepayId: string;
  appId: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: string;
  paySign: string;
}

export interface CreditRechargeStatus {
  outTradeNo: string;
  /** 0 待付 / 1 已付 / 2 关闭 / 3 退款 */
  status: number;
  /** true＝已支付到账（回调异步入账，需轮询） */
  paid: boolean;
  credits: number;
  balance: number;
}

export function createCreditRepository(deps: { client: ClientLike }) {
  return {
    /** 旧端 getCreditBalance：首次查询按商户配置惰性初始化免费次数 */
    getBalance(
      context: RequestContext,
      params?: { shopId?: number; feature?: string; taskId?: number },
    ): Promise<RepoResult<CreditBalance>> {
      const query: Record<string, string> = {};
      if (params?.shopId != null) query.shopId = String(params.shopId);
      if (params?.feature != null && params.feature !== "") query.feature = params.feature;
      if (params?.taskId != null && params.taskId > 0) query.taskId = String(params.taskId);
      return deps.client.request<CreditBalance>({
        method: "GET",
        url: "/api/aiface/credit/balance",
        query,
        authRequired: true,
        replayPolicy: "idempotent",
        context,
      });
    },
    /** 旧端 createCreditRecharge：微信小程序 JSAPI 下单（「支付一次开通一次」，credits 通常 1） */
    createRecharge(
      context: RequestContext,
      params: { shopId: number; credits: number; feature?: string; taskId?: number },
    ): Promise<RepoResult<CreditRechargeOrder>> {
      const body: Record<string, unknown> = { shopId: params.shopId, credits: params.credits };
      if (params.feature != null && params.feature !== "") body.feature = params.feature;
      if (params.taskId != null && params.taskId > 0) body.taskId = params.taskId;
      return deps.client.request<CreditRechargeOrder>({
        method: "POST",
        url: "/api/aiface/credit/recharge",
        body,
        authRequired: true,
        replayPolicy: "never",
        context,
      });
    },
    /** 旧端 getCreditRechargeStatus：wx.requestPayment 成功后轮询到账直到 paid=true */
    getRechargeStatus(
      context: RequestContext,
      outTradeNo: string,
    ): Promise<RepoResult<CreditRechargeStatus>> {
      return deps.client.request<CreditRechargeStatus>({
        method: "GET",
        url: "/api/aiface/credit/recharge/status",
        query: { outTradeNo },
        authRequired: true,
        replayPolicy: "idempotent",
        context,
      });
    },
    /** 旧端 redeemCreditCode：12 位兑换码，立即加次数 */
    redeemCode(
      context: RequestContext,
      code: string,
    ): Promise<RepoResult<{ creditsAdded: number; balance: number }>> {
      return deps.client.request<{ creditsAdded: number; balance: number }>({
        method: "POST",
        url: "/api/aiface/credit/redeem",
        body: { code },
        authRequired: true,
        replayPolicy: "never",
        context,
      });
    },
  };
}
