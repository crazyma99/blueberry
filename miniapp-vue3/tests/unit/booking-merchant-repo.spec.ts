// 预约商家收敛（契约 2026-11-06 §3）：新端点仓储方法的请求形状与防御性规整。
// 商家由请求头 X-Brand-Id 解析——头由 http client 按 RequestContext.brandId 注入，仓储**不拼头、不带 shopId**。
// 用假 client 验证，不假设后端已就绪。
import { describe, expect, it } from "vitest";
import { createBookingRepository } from "../../src/infrastructure/repositories/bookings";
import type { RequestContext } from "../../src/ports/context";
import type { ClientRequestInput } from "../../src/infrastructure/http/client";

const ctx: RequestContext = {
  platform: "mp-weixin",
  environment: "develop",
  brandId: "BRAND_A",
  requestId: "r1",
  profileKey: "blueberry",
  appCode: "x",
  scopeRevision: 0,
  authRevision: 0,
};

function fakeClient(respond: (input: ClientRequestInput) => unknown) {
  const calls: ClientRequestInput[] = [];
  return {
    calls,
    client: {
      request: async <T>(input: ClientRequestInput) => {
        calls.push(input);
        return respond(input) as { ok: true; value: T } | { ok: false; error: never };
      },
    },
  };
}

const CFG_ON = {
  merchantName: " 红河水乡 ",
  deposit: { enabled: true, amountFen: 5000, freeCancelHours: 24, lateCancelForfeitPct: 50, noShowForfeitPct: 100, refundTrigger: "auto_on_complete" },
  payHoldMinutes: 10,
  subscribeTemplates: { result: "T1", done: "T2" },
};

describe("getMerchantSlots：GET /api/booking/slots?date=", () => {
  it("请求形状：公开、幂等、带 date；路径不含 shopId；不自拼品牌头（交给 client 经 context 注入）", async () => {
    const f = fakeClient(() => ({ ok: true, value: { date: "2026-11-07", slots: [] } }));
    await createBookingRepository({ client: f.client }).getMerchantSlots(ctx, "2026-11-07");
    expect(f.calls[0]).toMatchObject({ method: "GET", url: "/api/booking/slots", query: { date: "2026-11-07" }, replayPolicy: "idempotent", context: ctx });
    expect(f.calls[0].authRequired).toBeUndefined();
    expect(f.calls[0]).not.toHaveProperty("headers");
    expect(JSON.stringify(f.calls[0].query)).not.toContain("shop");
  });

  it("防御性规整：reason 缺失/未知归一为空串；slots 非数组当空数组", async () => {
    const f = fakeClient(() => ({
      ok: true,
      value: {
        date: "2026-11-07",
        slots: [
          { slotId: 1, startTime: "09:00", endTime: "10:00", capacity: 3, used: 3, remaining: 0, bookable: false, reason: "full" },
          { slotId: 2, startTime: "10:00", endTime: "11:00", capacity: 3, used: 0, remaining: 3, bookable: true }, // 无 reason
          { slotId: 3, startTime: "11:00", endTime: "12:00", capacity: 3, used: 0, remaining: 3, bookable: true, reason: 42 },
        ],
      },
    }));
    const r = await createBookingRepository({ client: f.client }).getMerchantSlots(ctx, "2026-11-07");
    if (!r.ok) throw new Error("unreachable");
    expect(r.value.slots.map((s) => s.reason)).toEqual(["full", "", ""]);

    const bad = fakeClient(() => ({ ok: true, value: { date: "d", slots: "oops" } }));
    const r2 = await createBookingRepository({ client: bad.client }).getMerchantSlots(ctx, "d");
    if (!r2.ok) throw new Error("unreachable");
    expect(r2.value.slots).toEqual([]);
  });

  it("业务失败原样透传（如「请先选择入驻门店」）", async () => {
    const err = { ok: false, error: { kind: "BUSINESS", businessCode: 500, message: "请先选择入驻门店", requestId: "r", retryable: false } };
    const f = fakeClient(() => err);
    const r = await createBookingRepository({ client: f.client }).getMerchantSlots(ctx, "2026-11-07");
    expect(r).toEqual(err);
  });
});

