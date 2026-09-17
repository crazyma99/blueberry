// P2-01 repositories · 微信登录（旧端实测 POST /api/wx/login → {token, userInfo}）。
// 登录请求本身不带 Bearer（authRequired=false：它就是换票入口）；replayPolicy=never（非幂等）。
// P2-18 补 bindPhone（旧端 api.uts:215-226：POST /api/wx/phone body {code}，需登录，返回 UserInfo）。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "./carousels";

export interface WxLoginResult {
  token: string;
  /** UserInfo 结构随 T6 登记（旧端 api.uts 有 UserInfo 类型） */
  userInfo: Record<string, unknown>;
}

export function createWxAuthRepository(deps: { client: ClientLike }) {
  return {
    login(
      context: RequestContext,
      params: { code: string; [key: string]: unknown },
    ): Promise<RepoResult<WxLoginResult>> {
      return deps.client.request<WxLoginResult>({
        method: "POST",
        url: "/api/wx/login",
        body: params,
        authRequired: false,
        replayPolicy: "never",
        context,
      });
    },
    /** 旧端 wxBindPhone（api.uts:215-226）：POST /api/wx/phone body {code}，需登录；返回 UserInfo */
    bindPhone(
      context: RequestContext,
      params: { code: string },
    ): Promise<RepoResult<Record<string, unknown>>> {
      return deps.client.request<Record<string, unknown>>({
        method: "POST",
        url: "/api/wx/phone",
        body: params,
        authRequired: true,
        replayPolicy: "never",
        context,
      });
    },
  };
}
