// P2-03 provider 侧（1/2）：平台取登录 code（旧端 wx.login / uni.login 语义）。
// 容器安全：uni／uni.login 缺失（测试环境、异常容器）或用户侧失败 → 返回 null，**不抛**；
// 调用方（application/silent-login）据此 fail-closed 返回 auth 失败，绝不伪造会话。
export interface LoginCodePort {
  /** 成功返回一次性 code；失败/不可用返回 null */
  request(): Promise<string | null>;
}

interface UniLoginRes {
  code?: unknown;
  errMsg?: unknown;
}

/** 取码超时（2026-09-17 补：`uni.login` 无内建超时，容器不回调时会让 `waitForLogin` 排队者长期悬挂） */
export const LOGIN_CODE_TIMEOUT_MS = 10000;

export function createUniLoginCode(deps?: { timeoutMs?: number }): LoginCodePort {
  const timeoutMs = deps?.timeoutMs ?? LOGIN_CODE_TIMEOUT_MS;
  return {
    request(): Promise<string | null> {
      return new Promise((resolve) => {
        if (typeof uni === "undefined" || typeof uni.login !== "function") {
          resolve(null);
          return;
        }
        let settled = false;
        const finish = (code: string | null) => {
          if (settled) return;
          settled = true;
          resolve(code);
        };
        setTimeout(() => {
          if (!settled) {
            console.warn("[login] uni.login 超时（容器未回调），按 fail-closed 处理");
            finish(null);
          }
        }, timeoutMs);
        try {
          // 窄化调用：@dcloudio/types 对 login 的 options/回调签名更严，与 transport/upload/chooser 同口径
          const api = uni as unknown as { login: (options: Record<string, unknown>) => void };
          api.login({
            provider: "weixin",
            success: (res: UniLoginRes) => {
              const code = res?.code;
              finish(typeof code === "string" && code !== "" ? code : null);
            },
            fail: () => finish(null),
          });
        } catch {
          finish(null);
        }
      });
    },
  };
}
