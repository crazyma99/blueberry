// 预约保证金提交编排（application/booking-deposit-submit）单测：真实 submitUc + 真实 payFlow，仅仓储/支付/订阅为 fake，
// 用同一份调用日志断言「顺序不可换」：勾选守卫 → 订阅授权 → createBooking → requestPayment → getBooking 轮询。
// 三个守卫的变异自证对象：①勾选才可提交 ②订阅授权在 createBooking 之前 ③requestPayment 成功回调不作依据（见 booking-deposit-pay.spec）。
import { describe, expect, it, vi } from "vitest";
import { createSubmitBookingUseCase, type SubmitBookingParams } from "../../src/application/booking-flow";
import { createDepositPayFlow } from "../../src/application/booking-deposit-pay";
import { createDepositSubmitFlow, type DepositSubmitOptions } from "../../src/application/booking-deposit-submit";
import type { BookingView, CreateBookingResult, PayParams } from "../../src/infrastructure/repositories/bookings";
import type { PaymentRequestResult } from "../../src/platform/weixin/payments";
import type { DepositStatus } from "../../src/domain/booking-deposit";
import type { Session } from "../../src/infrastructure/http/client";
import type { RequestContext } from "../../src/ports/context";

const ctx: RequestContext = {
  platform: "mp-weixin",
  environment: "develop",
  brandId: null,
  requestId: "r",
  profileKey: "blueberry",
  appCode: "x",
  scopeRevision: 0,
  authRevision: 0,
};
const fullSession: Session = { userId: "1", token: "t", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" };
const silentSession: Session = { ...fullSession, kind: "silent" };

const input: SubmitBookingParams = {
  shopId: 1,
  slotId: 7,
  date: "2026-11-05",
  customerName: "张三",
  customerPhone: "13800138000",
  guestCount: 2,
};

const PAY: PayParams = { outTradeNo: "T1", prepayId: "p", appId: "a", timeStamp: "1", nonceStr: "n", package: "pkg", signType: "RSA", paySign: "s" };

function bk(status: BookingView["status"], dep: DepositStatus | null, extra: Partial<BookingView["deposit"] & object> = {}): BookingView {
  return {
    id: 9, shopId: 1, shopName: "红河水乡店", slotId: 7, startTime: "10:00", endTime: "11:00", date: "2026-11-05",
    customerName: "张三", customerPhone: "13800138000", guestCount: 2, remark: "", status, channel: "wx", createTime: "",
    deposit:
      dep == null
        ? null
        : { status: dep, amountFen: 5000, refundFen: 0, forfeitFen: 0, payExpireTime: "2026-11-05 12:10:00", settleReason: "", ...extra },
  };
}

const OPTS_ON: DepositSubmitOptions = {
  depositEnabled: true,
  agreed: true,
  templates: { result: "TPL-R", done: "TPL-D" },
  payHoldMinutes: 10,
};
const OPTS_OFF: DepositSubmitOptions = { depositEnabled: false, agreed: false, templates: { result: "", done: "" }, payHoldMinutes: 0 };

function harness(cfg: {
  createValue?: CreateBookingResult;
  createFail?: unknown;
  session?: Session;
  /** getBooking 轮询脚本：第 i 次返回 polls[min(i,last)] */
  polls?: BookingView[];
  payResult?: PaymentRequestResult;
  subscribeThrows?: boolean;
}) {
  const log: string[] = [];
  const subscribeArgs: string[][] = [];
  let clock = Date.parse("2026-11-05T12:00:00+08:00");
  let pollIdx = 0;
  const polls = cfg.polls ?? [bk("pending", "paid")];
  const bookings = {
    createBooking: async () => {
      log.push("create");
      if (cfg.createFail != null) return { ok: false, error: cfg.createFail } as never;
      return { ok: true, value: cfg.createValue ?? { ...bk("awaiting_payment", "pending"), pay: PAY } } as never;
    },
    getBooking: async () => {
      log.push("getBooking");
      return { ok: true, value: polls[Math.min(pollIdx++, polls.length - 1)] } as never;
    },
  };
  const submitUc = createSubmitBookingUseCase({
    bookings: bookings as never,
    loadSession: () => cfg.session ?? fullSession,
    context: () => ctx,
  });
  const payFlow = createDepositPayFlow({
    bookings: bookings as never,
    payments: {
      requestPayment: async () => {
        log.push("pay");
        return cfg.payResult ?? { ok: true };
      },
    },
    poll: { intervalMs: 1000, timeoutMs: 3000 },
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });
  const flow = createDepositSubmitFlow({
    submitUc,
    payFlow,
    subscribe: async (ids) => {
      log.push("subscribe");
      subscribeArgs.push(ids);
      if (cfg.subscribeThrows) throw new Error("boom");
      return { ok: false };
    },
    context: () => ctx,
    now: () => clock,
  });
  return { flow, log, subscribeArgs };
}

describe("勾选守卫：开启保证金必须勾选同意才可提交", () => {
  it("未勾选 → blocked，零订阅、零创建、零支付", async () => {
    const h = harness({});
    const r = await h.flow.submit(input, { ...OPTS_ON, agreed: false });
    expect(r).toEqual({ kind: "blocked", reason: "agreement-required" });
    expect(h.log).toEqual([]);
  });

  it("已勾选 → 放行进入后续流程", async () => {
    const h = harness({});
    const r = await h.flow.submit(input, OPTS_ON);
    expect(r.kind).toBe("paid");
    expect(h.log.length).toBeGreaterThan(0);
  });

  it("未开启保证金：agreed 与否都不影响（旧流程不受勾选约束）", async () => {
    const h = harness({ createValue: { ...bk("pending", null), pay: null } });
    const r = await h.flow.submit(input, { ...OPTS_OFF, agreed: false });
    expect(r.kind).toBe("created");
  });
});

describe("顺序不可换：订阅授权 → createBooking → requestPayment → getBooking 轮询", () => {
  it("成功路径的调用日志严格有序", async () => {
    const h = harness({});
    const r = await h.flow.submit(input, OPTS_ON);
    expect(r.kind).toBe("paid");
    expect(h.log).toEqual(["subscribe", "create", "pay", "getBooking"]);
  });

  it("【守卫】订阅授权必须先于 createBooking（日志中 subscribe 的下标 < create 的下标）", async () => {
    const h = harness({});
    await h.flow.submit(input, OPTS_ON);
    expect(h.log.indexOf("subscribe")).toBeGreaterThanOrEqual(0);
    expect(h.log.indexOf("subscribe")).toBeLessThan(h.log.indexOf("create"));
  });

  it("订阅授权在调用 submit 的同步栈内触发（保持点击手势）：submit() 返回 Promise 之前 subscribe 已被调用", () => {
    const h = harness({});
    void h.flow.submit(input, OPTS_ON); // 不 await
    expect(h.log).toEqual(["subscribe"]);
  });

  it("模板 ID 取自后端下发的配置，空串跳过；两个都空则不触发授权", async () => {
    const h1 = harness({});
    await h1.flow.submit(input, { ...OPTS_ON, templates: { result: "TPL-R", done: "" } });
    expect(h1.subscribeArgs).toEqual([["TPL-R"]]);

    const h2 = harness({});
    await h2.flow.submit(input, { ...OPTS_ON, templates: { result: "", done: "" } });
    expect(h2.subscribeArgs).toEqual([]);
    expect(h2.log[0]).toBe("create");

    const h3 = harness({});
    await h3.flow.submit(input, OPTS_ON);
    expect(h3.subscribeArgs).toEqual([["TPL-R", "TPL-D"]]);
  });

  it("订阅授权抛异常/被拒：一律放行，不阻断提交与支付", async () => {
    const h = harness({ subscribeThrows: true });
    const r = await h.flow.submit(input, OPTS_ON);
    expect(r.kind).toBe("paid");
    expect(h.log).toEqual(["subscribe", "create", "pay", "getBooking"]);
  });

  it("未开启保证金的门店：不触发订阅授权（不得新增授权弹窗），流程同既有免保证金预约", async () => {
    const h = harness({ createValue: { ...bk("pending", null), pay: null } });
    const r = await h.flow.submit(input, { ...OPTS_OFF, templates: { result: "TPL-R", done: "TPL-D" } });
    expect(r.kind).toBe("created");
    expect(h.log).toEqual(["create"]);
    expect(h.subscribeArgs).toEqual([]);
  });

  it("表单校验失败/未登录：不触发订阅授权（不为必然失败的提交白弹授权框），也不创建", async () => {
    const bad = harness({});
    const r1 = await bad.flow.submit({ ...input, customerPhone: "123" }, OPTS_ON);
    expect(r1).toMatchObject({ kind: "failed", result: { kind: "validation" } });
    expect(bad.log).toEqual([]);

    const anon = harness({ session: silentSession });
    const r2 = await anon.flow.submit(input, OPTS_ON);
    expect(r2).toMatchObject({ kind: "failed", result: { kind: "login-required" } });
    expect(anon.log).toEqual([]);
  });
});

describe("创建失败：原样透传给页面既有分支，不拉起支付", () => {
  it("业务失败（如时段约满）", async () => {
    const h = harness({ createFail: { kind: "BUSINESS", businessCode: 500, message: "该时段已约满", requestId: "r", retryable: false } });
    const r = await h.flow.submit(input, OPTS_ON);
    expect(r).toMatchObject({ kind: "failed", result: { kind: "business", message: "该时段已约满" } });
    expect(h.log).toEqual(["subscribe", "create"]);
  });
  it("会话失效（401）→ auth-expired", async () => {
    const h = harness({ createFail: { kind: "AUTH_EXPIRED", businessCode: null, message: "unauthorized", requestId: "r", retryable: false } });
    const r = await h.flow.submit(input, OPTS_ON);
    expect(r).toMatchObject({ kind: "failed", result: { kind: "auth-expired" } });
  });
});

describe("支付结果判定：只信服务端状态（requestPayment 回调不作依据）", () => {
  it("【守卫】requestPayment 成功但服务端一直 pending → 不得判成功（unpaid/timeout），且不重复创建预约", async () => {
    const h = harness({ polls: [bk("awaiting_payment", "pending")], payResult: { ok: true } });
    const r = await h.flow.submit(input, OPTS_ON);
    expect(r.kind).toBe("unpaid");
    if (r.kind !== "unpaid") throw new Error("unreachable");
    expect(r.reason).toBe("timeout");
    expect(h.log.filter((x) => x === "create").length).toBe(1);
  });

  it("requestPayment 失败，但服务端其实已 paid → 以服务端为准判成功", async () => {
    const h = harness({ polls: [bk("pending", "paid")], payResult: { ok: false, reason: "failed" } });
    const r = await h.flow.submit(input, OPTS_ON);
    expect(r.kind).toBe("paid");
  });

  it("用户取消支付 → unpaid/cancelled，预约保留，附保留分钟（按截止时间向上取整）", async () => {
    const h = harness({ polls: [bk("awaiting_payment", "pending")], payResult: { ok: false, reason: "cancelled" } });
    const r = await h.flow.submit(input, OPTS_ON);
    expect(r).toMatchObject({ kind: "unpaid", reason: "cancelled" });
    if (r.kind !== "unpaid") throw new Error("unreachable");
    expect(r.retainMinutes).toBeGreaterThan(0);
    expect(r.retainMinutes).toBeLessThanOrEqual(10);
    // 取消后只发 createBooking 一次（不重复创建）
    expect(h.log.filter((x) => x === "create").length).toBe(1);
  });

  it("支付失败 → unpaid/payment-failed", async () => {
    const h = harness({ polls: [bk("awaiting_payment", "pending")], payResult: { ok: false, reason: "failed" } });
    const r = await h.flow.submit(input, OPTS_ON);
    expect(r).toMatchObject({ kind: "unpaid", reason: "payment-failed" });
  });

  it("服务端已关单（预约取消）→ unpaid/closed", async () => {
    const h = harness({ polls: [bk("cancelled", "closed")], payResult: { ok: true } });
    const r = await h.flow.submit(input, OPTS_ON);
    expect(r).toMatchObject({ kind: "unpaid", reason: "closed" });
  });
});

describe("异常与竞态防御", () => {
  it("服务端返回待支付预约但缺 pay（异常）→ 保留待支付、不假装成功、不拉起支付", async () => {
    const h = harness({ createValue: { ...bk("awaiting_payment", "pending"), pay: null } });
    const r = await h.flow.submit(input, OPTS_ON);
    expect(r).toMatchObject({ kind: "unpaid", reason: "no-pay-params" });
    expect(h.log).toEqual(["subscribe", "create"]);
  });

  it("配置过期竞态：本地以为未开启保证金，服务端却返回 pay → 不自动拉起支付（规则未明示），引导去「我的预约」", async () => {
    const h = harness({});
    const r = await h.flow.submit(input, OPTS_OFF);
    expect(r).toMatchObject({ kind: "unpaid", reason: "rules-unseen" });
    expect(h.log).toEqual(["create"]); // 没有 pay、没有 subscribe
  });

  it("支付流程内部抛异常 → 收口为 unpaid/payment-failed，不向页面抛", async () => {
    const throwing = createDepositSubmitFlow({
      submitUc: { submit: async () => ({ ok: true, value: { ...bk("awaiting_payment", "pending"), pay: PAY } }) },
      payFlow: {
        payAndConfirm: async () => {
          throw new Error("boom");
        },
      },
      subscribe: async () => undefined,
      context: () => ctx,
    });
    const r = await throwing.submit(input, OPTS_ON);
    expect(r).toMatchObject({ kind: "unpaid", reason: "payment-failed" });
  });

  it("未开启保证金且服务端 pay=null：created，行为同既有免保证金预约（无订阅、无支付）", async () => {
    const h = harness({ createValue: { ...bk("pending", null), pay: null } });
    const r = await h.flow.submit(input, OPTS_OFF);
    expect(r.kind).toBe("created");
    if (r.kind !== "created") throw new Error("unreachable");
    expect(r.booking.deposit).toBeNull();
    expect("pay" in r.booking).toBe(false);
  });
});

describe("submit 钩子 beforeCreate（booking-flow）", () => {
  it("钩子在校验与登录前置通过后触发；其拒绝不阻断提交", async () => {
    const calls: string[] = [];
    const uc = createSubmitBookingUseCase({
      bookings: {
        createBooking: async () => {
          calls.push("create");
          return { ok: true, value: { ...bk("pending", null), pay: null } } as never;
        },
      } as never,
      loadSession: () => fullSession,
      context: () => ctx,
    });
    const r = await uc.submit(input, {
      beforeCreate: async () => {
        calls.push("hook");
        throw new Error("rejected");
      },
    });
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["hook", "create"]);
  });

  it("不传钩子：行为与此前一致", async () => {
    const calls: string[] = [];
    const uc = createSubmitBookingUseCase({
      bookings: {
        createBooking: async () => {
          calls.push("create");
          return { ok: true, value: { ...bk("pending", null), pay: null } } as never;
        },
      } as never,
      loadSession: () => fullSession,
      context: () => ctx,
    });
    const r = await uc.submit(input);
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["create"]);
  });
});

