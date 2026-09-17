// T5（P2-01/02/05）：HTTP client 合同测试——头注入/上下文快照/信封兼容/错误映射/重放透传。
import { describe, expect, it } from "vitest";
import { createHttpClient } from "../../src/infrastructure/http/client";
import type { RequestContext, Result } from "../../src/ports/context";
import type { HttpRequest, HttpResponse } from "../../src/ports/http";

const ctx: RequestContext = {
  platform: "mp-weixin",
  environment: "trial",
  brandId: "brand-1",
  requestId: "req-1",
  profileKey: "blueberry",
  appCode: "blueBerry",
  scopeRevision: 1,
  authRevision: 1,
};

function makeTransport(responder: (req: HttpRequest) => Result<HttpResponse<unknown>>) {
  const seen: HttpRequest[] = [];
  return {
    seen,
    port: {
      request: async <T,>(req: HttpRequest) => { seen.push(req); return responder(req) as unknown as Result<HttpResponse<T>>; },
      cancel: () => {},
    },
  };
}
const okAuth = {
  waitForLogin: async () => ({
    ok: true as const,
    value: { userId: "u1", token: "tok-1", platform: "mp-weixin" as const, profileKey: "blueberry", authRevision: 1 },
  }),
};
const failAuth = { waitForLogin: async () => ({ ok: false as const, reason: "denied" }) };

describe("createHttpClient 头注入（P2-02）", () => {
  it("X-App-Code 恒带；Bearer 仅 authRequired；X-Brand-Id 仅 brandScoped", async () => {
    const t = makeTransport((req) => ({ ok: true, value: { status: 200, businessCode: 0, requestId: "r", data: { n: 1 } } }));
    const c = createHttpClient({ transport: t.port, authCoordinator: okAuth });
    await c.request({ method: "GET", url: "/api/shops", context: ctx });
    let h = t.seen[0].headers!;
    expect(h["X-App-Code"]).toBe("blueBerry");
    expect(h.Authorization).toBeUndefined();
    expect(h["X-Brand-Id"]).toBeUndefined(); // 非品牌作用域不硬塞
    await c.request({ method: "POST", url: "/api/like", authRequired: true, brandScoped: true, context: ctx });
    h = t.seen[1].headers!;
    expect(h.Authorization).toBe("Bearer tok-1");
    expect(h["X-Brand-Id"]).toBe("brand-1");
  });
  it("brandScoped 但 brandId 为空 → 不带 X-Brand-Id", async () => {
    const t = makeTransport((req) => ({ ok: true, value: { status: 200, businessCode: 0, requestId: "r", data: null } }));
    const c = createHttpClient({ transport: t.port, authCoordinator: okAuth });
    await c.request({ method: "GET", url: "/x", brandScoped: true, context: { ...ctx, brandId: null } });
    expect(t.seen[0].headers!["X-Brand-Id"]).toBeUndefined();
  });
  it("RequestContext 快照捕获＋replayPolicy/timeout 透传", async () => {
    const t = makeTransport((req) => ({ ok: true, value: { status: 200, businessCode: 200, requestId: "r", data: 1 } }));
    const c = createHttpClient({ transport: t.port, authCoordinator: okAuth });
    await c.request({ method: "GET", url: "/y", replayPolicy: "idempotent", timeoutMs: 5000, context: ctx });
    const req = t.seen[0];
    expect(req.context).toStrictEqual(ctx);
    expect(Object.isFrozen(req.context)).toBe(true); // 快照冻结：在飞请求不受后续上下文变更影响
    expect(req.replayPolicy).toBe("idempotent");
    expect(req.timeoutMs).toBe(5000);
  });
});

describe("createHttpClient 响应与错误映射（P2-01/05）", () => {
  it("业务信封 0 与 200 均成功（两种信封并存兼容）", async () => {
    for (const code of [0, 200]) {
      const t = makeTransport(() => ({ ok: true, value: { status: 200, businessCode: code, requestId: "r", data: "payload" } }));
      const c = createHttpClient({ transport: t.port, authCoordinator: okAuth });
      const r = await c.request<string>({ method: "GET", url: "/z", context: ctx });
      expect(r).toEqual({ ok: true, value: "payload" });
    }
  });
  it("4001 → INSUFFICIENT_CREDITS；其他业务码 → BUSINESS；均不自动重放", async () => {
    const t1 = makeTransport(() => ({ ok: true, value: { status: 200, businessCode: 4001, requestId: "rq", data: null } }));
    const r1 = await createHttpClient({ transport: t1.port, authCoordinator: okAuth }).request({ method: "POST", url: "/p", context: ctx });
    expect(r1.ok).toBe(false);
    if (!r1.ok) {
      expect(r1.error.kind).toBe("INSUFFICIENT_CREDITS");
      expect(r1.error.businessCode).toBe(4001);
      expect(r1.error.retryable).toBe(false);
    }
    const t2 = makeTransport(() => ({ ok: true, value: { status: 200, businessCode: 5001, message: "存储失败", requestId: "rq", data: null } }));
    const r2 = await createHttpClient({ transport: t2.port, authCoordinator: okAuth }).request({ method: "POST", url: "/p", context: ctx });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.kind).toBe("BUSINESS");
    if (!r2.ok) expect(r2.error.message).toBe("存储失败"); // P2-10 CR：信封 message 不丢失
  });
  it("HTTP 401 → AUTH_EXPIRED；传输失败 reason 映射 network/timeout", async () => {
    const t1 = makeTransport(() => ({ ok: true, value: { status: 401, businessCode: null, requestId: "r", data: null } }));
    const r1 = await createHttpClient({ transport: t1.port, authCoordinator: okAuth }).request({ method: "GET", url: "/a", context: ctx });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.kind).toBe("AUTH_EXPIRED");
    const t2 = makeTransport(() => ({ ok: false, reason: "timeout" }));
    const r2 = await createHttpClient({ transport: t2.port, authCoordinator: okAuth }).request({ method: "GET", url: "/b", context: ctx });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.error.kind).toBe("TIMEOUT");
      expect(r2.error.retryable).toBe(true); // 传输失败可重放；非幂等与否由 replayPolicy 判
    }
  });
  it("authRequired 登录失败/取消 → 不发请求即返回；会话代次不符 → AUTH_EXPIRED", async () => {
    const t = makeTransport(() => ({ ok: true, value: { status: 200, businessCode: 0, requestId: "r", data: 1 } }));
    const r1 = await createHttpClient({ transport: t.port, authCoordinator: failAuth }).request({ method: "GET", url: "/c", authRequired: true, context: ctx });
    expect(t.seen.length).toBe(0);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.kind).toBe("AUTH_EXPIRED");
    const staleAuth = { waitForLogin: async () => ({ ok: true as const, value: { userId: "u", token: "t", platform: "mp-weixin" as const, profileKey: "p", authRevision: 0 } }) };
    const r2 = await createHttpClient({ transport: t.port, authCoordinator: staleAuth }).request({ method: "GET", url: "/d", authRequired: true, context: ctx });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.message).toContain("stale session");
  });
});
