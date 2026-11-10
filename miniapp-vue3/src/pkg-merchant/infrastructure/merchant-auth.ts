// 商家端认证仓储（M1 · issue #14）：`POST /auth/login`（用户名 + 密码）。
//
// 契约（只读核对 lanmei-backend-golang `internal/admin/handler/auth.go`）：
//   · 请求 body `{username, password}`；**不需要 JWT**，按 IP 限流 5 次/分钟（HTTP 429）；
//   · 成功 HTTP 200 + code=200，data = {token, adminId, merchantId, username, role, displayName, shopList[], permissions[], roleName?, shopScope?}；
//   · 失败＝HTTP 200 + body.code=500 + 中文 message（「用户名不存在、密码错误或账号已禁用」「该角色已被禁用，无法登录」）；
//   · **无 refresh / logout 接口**：token 过期（staging 24h / prod 7 天）只能回登录页；退出登录只清本地。
// 纪律：登录是**状态敏感**写请求 ⇒ `replayPolicy:"never"`；本层不吞错误、不记录密码。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "../../infrastructure/repositories/carousels";
import type { MerchantProfile, MerchantShop } from "../domain/merchant-auth";

export interface MerchantLoginResult {
  token: string;
  profile: MerchantProfile;
}

function toInt(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
}
function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** 规整 shopList：只保留 id>0 的项；展示名 displayName 优先、其次 shopName；畸形项丢弃 */
export function normalizeShopList(raw: unknown): MerchantShop[] {
  if (!Array.isArray(raw)) return [];
  const out: MerchantShop[] = [];
  for (const item of raw) {
    const s = (item ?? {}) as Record<string, unknown>;
    const id = toInt(s.id);
    if (id <= 0) continue;
    const display = toStr(s.displayName).trim();
    const name = display !== "" ? display : toStr(s.shopName).trim();
    out.push({ id, name: name !== "" ? name : "系列 " + id, merchantName: toStr(s.merchantName), status: s.status === undefined ? 1 : toInt(s.status) });
  }
  return out;
}

/** 规整登录响应：缺字段给安全默认（merchantId 缺失/null ⇒ 0，随后被角色闸拒绝）；permissions 非数组 ⇒ [] */
export function normalizeMerchantLogin(raw: unknown): MerchantLoginResult | null {
  const d = (raw ?? {}) as Record<string, unknown>;
  const token = toStr(d.token);
  if (token === "") return null;
  const permissions = Array.isArray(d.permissions) ? d.permissions.filter((p): p is string => typeof p === "string") : [];
  return {
    token,
    profile: {
      adminId: toInt(d.adminId),
      merchantId: toInt(d.merchantId),
      username: toStr(d.username),
      role: toStr(d.role),
      displayName: toStr(d.displayName),
      roleName: toStr(d.roleName),
      permissions,
      shopList: normalizeShopList(d.shopList),
    },
  };
}

export function createMerchantAuthRepository(deps: { client: ClientLike }) {
  return {
    async login(
      context: RequestContext,
      credentials: { username: string; password: string },
    ): Promise<RepoResult<MerchantLoginResult>> {
      const res = await deps.client.request<unknown>({
        method: "POST",
        url: "/auth/login",
        body: { username: credentials.username, password: credentials.password },
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      const value = normalizeMerchantLogin(res.value);
      if (value == null) {
        return {
          ok: false,
          error: { kind: "UNKNOWN", businessCode: null, message: "", requestId: context.requestId, retryable: false },
        };
      }
      return { ok: true, value };
    },
  };
}
