// 商家端会话服务（M1 · issue #14）：独立 coordinator + 独立 http client + 登录/退出/恢复。
//
// ⭐会话隔离（评审结论，硬约束）：
//   · **绝不使用全局 `lm.session.v1`**。协调器的存储经 `createMerchantStorage` 重映射，会话落 `lm.merchant.session.v1`，
//     legacy `token` 键的清理也落在商家命名空间 ⇒ 商家登录/401 **不可能**覆盖或清除 C 端会话；
//   · 不改 `infrastructure/http/client.ts` 工厂：另建一个 `createHttpClient` 实例，注入**商家 coordinator**，
//     401 只会触发商家 coordinator 的 `expireSession`；
//   · 请求上下文的 `brandId` 恒为 null ⇒ 共用 client **不会**给后台接口带 `X-Brand-Id`（C 端品牌上下文与商家端无关）；
//     `X-App-Code`／`X-Channel` 仍会带——后台接口不读 App-Code，`X-Channel` 仅由全局 ChannelMiddleware 解析、不拒绝请求（已核后端源码）。
//   · 无 refresh / logout 接口：token 过期（staging 24h / prod 7 天）⇒ 401 ⇒ 会话作废 ⇒ 页面回登录页；退出登录只清本地。
import type { Environment, Platform, RequestContext } from "../../ports/context";
import type { HttpPort } from "../../ports/http";
import type { StoragePort } from "../../ports/storage";
import { createAuthCoordinator } from "../../application/auth-coordinator";
import { createContextFactory } from "../../application/request-context";
import { createHttpClient, type Session } from "../../infrastructure/http/client";
import { createMerchantAuthRepository } from "../infrastructure/merchant-auth";
import {
  COORDINATOR_SESSION_KEY,
  createMerchantStorage,
  MERCHANT_PROFILE_KEY,
  MERCHANT_SESSION_KEY,
} from "../infrastructure/merchant-storage";
import { evaluateMerchantRole, type MerchantProfile } from "../domain/merchant-auth";
import {
  isMerchantAuthExpired,
  MERCHANT_AUTH_EXPIRED_TEXT,
  isMerchantRateLimited,
  merchantErrorMessage,
  MERCHANT_LOGIN_RATE_LIMITED_TEXT,
} from "../domain/merchant-error";

export type MerchantLoginOutcome =
  | { ok: true; profile: MerchantProfile }
  | { ok: false; kind: "invalid-input" | "denied" | "rate-limited" | "failed"; message: string };

export interface MerchantSessionState {
  loggedIn: boolean;
  profile: MerchantProfile | null;
}

const NOT_LOGGED_IN: MerchantSessionState = { loggedIn: false, profile: null };

