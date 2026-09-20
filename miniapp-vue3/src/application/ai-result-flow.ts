// T8 S5-1：AI 试衣结果轮询与买断权益（旧端 aiTryOnResult/index.uvue:365-505 的**业务内核**，纯逻辑可测）。
// 轮询（旧 :420-505）：
//  · 立即首查（`skipFirstPoll` 可跳过，避免背靠背双请求）＋**自适应间隔**：elapsed<20s→8s，<45s→3s，否则 2.5s（bug #12）
//  · **总超时 180s**（1s 计数）→ 停止并判 failed
//  · 空 taskId → 立即 failed，不空转（bug #8）
//  · 业务确定失败（非 0/200 或 status='failed'）→ 立即停止（不空等 180s），取 error_message／message
//  · **网络抖动容忍 3 次**（CR 🟡）：连续 3 次才判失败；成功一次即清零
//  · completed → 停止轮询，**进度走满 100% 后**（旧端 260ms 延迟）再切结果页
// 权益（旧 :71-85 / getCreditBalance(feature='download', taskId)）：
//  · `taskBought=true` ⇒ 「已解锁 · 永久保存」；否则付费模式按余额显示「限时免费 N 次」
//  · 保存原图前置：非付费模式 OR 余额>0 OR taskBought（三者之一即可）
import type { RequestContext } from "../ports/context";
import type { RepoResult } from "../infrastructure/repositories/carousels";
import type { CreditBalance } from "../infrastructure/repositories/credits";

export const RESULT_POLL_TIMEOUT_SECONDS = 180;
export const RESULT_COMPLETED_DELAY_MS = 260;

/** 自适应轮询间隔（旧 :446-451 逐值） */
export function nextPollDelayMs(elapsedSeconds: number): number {
  if (elapsedSeconds < 20) return 8000;
  if (elapsedSeconds < 45) return 3000;
  return 2500;
}

export type ResultStatus = "pending" | "processing" | "completed" | "failed";

export interface ResultPollState {
  status: ResultStatus;
  elapsedSeconds: number;
  errorMessage: string;
  /** completed 时先置 true（进度走满）再由调用方切结果页 */
  progressDone: boolean;
  stopped: boolean;
}

export interface ResultSnapshot {
  status?: string;
  error_message?: string;
}

