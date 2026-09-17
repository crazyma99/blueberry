// P2-18 登录三步骤纯逻辑（旧端 utils/loginFlow.uts 忠实移植）：
//   1. uni.login({provider:'weixin'}) 拿 wx code（容器守卫）
//   2. POST /api/wx/login 换 token+userInfo → 完成会话（completeLogin）并保存用户信息
//   3. POST /api/wx/phone 绑定手机号 → 非空合并本地用户信息；失败不视为整体失败
// 旧端纪律（loginFlow.uts:34-67）：不调 showLoading/toast/关弹窗——调用方按页面策略处理 UX；
// phone 接口失败仅 warn 继续（phoneHasFullProfile=false，调用方通常再弹 profile 弹窗补齐）。
// ⚠️ 有意偏差（已声明）：旧端登录成功后 flushPendingRequests/flushPendingUploads——新端由
// authCoordinator.completeLogin 唤醒全部 waitForLogin 等待者（P2-03 队列语义），无需手动 flush。
import type { RequestContext, Result } from "../ports/context";
import { createUniLoginCode, type LoginCodePort } from "../platform/uni/login";
import type { Platform } from "../ports/context";
import type { AuthCoordinator } from "./auth-coordinator";
import type { WxUserInfoLocal, UserInfoStore } from "./user-info-store";
import type { createWxAuthRepository } from "../infrastructure/repositories/wx-auth";

export type PhoneLoginErrorKind = "login" | "wxlogin" | "unknown";

export interface PhoneLoginResult {
  ok: boolean;
  phoneHasFullProfile: boolean;
  errorKind?: PhoneLoginErrorKind;
  errorMsg?: string;
}

type WxAuthRepo = ReturnType<typeof createWxAuthRepository>;

/** 旧端 :27-33：内部不抛错；任何步骤异常收敛为 {ok:false, errorKind:'unknown'} */
export function createPhoneLoginFlow(deps: {
  wxAuth: WxAuthRepo;
  authCoordinator: AuthCoordinator;
  userStore: UserInfoStore;
  context: () => RequestContext;
  platform: Platform;
  profileKey: string;
  /** P4-12：平台取 code 必须经端口（默认 `platform/uni/login`），不得在本层直调 `uni.login` */
  loginCode?: LoginCodePort;
}) {
  async function runPhoneLogin(phoneCode: string): Promise<PhoneLoginResult> {
    try {
      // step 1: 静默登录拿 wx code（旧端 :36-41；容器无 uni.login 时安全失败）
      // ⭐P4-12：改经 `LoginCodePort`（`platform/uni/login.ts`）——平台 API 只允许出现在 `src/platform/**`
      const wxCode = (await (deps.loginCode ?? createUniLoginCode()).request()) ?? "";
      if (!wxCode) {
        return { ok: false, phoneHasFullProfile: false, errorKind: "login" };
      }

      // step 2: wx code 换 token（旧端 :44-56）
      const ctx = deps.context();
      const wxRes = await deps.wxAuth.login(ctx, { code: wxCode });
      if (!wxRes.ok) {
        return { ok: false, phoneHasFullProfile: false, errorKind: "wxlogin", errorMsg: wxRes.error.message };
      }
      const token = wxRes.value.token;
      const rawUser = wxRes.value.userInfo ?? {};
      deps.authCoordinator.completeLogin({
        userId: typeof rawUser.id === "number" ? String(rawUser.id) : "",
        token,
        platform: deps.platform,
        profileKey: deps.profileKey,
        authRevision: 0,
      });
      deps.userStore.save(toLocalUser(rawUser));

      // step 3: phoneCode 绑定手机号；失败不视为整体失败（旧端 :59-70）
      let phoneHasFullProfile = false;
      try {
        // 绑定需登录：completeLogin 已完成会话，client 侧 waitForLogin 立即返回
        const phoneRes = await deps.wxAuth.bindPhone(deps.context(), { code: phoneCode });
        if (phoneRes.ok && phoneRes.value != null) {
          // 非空合并，避免 step2 拿到的头像/昵称被 null 覆盖（旧端 :62 mergeUserInfo）
          deps.userStore.merge(toLocalUser(phoneRes.value));
          const pNick = phoneRes.value.nickname;
          const pAvatar = phoneRes.value.avatarUrl;
          phoneHasFullProfile =
            typeof pNick === "string" && pNick !== "" && typeof pAvatar === "string" && pAvatar !== "";
        }
      } catch (phoneErr) {
        console.warn("[runPhoneLogin] bindPhone 异常，继续走 profile 补齐流程:", phoneErr);
      }

      return { ok: true, phoneHasFullProfile };
    } catch (err) {
      console.error("[runPhoneLogin] 异常:", err);
      return { ok: false, phoneHasFullProfile: false, errorKind: "unknown" };
    }
  }

  return { runPhoneLogin };
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
