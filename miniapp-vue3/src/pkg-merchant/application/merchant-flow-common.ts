// 商家端用例通用件（issue #14 · M2）：失败类型 / 错误映射 / 写操作串行锁。
// 与 merchant-slot-flow 同口径（那里保持原样不动，避免扩大 M1 改动面）。
import type { RequestContext } from "../../ports/context";
import { isMerchantAuthExpired, merchantErrorMessage } from "../domain/merchant-error";

export type FlowFail = { ok: false; kind: "failed" | "auth-expired" | "busy" | "validation"; message: string };

export function failFrom(err: Parameters<typeof merchantErrorMessage>[0], fallback: string): FlowFail {
  return { ok: false, kind: isMerchantAuthExpired(err) ? "auth-expired" : "failed", message: merchantErrorMessage(err, fallback) };
}

/** 写操作串行锁：进行中拒绝新的写操作（后端对重复/冲突返回业务错误，不能靠重试兜底） */
export function createExclusive() {
  let busy = false;
  return {
    isBusy: (): boolean => busy,
    async run<T>(fn: () => Promise<T | FlowFail>): Promise<T | FlowFail> {
      if (busy) return { ok: false, kind: "busy", message: "正在处理，请稍候" };
      busy = true;
      try {
        return await fn();
      } finally {
        busy = false;
      }
    },
  };
}

export type { RequestContext };
