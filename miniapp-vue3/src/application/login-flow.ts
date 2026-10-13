// P2-18 登录纯逻辑 —— **2026-10-13 契约变更后＝单次登录**；**同日再修：登录码必须「点手机号按钮之前」预取**。
//
// 顺序（**官方硬要求**）：抖音《获取手机号》原文——「使用（用户点击 button）前需先调用 `tt.login` 接口。
// **如果在回调中调用 `tt.login` 会刷新登录态**，导致登录后换取的 session_key 与手机号码加密时使用的
// session_key 不同，从而导致解密失败。」⇒ 真机现象即 `getPhoneNumber:fail invalid session`（2026-10-13 20:28 主人日志）。
// ⇒ 本模块口径：
//   1. `prefetchLoginCode()`：**进入登录弹窗/触发登录的关键动作时**先取码（经 LoginCodePort；抖音 provider=toutiao
//      且 force:true），缓存 **TTL＝4 分钟**（平台 code 5 分钟有效，取保守值）；已在有效期内即**复用（幂等）**，
//      在飞去重 ⇒ 满足抖音「冷启动生命周期内最多调一次」；
//   2. `runPhoneLogin(phoneCode)`：**只消费缓存里的 loginCode**，与 phoneCode **一次**提交 POST /api/{wx,tt}/login；
//      **回调路径内绝不调用 uni.login**（缺失/过期 ⇒ 给可行动提示、零请求）；
//   3. 成功后作废缓存（两个 code 一次性、不可复用）。
// 微信端同序（`getPhoneNumber` 同样要求「两个 code 一次性提交」；微信无「回调内 login 刷新登录态」的坑，
// 但统一为「先取码后授权」可让两端行为一致、且避免回调内网络往返）。
// 契约事实源：后端仓 .project-wiki/docs/modules/login-frontend-integration.md（2026-10-13）。
// ⚠️ 旧「三步链路」第 3 步 bindPhone 已废弃（服务端 /api/wx/login 现强制 phoneCode、/api/tt/phone 404）。
// 旧端纪律（loginFlow.uts:34-67）：不调 showLoading/toast/关弹窗——调用方按页面策略处理 UX。
import type { RequestContext, Result } from "../ports/context";
import { createUniLoginCode, type LoginCodePort } from "../platform/uni/login";
import type { Platform } from "../ports/context";
import type { AuthCoordinator } from "./auth-coordinator";
import type { WxUserInfoLocal, UserInfoStore } from "./user-info-store";
import type { createWxAuthRepository } from "../infrastructure/repositories/wx-auth";

/** 登录码缓存 TTL：平台「一次性 code 5 分钟有效」⇒ 取 4 分钟保守值（早于平台过期即失效，避免用过期码） */
export const LOGIN_CODE_TTL_MS = 4 * 60 * 1000;

export type PhoneLoginErrorKind = "login" | "wxlogin" | "phone" | "unknown";

export interface PhoneLoginResult {
  ok: boolean;
  phoneHasFullProfile: boolean;
  errorKind?: PhoneLoginErrorKind;
  /** **用户可读**失败文案（已按契约 §5 关键字映射；页面可直接 toast） */
  errorMsg?: string;
  /** 后端/网络原始 message：**仅日志与排查用，不得直接上屏**（防泄露内部细节） */
  errorRaw?: string;
}

/** 登录码缺失/过期时的可行动提示（不得静默失败、不得在回调里补取） */
export const LOGIN_CODE_STALE_HINT = "登录环境已刷新，请再点一次";

/**
 * 登录失败 message → 用户可读提示（契约 §5 关键字表的**单一事实源**）。
 * 纪律：任何分支都给出「重试／自行处理／联系技术」的下一步，**绝不把用户卡死**；不直传后端原文。
 */
export function mapLoginFailureMessage(raw: string): string {
  const m = raw ?? "";
  if (m.includes("phoneCode 不能为空")) return "需授权手机号后才能登录，请点击按钮重新授权";
  if (m.includes("手机号授权失败")) return "手机号获取失败，请重试";
  if (m.includes("no phone number")) return "你的抖音账号尚未绑定手机号，可在抖音 App 内绑定后再来";
  if (m.includes("not login") || m.includes("invalid session")) return "请先登录抖音，再继续";
  if (m.includes("抖音登录未开通")) return "抖音登录暂未开通，请联系技术人员";
  if (m.includes("28005187") || m.includes("28005185")) return "登录凭证已失效，请重试";
  if (m.includes("28005186")) return "登录凭证与当前小程序不匹配，请重试";
  if (m.includes("28005191")) return "抖音应用公钥未配置，请联系技术人员";
  return "登录失败，请稍后重试";
}

type WxAuthRepo = ReturnType<typeof createWxAuthRepository>;

