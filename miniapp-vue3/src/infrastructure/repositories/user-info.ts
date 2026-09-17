// P2-18 repositories · 当前用户信息（旧端实测：GET /api/wx/userinfo 读、PUT /api/wx/userinfo 写，均需登录）。
// 旧端 api.uts:228-258：GET 返回 {code,message,data:UserInfo}；PUT body 仅保留有值字段（''/undefined 不传，防误覆盖），
// 至少传一个字段。UserInfo 结构（旧端 auth.uts:7-19）：id/openid/phone/nickname/avatarUrl。
// 头像昵称非空合并语义（P2-18）：PUT 时仅传非空字段——空串不得覆盖后端已有值。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "./carousels";

export interface WxUserInfo {
  id: number;
  openid: string;
  phone: string | null;
  nickname: string | null;
  avatarUrl: string | null;
}

export function createUserInfoRepository(deps: { client: ClientLike }) {
  return {
    /** 旧端 wxGetUserInfo：GET /api/wx/userinfo（showLoading:false 等价——不带全局 loading） */
    getUserInfo(context: RequestContext): Promise<RepoResult<WxUserInfo>> {
      return deps.client.request<WxUserInfo>({
        method: "GET",
        url: "/api/wx/userinfo",
        authRequired: true, // 需登录（CR 🔴1：不设则 client 不注入 Bearer，恒 401）
        replayPolicy: "idempotent",
        context,
      });
    },
    /** 旧端 wxUpdateUserInfo：PUT /api/wx/userinfo；仅保留有值字段（旧端 api.uts:244-258 逐字语义） */
    updateUserInfo(
      context: RequestContext,
      params: { nickname?: string; avatarUrl?: string },
    ): Promise<RepoResult<WxUserInfo>> {
      const body: Record<string, string> = {};
      if (params.nickname != null && params.nickname !== "") body.nickname = params.nickname;
      if (params.avatarUrl != null && params.avatarUrl !== "") body.avatarUrl = params.avatarUrl;
      return deps.client.request<WxUserInfo>({
        method: "PUT",
        url: "/api/wx/userinfo",
        body,
        authRequired: true, // 需登录（CR 🔴1：不设则 client 不注入 Bearer，恒 401）
        replayPolicy: "never",
        context,
      });
    },
  };
}
