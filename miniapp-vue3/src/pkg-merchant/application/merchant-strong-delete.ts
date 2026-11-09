// 强确认删除编排（issue #14 · M2 分类/相册共用）：统计关联数 → 第一次确认（明示级联规模）→ 第二次确认 → 执行 → 以刷新为准。
// 纯编排（依赖全部注入），便于单测「取消任一步都不发删除请求」「统计失败 fail-closed 不进入确认」。
export interface ConfirmCopy {
  title: string;
  msg: string;
}

export type StrongDeleteOutcome =
  | { status: "deleted" }
  | { status: "cancelled" }
  | { status: "blocked"; message: string } // 统计失败等：未进入确认
  | { status: "failed"; message: string; authExpired: boolean };

export async function runStrongDelete(deps: {
  /** 统计关联规模；失败 ⇒ 整体拦下（fail-closed） */
  measure: () => Promise<{ ok: true } | { ok: false; message: string }>;
  /** 第一次确认文案（依赖 measure 的结果由调用方闭包生成） */
  firstCopy: () => ConfirmCopy;
  /** 第二次（最终）确认文案 */
  finalCopy: () => ConfirmCopy;
  /** 弹确认框：返回用户选择 */
  confirm: (copy: ConfirmCopy) => Promise<"confirm" | "cancel">;
  /** 执行删除 */
  execute: () => Promise<{ ok: true } | { ok: false; message: string; authExpired: boolean }>;
}): Promise<StrongDeleteOutcome> {
  const m = await deps.measure();
  if (!m.ok) return { status: "blocked", message: m.message };
  if ((await deps.confirm(deps.firstCopy())) !== "confirm") return { status: "cancelled" };
  if ((await deps.confirm(deps.finalCopy())) !== "confirm") return { status: "cancelled" };
  const r = await deps.execute();
  if (!r.ok) return { status: "failed", message: r.message, authExpired: r.authExpired };
  return { status: "deleted" };
}
