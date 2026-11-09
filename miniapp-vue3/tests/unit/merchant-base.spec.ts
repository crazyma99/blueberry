// 商家端基座单测（issue #14 · M1）：会话隔离 / 401 隔离 / 登录状态机 / 角色闸 / 传输状态补全。
// 变异靶点（见汇报「证据」）：①merchantKeyOf 去掉会话键重映射 ②去掉登录前角色闸 ③去掉 loginInFlight 防重 ④去掉 transport 状态补全。
import { describe, expect, it } from "vitest";
import { createMerchantSession } from "../../src/pkg-merchant/application/merchant-session";
import type { Session } from "../../src/infrastructure/http/client";
import { createMerchantTransport } from "../../src/pkg-merchant/infrastructure/merchant-transport";
import { createMerchantStorage, merchantKeyOf, MERCHANT_PROFILE_KEY, MERCHANT_SESSION_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";
import { evaluateMerchantRole, canApplySlotTemplate, hasPermission, ROLE_DENIED_MESSAGE } from "../../src/pkg-merchant/domain/merchant-auth";
import { merchantErrorMessage, isMerchantRateLimited } from "../../src/pkg-merchant/domain/merchant-error";
import type { HttpPort, HttpRequest, HttpResponse } from "../../src/ports/http";
import type { RequestContext, Result } from "../../src/ports/context";
import type { StoragePort } from "../../src/ports/storage";

function memStorage(): StoragePort & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
}

type Reply = { status?: number; code?: number | null; message?: string; data?: unknown };
function fakeTransport(responder: (req: HttpRequest) => Reply | Promise<Reply>) {
  const seen: HttpRequest[] = [];
  const port: HttpPort = {
    request: async <T,>(req: HttpRequest): Promise<Result<HttpResponse<T>>> => {
      seen.push(req);
      const r = await responder(req);
      return { ok: true, value: { status: r.status ?? 200, businessCode: r.code === undefined ? 200 : r.code, message: r.message, requestId: null, data: r.data as T } };
    },
    cancel: () => {},
  };
  return { seen, port };
}

const loginData = (over: Record<string, unknown> = {}) => ({
  token: "m-token-1",
  adminId: 7,
  merchantId: 3,
  username: "shopA",
  role: "merchant",
  displayName: "A 店",
  shopList: [],
  permissions: ["booking", "booking_slot", "booking_slot_template"],
  ...over,
});

function mkSession(backend: StoragePort, transport: HttpPort) {
  return createMerchantSession({ backend, transport, platform: "mp-weixin", environment: "trial", profileKey: "blueberry", appCode: "blueBerry" });
}

