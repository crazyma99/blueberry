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
  it("X-App-Code 恒带；Bearer 仅 authRequired；有品牌上下文 X-Brand-Id 恒带（旧端 http.uts:122 全请求口径）", async () => {
    const t = makeTransport((req) => ({ ok: true, value: { status: 200, businessCode: 0, requestId: "r", data: { n: 1 } } }));
    const c = createHttpClient({ transport: t.port, authCoordinator: okAuth });
    await c.request({ method: "GET", url: "/api/shops", context: ctx });
    let h = t.seen[0].headers!;
    expect(h["X-App-Code"]).toBe("blueBerry");
    expect(h.Authorization).toBeUndefined();
    expect(h["X-Brand-Id"]).toBe("brand-1"); // 旧端口径：有品牌上下文即恒带，无需逐请求标记
    await c.request({ method: "POST", url: "/api/like", authRequired: true, context: ctx });
    h = t.seen[1].headers!;
    expect(h.Authorization).toBe("Bearer tok-1");
    expect(h["X-Brand-Id"]).toBe("brand-1");
  });
  it("brandId 为空（null/空串）→ 不带 X-Brand-Id（无品牌上下文，走后端旧逻辑）", async () => {
    const t = makeTransport((req) => ({ ok: true, value: { status: 200, businessCode: 0, requestId: "r", data: null } }));
    const c = createHttpClient({ transport: t.port, authCoordinator: okAuth });
    await c.request({ method: "GET", url: "/x", context: { ...ctx, brandId: null } });
    expect(t.seen[0].headers!["X-Brand-Id"]).toBeUndefined();
    await c.request({ method: "GET", url: "/x", context: { ...ctx, brandId: "" } });
    expect(t.seen[1].headers!["X-Brand-Id"]).toBeUndefined();
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

describe("4002 照片质量拦截信封（2026-09-23 对接后端 staging）", () => {
  it("⭐业务失败也保留信封 data ⇒ businessData.check_code 到达调用方（补「client 未传 data」的变异假绿）", async () => {
    const t = makeTransport(() => ({
      ok: true,
      value: { status: 200, businessCode: 4002, message: "未检测到人脸，请上传单人正面照", requestId: "r", data: { check_code: "no_face" } },
    }));
    const c = createHttpClient({ transport: t.port, authCoordinator: okAuth });
    const res = await c.request({ method: "POST", url: "/api/aiface/tasks", context: ctx });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe("QUALITY_REJECTED"); // 单一事实源：4002 → QUALITY_REJECTED
      expect(res.error.businessCode).toBe(4002);
      expect((res.error.businessData as { check_code?: string }).check_code).toBe("no_face");
    }
  });

  it("既有业务失败不回归：无 data ⇒ businessData 为 undefined，kind 仍 BUSINESS", async () => {
    const t = makeTransport(() => ({ ok: true, value: { status: 200, businessCode: 500, message: "boom", requestId: "r" } }));
    const c = createHttpClient({ transport: t.port, authCoordinator: okAuth });
    const res = await c.request({ method: "GET", url: "/api/x", context: ctx });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe("BUSINESS");
      expect(res.error.businessData).toBeUndefined();
    }
  });
});