describe("getMerchantBookingConfig：GET /api/booking/config", () => {
  it("请求形状：公开、幂等、无参数、无 authRequired", async () => {
    const f = fakeClient(() => ({ ok: true, value: CFG_ON }));
    await createBookingRepository({ client: f.client }).getMerchantBookingConfig(ctx);
    expect(f.calls[0]).toMatchObject({ method: "GET", url: "/api/booking/config", replayPolicy: "idempotent", context: ctx });
    expect(f.calls[0].authRequired).toBeUndefined();
    expect(f.calls[0].query).toBeUndefined();
  });

  it("完整响应：merchantName 去首尾空白后透传，其余字段形态不变", async () => {
    const f = fakeClient(() => ({ ok: true, value: CFG_ON }));
    const r = await createBookingRepository({ client: f.client }).getMerchantBookingConfig(ctx);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value).toEqual({
      merchantName: "红河水乡",
      deposit: { enabled: true, amountFen: 5000, freeCancelHours: 24, lateCancelForfeitPct: 50, noShowForfeitPct: 100, refundTrigger: "auto_on_complete" },
      payHoldMinutes: 10,
      subscribeTemplates: { result: "T1", done: "T2" },
    });
  });

  it("merchantName 缺失/非字符串 → \"\"（页面标题回落「到店预约」）；其余缺字段给安全默认（enabled=false）", async () => {
    for (const v of [{}, { merchantName: null }, { merchantName: 123 }]) {
      const f = fakeClient(() => ({ ok: true, value: v }));
      const r = await createBookingRepository({ client: f.client }).getMerchantBookingConfig(ctx);
      if (!r.ok) throw new Error("unreachable");
      expect(r.value.merchantName).toBe("");
      expect(r.value.deposit.enabled).toBe(false);
      expect(r.value.subscribeTemplates).toEqual({ result: "", done: "" });
    }
  });

  it("无效配置（enabled=true 但金额 ≤0）→ 按拉取失败处理（可重试），不渲染 ¥0.00", async () => {
    const f = fakeClient(() => ({ ok: true, value: { merchantName: "x", deposit: { enabled: true, amountFen: 0 } } }));
    const r = await createBookingRepository({ client: f.client }).getMerchantBookingConfig(ctx);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error.retryable).toBe(true);
  });
});

describe("POST /api/bookings 与 BookingView（契约 §3.2/§3.3）", () => {
  it("createBooking 的 body 不含 shopId（即使调用方多传也不透出）；商家取自品牌头", async () => {
    const f = fakeClient(() => ({ ok: true, value: { id: 1, status: "pending" } }));
    await createBookingRepository({ client: f.client }).createBooking(ctx, {
      slotId: 7, date: "2026-11-07", customerName: "张三", customerPhone: "13800138000", guestCount: 2,
      ...({ shopId: 99 } as object),
    } as never);
    // 仓储按白名单拼 body：未知字段 shopId 不入 body
    expect(f.calls[0].body).not.toHaveProperty("shopId");
    expect(f.calls[0]).toMatchObject({ method: "POST", url: "/api/bookings", authRequired: true, replayPolicy: "never" });
  });

  it("BookingView.merchantId：缺失/非法当 0，合法值透传（create / get / list / cancel 一致）", async () => {
    const repo = (v: unknown) => createBookingRepository({ client: fakeClient(() => ({ ok: true, value: v })).client });
    const params = { slotId: 1, date: "2026-11-07", customerName: "a", customerPhone: "13800138000", guestCount: 1 };
    const pick = async <T,>(p: Promise<{ ok: boolean; value?: T }>) => {
      const r = await p;
      if (!r.ok) throw new Error("unreachable");
      return r.value as T;
    };
    expect((await pick(repo({ id: 1 }).createBooking(ctx, params))).merchantId).toBe(0);
    expect((await pick(repo({ id: 1, merchantId: 7 }).createBooking(ctx, params))).merchantId).toBe(7);
    expect((await pick(repo({ id: 1, merchantId: "7" }).getBooking(ctx, 1))).merchantId).toBe(0);
    expect((await pick(repo({ id: 1, merchantId: 9 }).cancelBooking(ctx, 1))).merchantId).toBe(9);
    const list = await pick(repo({ list: [{ id: 1 }, { id: 2, merchantId: 5 }], total: 2, page: 1, pageSize: 20 }).listBookings(ctx));
    expect(list.list.map((b) => b.merchantId)).toEqual([0, 5]);
  });

  it("旧版按 shopId 的方法仍保留且路径不变（旧版兼容，页面不再使用）", async () => {
    const f = fakeClient(() => ({ ok: true, value: { date: "d", slots: [] } }));
    const repo = createBookingRepository({ client: f.client });
    await repo.getSlots(ctx, 12, "d");
    await repo.getBookingConfig(ctx, 12);
    expect(f.calls.map((c) => c.url)).toEqual(["/api/shops/12/slots", "/api/shops/12/booking-config"]);
  });
});
