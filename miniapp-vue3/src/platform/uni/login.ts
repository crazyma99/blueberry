// P2-03 provider 侧（1/2）：平台取登录 code（旧端 wx.login / uni.login 语义）。
// 容器安全：uni／uni.login 缺失（测试环境、异常容器）或用户侧失败 → 返回 null，**不抛**；
// 调用方（application/silent-login）据此 fail-closed 返回 auth 失败，绝不伪造会话。
// 2026-09-19 抖音登录接入·前端层：provider 按平台分流——微信 'weixin'／抖音 'toutiao'
//   （uni-app 抖音 shim 对未知 provider 会忽略并转发 tt.login，显式传 'toutiao' 是官方口径）；
//   mp-xhs 无 provider 概念 → 省略该字段走平台默认。
import type { Platform } from "../../ports/context";

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

/** 平台 → uni.login provider；null = 省略 provider 字段（走平台默认） */
const LOGIN_PROVIDERS: Record<Platform, string | null> = {
  "mp-weixin": "weixin",
  "mp-toutiao": "toutiao",
  "mp-xhs": null,
};

export function createUniLoginCode(deps?: { timeoutMs?: number; platform?: Platform }): LoginCodePort {
  const timeoutMs = deps?.timeoutMs ?? LOGIN_CODE_TIMEOUT_MS;
  const provider = LOGIN_PROVIDERS[deps?.platform ?? "mp-weixin"];
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
          const options: Record<string, unknown> = {
            success: (res: UniLoginRes) => {
              const code = res?.code;
              finish(typeof code === "string" && code !== "" ? code : null);
            },
            fail: () => finish(null),
          };
          if (provider != null) options.provider = provider;
          api.login(options);
        } catch {
          finish(null);
        }
      });
    },
  };
}