const cCtx: RequestContext = {
  platform: "mp-weixin", environment: "trial", brandId: "lanmei", requestId: "c-1", profileKey: "blueberry", appCode: "blueBerry", scopeRevision: 0, authRevision: 0,
};
const cSession: Session = { userId: "u9", token: "C-TOKEN", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" };

describe("存储隔离：商家键空间与 C 端零交集", () => {
  it("协调器会话键重映射到 lm.merchant.session.v1；legacy token 等其它键落 lm.merchant.x.*", () => {
    expect(merchantKeyOf("lm.session.v1")).toBe(MERCHANT_SESSION_KEY);
    expect(merchantKeyOf("token")).toBe("lm.merchant.x.token");
    expect(merchantKeyOf(MERCHANT_PROFILE_KEY)).toBe(MERCHANT_PROFILE_KEY);
    for (const k of ["lm.session.v1", "token", "userInfo", "lm.brand.v1", MERCHANT_PROFILE_KEY]) {
      expect(["lm.session.v1", "token", "userInfo", "brand_id", "lm.brand.v1", "lm.brands.v1"]).not.toContain(merchantKeyOf(k));
    }
  });
});

describe("⭐会话隔离：两套会话互不覆盖", () => {
  it("商家登录不覆盖 C 端 lm.session.v1 / token；C 端写会话也不影响商家会话", async () => {
    const backend = memStorage();
    backend.set("lm.session.v1", JSON.stringify(cSession));
    backend.set("token", "C-LEGACY-TOKEN");
    const t = fakeTransport(() => ({ data: loginData() }));
    const m = mkSession(backend, t.port);

    const r = await m.login("shopA", "pw");
    expect(r.ok).toBe(true);
    // C 端键原封不动
    expect(JSON.parse(backend.data.get("lm.session.v1")!).token).toBe("C-TOKEN");
    expect(backend.data.get("token")).toBe("C-LEGACY-TOKEN");
    // 商家会话落在独立键
    expect(JSON.parse(backend.data.get(MERCHANT_SESSION_KEY)!).token).toBe("m-token-1");
    expect(m.getState().loggedIn).toBe(true);

    // 反向：C 端换票写新会话，商家会话不变
    backend.set("lm.session.v1", JSON.stringify({ ...cSession, token: "C-TOKEN-2" }));
    expect(JSON.parse(backend.data.get(MERCHANT_SESSION_KEY)!).token).toBe("m-token-1");
    expect(m.getState().loggedIn).toBe(true);
  });

  it("商家退出登录只清商家键，C 端会话保持", async () => {
    const backend = memStorage();
    backend.set("lm.session.v1", JSON.stringify(cSession));
    backend.set("token", "C-LEGACY-TOKEN");
    const m = mkSession(backend, fakeTransport(() => ({ data: loginData() })).port);
    await m.login("shopA", "pw");
    m.logout();
    expect(m.getState().loggedIn).toBe(false);
    expect(backend.data.has(MERCHANT_SESSION_KEY)).toBe(false);
    expect(backend.data.has(MERCHANT_PROFILE_KEY)).toBe(false);
    expect(JSON.parse(backend.data.get("lm.session.v1")!).token).toBe("C-TOKEN");
    expect(backend.data.get("token")).toBe("C-LEGACY-TOKEN");
  });

  it("⭐商家 401 只作废商家会话：对 C 端键（含与商家 token 同值的 legacy token）**零写入、零删除**（真实写入监听，非空断言）", async () => {
    const inner = memStorage();
    // 构造最坏情形：C 端 legacy token 与商家 token 同值（共用协调器的 401 自愈会按同 token 清 legacy 键）
    inner.set("token", "m-token-1");
    inner.set("lm.session.v1", JSON.stringify(cSession));
    // 监听**登录之后**对后端的所有写/删：任何落在 lm.merchant. 命名空间之外的操作都算污染 C 端
    const ops: string[] = [];
    let spying = false;
    const backend: StoragePort = {
      get: (k) => inner.get(k),
      set: (k, v) => { if (spying) ops.push("set:" + k); inner.set(k, v); },
      remove: (k) => { if (spying) ops.push("remove:" + k); inner.remove(k); },
    };
    let respondWith401 = false;
    const t = fakeTransport((req) => {
      if (req.url === "/auth/login") return { data: loginData() };
      return respondWith401 ? { status: 401, code: 401, message: "Token 已过期或无效，请重新登录" } : { data: { list: [], total: 0 } };
    });
    const m = mkSession(backend, t.port);
    spying = true;
    await m.login("shopA", "pw");
    respondWith401 = true;
    const res = await m.client.request({ method: "GET", url: "/booking/bookings", authRequired: true, context: m.nextContext() });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("AUTH_EXPIRED");

    // 监听必须真的看见了商家侧的写与删（否则下面「零污染」可能是监听失效造成的假绿）
    expect(ops).toContain("set:" + MERCHANT_SESSION_KEY);
    expect(ops).toContain("remove:" + MERCHANT_SESSION_KEY);
    const pollution = ops.filter((o) => !o.slice(o.indexOf(":") + 1).startsWith("lm.merchant."));
    expect(pollution, "污染 C 端键的操作：" + pollution.join(",")).toEqual([]);
    expect(JSON.parse(inner.data.get("lm.session.v1")!).token).toBe("C-TOKEN");
    expect(inner.data.get("token")).toBe("m-token-1");
    expect(inner.data.has(MERCHANT_SESSION_KEY)).toBe(false);
    expect(m.getState().loggedIn).toBe(false);
  });

  it("商家请求带商家 Bearer、不带 X-Brand-Id（brandId 恒 null）；C 端上下文的 brandId 不会泄漏进来", async () => {
    const backend = memStorage();
    const t = fakeTransport(() => ({ data: loginData() }));
    const m = mkSession(backend, t.port);
    await m.login("shopA", "pw");
    t.seen.length = 0;
    await m.client.request({ method: "GET", url: "/booking/slots", authRequired: true, context: m.nextContext() });
    const h = t.seen[0].headers ?? {};
    expect(h.Authorization).toBe("Bearer m-token-1");
    expect("X-Brand-Id" in h).toBe(false);
    expect(h["X-Channel"]).toBe("wx");
    void cCtx;
  });

  it("未登录发商家请求 ⇒ AUTH_EXPIRED（不挂起、不发起任何网络请求）", async () => {
    const t = fakeTransport(() => ({ data: {} }));
    const m = mkSession(memStorage(), t.port);
    const res = await m.client.request({ method: "GET", url: "/booking/bookings", authRequired: true, context: m.nextContext() });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("AUTH_EXPIRED");
    expect(t.seen).toEqual([]);
  });
});

describe("登录状态机", () => {
  it("空用户名/空密码 ⇒ invalid-input，不发请求", async () => {
    const t = fakeTransport(() => ({ data: loginData() }));
    const m = mkSession(memStorage(), t.port);
    expect((await m.login("  ", "pw")).ok).toBe(false);
    expect((await m.login("u", "")).ok).toBe(false);
    expect(t.seen).toEqual([]);
  });

  it("登录请求：POST /auth/login，body 仅 {username,password}，不带 Authorization，never 重放", async () => {
    const t = fakeTransport(() => ({ data: loginData() }));
    const m = mkSession(memStorage(), t.port);
    await m.login(" shopA ", "pw1");
    expect(t.seen[0].method).toBe("POST");
    expect(t.seen[0].url).toBe("/auth/login");
    expect(t.seen[0].body).toEqual({ username: "shopA", password: "pw1" });
    expect((t.seen[0].headers ?? {}).Authorization).toBeUndefined();
    expect(t.seen[0].replayPolicy).toBe("never");
  });

  it("失败＝HTTP200+code=500：原样展示后端中文 message；不落盘任何会话", async () => {
    const backend = memStorage();
    const m = mkSession(backend, fakeTransport(() => ({ code: 500, message: "用户名不存在、密码错误或账号已禁用" })).port);
    const r = await m.login("x", "y");
    expect(r).toEqual({ ok: false, kind: "failed", message: "用户名不存在、密码错误或账号已禁用" });
    expect(backend.data.size).toBe(0);
  });

  it("限流 HTTP 429 ⇒ rate-limited 专用文案", async () => {
    const m = mkSession(memStorage(), fakeTransport(() => ({ status: 429, code: 429, message: "请求过于频繁，请稍后再试" })).port);
    const r = await m.login("x", "y");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("rate-limited");
      expect(r.message).toContain("1 分钟");
    }
  });

  it("⭐角色闸：超管/平台角色或无 merchantId ⇒ denied，且不落盘会话/资料（变异：去掉闸即红）", async () => {
    for (const over of [{ role: "super_admin" }, { role: "platform_operator", merchantId: 3 }, { role: "merchant", merchantId: null }, { role: "merchant", merchantId: 0 }]) {
      const backend = memStorage();
      const m = mkSession(backend, fakeTransport(() => ({ data: loginData(over) })).port);
      const r = await m.login("x", "y");
      expect(r.ok, JSON.stringify(over)).toBe(false);
      if (!r.ok) {
        expect(r.kind).toBe("denied");
        expect(r.message).toBe(ROLE_DENIED_MESSAGE);
      }
      expect(backend.data.size, JSON.stringify(over)).toBe(0);
      expect(m.getState().loggedIn).toBe(false);
    }
  });

  it("放行：merchant 与带 merchantId 的 operator* 运营类角色", async () => {
    for (const role of ["merchant", "operator", "operator_lite"]) {
      const m = mkSession(memStorage(), fakeTransport(() => ({ data: loginData({ role }) })).port);
      const r = await m.login("x", "y");
      expect(r.ok, role).toBe(true);
    }
  });

  it("⭐登录防重：进行中再次点击不再发第二次请求（变异：去掉 loginInFlight 即红）", async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    const t = fakeTransport(async () => { await gate; return { data: loginData() }; });
    const m = mkSession(memStorage(), t.port);
    const p1 = m.login("a", "b");
    const p2 = m.login("a", "b");
    expect((await p2).ok).toBe(false);
    release();
    expect((await p1).ok).toBe(true);
    expect(t.seen.length).toBe(1);
  });

  it("响应缺 token ⇒ 登录失败（不落盘）", async () => {
    const backend = memStorage();
    const m = mkSession(backend, fakeTransport(() => ({ data: loginData({ token: "" }) })).port);
    expect((await m.login("a", "b")).ok).toBe(false);
    expect(backend.data.size).toBe(0);
  });

  it("重启恢复：同一存储新建 session 实例仍为已登录；资料损坏 ⇒ 视为未登录", async () => {
    const backend = memStorage();
    const t = fakeTransport(() => ({ data: loginData() }));
    await mkSession(backend, t.port).login("a", "b");
    expect(mkSession(backend, t.port).getState().loggedIn).toBe(true);
    backend.data.set(MERCHANT_PROFILE_KEY, "{bad");
    expect(mkSession(backend, t.port).getState().loggedIn).toBe(false);
  });
});

