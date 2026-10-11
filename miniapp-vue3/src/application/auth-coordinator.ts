// P2-03 认证协调器：一个登录交互唤醒全部等待者。
// 纪律：并发 waitForLogin 只发起一次换票；cancelLogin 全部 reject（不悬挂）；logout 作废旧会话
// 并使后续 waitForLogin 重新发起（二次 401 场景）；可选超时防无限等待。
// Session 为新端内部模型（非后端响应字段伪造）；换票委托 exchangeIdentity（平台 provider）。
// 2026-10-11（登录态横跳根修 B+C）：每个页面各自装配本协调器（内存 session 私有），但落盘键
// `lm.session.v1` 全局共享 ⇒ 常驻 tab 页（mine）若创建于登录之前，内存会话永远滞后于盘；
// 其首个 authRequired 请求会无谓发起静默换票，`/api/wx/login` 轮换 token 并以 silent 会话
// **覆盖盘上 full 会话** ⇒ 各页 isFullSession 门禁瞬间翻回未登录（「先出现立刻丢失」）。根修：
//   C（waitForLogin）：发起换票前**重读盘**，他页已写入的匹配会话直接认领，不再调换票端点；
//   B（startExchange 收口）：换票在飞期间他页可能已完成 full 登录 ⇒ 静默票**不得覆盖**既有
//      full 会话——认领既有 full 唤醒等待者，静默票丢弃（不落盘、不进内存）。
import type { RequestContext, Result } from "../ports/context";
import type { StoragePort } from "../ports/storage";
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
  /** 401 自愈（2026-10-11，见 client.ts D 修）：仅当在飞请求所用会话仍是当前会话时才作废——
   *  防「旧 token 的迟到 401」误杀他页刚写入的新会话；作废后下一次 waitForLogin 经 C 重读盘认领/重换 */
  expireSession(used: Session): void;
}

export function createAuthCoordinator(deps: {
  exchangeIdentity: (context: RequestContext) => Promise<Result<Session>>;
  storage: StoragePort;
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

  /** 重读盘上会话（与构造期兼容读同口径：损坏/缺字段安全失败＝null）。C/B/D 三处共用 */
  function readPersistedSession(): Session | null {
    try {
      const raw = deps.storage.get(SESSION_STORAGE_KEY);
      if (raw == null) return null;
      const parsed = JSON.parse(raw) as Session;
      if (parsed && typeof parsed.token === "string" && typeof parsed.authRevision === "number") return parsed;
      return null;
    } catch {
      return null;
    }
  }

  /** 认领既有会话进内存（不递增代次、不落盘——会话的写盘方是其产生方）；代次只升不降 */
  function adopt(s: Session): void {
    session = s;
    if (s.authRevision > revision) revision = s.authRevision;
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

  /** B：换票收口前找「可复用的 full 会话」——盘上优先（跨页最新写），内存兜底 */
  function findReusableFullSession(context: RequestContext): Session | null {
    const persisted = readPersistedSession();
    if (persisted != null && persisted.kind === "full" && matches(persisted, context)) return persisted;
    if (session != null && session.kind === "full" && matches(session, context)) return session;
    return null;
  }

  function startExchange(context: RequestContext): void {
    if (exchanging) return; // 一个登录交互唤醒全部
    exchanging = true;
    // CR（P2-10）：换票 Promise 若 reject 也必须收口——否则 exchanging 卡死、waiters 悬空
    deps.exchangeIdentity(context).then(
      (result) => {
        exchanging = false;
        if (!result.ok) {
          failAll(result.reason);
          return;
        }
        // 2026-10-11（B）：静默换票不得覆盖交互登录会话——在飞期间他页可能已完成 full 登录
        // ⇒ 认领既有 full 会话唤醒等待者；本次静默票丢弃（不落盘、不进内存、不顶号）
        if (result.value.kind !== "full") {
          const reusable = findReusableFullSession(context);
          if (reusable != null) {
            adopt(reusable);
            wakeAll({ ok: true, value: reusable });
            return;
          }
        }
        completeLogin(result.value);
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
    // 2026-10-11（C）：发起换票前重读盘——本实例可能创建于他页登录之前（常驻 tab 页内存滞后），
    // 盘上已出现匹配会话 ⇒ 直接认领，不再调换票端点（避免无谓换票顶掉 full 会话/轮换服务端 token）
    const persisted = readPersistedSession();
    if (persisted != null && matches(persisted, context)) {
      adopt(persisted);
      return Promise.resolve({ ok: true, value: persisted });
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
      // 超时：不能无限等待（计时用宿主计时器）
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
  const restored = readPersistedSession();
  if (restored != null) {
    session = restored;
    revision = restored.authRevision;
  }

  // 2026-10-11（D）：401 自愈——在飞请求所用会话仍是**当前内存会话**（token 比对）才作废，
  // 防「旧 token 的迟到 401」误杀新登录会话；清盘前重读盘：盘上若已是另一 token（他页刚登录/换票）
  // ⇒ 只清内存、保留盘（误清他页新会话＝二次横跳）。作废后下一次 waitForLogin 经 C 重读盘认领/重换。
  // legacy `token` 键按**同 token** 一并清（CR 🟡-1）：否则 versioned.loadSession 的 legacy 迁移会把
  // 同一个已 401 死掉的 token 重新迁移写回新键 ⇒ 僵尸态复活循环；持有**不同** token 时不动
  // （可能是旧端仍活着的会话，勿误伤；对齐 doLogout 清旧键先例 mine/index.vue:340-341）。
  const LEGACY_TOKEN_KEY = "token";
  function expireSession(used: Session): void {
    if (session === null || session.token !== used.token) return;
    revision += 1;
    session = null;
    const persisted = readPersistedSession();
    if (persisted != null && persisted.token === used.token) {
      deps.storage.remove(SESSION_STORAGE_KEY);
      if (deps.storage.get(LEGACY_TOKEN_KEY) === used.token) deps.storage.remove(LEGACY_TOKEN_KEY);
    }
  }

  return { waitForLogin, completeLogin, cancelLogin, logout, expireSession };
}
