// 最小可见时长（issue #14 · UX bugfix）：下拉刷新的指示器在「刷新动作极快」时一帧都来不及渲染（同一时间片内 true→false），
// 用户看不到任何 loading。本函数把一次动作的耗时**拉长到至少 minMs**：动作先跑，结束后若不足 minMs 再补足剩余时间。
// 不改共用的 composables/use-pull-refresh（C 端 5 页共用），只在商家页的 refresh 回调里包一层。动作抛错也会补足时长后再重抛（finally 语义不变）。
export const MIN_REFRESH_VISIBLE_MS = 600;

export async function withMinDuration<T>(action: () => Promise<T> | T, minMs: number = MIN_REFRESH_VISIBLE_MS): Promise<T> {
  const start = Date.now();
  const pad = async () => {
    const left = minMs - (Date.now() - start);
    if (left > 0) await new Promise<void>((r) => setTimeout(r, left));
  };
  try {
    const v = await action();
    await pad();
    return v;
  } catch (e) {
    await pad();
    throw e;
  }
}
