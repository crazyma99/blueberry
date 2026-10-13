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
    /**
     * ⭐task-67（2026-10-13，后端 staging 43161d3 已上线）：**服务端代下载**——`POST /api/wx/avatar/upload`
     * 按 Content-Type 分流：`application/json` ＋ `{sourceUrl}` ⇒ 服务端抓取第三方头像（仅 https／拒内网·回环·元数据／
     * DNS rebinding 复检／不跟重定向／10s 超时／≤20MB／魔数校验）⇒ 返回 `{file_url}`（http(s)）。
     * 为什么需要：真机 `downloadFile` 受「**downloadFile 合法域名**」限制，而**第三方头像域不该加白名单**（客户端下载被拦）。
     * 未登录真 401；参数/SSRF/抓取类失败＝HTTP 200 ＋ code 500 ＋ 可读 message（client 会映射为 BUSINESS 失败）。
     */
    proxyAvatarUpload(
      context: RequestContext,
      sourceUrl: string,
    ): Promise<RepoResult<{ file_url?: string; filename?: string }>> {
      return deps.client.request<{ file_url?: string; filename?: string }>({
        method: "POST",
        url: "/api/wx/avatar/upload",
        body: { sourceUrl },
        authRequired: true, // JWT 必需
        replayPolicy: "never",
        context,
      });
    },
  };
}
