// P2-03 provider 侧（2/2）：静默换票 exchangeIdentity —— 把「平台 code → 后端会话」接上认证协调器。
//
// ⚠️ **2026-10-13 登录契约变更后：本模块退化为「恒定 fail-closed」**（零请求）。
//   契约事实源：后端仓 .project-wiki/docs/modules/login-frontend-integration.md —— /api/{wx,tt}/login 现在要求
//   **loginCode ＋ phoneCode 一次性提交**，而 phoneCode 只能来自用户交互（手机号授权按钮回调）⇒ 在无用户交互的
//   静默路径上**不可能拿到可用会话**。旧实现仍会 POST 一次 code-only 请求：除必然失败外，还会消耗
//   「每 IP 每分钟 5 次」的登录限流额度（极端情况把用户真实登录挤掉）⇒ 改为零请求直接返回 auth 失败。
//
// 纪律不变：**fail-closed，绝不伪造会话**（否则 authRequired 端点会带假 token 请求）；不在此处落盘。
// 入参保留（页面装配签名不变）——后端若在未来提供「静默换票」契约，在此恢复实现即可。
import type { RequestContext, Result } from "../ports/context";
import type { Platform } from "../ports/context";
import type { Session } from "../infrastructure/http/client";
import type { RepoResult } from "../infrastructure/repositories/carousels";
import type { WxLoginParams, WxLoginResult } from "../infrastructure/repositories/wx-auth";
import type { LoginCodePort } from "../platform/uni/login";

/**
 * 静默换票契约开关（2026-10-13）：现行契约下静默路径无可用契约 ⇒ 恒 false（零请求 fail-closed）。
 * ⚠️ 置 true **不会**恢复任何能力（历史实现已删除）——仅供后人定位「这里曾有一条链路」。
 */
const SILENT_EXCHANGE_SUPPORTED = false;

export function createSilentIdentityExchange(deps: {
  /** 登录仓储（其 login 现为单次提交 loginCode＋phoneCode，见 wx-auth.ts） */
  getWxAuth: () => { login(context: RequestContext, params: WxLoginParams): Promise<RepoResult<WxLoginResult>> };
  loginCode: LoginCodePort;
  platform: Platform;
  profileKey: string;
}) {
  // 现行契约下不使用依赖（保留入参以便未来恢复）；显式声明避免误判为漏用。
  void deps;
  return async function exchangeIdentity(_context: RequestContext): Promise<Result<Session>> {
    if (!SILENT_EXCHANGE_SUPPORTED) return { ok: false, reason: "auth" };
    // ⚠️ 历史实现（2026-10-13 前：code → /api/wx/login 换票）**已删除**——置 SILENT_EXCHANGE_SUPPORTED=true
    // 不会恢复任何东西（下面只是同值的不可达 return）；如将来后端提供静默换票契约，需按新契约重新实现。
    return { ok: false, reason: "auth" };
  };
}
