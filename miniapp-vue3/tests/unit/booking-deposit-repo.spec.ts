// 预约保证金仓储新增方法：请求形状（冻结契约）＋服务端响应防御性规整（deposit 缺失当 null、pay 缺失当 null、
// booking-config 缺字段给安全默认 enabled=false）。
import { describe, expect, it } from "vitest";
import { createBookingRepository } from "../../src/infrastructure/repositories";
import type { RequestContext } from "../../src/ports/context";
import type { ClientRequestInput } from "../../src/infrastructure/http/client";

const ctx: RequestContext = {
  platform: "mp-weixin",
  environment: "develop",
  brandId: null,
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

describe("getBookingConfig：公开、幂等，不带 authRequired", () => {
  it("请求形状：GET /api/shops/:id/booking-config，idempotent，无 authRequired", async () => {
    const f = fakeClient(() => ({ ok: true, value: {} }));
    await createBookingRepository({ client: f.client }).getBookingConfig(ctx, 12);
    expect(f.calls[0]).toMatchObject({ method: "GET", url: "/api/shops/12/booking-config", replayPolicy: "idempotent" });
    expect(f.calls[0].authRequired).toBeUndefined();
  });

  it("完整响应原样规整", async () => {
    const f = fakeClient(() => ({
      ok: true,
      value: {
        deposit: { enabled: true, amountFen: 5000, freeCancelHours: 24, lateCancelForfeitPct: 50, noShowForfeitPct: 100, refundTrigger: "auto_on_complete" },
        payHoldMinutes: 10,
        subscribeTemplates: { result: "T1", done: "T2" },
      },
    }));
    const r = await createBookingRepository({ client: f.client }).getBookingConfig(ctx, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value).toEqual({
      deposit: { enabled: true, amountFen: 5000, freeCancelHours: 24, lateCancelForfeitPct: 50, noShowForfeitPct: 100, refundTrigger: "auto_on_complete" },
      payHoldMinutes: 10,
      subscribeTemplates: { result: "T1", done: "T2" },
    });
  });

  it("门店未开启/不存在/缺字段 → enabled=false 且其余安全默认，模板缺失为空串", async () => {
    const f = fakeClient(() => ({ ok: true, value: {} }));
    const r = await createBookingRepository({ client: f.client }).getBookingConfig(ctx, 1);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value).toEqual({
      deposit: { enabled: false, amountFen: 0, freeCancelHours: 0, lateCancelForfeitPct: 0, noShowForfeitPct: 0, refundTrigger: "manual" },
      payHoldMinutes: 0,
      subscribeTemplates: { result: "", done: "" },
    });
  });

  it("非法 refundTrigger 回落 manual；非数字金额归 0", async () => {
    const f = fakeClient(() => ({
      ok: true,
      value: { deposit: { enabled: true, amountFen: "bad", refundTrigger: "weird" } },
    }));
    const r = await createBookingRepository({ client: f.client }).getBookingConfig(ctx, 1);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value.deposit.refundTrigger).toBe("manual");
    expect(r.value.deposit.amountFen).toBe(0);
  });
});

describe("getBooking：本人单条、幂等、含 deposit 规整", () => {
  it("请求形状：GET /api/bookings/:id，authRequired、idempotent", async () => {
    const f = fakeClient(() => ({ ok: true, value: { id: 5 } }));
    await createBookingRepository({ client: f.client }).getBooking(ctx, 5);
    expect(f.calls[0]).toMatchObject({ method: "GET", url: "/api/bookings/5", authRequired: true, replayPolicy: "idempotent" });
  });

  it("deposit 缺失 → null", async () => {
    const f = fakeClient(() => ({ ok: true, value: { id: 5, status: "confirmed" } }));
    const r = await createBookingRepository({ client: f.client }).getBooking(ctx, 5);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value.deposit).toBeNull();
  });

  it("deposit 存在但缺字段 → 补安全默认（金额 0、payExpireTime/settleReason 空串）", async () => {
    const f = fakeClient(() => ({ ok: true, value: { id: 5, status: "awaiting_payment", deposit: { status: "pending" } } }));
    const r = await createBookingRepository({ client: f.client }).getBooking(ctx, 5);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value.deposit).toEqual({ status: "pending", amountFen: 0, refundFen: 0, forfeitFen: 0, payExpireTime: "", settleReason: "" });
  });
});