describe("订阅授权钩子兜底超时", () => {
  it("钩子 Promise 永不 settle（wx 容器异常）：超时后放行，仍创建预约，不永久挂起「提交中」", async () => {
    vi.useFakeTimers();
    try {
      const calls: string[] = [];
      const uc = createSubmitBookingUseCase({
        bookings: {
          createBooking: async () => {
            calls.push("create");
            return { ok: true, value: { ...bk("pending", null), pay: null } } as never;
          },
        } as never,
        loadSession: () => fullSession,
        context: () => ctx,
        hookTimeoutMs: 5000,
      });
      const p = uc.submit(input, { beforeCreate: () => new Promise<void>(() => undefined) });
      await vi.advanceTimersByTimeAsync(4999);
      expect(calls).toEqual([]); // 未到超时：仍在等授权
      await vi.advanceTimersByTimeAsync(2);
      const r = await p;
      expect(r.ok).toBe(true);
      expect(calls).toEqual(["create"]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("钩子正常返回：清掉兜底定时器（不留悬挂计时器）", async () => {
    vi.useFakeTimers();
    try {
      const uc = createSubmitBookingUseCase({
        bookings: { createBooking: async () => ({ ok: true, value: { ...bk("pending", null), pay: null } }) } as never,
        loadSession: () => fullSession,
        context: () => ctx,
      });
      await uc.submit(input, { beforeCreate: async () => undefined });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