export function createMerchantSession(deps: {
  /** 原始存储（C 端同款 KV）；本服务内部经 `createMerchantStorage` 隔离，调用方不要预先隔离 */
  backend: StoragePort;
  transport: HttpPort;
  platform: Platform;
  environment: Environment;
  profileKey: string;
  appCode: string;
}) {
  const storage = createMerchantStorage(deps.backend);

  // 商家端没有「静默换票」：会话缺失时 waitForLogin 直接失败（client 返回 AUTH_EXPIRED，不挂起）
  const coordinator = createAuthCoordinator({
    exchangeIdentity: async () => ({ ok: false as const, reason: "merchant-login-required" }),
    storage,
  });
  const client = createHttpClient({ transport: deps.transport, authCoordinator: coordinator });
  const ctxFactory = createContextFactory({
    platform: deps.platform,
    environment: deps.environment,
    profileKey: deps.profileKey,
    appCode: deps.appCode,
    getBrandId: () => null,
  });
  const authRepo = createMerchantAuthRepository({ client });

  /** 读盘上的商家会话（损坏/缺字段/跨 Profile ⇒ null）。会话的写入与作废全由 coordinator 负责，此处只读 */
  function readSession(): Session | null {
    const raw = storage.get(COORDINATOR_SESSION_KEY); // 协调器视角的键名；经商家存储重映射后实际落 lm.merchant.session.v1
    if (raw == null) return null;
    try {
      const s = JSON.parse(raw) as Session | null;
      if (s == null || typeof s.token !== "string" || s.token === "" || typeof s.authRevision !== "number") return null;
      if (s.platform !== deps.platform || s.profileKey !== deps.profileKey) return null;
      return s;
    } catch {
      return null;
    }
  }

  function readProfile(): MerchantProfile | null {
    const raw = storage.get(MERCHANT_PROFILE_KEY);
    if (raw == null) return null;
    try {
      const p = JSON.parse(raw) as MerchantProfile | null;
      if (p == null || typeof p.merchantId !== "number" || !Array.isArray(p.permissions)) return null;
      // 兼容升级前落盘的旧资料（没有 shopList）：缺失/畸形 ⇒ []，不要求重新登录
      return { ...p, shopList: Array.isArray((p as { shopList?: unknown }).shopList) ? p.shopList : [] };
    } catch {
      return null;
    }
  }

  /** 当前状态：**必须同时有会话与资料**才算已登录（401 作废会话后自然变为未登录，不依赖残留资料） */
  function getState(): MerchantSessionState {
    const session = readSession();
    if (session == null) return NOT_LOGGED_IN;
    const profile = readProfile();
    if (profile == null) return NOT_LOGGED_IN;
    return { loggedIn: true, profile };
  }

  /** 登录进行中：连点只发一次请求（登录接口按 IP 限流 5 次/分钟，重复请求会白白耗掉额度） */
  let loginInFlight = false;

  async function login(username: string, password: string): Promise<MerchantLoginOutcome> {
    const u = username.trim();
    if (u === "" || password === "") {
      return { ok: false, kind: "invalid-input", message: "请输入用户名和密码" };
    }
    if (loginInFlight) return { ok: false, kind: "failed", message: "正在登录，请稍候" };
    loginInFlight = true;
    try {
      return await doLogin(u, password);
    } finally {
      loginInFlight = false;
    }
  }

  async function doLogin(u: string, password: string): Promise<MerchantLoginOutcome> {
    const r = await authRepo.login(ctxFactory.next(), { username: u, password });
    if (!r.ok) {
      if (isMerchantRateLimited(r.error)) {
        return { ok: false, kind: "rate-limited", message: MERCHANT_LOGIN_RATE_LIMITED_TEXT };
      }
      // 登录接口的 HTTP 401 不是「会话失效」语义（此时还没有会话），统一给通用登录失败文案
      const message = r.error.kind === "AUTH_EXPIRED" ? "登录失败，请重试" : merchantErrorMessage(r.error, "登录失败，请重试");
      return { ok: false, kind: "failed", message };
    }
    // 角色闸：先判后写——被拒的账号**不落盘任何会话/资料**
    const gate = evaluateMerchantRole({ role: r.value.profile.role, merchantId: r.value.profile.merchantId });
    if (!gate.ok) return { ok: false, kind: "denied", message: gate.message };
    coordinator.completeLogin({
      userId: String(r.value.profile.adminId),
      token: r.value.token,
      platform: deps.platform,
      profileKey: deps.profileKey,
      authRevision: 0, // 由协调器按代次覆盖
      kind: "full",
    });
    storage.set(MERCHANT_PROFILE_KEY, JSON.stringify(r.value.profile));
    return { ok: true, profile: r.value.profile };
  }

  /**
   * 刷新权限快照（工作台下拉刷新用）：GET /auth/me/permissions，经商家 client、authRequired:true。
   *   · 成功：只更新资料里的 permissions（角色/展示名/系列列表保持登录时快照；角色变更走重新登录），返回新资料；
   *   · 401（含 body.code=401）：client 的 401 自愈已作废本次所用会话 ⇒ 返回 auth-expired（页面走既有失效态）；
   *   · 其它失败（网络/超时/业务错）：**保留旧快照**，返回 failed + 可读文案；
   *   · 响应期间会话已被换新（重新登录得到新 token）⇒ 不覆盖新会话的资料（按 token 比对）。
   */
  async function refreshPermissions(): Promise<{ ok: true; profile: MerchantProfile } | { ok: false; kind: "auth-expired" | "failed"; message: string }> {
    const before = readSession();
    const prof = readProfile();
    if (before == null || prof == null) return { ok: false, kind: "auth-expired", message: MERCHANT_AUTH_EXPIRED_TEXT };
    const r = await authRepo.getMyPermissions(ctxFactory.next());
    if (!r.ok) {
      if (isMerchantAuthExpired(r.error)) return { ok: false, kind: "auth-expired", message: MERCHANT_AUTH_EXPIRED_TEXT };
      return { ok: false, kind: "failed", message: merchantErrorMessage(r.error, "刷新失败，请稍后重试") };
    }
    const now = readSession();
    const cur = readProfile();
    if (now == null || cur == null || now.token !== before.token) return { ok: false, kind: "auth-expired", message: MERCHANT_AUTH_EXPIRED_TEXT };
    const next: MerchantProfile = { ...cur, permissions: r.value.permissions };
    storage.set(MERCHANT_PROFILE_KEY, JSON.stringify(next));
    return { ok: true, profile: next };
  }

  /** 退出登录：只清本地（后端无 logout 接口） */
  function logout(): void {
    coordinator.logout();
    storage.remove(MERCHANT_PROFILE_KEY);
  }

  return {
    client,
    coordinator,
    /** 每次请求取新上下文（brandId 恒 null） */
    nextContext: (): RequestContext => ctxFactory.next(),
    getState,
    /**
     * 401 精确作废（multipart 上传不经 http client，client 的 401 自愈覆盖不到它们，需调用方显式作废）：
     * 仅当「在飞请求所用 token」仍等于**当前会话 token** 才作废——旧 token 的迟到 401 不会误杀刚重新登录的新会话
     * （与 http client 401 自愈同口径，直接复用协调器的 expireSession 比对）。返回是否真的作废了。
     * 作废后 getState().loggedIn 为 false，登录页 onShow 不会再把人弹回工作台。
     */
    expireSessionByToken: (usedToken: string): boolean => {
      const cur = readSession();
      if (cur == null || usedToken === "" || cur.token !== usedToken) return false;
      coordinator.expireSession(cur);
      return readSession() == null;
    },
    /** 当前商家会话 token（上传等 multipart 请求手工带 Authorization 用）；未登录/会话缺失 ⇒ ""。只读商家命名空间，不碰 C 端会话 */
    getToken: (): string => readSession()?.token ?? "",
    login,
    logout,
    refreshPermissions,
    /** 仅供测试断言隔离键名 */
    keys: { session: MERCHANT_SESSION_KEY, profile: MERCHANT_PROFILE_KEY },
  };
}

export type MerchantSession = ReturnType<typeof createMerchantSession>;
