// ⚠️ 本文件把 TZ 钉成 UTC：否则「无时区串按 +08:00 换算」的变异在 +08 机器上无法被区分（CR ⒟ 同族假绿教训）。
process.env.TZ = "UTC";

// 2026-09-23 主人报：「等待页返回/进入其他页面后再回来，进度会丢失（异步任务没丢，但体感丢了）」。
// 解法：伪进度支持**真实起始时间**（`startedAtMs`）⇒ 按墙钟推导，回页自动续算；无可用值则回落旧行为。
import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useFakeProgress } from "../../src/composables/use-fake-progress";
import { parseServerTimeMs, shouldResumeStartedAt } from "../../src/application/wait-resume";
/** 取函数体片段（到首个行首 `}` 为止）——用于断言 helper 内部行为 */
const srcSlice = (src: string, anchor: string): string => {
  const i = src.indexOf(anchor);
  return i < 0 ? "" : src.slice(i, src.indexOf("\n}", i));
};

const steps = { base: ["a", "b", "c", "d"], done: ["A", "B", "C", "D"] };
const icons = ["/1.svg", "/2.svg", "/3.svg", "/4.svg"];

function make(opts: { elapsed?: number; startedAt?: number; done?: boolean }) {
  const elapsedSeconds = ref(opts.elapsed ?? 0);
  const progressDone = ref(opts.done ?? false);
  return useFakeProgress(10, { elapsedSeconds, progressDone, icons, steps, startedAtMs: ref(opts.startedAt ?? 0) });
}

describe("伪进度续算（离开等待页再回来不再从 0 开始）", () => {
  it("⭐有真实起始时间：按墙钟续算（5s 前开始、10s 档 ⇒ ≈50%），而非本地 elapsed=0", () => {
    const p = make({ elapsed: 0, startedAt: Date.now() - 5000 });
    expect(p.progressPercent.value).toBeGreaterThanOrEqual(49);
    expect(p.progressPercent.value).toBeLessThanOrEqual(51);
    expect(p.currentProgressStep.value).toBe(2); // <75 且 >=45
  });

  it("无起始时间（0/NaN/未来）⇒ 回落本地 elapsedSeconds（旧行为不变）", () => {
    expect(make({ elapsed: 3 }).progressPercent.value).toBe(30);
    expect(make({ elapsed: 3, startedAt: NaN }).progressPercent.value).toBe(30);
    expect(make({ elapsed: 3, startedAt: Date.now() + 60000 }).progressPercent.value).toBe(30); // 时钟偏差 ⇒ 不恢复
  });

  it("续算同样遵守 99% 封顶与 progressDone=100", () => {
    expect(make({ startedAt: Date.now() - 600000 }).progressPercent.value).toBe(99);
    expect(make({ startedAt: Date.now() - 600000, done: true }).progressPercent.value).toBe(100);
  });

  // ===== CR ⒟ 收尾：判定抽纯函数后做**行为测试**（原为源码字符串断言＝假绿点）=====
  it("shouldResumeStartedAt：有效=新鲜且非未来；无效=非数/≤0/未来/超窗", () => {
    const now = 1_700_000_000_000;
    expect(shouldResumeStartedAt(now, now - 5000, 1800)).toBe(true); // 5s 前 ⇒ 可续算
    expect(shouldResumeStartedAt(now, now + 1000, 1800)).toBe(false); // 未来（时钟偏差）
    expect(shouldResumeStartedAt(now, 0, 1800)).toBe(false);
    expect(shouldResumeStartedAt(now, Number.NaN, 1800)).toBe(false);
    expect(shouldResumeStartedAt(now, now - 1801_000, 1800)).toBe(false); // 超窗 ⇒ 不续算（防「永远 99%」）
  });

  it("parseServerTimeMs：无时区串按 +08:00 解释（跨时区不再放大已等待时间）", () => {
    const now = Date.UTC(2026, 8, 23, 2, 0, 10); // 10:00:10 (+08:00) 的 UTC 表示
    const expected = Date.UTC(2026, 8, 23, 2, 0, 0); // 10:00:00 (+08:00) == 02:00:00Z（**与运行环境 TZ 无关**的定点值）
    expect(parseServerTimeMs("2026-09-23 10:00:00", now)).toBe(expected);
    expect(parseServerTimeMs("2026-09-23T10:00:00", now)).toBe(expected);
    expect(parseServerTimeMs("2026-09-23T10:00:00+08:00", now)).toBe(expected); // 带时区 ISO 原样解析
    expect(parseServerTimeMs("", now)).toBe(0);
    expect(parseServerTimeMs(null, now)).toBe(0);
    expect(parseServerTimeMs("2026-09-23 09:00:00", now)).toBe(0); // 1h 前 > 30min 新鲜度窗口
  });

  it("接线（结论性最小断言）：两页分别接上纯函数（判定逻辑已在上面行为覆盖）", () => {
    const tryon = readFileSync(resolve(__dirname, "../..", "src/pages/aiTryOnResult/index.vue"), "utf-8");
    expect(tryon).toContain("parseServerTimeMs(");
    const rec = readFileSync(resolve(__dirname, "../..", "src/pages/aiRecommendLoading/index.vue"), "utf-8");
    expect(rec).toContain("shouldResumeStartedAt(");
    expect(rec.match(/finishAsFailed\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4); // 覆盖面（≥4 类终态）
    // ⭐结构不变式（强守卫）：失败终态**唯一出口** ⇒ helper 之外不得出现裸置失败
    //（计数式断言在变异 N3「删一处 helper 调用」下仍绿 ⇒ 会被掩盖，故改此断言）
    expect(rec.match(/status\.value = "failed";/g)?.length ?? 0).toBe(1);
    // 统一出口内部必须清理起始时间（否则失败后重试会「一上来就 60%」）
    expect(srcSlice(rec, "function finishAsFailed()")).toContain("clearRecommendStartedAt()");
  });
});
