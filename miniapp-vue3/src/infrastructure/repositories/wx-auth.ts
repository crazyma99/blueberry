// P2-01 repositories · 登录（换票）——**2026-10-13 契约变更：单次登录（loginCode ＋ phoneCode）**。
// 契约唯一事实源：后端仓 `.project-wiki/docs/modules/login-frontend-integration.md`（2026-10-13）：
//   · 微信 `POST /api/wx/login`／抖音 `POST /api/tt/login`，**两端请求/响应结构完全一致**（前端按平台分流调用）；
//   · body `{ loginCode, phoneCode, nickname?, avatarUrl? }`——`phoneCode` **必传**（手机号授权按钮回调 code），
//     `loginCode` 兼容旧别名 `code`；
//   · 信封 `{code,message,data:{token,userInfo}}`，`code===200` 才算成功（client 已兼容 0/200）；
//   · 两个 code 均为**一次性、5 分钟有效、不可复用**；限流每 IP 每分钟 5 次；
//   · **登录必须由关键动作触发**，不得进小程序即弹手机号（抖音审核红线）。
// ⚠️ **废弃（2026-10-13）**：旧「三步链路」与 `bindPhone`——服务端实测 `/api/wx/login` 已**强制 phoneCode**
//   （只带 `code` 时返回 500「phoneCode 不能为空…」）⇒ 旧链路对微信端同样失效；`POST /api/tt/phone` 服务端 404、
//   `POST /api/wx/phone` 属遗留（需鉴权）⇒ 本仓**移除** bindPhone 与其端点（保留亦无契约意义）。
// 登录请求本身不带 Bearer（authRequired=false：它就是换票入口）；replayPolicy=never（code 一次性，禁自动重放）。
// 未登记平台（mp-xhs）= 无契约 ⇒ **不发请求**直接 fail-closed（与既有口径一致）。
import type { Platform, RequestContext } from "../../ports/context";
import type { AppError } from "../http/errors";
import type { ClientLike, RepoResult } from "./carousels";

export interface WxLoginResult {
  token: string;
  /** UserInfo 结构随 T6 登记（旧端 api.uts 有 UserInfo 类型）；含 id/phone/nickname/avatarUrl/openid/registerChannel 等 */
  userInfo: Record<string, unknown>;
}

/** 登录请求体（契约 §1.1；两端一致） */
export interface WxLoginParams {
  /** 平台登录 code：微信 `wx.login`／抖音 `tt.login`（抖音建议 `force:true`） */
  loginCode: string;
  /** 手机号授权 code：`getPhoneNumber` 回调 `e.detail.code`；**必传**，缺则服务端拒绝 */
  phoneCode: string;
  /** 可选：仅新账号或账号昵称为空时写入 */
  nickname?: string;
  /** 可选：同上 */
  avatarUrl?: string;
}

/** 平台 → 登录端点（**已定案**：2026-10-13 前端对接文档 §1；未登记平台＝无契约） */
const AUTH_ENDPOINTS: Partial<Record<Platform, { login: string }>> = {
  "mp-weixin": { login: "/api/wx/login" },
  "mp-toutiao": { login: "/api/tt/login" },
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
    /** 单次登录：一次提交 `{loginCode, phoneCode}` ⇒ `{token, userInfo}`（契约 §1） */
    login(context: RequestContext, params: WxLoginParams): Promise<RepoResult<WxLoginResult>> {
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
  };
}
