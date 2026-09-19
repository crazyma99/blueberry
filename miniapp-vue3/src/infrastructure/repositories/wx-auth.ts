// P2-01 repositories · 登录/绑定手机号（旧端实测 POST /api/wx/login → {token, userInfo}）。
// 登录请求本身不带 Bearer（authRequired=false：它就是换票入口）；replayPolicy=never（非幂等）。
// P2-18 补 bindPhone（旧端 api.uts:215-226：POST /api/wx/phone body {code}，需登录，返回 UserInfo）。
// 2026-09-19 抖音登录接入·前端层：端点按平台查表分流（AUTH_ENDPOINTS 为唯一事实源·服务端契约位）——
//   微信为线上定案；抖音 /api/tt/* 为**占位契约**（待服务端仓库按 SOP 定案后核对，未落地前抖音端 404
//   ⇒ fail-closed 无会话，与此前「抖音 code 打 /api/wx/login 必失败」等价、不劣化）；
//   未登记平台（mp-xhs）= 无契约 ⇒ 不发请求直接 fail-closed。
import type { Platform, RequestContext } from "../../ports/context";
import type { AppError } from "../http/errors";
import type { ClientLike, RepoResult } from "./carousels";

export interface WxLoginResult {
  token: string;
  /** UserInfo 结构随 T6 登记（旧端 api.uts 有 UserInfo 类型） */
  userInfo: Record<string, unknown>;
}

/** 平台 → 认证端点（登录换票 / 绑定手机号）；未登记 = 该平台无服务端契约 */
const AUTH_ENDPOINTS: Partial<Record<Platform, { login: string; bindPhone: string }>> = {
  "mp-weixin": { login: "/api/wx/login", bindPhone: "/api/wx/phone" },
  "mp-toutiao": { login: "/api/tt/login", bindPhone: "/api/tt/phone" },
};

function noContractError(platform: Platform): AppError {
  return {
    kind: "UNKNOWN",
    businessCode: null,
    message: `[wx-auth] 平台 ${platform} 无登录服务端契约（未发请求）`,
    requestId: null,
    retryable: false,
  };
}

export function createWxAuthRepository(deps: { client: ClientLike; platform: Platform }) {
  const endpoints = AUTH_ENDPOINTS[deps.platform] ?? null;
  return {
    login(
      context: RequestContext,
      params: { code: string; [key: string]: unknown },
    ): Promise<RepoResult<WxLoginResult>> {
      if (endpoints == null) return Promise.resolve({ ok: false, error: noContractError(deps.platform) });
      return deps.client.request<WxLoginResult>({
        method: "POST",
        url: endpoints.login,
        body: params,
        authRequired: false,
        replayPolicy: "never",
        context,
      });
    },
    /** 旧端 wxBindPhone（api.uts:215-226）：POST body {code}，需登录；返回 UserInfo */
    bindPhone(
      context: RequestContext,
      params: { code: string },
    ): Promise<RepoResult<Record<string, unknown>>> {
      if (endpoints == null) return Promise.resolve({ ok: false, error: noContractError(deps.platform) });
      return deps.client.request<Record<string, unknown>>({
        method: "POST",
        url: endpoints.bindPhone,
        body: params,
        authRequired: true,
        replayPolicy: "never",
        context,
      });
    },
  };
}
