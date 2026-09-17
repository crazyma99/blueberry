// P2-03 认证协调器：一个登录交互唤醒全部等待者。
// 纪律：并发 waitForLogin 只发起一次换票；cancelLogin 全部 reject（不悬挂）；logout 作废旧会话
// 并使后续 waitForLogin 重新发起（二次 401 场景）；可选超时防无限等待。
// Session 为新端内部模型（非后端响应字段伪造）；换票委托 exchangeIdentity（平台 provider）。
import type { RequestContext, Result } from "../ports/context";
import type { StoragePort } from "../ports/storage";
import type { ClockPort } from "../ports/clock";
import type { Session } from "../infrastructure/http/client";

const SESSION_STORAGE_KEY = "lm.session.v1";

export interface AuthCoordinator {
  waitForLogin(
    context: RequestContext,
    options?: { timeoutMs?: number },
  ): Promise<Result<Session>>;
  completeLogin(session: Session): void;
  cancelLogin(): void;
  logout(): void;
}

export function createAuthCoordinator(deps: {
  exchangeIdentity: (context: RequestContext) => Promise<Result<Session>>;
  storage: StoragePort;
  clock: ClockPort;
}): AuthCoordinator {
  let session: Session | null = null;
  let revision = 0;
  let exchanging = false;
  const waiters: Array<(r: Result<Session>) => void> = [];

  function wakeAll(result: Result<Session>): void {
    const list = waiters.splice(0, waiters.length);
    for (const w of list) w(result);
  }

  function failAll(reason: string): void {
    wakeAll({ ok: false, reason });
  }

  function persist(s: Session | null): void {
    if (s === null) {
      deps.storage.remove(SESSION_STORAGE_KEY);
    } else {
      deps.storage.set(SESSION_STORAGE_KEY, JSON.stringify(s));
    }
  }

  function completeLogin(incoming: Session): void {
    revision += 1;
    session = { ...incoming, authRevision: revision };
    persist(session);
    wakeAll({ ok: true, value: session });
  }

  function cancelLogin(): void {
    exchanging = false;
    failAll("cancelled");
  }

  function logout(): void {
    revision += 1;
    session = null;
    persist(null);
    // 登出时未完成的登录交互一并作废（不能悬挂）
    failAll("cancelled");
  }

  function matches(s: Session, context: RequestContext): boolean {
    return s.platform === context.platform && s.profileKey === context.profileKey;
  }

  function startExchange(context: RequestContext): void {
    if (exchanging) return; // 一个登录交互唤醒全部
    exchanging = true;
    // CR（P2-10）：换票 Promise 若 reject 也必须收口——否则 exchanging 卡死、waiters 悬空
    deps.exchangeIdentity(context).then(
      (result) => {
        exchanging = false;
        if (result.ok) {
          completeLogin(result.value);
        } else {
          failAll(result.reason);
        }
      },
      () => {
        exchanging = false;
        failAll("exchange-failed");
      },
    );
  }

  function waitForLogin(
    context: RequestContext,
    options?: { timeoutMs?: number },
  ): Promise<Result<Session>> {
    // 已有匹配会话：立即返回（平台＋Profile 有效性校验，P2-06 前置语义）
    if (session !== null && matches(session, context)) {
      return Promise.resolve({ ok: true, value: session });
    }
    return new Promise<Result<Session>>((resolve) => {
      let settled = false;
      const finish = (r: Result<Session>) => {
        if (settled) return;
        settled = true;
        const idx = waiterIndex(wrapper);
        if (idx >= 0) waiters.splice(idx, 1);
        resolve(r);
      };
      const wrapper = (r: Result<Session>) => finish(r);
      waiters.push(wrapper);
      // 超时：不能无限等待（clock 仅用于可测性注记；计时用宿主计时器）
      if (options && typeof options.timeoutMs === "number" && options.timeoutMs > 0) {
        setTimeout(() => finish({ ok: false, reason: "timeout" }), options.timeoutMs);
      }
      startExchange(context);
    });
  }

  function waiterIndex(fn: (r: Result<Session>) => void): number {
    for (let i = 0; i < waiters.length; i++) {
      if (waiters[i] === fn) return i;
    }
    return -1;
  }

  // 启动时兼容读旧存储（versioned key；损坏内容安全失败＝视为未登录，P2-06 语义前置）
  try {
    const raw = deps.storage.get(SESSION_STORAGE_KEY);
    if (raw != null) {
      const parsed = JSON.parse(raw) as Session;
      if (parsed && typeof parsed.token === "string" && typeof parsed.authRevision === "number") {
        session = parsed;
        revision = parsed.authRevision;
      }
    }
  } catch {
    session = null;
  }

  return { waitForLogin, completeLogin, cancelLogin, logout };
}
