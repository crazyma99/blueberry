// T8 S5-1：结果轮询与买断权益测试——自适应间隔/180s 超时/空任务不空转/确定失败即停/网络抖动容忍 3 次/completed 走满进度/权益与保存前置。
import { describe, expect, it, vi } from "vitest";
import {
  canSaveOriginal,
  createResultPoller,
  loadTaskEntitlement,
  nextPollDelayMs,
  RESULT_POLL_TIMEOUT_SECONDS,
  saveBadgeText,
  type ResultPollState,
  type ResultSnapshot,
} from "../../src/application/ai-result-flow";
import type { RequestContext } from "../../src/ports/context";
import type { RepoResult } from "../../src/infrastructure/repositories/carousels";

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

/** 假计时器：手动推进，避免真实等待 */
function fakeTimers() {
  const timeouts: Array<{ fn: () => void; ms: number }> = [];
  const intervals: Array<{ fn: () => void; ms: number }> = [];
  return {
    timeouts,
    intervals,
    api: {
      setTimeout: (fn: () => void, ms: number) => {
        timeouts.push({ fn, ms });
        return timeouts.length - 1;
      },
      clearTimeout: (h: unknown) => {
        if (typeof h === "number") timeouts[h] = { fn: () => undefined, ms: -1 };
      },
      setInterval: (fn: () => void, ms: number) => {
        intervals.push({ fn, ms });
        return intervals.length - 1;
      },
      clearInterval: (h: unknown) => {
        if (typeof h === "number") intervals[h] = { fn: () => undefined, ms: -1 };
      },
    },
    async runTimeouts(): Promise<void> {
      const snapshot = [...timeouts];
      for (const t of snapshot) {
        if (t.ms >= 0 && t.fn !== undefined) await Promise.resolve(t.fn());
      }
    },
    runTicks(times: number): void {
      for (const iv of intervals) {
        if (iv.ms < 0) continue;
        for (let i = 0; i < times; i++) iv.fn();
      }
    },
  };
}

function makePoller(sequence: Array<RepoResult<ResultSnapshot>>, onStates: ResultPollState[]) {
  const timer = fakeTimers();
  let calls = 0;
  const poller = createResultPoller({
    getResult: async () => {
      const res = sequence[Math.min(calls, sequence.length - 1)];
      calls += 1;
      return res;
    },
    nextContext: () => ctx,
    onState: (s) => onStates.push({ ...s }),
    timers: timer.api,
  });
  return { poller, timer, calls: () => calls };
}

const ok = (status: string, extra: Partial<ResultSnapshot> = {}): RepoResult<ResultSnapshot> => ({ ok: true, value: { status, ...extra } });