describe("merchant-transport：HTTP 状态补全（HTTP 状态与 body.code 两条线）", () => {
  const inner = (status: number, code: number | null): HttpPort => ({
    request: async <T,>() => ({ ok: true, value: { status, businessCode: code, requestId: null, data: null as T } }) as Result<HttpResponse<T>>,
    cancel: () => {},
  });
  const call = (p: HttpPort) => p.request<unknown>({ method: "GET", url: "/x", timeoutMs: 1, replayPolicy: "never", context: cCtx });

  it("⭐非 JSON 的 429/403/502（businessCode=null）被补成 HTTP 状态；401 不动；已有 body.code 原样（变异：去掉补全即红）", async () => {
    for (const st of [429, 403, 502]) {
      const r = await call(createMerchantTransport(inner(st, null)));
      expect(r.ok && r.value.businessCode).toBe(st);
    }
    const r401 = await call(createMerchantTransport(inner(401, null)));
    expect(r401.ok && r401.value.businessCode).toBeNull();
    const r500 = await call(createMerchantTransport(inner(200, 500)));
    expect(r500.ok && r500.value.businessCode).toBe(500);
    const r200 = await call(createMerchantTransport(inner(200, 200)));
    expect(r200.ok && r200.value.businessCode).toBe(200);
  });
});