export function createResultPoller(deps: {
  getResult: (context: RequestContext, taskId: string) => Promise<RepoResult<ResultSnapshot>>;
  nextContext: () => RequestContext;
  /** 状态变化回调（页面据此更新 UI） */
  onState: (state: ResultPollState) => void;
  timers?: {
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
    setInterval: (fn: () => void, ms: number) => unknown;
    clearInterval: (handle: unknown) => void;
  };
}) {
  const timers = deps.timers ?? {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  };

  let state: ResultPollState = { status: "pending", elapsedSeconds: 0, errorMessage: "", progressDone: false, stopped: true };
  let taskId = "";
  let pollTimer: unknown = null;
  let tickTimer: unknown = null;
  let errorStreak = 0;

  function emit(patch: Partial<ResultPollState>): void {
    state = { ...state, ...patch };
    deps.onState(state);
  }

  function stopPolling(failed: boolean, errorMessage = ""): void {
    if (pollTimer != null) {
      timers.clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (tickTimer != null) {
      timers.clearInterval(tickTimer);
      tickTimer = null;
    }
    emit({ stopped: true, status: failed ? "failed" : state.status, errorMessage: errorMessage !== "" ? errorMessage : state.errorMessage });
  }

  async function pollResult(): Promise<void> {
    if (state.stopped) return;
    if (taskId === "") {
      // bug #8：空任务不空转轮询
      stopPolling(true);
      return;
    }
    let res: RepoResult<ResultSnapshot>;
    try {
      res = await deps.getResult(deps.nextContext(), taskId);
    } catch (err) {
      console.error("轮询AI试衣结果失败:", err, "streak=", errorStreak + 1);
      errorStreak += 1;
      if (errorStreak >= 3) stopPolling(true);
      return;
    }
    if (!res.ok || res.value == null) {
      // 业务确定失败 → 立即停止（旧 :488-491）
      // ⭐2026-09-20：鉴权失效（401）单独给中文可行动文案，避免把「未登录/登录过期」伪装成「生成失败」
      //（体验版「付完钱却显示生成失败」的观感即来自此处 + 详情请求漏带 Bearer）
      const kind = !res.ok ? (res.error as { kind?: string } | undefined)?.kind : undefined;
      const message = !res.ok && typeof res.error.message === "string" ? res.error.message : "";
      stopPolling(true, kind === "AUTH_EXPIRED" ? "登录已失效，请重新进入" : message !== "" ? message : "任务查询失败");
      return;
    }
    errorStreak = 0;
    const taskStatus = res.value.status;
    if (taskStatus === "completed") {
      stopPolling(false);
      emit({ progressDone: true }); // 旧 :475-479：进度走满再切结果页
      return;
    }
    if (taskStatus === "failed") {
      stopPolling(true, res.value.error_message ?? "");
      return;
    }
    emit({ status: taskStatus === "processing" ? "processing" : "pending" });
  }

  function schedulePoll(): void {
    if (state.stopped) return;
    pollTimer = timers.setTimeout(() => {
      void pollResult().then(() => {
        if (!state.stopped && state.status !== "completed" && state.status !== "failed") schedulePoll();
      });
    }, nextPollDelayMs(state.elapsedSeconds));
  }

  return {
    /** 开始轮询；skipFirstPoll=true 表示页面刚查过一次，避免背靠背双请求 */
    start(id: string, options?: { skipFirstPoll?: boolean }): void {
      taskId = id;
      errorStreak = 0;
      state = { status: "pending", elapsedSeconds: 0, errorMessage: "", progressDone: false, stopped: false };
      deps.onState(state);
      tickTimer = timers.setInterval(() => {
        emit({ elapsedSeconds: state.elapsedSeconds + 1 });
        if (state.elapsedSeconds >= RESULT_POLL_TIMEOUT_SECONDS) {
          stopPolling(true); // 180s 超时 → 判失败
        }
      }, 1000);
      if (options?.skipFirstPoll !== true) void pollResult();
      schedulePoll();
    },
    stop(): void {
      stopPolling(false);
    },
    getState(): ResultPollState {
      return state;
    },
  };
}

export interface TaskEntitlement {
  balance: number;
  priceFenPerCredit: number;
  /** 该任务是否已永久买断（服务端口径） */
  taskBought: boolean;
  isPaidMode: boolean;
}

/** 权益查询（旧 :71-85）：download 池＋taskId ⇒ 服务端返回 taskBought */
export async function loadTaskEntitlement(
  deps: {
    credits: {
      getBalance(
        context: RequestContext,
        params?: { shopId?: number; feature?: string; taskId?: number },
      ): Promise<RepoResult<CreditBalance>>;
    };
    context: RequestContext;
  },
  input: { shopId: string; taskId: string },
): Promise<TaskEntitlement | null> {
  const shopIdNum = parseInt(input.shopId, 10) || 0;
  const taskIdNum = parseInt(input.taskId, 10) || 0;
  const res = await deps.credits.getBalance(deps.context, {
    ...(shopIdNum > 0 ? { shopId: shopIdNum } : {}),
    feature: "download",
    ...(taskIdNum > 0 ? { taskId: taskIdNum } : {}),
  });
  if (!res.ok) return null;
  const balance = res.value.balance;
  const priceFenPerCredit = res.value.priceFenPerCredit;
  return {
    balance,
    priceFenPerCredit,
    taskBought: res.value.taskBought === true,
    isPaidMode: priceFenPerCredit > 0,
  };
}

/** 保存原图前置（旧 :71-85 三个 v-if 的合取）：非付费 OR 余额>0 OR 已买断 */
export function canSaveOriginal(e: { isPaidMode: boolean; balance: number; taskBought: boolean }): boolean {
  if (!e.isPaidMode) return true;
  return e.balance > 0 || e.taskBought;
}

/** 保存按钮角标文案（旧 :85 逐字） */
export function saveBadgeText(e: { taskBought: boolean; balance: number }): string {
  return e.taskBought ? "已解锁 · 永久保存" : `限时免费 ${e.balance} 次`;
}
