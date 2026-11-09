// 商家端加载兜底（issue #14 M1 真机缺陷修复）：任何「首屏/列表加载」都必须有失败/超时出口，骨架屏不得无限显示。
//
// 背景：页面曾用 `onLoad(() => reload().then(() => { ready = true }))` 置位「首屏完成」——
// reload 一旦抛异常（`.then` 不执行且无 catch，ready 永远 false）或请求挂起（Promise 永不 settle），
// `v-if="!ready"` 的骨架屏会一直遮挡列表/错误态，连后续点筛选 chip 拿到的数据也被盖住。
// 修法：①加载函数自己收口异常与超时，返回结构化结果（永不 reject、永不挂起）；②页面骨架屏条件只看「当前是否真的在加载且没有数据」。
// 超时用页面级定时器（不新造 http；单请求自身仍有 client 的 10s 超时，这里兜的是「整次加载」的上限）。
export const LIST_LOAD_TIMEOUT_MS = 20_000;
let timeoutMs = LIST_LOAD_TIMEOUT_MS;
/** 当前生效的整次加载超时（ms） */
export function getLoadTimeoutMs(): number {
  return timeoutMs;
}
/** 仅供测试：覆盖超时（传 null 恢复默认）。生产代码不得调用 */
export function __setLoadTimeoutMsForTest(ms: number | null): void {
  timeoutMs = ms == null ? LIST_LOAD_TIMEOUT_MS : ms;
}
export const LOAD_TIMEOUT_TEXT = "加载超时，请点击重试";
export const LOAD_ERROR_TEXT = "加载失败，请点击重试";

export type GuardedResult<T> = { ok: true; value: T } | { ok: false; reason: "timeout" | "error"; message: string };

/**
 * 给一次异步加载加兜底：
 *   · 抛异常（含 `fn` 同步抛）⇒ `{ok:false,reason:"error"}`；
 *   · 超过 `ms` 仍未 settle ⇒ `{ok:false,reason:"timeout"}`——此后 `fn` 迟到的结果被丢弃（本函数不再观察它）；
 *   · 定时器在 settle 后一定清除。**永不 reject、永不挂起**。
 */
export async function guardedLoad<T>(fn: () => Promise<T>, ms: number = getLoadTimeoutMs()): Promise<GuardedResult<T>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<GuardedResult<T>>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: "timeout", message: LOAD_TIMEOUT_TEXT }), ms);
  });
  const work = (async (): Promise<GuardedResult<T>> => {
    try {
      return { ok: true, value: await fn() };
    } catch (e) {
      console.error("[merchant] 加载异常（已收口为失败态）:", e);
      return { ok: false, reason: "error", message: LOAD_ERROR_TEXT };
    }
  })();
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}

/** 骨架屏显示条件（纯函数，页面与测试共用）：没有数据、没有错误，且（正在加载 或 还没尝试过）。已有数据/错误时绝不遮挡 */
export function shouldShowSkeleton(s: { itemCount: number; hasError: boolean; loading: boolean; attempted: boolean }): boolean {
  return s.itemCount === 0 && !s.hasError && (s.loading || !s.attempted);
}
