// T74（2026-10-13 抖音 `getPhoneNumber:fail invalid session` 根因修复）：**登录码必须「点手机号按钮之前」预取并缓存**。
// 官方《获取手机号》原文：「使用（用户点击 button）前需先调用 tt.login 接口。如果在回调中调用 tt.login 会刷新登录态，
// 导致登录后换取的 session_key 与手机号码加密时使用的 session_key 不同，从而导致解密失败。」
// ⇒ 本 spec 守卫：①调用顺序（预取在前、提交在后）②**回调路径内零 uni.login**（LoginCodePort 计数不增）
// ③缓存三态（缺失/有效/过期）④幂等（有效期内不重复调平台）⑤缓存缺失/过期 ⇒ 可行动提示＋**零请求**。
import { describe, expect, it } from "vitest";
import { createPhoneLoginFlow, LOGIN_CODE_STALE_HINT, LOGIN_CODE_TTL_MS } from "../../src/application/login-flow";
import type { RequestContext } from "../../src/ports/context";

const ctx: RequestContext = {
  platform: "mp-toutiao",
  environment: "trial",
  brandId: null,
  requestId: "r",
  profileKey: "blueberry",
  appCode: "blueBerry",
  scopeRevision: 1,
  authRevision: 1,
};

function makeHarness(opts?: { code?: string | null; clock?: { v: number } }) {
  const events: string[] = [];
  const loginParams: unknown[] = [];
  let portCalls = 0;
  const clock = opts?.clock ?? { v: 1_000_000 };
  const flow = createPhoneLoginFlow({
    wxAuth: {
      login: async (_c: RequestContext, params: unknown) => {
        events.push("submit");
        loginParams.push(params);
        return { ok: true, value: { token: "TK", userInfo: { id: 1, nickname: "蓝梅", avatarUrl: "https://cdn/a.png" } } };
      },
    } as never,
    authCoordinator: { completeLogin: () => undefined } as never,
    userStore: { save: () => undefined } as never,
    context: () => ctx,
    platform: "mp-toutiao",
    profileKey: "blueberry",
    loginCode: {
      request: async () => {
        events.push("loginCode.request");
        portCalls += 1;
        return opts?.code === undefined ? "LOGIN-CODE" : opts.code;
      },
    },
    now: () => clock.v,
  });
  return { flow, events, loginParams, portCalls: () => portCalls, clock };
}

describe("t74 · 顺序：预取在点按钮之前，提交在回调里", () => {
  it("⭐先 prefetchLoginCode（进弹窗/关键动作）→ 再 runPhoneLogin：调用顺序＝loginCode.request → submit", async () => {
    const h = makeHarness();
    expect(await h.flow.prefetchLoginCode()).toBe(true);
    expect(h.events).toEqual(["loginCode.request"]);
    const out = await h.flow.runPhoneLogin("PHONE-CODE");
    expect(out).toMatchObject({ ok: true });
    expect(h.events, "预取必须在提交之前").toEqual(["loginCode.request", "submit"]);
    expect(h.loginParams[0]).toEqual({ loginCode: "LOGIN-CODE", phoneCode: "PHONE-CODE" });
  });

  it("⭐回调路径内**零** uni.login：预取 1 次后，回调（含缓存已空时）都不得再调平台", async () => {
    const h = makeHarness();
    await h.flow.prefetchLoginCode();
    await h.flow.runPhoneLogin("PHONE-CODE"); // 提交成功并作废缓存
    const out2 = await h.flow.runPhoneLogin("PHONE-CODE-2"); // 缓存空 ⇒ 只提示，不补取
    expect(out2).toMatchObject({ ok: false, errorKind: "login" });
    expect(h.portCalls(), "回调路径内不得调用 LoginCodePort（Platform 登录）").toBe(1);
    expect(h.events.filter((e) => e === "submit").length).toBe(1);
  });
});

describe("t74 · 缓存三态（缺失/有效/过期）＋幂等", () => {
  it("⭐缺失：未预取就提交 ⇒ 可行动提示＋**零请求**（不得静默失败、不得回调内补取）", async () => {
    const h = makeHarness();
    const out = await h.flow.runPhoneLogin("PHONE-CODE");
    expect(out).toMatchObject({ ok: false, errorKind: "login", errorMsg: LOGIN_CODE_STALE_HINT });
    expect(h.portCalls()).toBe(0);
    expect(h.events).toEqual([]); // 既没取码也没提交
  });

  it("⭐有效：TTL 内复用预取码；且幂等——重复 prefetch 不再调平台（合抖音「冷启动最多一次」）", async () => {
    const h = makeHarness();
    await h.flow.prefetchLoginCode();
    await h.flow.prefetchLoginCode();
    await h.flow.prefetchLoginCode();
    expect(h.portCalls()).toBe(1);
    expect(await h.flow.hasValidLoginCode()).toBe(true);
    h.clock.v += LOGIN_CODE_TTL_MS - 1000; // 仍在 TTL 内
    expect(h.flow.hasValidLoginCode()).toBe(true);
    const out = await h.flow.runPhoneLogin("P");
    expect(out).toMatchObject({ ok: true });
  });

  it("⭐过期：超过 TTL ⇒ 视为无码 ⇒ 可行动提示＋零请求（下一次进弹窗重新预取）", async () => {
    const h = makeHarness();
    await h.flow.prefetchLoginCode();
    h.clock.v += LOGIN_CODE_TTL_MS + 1;
    expect(h.flow.hasValidLoginCode()).toBe(false);
    const out = await h.flow.runPhoneLogin("P");
    expect(out).toMatchObject({ ok: false, errorKind: "login", errorMsg: LOGIN_CODE_STALE_HINT });
    expect(h.portCalls()).toBe(1); // 只有当初那次预取
    expect(h.events.filter((e) => e === "submit").length).toBe(0);
    // 过期后**显式再预取**是允许的（页面在下一次进弹窗时调用）
    expect(await h.flow.prefetchLoginCode()).toBe(true);
    expect(h.portCalls()).toBe(2);
  });

  it("预取失败（平台未返回码）⇒ 返回 false；提交给可行动提示且零请求", async () => {
    const h = makeHarness({ code: null });
    expect(await h.flow.prefetchLoginCode()).toBe(false);
    const out = await h.flow.runPhoneLogin("P");
    expect(out).toMatchObject({ ok: false, errorKind: "login", errorMsg: LOGIN_CODE_STALE_HINT });
    expect(h.events.filter((e) => e === "submit").length).toBe(0);
  });
});
