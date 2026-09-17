// P2-01 repositories · 微信登录（旧端实测 POST /api/wx/login → {token, userInfo}）。
// 登录请求本身不带 Bearer（authRequired=false：它就是换票入口）；replayPolicy=never（非幂等）。
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
  };
}
