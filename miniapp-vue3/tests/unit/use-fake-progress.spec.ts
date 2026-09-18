// useFakeProgress 单测：28s/10s 两档推进、99% 封顶、progressDone→100、20/45/75 步骤阈值、文案/图标透传不串扰。
// 溯源：pages/aiTryOnResult（28s 档）与 pages/aiRecommendLoading（10s 档）原页面逻辑逐行比对后的共享抽取。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useFakeProgress } from "../../src/composables/use-fake-progress";

/** 复刻页面「每秒 +1」的计时器驱动方式（composable 自身不持定时器） */
function tickEverySecond(elapsedSeconds: { value: number }): void {
  setInterval(() => {
    elapsedSeconds.value += 1;
  }, 1000);
}

const TRY_ON_ICONS = [
  "/static/iconpark/face-scan.svg",
  "/static/iconpark/eyes.svg",
  "/static/iconpark/puzzle.svg",
  "/static/iconpark/picture.svg",
];
const TRY_ON_STEPS = {
  base: ["分析照片面部细节", "分析五官类型", "正在匹配面部", "生成试衣图像"],
  done: ["照片面部细节分析完毕", "五官类型分析完毕", "面部匹配完成", "试衣图像生成完毕"],
};
const RECOMMEND_ICONS = [
  "/static/iconpark/face-scan.svg",
  "/static/iconpark/eyes.svg",
  "/static/iconpark/plan.svg",
  "/static/iconpark/list-success.svg",
];
const RECOMMEND_STEPS = {
  base: ["分析照片面部细节", "分析五官类型", "生成推荐方案", "生成推荐结果"],
  done: ["照片面部细节分析完毕", "五官类型分析完毕", "推荐方案生成完毕", "推荐结果生成完毕"],
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useFakeProgress（AI 等待页伪进度共享 composable）", () => {
  it("28s 档（aiTryOnResult）：按 floor(elapsed/28*100) 推进，走满时刻封顶 99", () => {
    const elapsedSeconds = ref(0);
    const progressDone = ref(false);
    tickEverySecond(elapsedSeconds);
    const { progressPercent, currentProgressStep } = useFakeProgress(28, {
      elapsedSeconds,
      progressDone,
      icons: TRY_ON_ICONS,
      steps: TRY_ON_STEPS,
    });
    expect(progressPercent.value).toBe(0);
    expect(currentProgressStep.value).toBe(0);
    vi.advanceTimersByTime(14_000); // 14s → floor(50)
    expect(progressPercent.value).toBe(50);
    expect(currentProgressStep.value).toBe(2);
    vi.advanceTimersByTime(13_000); // 27s → floor(96.4)=96
    expect(progressPercent.value).toBe(96);
    vi.advanceTimersByTime(1_000); // 28s → floor(100) → 封顶 99
    expect(progressPercent.value).toBe(99);
    expect(currentProgressStep.value).toBe(3);
  });

  it("10s 档（aiRecommendLoading）：按 floor(elapsed/10*100) 推进，走满时刻封顶 99", () => {
    const elapsedSeconds = ref(0);
    const progressDone = ref(false);
    tickEverySecond(elapsedSeconds);
    const { progressPercent } = useFakeProgress(10, {
      elapsedSeconds,
      progressDone,
      icons: RECOMMEND_ICONS,
      steps: RECOMMEND_STEPS,
    });
    vi.advanceTimersByTime(5_000); // 5s → 50
    expect(progressPercent.value).toBe(50);
    vi.advanceTimersByTime(5_000); // 10s → floor(100) → 封顶 99
    expect(progressPercent.value).toBe(99);
  });

  it("⭐99% 封顶：远超走满时长后仍停在 99（未完成绝不显示 100）", () => {
    const elapsedSeconds = ref(0);
    const progressDone = ref(false);
    tickEverySecond(elapsedSeconds);
    const p28 = useFakeProgress(28, { elapsedSeconds, progressDone, icons: TRY_ON_ICONS, steps: TRY_ON_STEPS });
    const p10 = useFakeProgress(10, { elapsedSeconds, progressDone, icons: RECOMMEND_ICONS, steps: RECOMMEND_STEPS });
    vi.advanceTimersByTime(300_000);
    expect(p28.progressPercent.value).toBe(99);
    expect(p10.progressPercent.value).toBe(99);
  });

  it("⭐完成置 100：progressDone → 立即 100（即使 elapsed=0），当前步骤跳到末步", () => {
    const elapsedSeconds = ref(0);
    const progressDone = ref(false);
    const { progressPercent, currentProgressStep, progressSteps } = useFakeProgress(28, {
      elapsedSeconds,
      progressDone,
      icons: TRY_ON_ICONS,
      steps: TRY_ON_STEPS,
    });
    progressDone.value = true;
    expect(progressPercent.value).toBe(100);
    expect(currentProgressStep.value).toBe(3);
    // i < 3 显示完毕文案，末步（i=3）仍为进行中文案（与原页面循环同口径）
    expect(progressSteps.value).toEqual([
      "照片面部细节分析完毕",
      "五官类型分析完毕",
      "面部匹配完成",
      "生成试衣图像",
    ]);
  });

  it("步骤阈值 20/45/75：<20→0／<45→1／<75→2／else 3（10s 档逐秒验证）", () => {
    const elapsedSeconds = ref(0);
    const progressDone = ref(false);
    tickEverySecond(elapsedSeconds);
    const { progressPercent, currentProgressStep } = useFakeProgress(10, {
      elapsedSeconds,
      progressDone,
      icons: RECOMMEND_ICONS,
      steps: RECOMMEND_STEPS,
    });
    vi.advanceTimersByTime(1_000); // 10 → 步0
    expect(progressPercent.value).toBe(10);
    expect(currentProgressStep.value).toBe(0);
    vi.advanceTimersByTime(1_000); // 20 → 步1
    expect(progressPercent.value).toBe(20);
    expect(currentProgressStep.value).toBe(1);
    vi.advanceTimersByTime(2_000); // 40 → 步1
    expect(currentProgressStep.value).toBe(1);
    vi.advanceTimersByTime(1_000); // 50 → 步2
    expect(currentProgressStep.value).toBe(2);
    vi.advanceTimersByTime(2_000); // 70 → 步2
    expect(currentProgressStep.value).toBe(2);
    vi.advanceTimersByTime(1_000); // 80 → 步3
    expect(currentProgressStep.value).toBe(3);
  });

  it("文案推导：i < cur 用 done 文案、其余用 base；两页参数互不串扰（图标透传）", () => {
    const elapsedSeconds = ref(0);
    const progressDone = ref(false);
    tickEverySecond(elapsedSeconds);
    const tryOn = useFakeProgress(28, { elapsedSeconds, progressDone, icons: TRY_ON_ICONS, steps: TRY_ON_STEPS });
    const recommend = useFakeProgress(10, { elapsedSeconds, progressDone, icons: RECOMMEND_ICONS, steps: RECOMMEND_STEPS });
    vi.advanceTimersByTime(5_000); // 10s 档 → 50（步2）；28s 档 → 17（步0）
    expect(recommend.currentProgressStep.value).toBe(2);
    expect(recommend.progressSteps.value).toEqual([
      "照片面部细节分析完毕",
      "五官类型分析完毕",
      "生成推荐方案",
      "生成推荐结果",
    ]);
    expect(tryOn.currentProgressStep.value).toBe(0);
    expect(tryOn.progressSteps.value).toEqual(TRY_ON_STEPS.base);
    expect(tryOn.progressIcons).toEqual(TRY_ON_ICONS);
    expect(recommend.progressIcons).toEqual(RECOMMEND_ICONS);
  });
});
