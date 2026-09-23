// 等待页「断点续算」纯函数（2026-09-23 主人需求 + 独立 CR 收尾项）：把判定从页面里抽出来，**可行为测试**（此前 t60 只做源码字符串断言＝假绿点）。
//
// 背景：伪进度原先只认本页本地 elapsedSeconds ⇒ 离开等待页再回来从 0 重来，体感丢进度（异步任务其实照跑）。
// 口径：①试衣取服务端任务 `created_at`（跨设备一致）②推荐接口只调一次不可轮询 ⇒ 本地持久化起始时间。

/** 服务端时区偏移（Asia/Shanghai）：无时区串按此定点换算，**不受运行环境本地时区影响** */
export const SERVICE_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 起始时间新鲜度窗口（秒）：超过该窗口的起始时间视为"上一次尝试已结束"，忽略以免「永远 99%」 */
export const STARTED_AT_MAX_AGE_SEC = 1800; // 30 分钟（试衣任务通常 1 分钟内完成，30 分钟足够宽松）

/**
 * 是否可用 `startedAtMs` 续算。
 * 无效情形（一律返回 false ⇒ 调用方回落本地累加＝旧行为）：非有限数 / ≤0 / **未来**（客户端-服务端时钟偏差）/ 超出新鲜度窗口。
 */
export function shouldResumeStartedAt(now: number, startedAtMs: number, maxAgeSec: number = STARTED_AT_MAX_AGE_SEC): boolean {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(now) || startedAtMs <= 0) return false;
  if (startedAtMs > now) return false; // 时钟偏差：未来时间不可信
  return (now - startedAtMs) / 1000 <= maxAgeSec;
}

/**
 * 解析服务端时间串 → epoch ms（不可信时返回 0）。
 * 兼容：①`YYYY-MM-DD HH:mm:ss` / `YYYY-MM-DDTHH:mm:ss`（**无时区**）⇒ 按服务端时区 Asia/Shanghai(+08:00) **定点换算**
 *       ②ISO 带时区（`Z`／`±HH:MM`）⇒ 原样解析。
 * ⚠️ 无时区串**不用 `Date.parse` 直接解析**（那会按**运行环境本地时区**解释：跨时区用户会把已等待时间放大 ⇒ 顶到 99% 卡住）。
 */
export function parseServerTimeMs(raw: unknown, now: number = Date.now(), maxAgeSec: number = STARTED_AT_MAX_AGE_SEC): number {
  if (typeof raw !== "string" || raw.trim() === "") return 0;
  const s = raw.trim();
  let ms = 0;
  const naive = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (naive != null) {
    const [, y, mo, d, h, mi, sec] = naive;
    ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec)) - SERVICE_TZ_OFFSET_MS; // +08:00 定点换算
  } else {
    ms = Date.parse(s);
  }
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return shouldResumeStartedAt(now, ms, maxAgeSec) ? ms : 0;
}