describe("domain：角色/权限/错误文案", () => {
  it("evaluateMerchantRole 边界", () => {
    expect(evaluateMerchantRole({ role: "merchant", merchantId: 1 }).ok).toBe(true);
    expect(evaluateMerchantRole({ role: " merchant ", merchantId: 1 }).ok).toBe(true);
    expect(evaluateMerchantRole({ role: "operator", merchantId: 1 }).ok).toBe(true);
    expect(evaluateMerchantRole({ role: "super_admin", merchantId: 1 }).ok).toBe(false);
    expect(evaluateMerchantRole({ role: "merchant", merchantId: null }).ok).toBe(false);
    expect(evaluateMerchantRole({ role: "", merchantId: 1 }).ok).toBe(false);
  });

  it("权限判断：精确匹配；profile 缺失 fail-closed；模板套用需模板权限且需档期写权限", () => {
    const p = { permissions: ["booking", "booking_slot_template"] };
    expect(hasPermission(p, "booking")).toBe(true);
    expect(hasPermission(p, "book")).toBe(false);
    expect(hasPermission(null, "booking")).toBe(false);
    expect(canApplySlotTemplate(p)).toBe(false);
    expect(canApplySlotTemplate({ permissions: ["booking_slot_template", "booking_slot"] })).toBe(true);
  });

  it("错误文案：401/403/429/网络固定中文；业务失败原样；无 message 用兜底", () => {
    expect(merchantErrorMessage({ kind: "AUTH_EXPIRED", message: "unauthorized" })).toBe("登录已失效，请重新登录");
    expect(merchantErrorMessage({ kind: "BUSINESS", businessCode: 403, message: "x" })).toBe("无权限执行此操作");
    expect(merchantErrorMessage({ kind: "BUSINESS", businessCode: 429, message: "x" })).toBe("操作过于频繁，请稍后再试");
    expect(merchantErrorMessage({ kind: "NETWORK", message: "transport failure: network" })).toBe("网络异常，请检查网络后重试");
    expect(merchantErrorMessage({ kind: "BUSINESS", businessCode: 500, message: "该时间段已存在" })).toBe("该时间段已存在");
    expect(merchantErrorMessage({ kind: "BUSINESS", businessCode: 500, message: " " }, "兜底")).toBe("兜底");
    expect(isMerchantRateLimited({ kind: "BUSINESS", businessCode: 429, message: "" })).toBe(true);
  });
});

describe("createMerchantStorage 读写经重映射", () => {
  it("写 lm.session.v1 落 lm.merchant.session.v1；读同理；remove 同理", () => {
    const b = memStorage();
    const s = createMerchantStorage(b);
    s.set("lm.session.v1", "A");
    expect(b.data.get(MERCHANT_SESSION_KEY)).toBe("A");
    expect(b.data.has("lm.session.v1")).toBe(false);
    expect(s.get("lm.session.v1")).toBe("A");
    s.remove("lm.session.v1");
    expect(b.data.size).toBe(0);
  });
});