/** 旧端 :27-33：内部不抛错；任何步骤异常收敛为 ok=false 且 errorKind=unknown */
export function createPhoneLoginFlow(deps: {
  wxAuth: WxAuthRepo;
  authCoordinator: AuthCoordinator;
  userStore: UserInfoStore;
  context: () => RequestContext;
  platform: Platform;
  profileKey: string;
  /** P4-12：平台取 code 必须经端口（默认 platform/uni/login），不得在本层直调 uni.login */
  loginCode?: LoginCodePort;
  /** 注入时钟（测试用；默认 Date.now） */
  now?: () => number;
}) {
  const now = deps.now ?? (() => Date.now());
  /** 预取到的登录码与时间（"" / 0＝无） */
  let cachedCode = "";
  let cachedAtMs = 0;
  /** 在飞预取（幂等/去重） */
  let prefetching: Promise<boolean> | null = null;

  /** 有效缓存（未过期才返回；过期视为无） */
  function validCachedCode(): string {
    if (cachedCode === "") return "";
    if (now() - cachedAtMs > LOGIN_CODE_TTL_MS) return "";
    return cachedCode;
  }

  /**
   * 预取登录码（**必须在用户点手机号按钮之前**调用：进入登录弹窗 / 触发登录的关键动作时）。
   * 幂等：有效期内已缓存 ⇒ 直接返回 true 且**不再调用平台**（合抖音「冷启动最多一次」）。
   * 失败（容器无 uni.login／超时／平台拒绝）⇒ 返回 false，由调用方在**下一次进入弹窗**时再预取。
   */
  async function prefetchLoginCode(): Promise<boolean> {
    if (validCachedCode() !== "") return true;
    if (prefetching != null) return prefetching;
    prefetching = (async () => {
      try {
        const port = deps.loginCode ?? createUniLoginCode({ platform: deps.platform });
        const code = (await port.request()) ?? "";
        if (code === "") {
          console.warn("[login-flow] 预取登录码失败（容器/平台未返回）⇒ 下次进弹窗再试");
          return false;
        }
        cachedCode = code;
        cachedAtMs = now();
        return true;
      } catch (err) {
        console.error("[login-flow] 预取登录码异常:", err);
        return false;
      } finally {
        prefetching = null;
      }
    })();
    return prefetching;
  }

  /** 是否已有可用（未过期）登录码——供页面提示/测试观察，不触发平台调用 */
  function hasValidLoginCode(): boolean {
    return validCachedCode() !== "";
  }

  /**
   * 手机号授权回调后的提交（**回调路径**）。
   * ⚠️ 此处**绝不调用** `uni.login`/`tt.login`（官方：回调内 login 会刷新登录态 ⇒ 手机号令牌解密失败）。
   * @param phoneCode getPhoneNumber 回调 e.detail.code（必传；空值不空转、直接给可行动提示）
   */
  async function runPhoneLogin(phoneCode: string): Promise<PhoneLoginResult> {
    try {
      if (typeof phoneCode !== "string" || phoneCode === "") {
        return {
          ok: false,
          phoneHasFullProfile: false,
          errorKind: "phone",
          errorMsg: mapLoginFailureMessage("phoneCode 不能为空"),
        };
      }
      const loginCode = validCachedCode();
      if (loginCode === "") {
        // 缓存缺失/过期：**不在回调里补取**，给可行动提示并零请求（页面在下一次进弹窗时重新预取）
        return { ok: false, phoneHasFullProfile: false, errorKind: "login", errorMsg: LOGIN_CODE_STALE_HINT };
      }
      const ctx = deps.context();
      const loginRes = await deps.wxAuth.login(ctx, { loginCode, phoneCode });
      // 无论成败都作废缓存：code 一次性、不可复用（失败后下次进弹窗会重新预取）
      cachedCode = "";
      cachedAtMs = 0;
      if (!loginRes.ok) {
        const raw = typeof loginRes.error.message === "string" ? loginRes.error.message : "";
        console.error("[runPhoneLogin] 单次登录失败（原始 message 仅日志）:", raw);
        return {
          ok: false,
          phoneHasFullProfile: false,
          errorKind: "wxlogin",
          errorMsg: mapLoginFailureMessage(raw),
          errorRaw: raw,
        };
      }
      const token = loginRes.value.token;
      if (typeof token !== "string" || token === "") {
        return { ok: false, phoneHasFullProfile: false, errorKind: "wxlogin", errorMsg: mapLoginFailureMessage("") };
      }
      const rawUser = loginRes.value.userInfo ?? {};
      deps.authCoordinator.completeLogin({
        userId: typeof rawUser.id === "number" ? String(rawUser.id) : "",
        token,
        platform: deps.platform,
        profileKey: deps.profileKey,
        authRevision: 0,
        kind: "full", // 弹窗交互登录：UX 登录门唯一认可的会话（2026-09-28）
      });
      deps.userStore.save(toLocalUser(rawUser));
      const pNick = rawUser.nickname;
      const pAvatar = rawUser.avatarUrl;
      const phoneHasFullProfile =
        typeof pNick === "string" && pNick !== "" && typeof pAvatar === "string" && pAvatar !== "";
      return { ok: true, phoneHasFullProfile };
    } catch (err) {
      console.error("[runPhoneLogin] 异常:", err);
      return { ok: false, phoneHasFullProfile: false, errorKind: "unknown", errorMsg: mapLoginFailureMessage("") };
    }
  }

  return { prefetchLoginCode, hasValidLoginCode, runPhoneLogin };
}

/** 后端 UserInfo（宽松 Record）→ 本地 WxUserInfoLocal（非空字段收窄；缺失保留空值） */
export function toLocalUser(raw: Record<string, unknown>): WxUserInfoLocal {
  return {
    id: typeof raw.id === "number" ? raw.id : 0,
    openid: typeof raw.openid === "string" ? raw.openid : "",
    phone: typeof raw.phone === "string" && raw.phone !== "" ? raw.phone : null,
    nickname: typeof raw.nickname === "string" && raw.nickname !== "" ? raw.nickname : null,
    avatarUrl: typeof raw.avatarUrl === "string" && raw.avatarUrl !== "" ? raw.avatarUrl : null,
  };
}
