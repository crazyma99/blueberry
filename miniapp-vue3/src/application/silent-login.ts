// P2-03 provider 侧（2/2）：静默换票 exchangeIdentity —— 把「平台 code → 后端会话」接上认证协调器。
// 链路（与 application/login-flow 的 code 换票同源）：`uni.login` 取 code → `POST /api/wx/login`（wxAuthor.login）
//   → `{token, userInfo}` → 构造新端内部 `Session` → 协调器 `completeLogin` 唤醒全部等待者。
// 纪律：**fail-closed** —— 取不到 code、换票失败、token 为空、异常一律 `{ok:false, reason:"auth"}`，
//   **绝不伪造会话**（否则 authRequired 端点会带假 token 请求）；不在此处落盘（持久化由协调器统一负责）。
// 循环依赖处理：页面装配顺序为 client→wxAuth→authCoordinator，故 wxAuth 以 **getter 惰性取用**（调用期已初始化）。
import type { RequestContext, Result } from "../ports/context";
import type { Platform } from "../ports/context";
import type { Session } from "../infrastructure/http/client";
import type { RepoResult } from "../infrastructure/repositories/carousels";
import type { WxLoginResult } from "../infrastructure/repositories/wx-auth";
import type { LoginCodePort } from "../platform/uni/login";

export function createSilentIdentityExchange(deps: {
  getWxAuth: () => { login(context: RequestContext, params: { code: string }): Promise<RepoResult<WxLoginResult>> };
  loginCode: LoginCodePort;
  platform: Platform;
  profileKey: string;
}) {
  return async function exchangeIdentity(context: RequestContext): Promise<Result<Session>> {
    try {
      const code = await deps.loginCode.request();
      if (code == null || code === "") return { ok: false, reason: "auth" };
      const res = await deps.getWxAuth().login(context, { code });
      if (!res.ok) return { ok: false, reason: "auth" };
      const token = res.value?.token;
      if (typeof token !== "string" || token === "") return { ok: false, reason: "auth" };
      const openid = (res.value.userInfo as { openid?: unknown } | undefined)?.openid;
      return {
        ok: true,
        value: {
          userId: typeof openid === "string" ? openid : "",
          token,
          platform: deps.platform,
          profileKey: deps.profileKey,
          authRevision: 0, // 协调器 completeLogin 会自增并覆盖
        },
      };
    } catch (err) {
      console.error("[silent-login] 换票异常（fail-closed）:", err);
      return { ok: false, reason: "auth" };
    }
  };
}
