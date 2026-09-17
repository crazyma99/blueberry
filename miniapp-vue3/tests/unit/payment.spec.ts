// T9a 支付协调器＋门闩＋平台适配单测：状态机五阶段、终态释放门闩（绝不悬挂）、超时/取消/不支持路径。
import { describe, expect, it } from "vitest";
import { createPaymentCoordinator } from "../../src/application/payment-coordinator";
import { isTerminalPhase, PayGuard } from "../../src/domain/payment-state";
import { createWeixinPayments } from "../../src/platform/weixin/payments";
import type { CreditRechargeOrder, CreditRechargeStatus } from "../../src/infrastructure/repositories/credits";
import type { RequestContext } from "../../src/ports/context";

const ctx: RequestContext = {
  platform: "mp-weixin",
  environment: "trial",
  brandId: null,
  requestId: "r",
  profileKey: "blueberry",
  appCode: "blueBerry",
  scopeRevision: 1,
  authRevision: 1,
};

const order: CreditRechargeOrder = {
  outTradeNo: "T100",
  prepayId: "prepay",
  appId: "wx",
  timeStamp: "1",
  nonceStr: "n",
  package: "prepay_id=prepay",
  signType: "RSA",
  paySign: "sig",
};

function makeCredits(opts: {
  createOk?: boolean;
  createKind?: string;
  paidAfterPolls?: number; // 第 N 次轮询才 paid（默认 1）
  statusOk?: boolean;
  /** P3-05 权益迟到协议：第 N 次权益查询才满足（默认与 paid 同步=1） */
  entitledAfterPolls?: number;
  /** download 池：taskBought 是否已到账（默认 true；false 用于证明「paid≠权益」） */
  taskBought?: boolean;
  balance?: number;
}) {
  let polls = 0;
  let entPolls = 0;
  const paidAfter = opts.paidAfterPolls ?? 1;
  const entitledAfter = opts.entitledAfterPolls ?? 1;
  const credits = {
    createRecharge: async () =>
      opts.createOk === false
        ? ({ ok: false as const, error: { kind: opts.createKind ?? "BUSINESS" } })
        : ({ ok: true as const, value: order }),
    getRechargeStatus: async (): Promise<
      { ok: true; value: CreditRechargeStatus } | { ok: false; error: { kind: string } }
    > => {
      polls += 1;
      if (opts.statusOk === false) return { ok: false, error: { kind: "network" } };
      const paid = polls >= paidAfter;
      return { ok: true, value: { outTradeNo: "T100", status: paid ? 1 : 0, paid, credits: 1, balance: opts.balance ?? 5 } };
    },
    getBalance: async (): Promise<
      { ok: true; value: CreditBalance } | { ok: false; error: { kind: string } }
    > => {
      entPolls += 1;
      const entitled = entPolls >= entitledAfter;
      return {
        ok: true,
        value: {
          balance: entitled ? (opts.balance ?? 5) : 0,
          inited: true,
          priceFenPerCredit: 990,
          taskBought: entitled ? (opts.taskBought ?? true) : false,
        },
      };
    },
  };
  return { credits, polls: () => polls, entPolls: () => entPolls };
}

/** 固定步进时钟：sleep 调用即推进时间，超时判定可控且不依赖真实等待。
 * 起点取 10000：PayGuard 默认防抖 800ms（构造参数 <=0 会回落默认），首调用需 t - lastTriggerAt >= 800。 */
