// payAndConfirm 单测：支付回调不作依据（只信服务端 deposit.status）。注入 sleep/now 快速运行。
// 覆盖：requestPayment ok 但服务端仍 pending 轮询到超时 → 不得 paid；requestPayment 失败但服务端已 paid → 仍 paid；
//      取消仍 pending → cancelled；closed → closed；网络抖动继续轮询；busy 防重；unsupported；authExpired。
import { describe, expect, it, vi } from "vitest";
import { createDepositPayFlow, type BookingReaderLike } from "../../src/application/booking-deposit-pay";
import { PayGuard } from "../../src/domain/payment-state";
import type { PaymentsPort, PaymentRequestResult } from "../../src/platform/weixin/payments";
import type { BookingView } from "../../src/infrastructure/repositories/bookings";
import type { DepositStatus } from "../../src/domain/booking-deposit";
import type { RequestContext } from "../../src/ports/context";

const ctx: RequestContext = {
  platform: "mp-weixin",
  environment: "trial",
  brandId: null,
  requestId: "r",
  profileKey: "blueberry",
  appCode: "x",
  scopeRevision: 1,
  authRevision: 1,
};

const pay = {
  outTradeNo: "T1",
  prepayId: "p",
  appId: "a",
  timeStamp: "1",
  nonceStr: "n",
  package: "pkg",
  signType: "RSA",
  paySign: "s",
};

function bk(depositStatus: DepositStatus | null, status: BookingView["status"] = "awaiting_payment"): BookingView {
  return {
    id: 1, shopId: 0, merchantId: 7, shopName: "s", slotId: 1, startTime: "", endTime: "", date: "2026-11-05",
    customerName: "x", customerPhone: "13800138000", guestCount: 1, remark: "", status, channel: "wx", createTime: "",
    deposit: depositStatus == null ? null : { status: depositStatus, amountFen: 5000, refundFen: 0, forfeitFen: 0, payExpireTime: "", settleReason: "" },
  };
}

