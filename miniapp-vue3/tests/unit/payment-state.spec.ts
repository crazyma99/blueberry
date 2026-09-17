// P1-10 支付门闩状态转移测试 ＋ P1-09 错误码冻结测试
// 来源口径：旧端 src/utils/payGuard.uts（2026-09-17 迁移移植核对）；4001 处理见旧端 pages（aiTryOn:610 等）
import { describe, expect, it } from "vitest";
import { PayGuard, mapBusinessCode, mayTriggerRecharge } from "../../src/domain/payment-state";

function fixedClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("PayGuard 状态机 idle→paying→confirming→idle（缺实现即红）", () => {
  it("初始 idle 且不忙", () => {
    const g = new PayGuard(undefined, fixedClock().now);
    expect(g.getState()).toBe("idle");
    expect(g.isBusy()).toBe(false);
  });
  it("tryBegin 放行 → paying 且 busy；paying 中再试 → false", () => {
    const c = fixedClock();
    const g = new PayGuard(undefined, c.now);
    expect(g.tryBegin()).toBe(true);
    expect(g.getState()).toBe("paying");
    expect(g.isBusy()).toBe(true);
    expect(g.tryBegin()).toBe(false);
  });
  it("toConfirming → confirming 且 busy；confirming 中再试 → false", () => {
    const c = fixedClock();
    const g = new PayGuard(undefined, c.now);
    g.tryBegin();
    g.toConfirming();
    expect(g.getState()).toBe("confirming");
    expect(g.isBusy()).toBe(true);
    expect(g.tryBegin()).toBe(false);
  });
  it("end → idle 可再触发；防抖 800ms 内拒绝、推进后放行", () => {
    const c = fixedClock();
    const g = new PayGuard(undefined, c.now);
    expect(g.tryBegin()).toBe(true);
    g.end();
    expect(g.getState()).toBe("idle");
    expect(g.tryBegin()).toBe(false); // 800ms 防抖窗口内
    c.advance(799);
    expect(g.tryBegin()).toBe(false);
    c.advance(1);
    expect(g.tryBegin()).toBe(true); // 恰好 800ms 放行
  });
  it("自定义间隔生效；0/负数回落默认 800", () => {
    const c1 = fixedClock();
    const g1 = new PayGuard(100, c1.now);
    g1.tryBegin(); g1.end();
    c1.advance(99);
    expect(g1.tryBegin()).toBe(false);
    c1.advance(1);
    expect(g1.tryBegin()).toBe(true);
    const c2 = fixedClock();
    const g2 = new PayGuard(0, c2.now);
    g2.tryBegin(); g2.end();
    c2.advance(100);
    expect(g2.tryBegin()).toBe(false); // 回落 800
    c2.advance(700);
    expect(g2.tryBegin()).toBe(true);
  });
});

describe("P1-09 错误码冻结：4001 → INSUFFICIENT_CREDITS", () => {
  it("4001 映射 INSUFFICIENT_CREDITS 并保留 businessCode/message/requestId", () => {
    const e = mapBusinessCode(4001, "次数不足", "req-1");
    expect(e.kind).toBe("INSUFFICIENT_CREDITS");
    expect(e.businessCode).toBe(4001);
    expect(e.message).toBe("次数不足");
    expect(e.requestId).toBe("req-1");
  });
  it("其他数字业务码 → BUSINESS；缺失 → UNKNOWN", () => {
    expect(mapBusinessCode(5001).kind).toBe("BUSINESS");
    expect(mapBusinessCode(undefined).kind).toBe("UNKNOWN");
  });
  it("仅 INSUFFICIENT_CREDITS 可拉起充值；普通 BUSINESS/UNKNOWN 不可", () => {
    expect(mayTriggerRecharge(mapBusinessCode(4001))).toBe(true);
    expect(mayTriggerRecharge(mapBusinessCode(5001))).toBe(false);
    expect(mayTriggerRecharge(mapBusinessCode(undefined))).toBe(false);
  });
});