describe("payBooking：继续支付，never 重放，pay 规整", () => {
  it("请求形状：POST /api/bookings/:id/pay，authRequired、never", async () => {
    const f = fakeClient(() => ({ ok: true, value: { id: 7, deposit: null, pay: null } }));
    await createBookingRepository({ client: f.client }).payBooking(ctx, 7);
    expect(f.calls[0]).toMatchObject({ method: "POST", url: "/api/bookings/7/pay", authRequired: true, replayPolicy: "never" });
  });

  it("pay 完整 → 透传；pay 缺关键字段 → null（不造半截假单据）", async () => {
    const full = fakeClient(() => ({
      ok: true,
      value: { id: 7, deposit: { status: "pending" }, pay: { outTradeNo: "T1", prepayId: "p", appId: "a", timeStamp: "1", nonceStr: "n", package: "pkg", signType: "RSA", paySign: "s" } },
    }));
    const r1 = await createBookingRepository({ client: full.client }).payBooking(ctx, 7);
    if (!r1.ok) throw new Error("unreachable");
    expect(r1.value.pay).toMatchObject({ outTradeNo: "T1", prepayId: "p", paySign: "s" });

    const missing = fakeClient(() => ({ ok: true, value: { id: 7, pay: { outTradeNo: "T1" } } })); // 无 prepayId/paySign
    const r2 = await createBookingRepository({ client: missing.client }).payBooking(ctx, 7);
    if (!r2.ok) throw new Error("unreachable");
    expect(r2.value.pay).toBeNull();
  });
});

describe("getCancelPreview：本人、幂等，缺字段给 0", () => {
  it("请求形状：GET /api/bookings/:id/cancel-preview，authRequired、idempotent", async () => {
    const f = fakeClient(() => ({ ok: true, value: {} }));
    await createBookingRepository({ client: f.client }).getCancelPreview(ctx, 9);
    expect(f.calls[0]).toMatchObject({ method: "GET", url: "/api/bookings/9/cancel-preview", authRequired: true, replayPolicy: "idempotent" });
  });

  it("缺字段 → refundFen/forfeitFen=0、reason=''", async () => {
    const f = fakeClient(() => ({ ok: true, value: {} }));
    const r = await createBookingRepository({ client: f.client }).getCancelPreview(ctx, 9);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value).toEqual({ refundFen: 0, forfeitFen: 0, reason: "" });
  });

  it("完整响应透传", async () => {
    const f = fakeClient(() => ({ ok: true, value: { refundFen: 2500, forfeitFen: 2500, reason: "cancel_late" } }));
    const r = await createBookingRepository({ client: f.client }).getCancelPreview(ctx, 9);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value).toEqual({ refundFen: 2500, forfeitFen: 2500, reason: "cancel_late" });
  });
});

describe("createBooking：返回带 pay（规整），列表 deposit 规整", () => {
  it("createBooking 响应 pay 缺失 → null、deposit 缺失 → null", async () => {
    const f = fakeClient(() => ({ ok: true, value: { id: 1, status: "pending" } }));
    const r = await createBookingRepository({ client: f.client }).createBooking(ctx, {
      shopId: 1, slotId: 1, date: "2026-11-05", customerName: "张三", customerPhone: "13800138000", guestCount: 1,
    });
    if (!r.ok) throw new Error("unreachable");
    expect(r.value.pay).toBeNull();
    expect(r.value.deposit).toBeNull();
  });

  it("listBookings：每项 deposit 缺失规整为 null，其余字段原样", async () => {
    const f = fakeClient(() => ({ ok: true, value: { list: [{ id: 1, status: "pending" }, { id: 2, status: "awaiting_payment", deposit: { status: "pending", amountFen: 5000 } }], total: 2, page: 1, pageSize: 20 } }));
    const r = await createBookingRepository({ client: f.client }).listBookings(ctx);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value.list[0].deposit).toBeNull();
    expect(r.value.list[1].deposit).toMatchObject({ status: "pending", amountFen: 5000, refundFen: 0 });
  });
});

describe("防御性规整：加固项（CR）", () => {
  it("deposit 缺 status → 记为 unknown（不默认 pending，否则会冒出可点的「继续支付」）", async () => {
    const f = fakeClient(() => ({ ok: true, value: { id: 5, status: "awaiting_payment", deposit: { amountFen: 5000 } } }));
    const r = await createBookingRepository({ client: f.client }).getBooking(ctx, 5);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value.deposit?.status).toBe("unknown");
  });

  it("pay 缺任一调起支付必需字段（timeStamp/nonceStr/package/signType/paySign/prepayId）→ null，不拉起必然失败的支付", async () => {
    const full = { outTradeNo: "T1", prepayId: "p", appId: "a", timeStamp: "1", nonceStr: "n", package: "pkg", signType: "RSA", paySign: "s" };
    for (const k of ["prepayId", "timeStamp", "nonceStr", "package", "signType", "paySign"]) {
      const bad = { ...full, [k]: "" };
      const f = fakeClient(() => ({ ok: true, value: { id: 7, status: "awaiting_payment", pay: bad } }));
      const r = await createBookingRepository({ client: f.client }).payBooking(ctx, 7);
      if (!r.ok) throw new Error("unreachable");
      expect(r.value.pay, k).toBeNull();
    }
  });
});