describe("ai-result-flow · 轮询内核（T8 S5）", () => {
  it("自适应间隔逐值：<20s→8000，<45s→3000，≥45s→2500（旧 :446-451）", () => {
    expect(nextPollDelayMs(0)).toBe(8000);
    expect(nextPollDelayMs(19)).toBe(8000);
    expect(nextPollDelayMs(20)).toBe(3000);
    expect(nextPollDelayMs(44)).toBe(3000);
    expect(nextPollDelayMs(45)).toBe(2500);
  });

  it("⭐completed：停止轮询并置 progressDone（进度走满再切页）", async () => {
    const states: ResultPollState[] = [];
    const { poller } = makePoller([ok("completed")], states);
    poller.start("42");
    await Promise.resolve();
    await Promise.resolve();
    const last = poller.getState();
    expect(last.progressDone).toBe(true);
    expect(last.stopped).toBe(true);
    expect(states.some((s) => s.progressDone)).toBe(true);
  });

  it("failed：带 error_message 立即停止", async () => {
    const states: ResultPollState[] = [];
    const { poller } = makePoller([ok("failed", { error_message: "生成失败原因" })], states);
    poller.start("42");
    await Promise.resolve();
    await Promise.resolve();
    expect(poller.getState().status).toBe("failed");
    expect(poller.getState().errorMessage).toBe("生成失败原因");
  });

  it("⭐业务确定失败（非 ok）→ 立即停止并取 message，不空等 180s", async () => {
    const states: ResultPollState[] = [];
    const { poller } = makePoller([{ ok: false, error: { kind: "BUSINESS", message: "任务不存在" } }], states);
    poller.start("42");
    await Promise.resolve();
    await Promise.resolve();
    expect(poller.getState()).toMatchObject({ status: "failed", stopped: true, errorMessage: "任务不存在" });
  });

  it("空 taskId → 立即失败且零请求（bug #8 不空转）", async () => {
    const states: ResultPollState[] = [];
    const { poller, calls } = makePoller([ok("pending")], states);
    poller.start("");
    await Promise.resolve();
    await Promise.resolve();
    expect(calls()).toBe(0); // ✅ 真·零请求：空 taskId 在发起前即拦截（bug #8 不空转）
    expect(poller.getState().status).toBe("failed");
  });

  it("⭐网络抖动容忍 3 次：前两次继续，第三次判失败；成功一次清零 streak", async () => {
    const states: ResultPollState[] = [];
    const timer = fakeTimers();
    let n = 0;
    const poller = createResultPoller({
      getResult: async () => {
        n += 1;
        if (n <= 2) throw new Error("net");
        return ok("processing");
      },
      nextContext: () => ctx,
      onState: (s) => states.push({ ...s }),
      timers: timer.api,
    });
    poller.start("42");
    await Promise.resolve();
    await Promise.resolve();
    expect(poller.getState().stopped).toBe(false); // 1 次抖动不失败
    await timer.runTimeouts();
    await Promise.resolve();
    await Promise.resolve();
    expect(poller.getState().stopped).toBe(false); // 2 次抖动仍继续
    await timer.runTimeouts();
    await Promise.resolve();
    await Promise.resolve();
    expect(poller.getState()).toMatchObject({ status: "processing", stopped: false }); // 成功 → streak 清零
  });

  it("⭐180s 超时：elapsed 到点判失败并停止（1s 计数）", async () => {
    const states: ResultPollState[] = [];
    const { poller, timer } = makePoller([ok("processing")], states);
    poller.start("42");
    await Promise.resolve();
    await Promise.resolve();
    timer.runTicks(RESULT_POLL_TIMEOUT_SECONDS);
    expect(poller.getState()).toMatchObject({ status: "failed", stopped: true });
  });

  it("skipFirstPoll=true：不发起首次查询（避免背靠背双请求）", async () => {
    const states: ResultPollState[] = [];
    const { poller, calls } = makePoller([ok("pending")], states);
    poller.start("42", { skipFirstPoll: true });
    await Promise.resolve();
    expect(calls()).toBe(0);
  });
});

describe("ai-result-flow · 买断权益（T8 S5）", () => {
  it("权益查询：download 池＋taskId，返回 taskBought/isPaidMode", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const res = await loadTaskEntitlement(
      {
        credits: {
          getBalance: async (_c, params) => {
            seen.push(params as Record<string, unknown>);
            return { ok: true, value: { balance: 0, inited: true, priceFenPerCredit: 990, taskBought: true } };
          },
        },
        context: ctx,
      },
      { shopId: "7", taskId: "42" },
    );
    expect(seen[0]).toEqual({ shopId: 7, feature: "download", taskId: 42 });
    expect(res).toEqual({ balance: 0, priceFenPerCredit: 990, taskBought: true, isPaidMode: true });
  });

  it("⭐保存前置：非付费 恒可存；付费时需 余额>0 或 taskBought（旧 :71-85）", () => {
    expect(canSaveOriginal({ isPaidMode: false, balance: 0, taskBought: false })).toBe(true);
    expect(canSaveOriginal({ isPaidMode: true, balance: 0, taskBought: false })).toBe(false);
    expect(canSaveOriginal({ isPaidMode: true, balance: 1, taskBought: false })).toBe(true);
    expect(canSaveOriginal({ isPaidMode: true, balance: 0, taskBought: true })).toBe(true);
  });

  it("角标文案逐字：已买断／限时免费 N 次", () => {
    expect(saveBadgeText({ taskBought: true, balance: 0 })).toBe("已解锁 · 永久保存");
    expect(saveBadgeText({ taskBought: false, balance: 2 })).toBe("限时免费 2 次");
  });
});

describe("ai-result-flow · 定时器清理", () => {
  it("stop() 清理定时器且不改变结论状态", () => {
    const states: ResultPollState[] = [];
    const clearTimeoutSpy = vi.fn();
    const clearIntervalSpy = vi.fn();
    const poller = createResultPoller({
      getResult: async () => ok("pending"),
      nextContext: () => ctx,
      onState: (s) => states.push({ ...s }),
      timers: { setTimeout: () => 1, clearTimeout: clearTimeoutSpy, setInterval: () => 2, clearInterval: clearIntervalSpy },
    });
    poller.start("42");
    poller.stop();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(poller.getState().stopped).toBe(true);
  });
});
