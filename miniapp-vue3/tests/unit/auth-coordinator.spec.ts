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

// ===== 2026-10-11 登录态横跳根修（每页一个协调器实例＋共享落盘键 ⇒ 内存滞后/静默票覆盖 full）=====
// 根因：常驻 tab 页（mine）创建于登录前 ⇒ 内存 session=null 永不重读盘；其首个 authRequired 请求
// 无谓发起静默换票 ⇒ 换票轮换 token 并以 silent 覆盖盘上 full ⇒ 各页 isFullSession 门禁瞬间翻回未登录。
const mkFull = (rev: number, token: string): Session => ({ ...mkSession(rev), token, kind: "full" });
const mkSilent = (token: string): Session => ({ ...mkSession(0), token, kind: "silent" });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("C：发起换票前重读盘认领（内存滞后不再无谓换票）", () => {
  it("协调器创建后他页写入会话 ⇒ waitForLogin 认领盘会话，不调换票端点", async () => {
    let calls = 0;
    const storage = memStorage();
    const co = createAuthCoordinator({
      exchangeIdentity: () => { calls++; return Promise.resolve({ ok: true, value: mkSilent("tok-silent") }); },
      storage,
    });
    // 他页（另一协调器实例）完成交互登录并落盘 full
    storage.set("lm.session.v1", JSON.stringify(mkFull(7, "tok-full-A")));
    const r = await co.waitForLogin(ctx());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.token).toBe("tok-full-A");
      expect(r.value.kind).toBe("full"); // 原样认领（含 kind，UX 门禁可读）
    }
    expect(calls).toBe(0); // 关键断言：没有发起换票
  });
  it("盘上会话归属不匹配（异 Profile）⇒ 不认领，照常发起换票", async () => {
    let calls = 0;
    const storage = memStorage();
    storage.set("lm.session.v1", JSON.stringify({ ...mkFull(7, "tok-foreign"), profileKey: "other-profile" }));
    const co = createAuthCoordinator({
      exchangeIdentity: () => { calls++; return Promise.resolve({ ok: true, value: mkSilent("tok-silent") }); },
      storage,
    });
    const r = await co.waitForLogin(ctx());
    expect(calls).toBe(1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.token).toBe("tok-silent");
  });
});

describe("B：静默换票不得覆盖 full 会话", () => {
  it("换票在飞期间他页完成 full 登录 ⇒ 丢弃静默票：等待者认领 full，盘/内存不被覆盖，后续不再换票", async () => {
    const storage = memStorage();
    const d = deferred<Result<Session>>();
    let calls = 0;
    const co = createAuthCoordinator({ exchangeIdentity: () => { calls++; return d.promise; }, storage });
    const w = co.waitForLogin(ctx());
    expect(calls).toBe(1);
    // 在飞期间：他页完成交互登录并落盘 full/A
    storage.set("lm.session.v1", JSON.stringify(mkFull(9, "tok-full-A")));
    // 本实例的静默换票才返回（带回了 silent 票）
    d.resolve({ ok: true, value: mkSilent("tok-silent-S") });
    const r = await w;
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.token).toBe("tok-full-A"); // 等待者拿到 full 而非静默票
    const onDisk = JSON.parse(storage.data.get("lm.session.v1")!) as Session;
    expect(onDisk).toMatchObject({ token: "tok-full-A", kind: "full" }); // 盘未被 silent 覆盖
    const r2 = await co.waitForLogin(ctx()); // 内存已认领 full
    expect(r2.ok && r2.value.token).toBe("tok-full-A");
    expect(calls).toBe(1); // 不再换票
  });
  it("换票在飞期间本页完成弹窗登录（completeLogin full）⇒ 迟到的静默票不覆盖内存/盘", async () => {
    const storage = memStorage();
    const d = deferred<Result<Session>>();
    const co = createAuthCoordinator({ exchangeIdentity: () => d.promise, storage });
    const w = co.waitForLogin(ctx());
    // 同页弹窗登录完成（runPhoneLogin 直接 completeLogin full）⇒ 先唤醒等待者
    co.completeLogin(mkFull(0, "tok-full-popup"));
    const r1 = await w;
    expect(r1.ok && r1.value.token).toBe("tok-full-popup");
    // 迟到的静默换票结果到达
    d.resolve({ ok: true, value: mkSilent("tok-silent-late") });
    await tick();
    const r2 = await co.waitForLogin(ctx());
    expect(r2.ok && r2.value.token).toBe("tok-full-popup"); // 内存仍 full
    const onDisk = JSON.parse(storage.data.get("lm.session.v1")!) as Session;
    expect(onDisk.token).toBe("tok-full-popup"); // 盘仍 full
  });
});

describe("D：401 自愈（expireSession）", () => {
  it("作废当前会话：内存+盘同 token 一并清除 ⇒ 后续 waitForLogin 重新换票", async () => {
    const storage = memStorage();
    let calls = 0;
    const co = createAuthCoordinator({
      exchangeIdentity: () => { calls++; return Promise.resolve({ ok: true, value: mkSilent("tok-" + calls) }); },
      storage,
    });
    const r1 = await co.waitForLogin(ctx());
    expect(r1.ok).toBe(true);
    expect(storage.data.has("lm.session.v1")).toBe(true);
    if (r1.ok) co.expireSession(r1.value);
    expect(storage.data.has("lm.session.v1")).toBe(false); // 盘清净
    const w2 = co.waitForLogin(ctx());
    expect(calls).toBe(2); // 重新换票（自愈闭环）
    await expect(w2).resolves.toMatchObject({ ok: true });
  });
  it("旧 token 的迟到 401 不误杀已轮换的新会话（token 不匹配 ⇒ 不作废）", async () => {
    const storage = memStorage();
    const co = createAuthCoordinator({
      exchangeIdentity: () => Promise.resolve({ ok: true, value: mkSilent("tok-new") }),
      storage,
    });
    await co.waitForLogin(ctx()); // 内存+盘 = tok-new
    co.expireSession(mkSilent("tok-old-stale")); // 过期请求持旧票的迟到 401
    expect(storage.data.has("lm.session.v1")).toBe(true);
    const r = await co.waitForLogin(ctx());
    expect(r.ok && r.value.token).toBe("tok-new"); // 新会话不受影响
  });
  it("D+C 闭环：作废时盘上已是他页新会话 ⇒ 只清内存保留盘；下次 waitForLogin 认领盘会话、不换票", async () => {
    const storage = memStorage();
    let calls = 0;
    const co = createAuthCoordinator({
      exchangeIdentity: () => { calls++; return Promise.resolve({ ok: true, value: mkSilent("tok-A") }); },
      storage,
    });
    const r1 = await co.waitForLogin(ctx()); // 内存+盘 = tok-A
    storage.set("lm.session.v1", JSON.stringify(mkFull(5, "tok-B"))); // 他页写入新会话
    if (r1.ok) co.expireSession(r1.value); // tok-A 的 401 到达
    const onDisk = JSON.parse(storage.data.get("lm.session.v1")!) as Session;
    expect(onDisk.token).toBe("tok-B"); // 盘保留他页新会话（误清＝二次横跳）
    const r2 = await co.waitForLogin(ctx()); // 内存已清 ⇒ C 认领盘会话
    expect(r2.ok && r2.value.token).toBe("tok-B");
    expect(calls).toBe(1); // 不再换票
  });
});
