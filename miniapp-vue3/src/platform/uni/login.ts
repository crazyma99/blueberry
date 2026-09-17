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

export function createUniLoginCode(): LoginCodePort {
  return {
    request(): Promise<string | null> {
      return new Promise((resolve) => {
        if (typeof uni === "undefined" || typeof uni.login !== "function") {
          resolve(null);
          return;
        }
        try {
          // 窄化调用：@dcloudio/types 对 login 的 options/回调签名更严，与 transport/upload/chooser 同口径
          const api = uni as unknown as { login: (options: Record<string, unknown>) => void };
          api.login({
            provider: "weixin",
            success: (res: UniLoginRes) => {
              const code = res?.code;
              resolve(typeof code === "string" && code !== "" ? code : null);
            },
            fail: () => resolve(null),
          });
        } catch {
          resolve(null);
        }
      });
    },
  };
}