/** 固定时钟：调用 sleep 时推进虚拟时间，使超时可在无真实计时下触发 */
function fakeClock(startMs = 0) {
  let t = startMs;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

function payments(result: PaymentRequestResult): PaymentsPort {
  return { requestPayment: async () => result };
}

/** 脚本化 getBooking：第 i 次调用返回 scripts[min(i, last)] */
function reader(scripts: Array<{ ok: true; value: BookingView } | { ok: false; error: { kind: string } }>): BookingReaderLike & { count: () => number } {
  let i = 0;
  return {
    count: () => i,
    getBooking: async () => scripts[Math.min(i++, scripts.length - 1)],
  };
}
const ok = (b: BookingView) => ({ ok: true as const, value: b });
const err = (kind: string) => ({ ok: false as const, error: { kind } });

describe("payAndConfirm：只信服务端状态（支付回调不作依据）", () => {
  it("requestPayment 成功、服务端 deposit=paid → paid", async () => {
    const clock = fakeClock();
    const flow = createDepositPayFlow({ bookings: reader([ok(bk("paid"))]), payments: payments({ ok: true }), ...clock });
    const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r.ok).toBe(true);
    expect(r.phase).toBe("paid");
  });

  it("【守卫】requestPayment 成功，但服务端一直 pending，轮询到超时 → 不得 paid（timeout）", async () => {
    const clock = fakeClock();
    const flow = createDepositPayFlow({
      bookings: reader([ok(bk("pending"))]),
      payments: payments({ ok: true }),
      poll: { intervalMs: 1000, timeoutMs: 3000 },
      ...clock,
    });
    const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("timeout");
    expect(r.phase).toBeUndefined(); // 绝不 paid
  });

  it("requestPayment 失败(failed)，但服务端已 paid → 仍 paid（短轮询命中）", async () => {
    const clock = fakeClock();
    const flow = createDepositPayFlow({
      bookings: reader([ok(bk("paid"))]),
      payments: payments({ ok: false, reason: "failed" }),
      ...clock,
    });
    const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r.ok).toBe(true);
    expect(r.phase).toBe("paid");
  });

  it("用户取消，短轮询仍 pending → cancelled（留在待支付）", async () => {
    const clock = fakeClock();
    const flow = createDepositPayFlow({
      bookings: reader([ok(bk("pending")), ok(bk("pending"))]),
      payments: payments({ ok: false, reason: "cancelled" }),
      ...clock,
    });
    const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r).toMatchObject({ ok: false, reason: "cancelled" });
  });

  it("支付失败，短轮询仍 pending → payment-failed", async () => {
    const clock = fakeClock();
    const flow = createDepositPayFlow({
      bookings: reader([ok(bk("pending")), ok(bk("pending"))]),
      payments: payments({ ok: false, reason: "failed" }),
      ...clock,
    });
    const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r).toMatchObject({ ok: false, reason: "payment-failed" });
  });

  it("轮询见 deposit=closed（后台超时取消）→ closed", async () => {
    const clock = fakeClock();
    const flow = createDepositPayFlow({ bookings: reader([ok(bk("closed"))]), payments: payments({ ok: true }), ...clock });
    const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r).toMatchObject({ ok: false, reason: "closed" });
  });

  it("轮询见 booking.status=cancelled → closed", async () => {
    const clock = fakeClock();
    const flow = createDepositPayFlow({ bookings: reader([ok(bk("pending", "cancelled"))]), payments: payments({ ok: true }), ...clock });
    const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r).toMatchObject({ ok: false, reason: "closed" });
  });

  it("unsupported（非微信端/无能力）→ 不轮询，直接 unsupported", async () => {
    const clock = fakeClock();
    const rd = reader([ok(bk("pending"))]);
    const flow = createDepositPayFlow({ bookings: rd, payments: payments({ ok: false, reason: "unsupported" }), ...clock });
    const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r).toEqual({ ok: false, reason: "unsupported" });
    expect(rd.count()).toBe(0); // 未轮询服务端
  });

  it("网络抖动（单次 getBooking 失败非 auth）继续轮询，最终 paid", async () => {
    const clock = fakeClock();
    const flow = createDepositPayFlow({
      bookings: reader([err("NETWORK"), ok(bk("pending")), ok(bk("paid"))]),
      payments: payments({ ok: true }),
      poll: { intervalMs: 1000, timeoutMs: 30000 },
      ...clock,
    });
    const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r.ok).toBe(true);
    expect(r.phase).toBe("paid");
  });

  it("轮询中 auth 失效 → 立即终止并带 authExpired", async () => {
    const clock = fakeClock();
    const flow = createDepositPayFlow({
      bookings: reader([err("AUTH_EXPIRED")]),
      payments: payments({ ok: true }),
      ...clock,
    });
    const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r).toMatchObject({ ok: false, reason: "authExpired" });
  });

  it("并发防抖：同一 bookingId 在飞时再次调用 → busy（不重复拉起）", async () => {
    let release: () => void = () => undefined;
    const gateProm = new Promise<void>((r) => (release = r));
    let payCalls = 0;
    const payments2: PaymentsPort = {
      requestPayment: async () => {
        payCalls++;
        await gateProm;
        return { ok: true };
      },
    };
    const clock = fakeClock();
    const flow = createDepositPayFlow({ bookings: reader([ok(bk("paid"))]), payments: payments2, ...clock });
    const p1 = flow.payAndConfirm(ctx, { bookingId: 1, pay });
    const r2 = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r2).toEqual({ ok: false, reason: "busy" });
    release();
    const r1 = await p1;
    expect(r1.ok).toBe(true);
    expect(payCalls).toBe(1); // 第二次未拉起支付
  });

  it("gate 门闩被占用 → busy", async () => {
    const gate = new PayGuard();
    gate.tryBegin(); // 预先占用
    const clock = fakeClock();
    const flow = createDepositPayFlow({ bookings: reader([ok(bk("paid"))]), payments: payments({ ok: true }), gate, ...clock });
    const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r).toEqual({ ok: false, reason: "busy" });
  });

  it("面板回调兜底超时：既不 success 也不 fail 时不无限挂起；结果未知 ⇒ 向服务端确认，仍待支付则回 timeout（不能说「失败」，真实面板可能仍悬着）", async () => {
    vi.useFakeTimers();
    try {
      const clock = fakeClock();
      const neverResolve: PaymentsPort = { requestPayment: () => new Promise<PaymentRequestResult>(() => undefined) };
      const flow = createDepositPayFlow({
        bookings: reader([ok(bk("pending")), ok(bk("pending"))]),
        payments: neverResolve,
        payTimeoutMs: 120000,
        ...clock,
      });
      const p = flow.payAndConfirm(ctx, { bookingId: 1, pay });
      await vi.advanceTimersByTimeAsync(120000);
      const r = await p;
      expect(r).toMatchObject({ ok: false, reason: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("面板兜底超时后服务端其实已 paid → 以服务端为准判 paid", async () => {
    vi.useFakeTimers();
    try {
      const clock = fakeClock();
      const neverResolve: PaymentsPort = { requestPayment: () => new Promise<PaymentRequestResult>(() => undefined) };
      const flow = createDepositPayFlow({ bookings: reader([ok(bk("paid"))]), payments: neverResolve, payTimeoutMs: 1000, ...clock });
      const p = flow.payAndConfirm(ctx, { bookingId: 1, pay });
      await vi.advanceTimersByTimeAsync(1000);
      expect(await p).toMatchObject({ ok: true, phase: "paid" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("payAndConfirm：服务端终态分类与资源清理", () => {
  it("支付到账时保留期已过 ⇒ 服务端自动结算（deposit=refunding/refunded/forfeited/refund_abnormal）：不得当作预约成功，也不空轮询到超时 → closed", async () => {
    for (const st of ["refunding", "refunded", "forfeited", "refund_abnormal"] as const) {
      const clock = fakeClock();
      const rd = reader([ok(bk(st, "cancelled"))]);
      const flow = createDepositPayFlow({ bookings: rd, payments: payments({ ok: true }), ...clock });
      const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
      expect(r, st).toMatchObject({ ok: false, reason: "closed" });
      expect(rd.count(), st).toBe(1); // 一次命中即终止，不空转
    }
  });

  it("面板先于兜底超时返回时清掉兜底定时器（不留 120s 悬挂计时器）", async () => {
    vi.useFakeTimers();
    try {
      const clock = fakeClock();
      const flow = createDepositPayFlow({ bookings: reader([ok(bk("paid"))]), payments: payments({ ok: true }), ...clock });
      const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
      expect(r.ok).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("【守卫-单点】requestPayment 成功后若直接信回调则会判 paid；此用例要求服务端 pending 时绝不 paid（变异自证对象）", async () => {
    const clock = fakeClock();
    const rd = reader([ok(bk("pending"))]);
    const flow = createDepositPayFlow({
      bookings: rd,
      payments: payments({ ok: true }),
      poll: { intervalMs: 1000, timeoutMs: 2000 },
      ...clock,
    });
    const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r.ok).toBe(false);
    expect(rd.count()).toBeGreaterThanOrEqual(2); // 确实向服务端轮询了，而不是直接采信回调
  });
});

describe("payAndConfirm：状态归类的边界（CR 加固）", () => {
  it("服务端出现未知 deposit.status：不下结论（不误报已关闭），继续轮询直到 timeout", async () => {
    const clock = fakeClock();
    const rd = reader([ok(bk("brand-new-status" as never))]);
    const flow = createDepositPayFlow({
      bookings: rd,
      payments: payments({ ok: true }),
      poll: { intervalMs: 1000, timeoutMs: 3000 },
      ...clock,
    });
    const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r).toMatchObject({ ok: false, reason: "timeout" });
    expect(rd.count()).toBeGreaterThanOrEqual(3);
  });

  it("deposit=paid 但预约已 cancelled/expired（到账时保留期已过的竞态）：不得报「已支付」→ closed", async () => {
    for (const st of ["cancelled", "expired"] as const) {
      const clock = fakeClock();
      const flow = createDepositPayFlow({ bookings: reader([ok(bk("paid", st))]), payments: payments({ ok: true }), ...clock });
      const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
      expect(r, st).toMatchObject({ ok: false, reason: "closed" });
    }
  });

  it("【问题 10·时钟回拨】轮询期间系统时钟被向后调整（now 递减）：不靠时间收口也能在有限次内 timeout，次数 ≤ ceil(timeoutMs/intervalMs)+3", async () => {
    let t = 1_000_000;
    let calls = 0;
    // 逃生阀：若实现没有迭代上限则在第 201 次返回 AUTH_EXPIRED 强行收口，让用例以断言失败（而不是死循环）暴露问题
    const rd: BookingReaderLike & { count: () => number } = {
      count: () => calls,
      getBooking: async () => {
        calls++;
        return calls > 200 ? err("AUTH_EXPIRED") : ok(bk("pending"));
      },
    };
    const flow = createDepositPayFlow({
      bookings: rd,
      payments: payments({ ok: true }),
      poll: { intervalMs: 1000, timeoutMs: 30000 },
      now: () => (t -= 500), // 每次读时钟都往回拨：now()-startedAt 恒为负，纯时间判断永不超时
      sleep: async () => undefined,
    });
    const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r).toMatchObject({ ok: false, reason: "timeout" });
    expect(r.phase).toBeUndefined();
    expect(rd.count()).toBe(Math.ceil(30000 / 1000) + 3); // 33 次后按迭代上限收口
  });

  it("迭代上限不影响正常时钟：时间先到则按时间停（不多轮询）", async () => {
    const clock = fakeClock();
    const rd = reader([ok(bk("pending"))]);
    const flow = createDepositPayFlow({ bookings: rd, payments: payments({ ok: true }), poll: { intervalMs: 1000, timeoutMs: 3000 }, ...clock });
    const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r).toMatchObject({ ok: false, reason: "timeout" });
    expect(rd.count()).toBe(4); // t=0,1000,2000,3000 ⇒ 第 4 次读到 3000>=timeout 停
  });

  it("取消/失败后的确认轮询为 3 次（给微信异步到账通知留 2 个间隔），第 3 次才见 paid 也能判成功", async () => {
    const clock = fakeClock();
    const rd = reader([ok(bk("pending")), ok(bk("pending")), ok(bk("paid"))]);
    const flow = createDepositPayFlow({ bookings: rd, payments: payments({ ok: false, reason: "failed" }), ...clock });
    const r = await flow.payAndConfirm(ctx, { bookingId: 1, pay });
    expect(r).toMatchObject({ ok: true, phase: "paid" });
    expect(rd.count()).toBe(3);
  });
});
