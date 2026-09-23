// 2026-09-23 主人报：「等待页返回/进入其他页面后再回来，进度会丢失（异步任务没丢，但体感丢了）」。
// 解法：伪进度支持**真实起始时间**（`startedAtMs`）⇒ 按墙钟推导，回页自动续算；无可用值则回落旧行为。
import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useFakeProgress } from "../../src/composables/use-fake-progress";

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

  it("页面接线（源码守卫）：试衣页用服务端 created_at、推荐页用本地持久化起始时间", () => {
    const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf-8");
    const tryon = read("src/pages/aiTryOnResult/index.vue");
    expect(tryon).toContain("parseServerTimeMs");
    expect(tryon).toContain("created_at");
    expect(tryon).toContain("startedAtMs,"); // 传入 useFakeProgress
    const rec = read("src/pages/aiRecommendLoading/index.vue");
    expect(rec).toContain("RECOMMEND_STARTED_AT_KEY");
    expect(rec).toContain("readResumeStartedAt");
    expect(rec).toContain("clearRecommendStartedAt"); // 终态清理（防误续算／永远 99%）
    expect(rec).toContain("startedAtMs,");
  });
});