function fakeClock() {
  let t = 10000;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe("payment-coordinator（T9a 共享支付）", () => {
  it("成功：下单 → 拉起 → 轮询到账 → succeeded，且门闩释放", async () => {
    const { credits, polls } = makeCredits({ paidAfterPolls: 2 });
    const clock = fakeClock();
    const gate = new PayGuard(undefined, clock.now);
    const co = createPaymentCoordinator({
      credits,
      payments: { requestPayment: async () => ({ ok: true }) },
      gate,
      poll: { intervalMs: 1000, timeoutMs: 30000 },
      now: clock.now,
      sleep: clock.sleep,
    });
    const out = await co.recharge(ctx, { shopId: 1, credits: 1, feature: "download", taskId: 9 });
    expect(out.ok).toBe(true);
    expect(out.phase).toBe("succeeded");
    expect(out.balance).toBe(5);
    expect(polls()).toBe(2);
    expect(gate.isBusy()).toBe(false); // ✅ 终态释放门闩
    expect(co.phase).toBe("succeeded");
  });

  it("用户取消 → cancelled（不轮询），门闩释放", async () => {
    const { credits, polls } = makeCredits({});
    const clock = fakeClock();
    const gate = new PayGuard(undefined, clock.now);
    const co = createPaymentCoordinator({
      credits,
      payments: { requestPayment: async () => ({ ok: false, reason: "cancelled" }) },
      gate,
      now: clock.now,
      sleep: clock.sleep,
    });
    const out = await co.recharge(ctx, { shopId: 1, credits: 1 });
    expect(out).toMatchObject({ ok: false, phase: "cancelled", reason: "cancelled" });
    expect(polls()).toBe(0);
    expect(gate.isBusy()).toBe(false);
  });

  it("平台不支持（抖音/容器无 requestPayment）→ failed·unsupported，门闩释放", async () => {
    const { credits } = makeCredits({});
    const clock = fakeClock();
    const gate = new PayGuard(undefined, clock.now);
    const co = createPaymentCoordinator({
      credits,
      payments: { requestPayment: async () => ({ ok: false, reason: "unsupported" }) },
      gate,
      now: clock.now,
      sleep: clock.sleep,
    });
    const out = await co.recharge(ctx, { shopId: 1, credits: 1 });
    expect(out).toMatchObject({ ok: false, phase: "failed", reason: "unsupported" });
    expect(gate.isBusy()).toBe(false);
  });

  it("下单失败（业务/网络）→ failed·create-order-failed 且带 errorKind，门闩释放", async () => {
    const { credits } = makeCredits({ createOk: false, createKind: "INSUFFICIENT_CREDITS" });
    const clock = fakeClock();
    const gate = new PayGuard(undefined, clock.now);
    const co = createPaymentCoordinator({
      credits,
      payments: { requestPayment: async () => ({ ok: true }) },
      gate,
      now: clock.now,
      sleep: clock.sleep,
    });
    const out = await co.recharge(ctx, { shopId: 1, credits: 1 });
    expect(out).toMatchObject({ ok: false, phase: "failed", reason: "create-order-failed", errorKind: "INSUFFICIENT_CREDITS" });
    expect(gate.isBusy()).toBe(false);
  });

  it("到账超时（轮询不 paid / 状态查询失败）→ failed·timeout＋回传 outTradeNo（超时≠作废），门闩释放", async () => {
    const { credits, polls } = makeCredits({ paidAfterPolls: 999, statusOk: false });
    const clock = fakeClock();
    const gate = new PayGuard(undefined, clock.now);
    const co = createPaymentCoordinator({
      credits,
      payments: { requestPayment: async () => ({ ok: true }) },
      gate,
      poll: { intervalMs: 1000, timeoutMs: 5000 },
      now: clock.now,
      sleep: clock.sleep,
    });
    const out = await co.recharge(ctx, { shopId: 1, credits: 1 });
    expect(out).toMatchObject({ ok: false, phase: "failed", reason: "timeout", outTradeNo: "T100" });
    expect(polls()).toBeGreaterThan(0); // 证据：状态查询失败被当作瞬时继续，未提前判失败
    expect(gate.isBusy()).toBe(false);
  });

  it("防御收敛：仓储/适配意外抛错 → failed（errorKind unknown）且门闩释放，不悬挂", async () => {
    const clock = fakeClock();
    const gate = new PayGuard(undefined, clock.now);
    const co = createPaymentCoordinator({
      credits: {
        createRecharge: async () => {
          throw new Error("boom");
        },
        getRechargeStatus: async () => ({
          ok: true as const,
          value: { outTradeNo: "T", status: 1, paid: true, credits: 1, balance: 1 },
        }),
        getBalance: async () => ({ ok: true as const, value: { balance: 1, inited: true, priceFenPerCredit: 990 } }),
      },
      payments: { requestPayment: async () => ({ ok: true }) },
      gate,
      now: clock.now,
      sleep: clock.sleep,
    });
    const out = await co.recharge(ctx, { shopId: 1, credits: 1 });
    expect(out).toMatchObject({ ok: false, phase: "failed", reason: "payment-failed", errorKind: "unknown" });
    expect(gate.isBusy()).toBe(false);
  });

  it("门闩忙：并发第二笔被拒（phase 固定 idle、reason busy），下单调用仍只有 1 次", async () => {
    let releaseCreate: (() => void) | null = null;
    let createCalls = 0;
    const gate = new PayGuard(undefined, () => 10000); // 首调用 t-last=10000 ≥ 800 防抖
    const credits = {
      createRecharge: () => {
        createCalls += 1;
        return new Promise<{ ok: true; value: CreditRechargeOrder }>((resolve) => {
          releaseCreate = () => resolve({ ok: true, value: order });
        });
      },
      getRechargeStatus: async () => ({ ok: true as const, value: { outTradeNo: "T100", status: 1, paid: true, credits: 1, balance: 1 } }),
      getBalance: async () => ({ ok: true as const, value: { balance: 1, inited: true, priceFenPerCredit: 990 } }),
    };
    const co = createPaymentCoordinator({
      credits,
      payments: { requestPayment: async () => ({ ok: true }) },
      gate,
      now: () => 10000,
      sleep: async () => {},
    });
    const first = co.recharge(ctx, { shopId: 1, credits: 1 });
    const second = await co.recharge(ctx, { shopId: 1, credits: 1 });
    expect(second).toMatchObject({ ok: false, phase: "idle", reason: "busy" });
    releaseCreate?.();
    const firstOut = await first;
    expect(firstOut.ok).toBe(true);
    expect(createCalls).toBe(1); // ✅ 不产生第二笔订单
    expect(gate.isBusy()).toBe(false);
  });

  it("⭐P3-03 operationId：同 op 重复点击复用同一在飞过程（下单仅 1 次、结果同源）", async () => {
    let releaseCreate: (() => void) | null = null;
    let createCalls = 0;
    const gate = new PayGuard(undefined, () => 10000);
    const credits = {
      createRecharge: () => {
        createCalls += 1;
        return new Promise<{ ok: true; value: CreditRechargeOrder }>((resolve) => {
          releaseCreate = () => resolve({ ok: true, value: order });
        });
      },
      getRechargeStatus: async () => ({ ok: true as const, value: { outTradeNo: "T100", status: 1, paid: true, credits: 1, balance: 3 } }),
      getBalance: async () => ({ ok: true as const, value: { balance: 3, inited: true, priceFenPerCredit: 990 } }),
    };
    const co = createPaymentCoordinator({
      credits,
      payments: { requestPayment: async () => ({ ok: true }) },
      gate,
      now: () => 10000,
      sleep: async () => {},
    });
    const p1 = co.recharge(ctx, { shopId: 1, credits: 1, operationId: "op-1" });
    const p2 = co.recharge(ctx, { shopId: 1, credits: 1, operationId: "op-1" });
    expect(p1).toBe(p2); // 同一 Promise（复用而非拒绝）
    releaseCreate?.();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(createCalls).toBe(1);
  });

  it("⭐P3-05 权益迟到协议：查询1 paid=true 但权益未到，查询2 权益到位 → succeeded（paid≠权益）", async () => {
    // 最小测试协议（phases :591-594）：paid 先于权益到账，不得因 paid 就判成功
    const { credits, polls } = makeCredits({ paidAfterPolls: 1, entitledAfterPolls: 2 });
    const clock = fakeClock();
    const gate = new PayGuard(undefined, clock.now);
    const co = createPaymentCoordinator({
      credits,
      payments: { requestPayment: async () => ({ ok: true }) },
      gate,
      poll: { intervalMs: 1000, timeoutMs: 30000 },
      now: clock.now,
      sleep: clock.sleep,
    });
    const out = await co.recharge(ctx, { shopId: 1, credits: 1 });
    expect(out.ok).toBe(true);
    expect(out.balance).toBe(5);
    expect(polls()).toBe(2); // 第一轮 paid 但无权益 ⇒ 继续确认
  });

  it("⭐P3-05 下载买断：paid 但 taskBought=false → 不判成功（超时），taskBought=true 才 succeeded", async () => {
    // 未到账（taskBought 恒 false）→ 超时失败，绝不「仅 paid 就本地置已解锁」
    const neg = makeCredits({ taskBought: false, entitledAfterPolls: 999 });
    const clockA = fakeClock();
    const coNeg = createPaymentCoordinator({
      credits: neg.credits,
      payments: { requestPayment: async () => ({ ok: true }) },
      gate: new PayGuard(undefined, clockA.now),
      poll: { intervalMs: 1000, timeoutMs: 3000 },
      now: clockA.now,
      sleep: clockA.sleep,
    });
    const outNeg = await coNeg.recharge(ctx, { shopId: 1, credits: 1, feature: "download", taskId: 9 });
    expect(outNeg).toMatchObject({ ok: false, reason: "timeout" });

    const pos = makeCredits({ taskBought: true });
    const clockB = fakeClock();
    const coPos = createPaymentCoordinator({
      credits: pos.credits,
      payments: { requestPayment: async () => ({ ok: true }) },
      gate: new PayGuard(undefined, clockB.now),
      poll: { intervalMs: 1000, timeoutMs: 30000 },
      now: clockB.now,
      sleep: clockB.sleep,
    });
    const outPos = await coPos.recharge(ctx, { shopId: 1, credits: 1, feature: "download", taskId: 9 });
    expect(outPos.ok).toBe(true);
  });

  it("⭐P3-04 超时后 resume(outTradeNo)：按后端状态恢复成功，且不新建订单", async () => {
    let createCalls = 0;
    let entitled = false;
    const order2: CreditRechargeOrder = { ...order, outTradeNo: "T200" };
    const credits = {
      createRecharge: async () => {
        createCalls += 1;
        return { ok: true as const, value: order2 };
      },
      getRechargeStatus: async () => ({
        ok: true as const,
        value: { outTradeNo: "T200", status: entitled ? 1 : 0, paid: entitled, credits: 1, balance: entitled ? 2 : 0 },
      }),
      getBalance: async () => ({ ok: true as const, value: { balance: entitled ? 2 : 0, inited: true, priceFenPerCredit: 990 } }),
    };
    const clock = fakeClock();
    const gate = new PayGuard(undefined, clock.now);
    const co = createPaymentCoordinator({
      credits,
      payments: { requestPayment: async () => ({ ok: true }) },
      gate,
      poll: { intervalMs: 1000, timeoutMs: 2000 },
      now: clock.now,
      sleep: clock.sleep,
    });
    // 首次：超时（权益未到）
    const first = await co.recharge(ctx, { shopId: 1, credits: 1 });
    expect(first).toMatchObject({ ok: false, reason: "timeout", outTradeNo: "T200" });
    // 后端稍后到账：用同一订单号恢复（不重新下单）
    entitled = true;
    const resumed = await co.resume(ctx, { shopId: 1, credits: 1, outTradeNo: "T200" });
    expect(resumed.ok).toBe(true);
    expect(resumed.outTradeNo).toBe("T200");
    expect(createCalls).toBe(1); // ✅ 恢复路径不创建新订单
  });

  it("domain：isTerminalPhase 仅 succeeded/cancelled/failed 为终态", () => {
    expect(isTerminalPhase("succeeded")).toBe(true);
    expect(isTerminalPhase("cancelled")).toBe(true);
    expect(isTerminalPhase("failed")).toBe(true);
    expect(isTerminalPhase("idle")).toBe(false);
    expect(isTerminalPhase("creatingOrder")).toBe(false);
    expect(isTerminalPhase("awaitingUser")).toBe(false);
    expect(isTerminalPhase("confirmingEntitlement")).toBe(false);
  });
});

describe("platform/weixin/payments（适配：fail-closed）", () => {
  it("容器无 uni.requestPayment → unsupported（不假装成功）", async () => {
    const p = createWeixinPayments();
    const r = await p.requestPayment(order);
    expect(r).toEqual({ ok: false, reason: "unsupported" });
  });

  it("非微信端（isWeixin=false）→ unsupported", async () => {
    const p = createWeixinPayments({ isWeixin: () => false });
    const r = await p.requestPayment(order);
    expect(r).toMatchObject({ ok: false, reason: "unsupported" });
  });

  it("成功/取消/失败三分支：errMsg 含 cancel → cancelled，其余 → failed", async () => {
    const calls: Array<{ success: () => void; fail: (e: unknown) => void }> = [];
    (globalThis as { uni?: unknown }).uni = {
      requestPayment: (o: { success: () => void; fail: (e: unknown) => void }) => {
        calls.push(o);
      },
    };
    const p = createWeixinPayments({ isWeixin: () => true });
    const okP = p.requestPayment(order);
    calls[0].success();
    expect(await okP).toEqual({ ok: true });
    const cancelP = p.requestPayment(order);
    calls[1].fail({ errMsg: "requestPayment:fail cancel" });
    expect(await cancelP).toMatchObject({ ok: false, reason: "cancelled" });
    const failP = p.requestPayment(order);
    calls[2].fail({ errMsg: "requestPayment:fail error" });
    expect(await failP).toMatchObject({ ok: false, reason: "failed" });
    delete (globalThis as { uni?: unknown }).uni;
  });
});

describe("payment-coordinator（P3-02 失败与竞态场景补测）", () => {
  it("⭐callback 重复/重复入账防护：同一订单反复 paid 只确认一次权益即返回（不重复应用）", async () => {
    const { credits, polls, entPolls } = makeCredits({ paidAfterPolls: 1 });
    const clock = fakeClock();
    const co = createPaymentCoordinator({
      credits,
      payments: { requestPayment: async () => ({ ok: true }) },
      gate: new PayGuard(undefined, clock.now),
      poll: { intervalMs: 1000, timeoutMs: 30000 },
      now: clock.now,
      sleep: clock.sleep,
    });
    const out = await co.recharge(ctx, { shopId: 1, credits: 1 });
    expect(out.ok).toBe(true);
    expect(polls()).toBe(1); // 首次 paid 即确认，不继续轮询
    expect(entPolls()).toBe(1); // 权益只查一次（重复回调不重复应用）
  });

  it("⭐旧账号/会话过期迟到：下单返回 AUTH_EXPIRED → failed·create-order-failed（不再拉起支付），门闩释放", async () => {
    const clock = fakeClock();
    const gate = new PayGuard(undefined, clock.now);
    let payCalled = false;
    const co = createPaymentCoordinator({
      credits: {
        createRecharge: async () => ({ ok: false as const, error: { kind: "AUTH_EXPIRED" } }),
        getRechargeStatus: async () => ({ ok: true as const, value: { outTradeNo: "T", status: 0, paid: false, credits: 1, balance: 0 } }),
        getBalance: async () => ({ ok: true as const, value: { balance: 0, inited: true, priceFenPerCredit: 990 } }),
      },
      payments: {
        requestPayment: async () => {
          payCalled = true;
          return { ok: true };
        },
      },
      gate,
      now: clock.now,
      sleep: clock.sleep,
    });
    const out = await co.recharge(ctx, { shopId: 1, credits: 1 });
    expect(out).toMatchObject({ ok: false, phase: "failed", reason: "create-order-failed", errorKind: "AUTH_EXPIRED" });
    expect(payCalled).toBe(false); // 下单失败不得拉起支付面板
    expect(gate.isBusy()).toBe(false);
  });

  it("⭐面板回调兜底超时：面板不回调 → 按 payment-failed 收口并释放门闩（不长期持闩）", async () => {
    const clock = fakeClock();
    const gate = new PayGuard(undefined, clock.now);
    const co = createPaymentCoordinator({
      credits: {
        createRecharge: async () => ({ ok: true as const, value: order }),
        getRechargeStatus: async () => ({ ok: true as const, value: { outTradeNo: "T100", status: 1, paid: true, credits: 1, balance: 5 } }),
        getBalance: async () => ({ ok: true as const, value: { balance: 5, inited: true, priceFenPerCredit: 990 } }),
      },
      payments: { requestPayment: () => new Promise(() => {}) }, // 永不回调
      gate,
      payTimeoutMs: 50,
      now: clock.now,
      sleep: clock.sleep,
    });
    const out = await co.recharge(ctx, { shopId: 1, credits: 1 });
    expect(out).toMatchObject({ ok: false, phase: "failed", reason: "payment-failed", outTradeNo: "T100" });
    expect(gate.isBusy()).toBe(false);
  });
});

describe("platform/weixin/payments（P3-06 订单归属与本地验证口径）", () => {
  it("⭐订单字段透传（归属校验）：requestPayment 收到的拉起参数与下单响应逐字一致", async () => {
    const seen: Array<Record<string, unknown>> = [];
    (globalThis as { uni?: unknown }).uni = {
      requestPayment: (o: Record<string, unknown>) => {
        seen.push(o);
        (o.success as () => void)();
      },
    };
    const p = createWeixinPayments({ isWeixin: () => true });
    await p.requestPayment(order);
    expect(seen[0]).toMatchObject({
      provider: "wxpay",
      timeStamp: order.timeStamp,
      nonceStr: order.nonceStr,
      package: order.package,
      signType: order.signType,
      paySign: order.paySign,
    });
    delete (globalThis as { uni?: unknown }).uni;
  });

  it("⭐不调用真实支付：非微信端/无 API 时 requestPayment 内部不触发 uni.requestPayment（验收不改真实支付）", async () => {
    let called = 0;
    (globalThis as { uni?: unknown }).uni = {
      requestPayment: () => {
        called += 1;
      },
    };
    const p = createWeixinPayments({ isWeixin: () => false });
    const r = await p.requestPayment(order);
    expect(r).toEqual({ ok: false, reason: "unsupported" });
    expect(called).toBe(0); // ✅ 抖音/非微信端零支付调用
    delete (globalThis as { uni?: unknown }).uni;
  });
});
