// P2-03 AuthCoordinator：并发唤醒/取消全拒/登出作废/二次登录/超时（P2-03 纪律）。
import { describe, expect, it } from "vitest";
import { createAuthCoordinator } from "../../src/application/auth-coordinator";
import type { Session } from "../../src/infrastructure/http/client";
import type { RequestContext, Result } from "../../src/ports/context";
import type { StoragePort } from "../../src/ports/storage";

function memStorage(): StoragePort & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (k) => data.get(k) ?? null,
    set: (k, v) => { data.set(k, v); },
    remove: (k) => { data.delete(k); },
  };
}
function ctx(over: Partial<RequestContext> = {}): RequestContext {
  return { platform: "mp-weixin", environment: "trial", brandId: null, requestId: "r", profileKey: "blueberry", appCode: "blueBerry", scopeRevision: 1, authRevision: 0, ...over };
}
function deferred<T>() {
  let resolve!: (v: T) => void; let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const mkSession = (rev: number): Session => ({ userId: "u1", token: "tok-" + rev, platform: "mp-weixin", profileKey: "blueberry", authRevision: rev });

describe("createAuthCoordinator（P2-03）", () => {
  it("并发 waitForLogin 只发起一次换票；completeLogin 唤醒全部等待者", async () => {
    const d = deferred<Result<Session>>();
    let calls = 0;
    const co = createAuthCoordinator({ exchangeIdentity: () => { calls++; return d.promise; }, storage: memStorage() });
    const w1 = co.waitForLogin(ctx());
    const w2 = co.waitForLogin(ctx());
    expect(calls).toBe(1);
    d.resolve({ ok: true, value: mkSession(0) });
    const [r1, r2] = await Promise.all([w1, w2]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok) expect(r1.value.authRevision).toBe(1); // completeLogin 递增代次
  });
  it("cancelLogin → 全部等待者 reject（ok:false）；可再次发起", async () => {
    const d = deferred<Result<Session>>();
    const co = createAuthCoordinator({ exchangeIdentity: () => d.promise, storage: memStorage() });
    const w = co.waitForLogin(ctx());
    co.cancelLogin();
    const r = await w;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("cancelled");
  });
  it("换票失败 → 全部等待者失败", async () => {
    const d = deferred<Result<Session>>();
    const co = createAuthCoordinator({ exchangeIdentity: () => d.promise, storage: memStorage() });
    const w = co.waitForLogin(ctx());
    d.resolve({ ok: false, reason: "provider-error" });
    const r = await w;
    expect(r.ok).toBe(false);
  });
  it("logout 后旧会话失效：再次 waitForLogin 重新发起换票（二次 401 场景）", async () => {
    let calls = 0;
    const d1 = deferred<Result<Session>>();
    const d2 = deferred<Result<Session>>();
    const queue = [d1, d2];
    const storage = memStorage();
    const co = createAuthCoordinator({ exchangeIdentity: () => { calls++; return queue[calls - 1].promise; }, storage });
    const w1 = co.waitForLogin(ctx());
    d1.resolve({ ok: true, value: mkSession(0) });
    const r1 = await w1;
    expect(r1.ok).toBe(true);
    // 已登录：直接命中缓存，不再换票
    const rCached = await co.waitForLogin(ctx({ authRevision: 1 }));
    expect(rCached.ok).toBe(true);
    expect(calls).toBe(1);
    co.logout();
    expect(storage.data.size).toBe(0); // 登出清净区
    const w2 = co.waitForLogin(ctx({ authRevision: 1 }));
    expect(calls).toBe(2); // 重新发起
    d2.resolve({ ok: true, value: mkSession(0) });
    const r2 = await w2;
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.authRevision).toBeGreaterThan(1); // 代次递增
  });
  it("换票 Promise reject → 全部等待者失败且不悬挂（P2-10 CR 回归）", async () => {
    let calls = 0;
    const co = createAuthCoordinator({
      exchangeIdentity: () => {
        calls++;
        return calls === 1
          ? Promise.reject(new Error("provider exploded"))
          : Promise.resolve({ ok: true, value: mkSession(0) });
      },
      storage: memStorage(),
    });
    const w = co.waitForLogin(ctx());
    const r = await w;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("exchange-failed");
    const r2 = await co.waitForLogin(ctx());
    expect(calls).toBe(2);
    expect(r2.ok).toBe(true);
  });
  it("超时：不能无限等待（timeoutMs 到点失败）", async () => {
    const co = createAuthCoordinator({ exchangeIdentity: () => new Promise(() => {}), storage: memStorage() });
    const r = await co.waitForLogin(ctx(), { timeoutMs: 20 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("timeout");
  });
});
