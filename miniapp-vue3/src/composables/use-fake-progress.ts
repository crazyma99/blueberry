// AI 等待/结果页「伪进度」共享 composable——纯去重抽取，零行为变化。
//
// 溯源（两页原实现逐行比对后抽取）：
//  · src/pages/aiTryOnResult/index.vue（28s 档；旧端 aiTryOnResult/index.uvue :212-247）
//  · src/pages/aiRecommendLoading/index.vue（10s 档；旧端 aiRecommendLoading/index.uvue :82-117）
//
// 两页差异点（参数化保留各自语义，均为主人定稿，勿改）：
//  ① 走满时长：28s（试衣结果）／10s（推荐等待）→ `durationSec` 参数
//  ② 四步节点图标：后两步不同（puzzle/picture vs plan/list-success）→ `icons` 参数
//  ③ 四步动态文案：后两步 base/done 文案不同 → `steps` 参数
// 两页逐字一致、收敛为共享实现的部分：
//  · 百分比 = floor(elapsed/duration*100)，未完成封顶 99，progressDone → 100
//  · 当前步骤阈值：<20→0／<45→1／<75→2／else 3
//  · 步骤文案推导：i < cur 用 done 文案，否则用 base 文案
//
// 计时器/轮询仍由页面持有（本 composable 只消费 refs、产出派生量，不新建定时器）。
import { computed, type ComputedRef, type Ref } from "vue";

/** 伪进度上限：任务未完成时最高 99%（两页逐字一致） */
const FAKE_PROGRESS_CAP = 99;

export interface FakeProgressSteps {
  /** 进行中文案（4 步，各页主人定稿逐字） */
  base: string[];
  /** 已完成文案（与 base 等长；i < 当前步骤时展示） */
  done: string[];
}

export interface FakeProgressSource {
  /** 已等待秒数（页面计时器/轮询内核每秒回写；**当 `startedAtMs` 有效时仅用于驱动重算**） */
  elapsedSeconds: Ref<number>;
  /**
   * 任务真实起始时间（epoch ms，**可选**）。2026-09-23 主人报「离开等待页再回来进度从 0 重来、体感丢进度」：
   * 伪进度原先只认本页 `elapsedSeconds`（重新进页＝从 0）⇒ 传入真实起始时间后按**墙钟**推导，回页自动续算。
   * 数据来源优先级：服务端任务 `created_at`（试衣，最佳实践：跨设备一致）＞ 本地持久化（推荐页，接口只调一次不可轮询）。
   * 约定：`<= 0`／`NaN`／未来时间（时钟偏差）一律视为「无」⇒ 回落到本地 `elapsedSeconds`（即旧行为）。
   */
  startedAtMs?: Ref<number>;
  /** 任务完成置真 → 百分比直接走满 100 */
  progressDone: Ref<boolean>;
  /** 四步节点图标（已完成节点的白勾由 GenerationProgress 组件统一渲染） */
  icons: string[];
  /** 四步动态文案（进行中／已完成两套） */
  steps: FakeProgressSteps;
}

export interface FakeProgress {
  /** 百分比：durationSec 秒走满 99（封顶）；progressDone → 100 */
  progressPercent: ComputedRef<number>;
  /** 当前步骤下标：0..3，阈值 20/45/75 */
  currentProgressStep: ComputedRef<number>;
  /** 四步节点图标（透传页面入参） */
  progressIcons: string[];
  /** 四步动态文案：当前步骤之前的节点显示「完毕」文案 */
  progressSteps: ComputedRef<string[]>;
}

/** 有效已等待秒数：有可信 `startedAtMs` 时按墙钟（回页续算），否则用本地累加（旧行为） */
function effectiveElapsedSeconds(source: FakeProgressSource): number {
  const started = source.startedAtMs?.value ?? 0;
  // 无效起始时间：非数字／≤0／**未来**（客户端-服务端时钟偏差）⇒ 回落本地累加（旧行为）
  if (!Number.isFinite(started) || started <= 0 || started > Date.now()) return source.elapsedSeconds.value;
  const wall = (Date.now() - started) / 1000;
  return wall > 0 ? wall : 0; // 时钟偏差导致的「负数等待」按 0 处理
}

export function useFakeProgress(durationSec: number, source: FakeProgressSource): FakeProgress {
  // 生成等待伪进度：durationSec 秒走满 99%，完成时 progressDone → 100
  const progressPercent = computed<number>(() => {
    if (source.progressDone.value) return 100;
    const elapsed = effectiveElapsedSeconds(source);
    const p = Math.floor((elapsed / durationSec) * 100);
    return p > FAKE_PROGRESS_CAP ? FAKE_PROGRESS_CAP : p;
  });
  // 当前步骤下标（阈值 20/45/75，两页逐字一致）
  const currentProgressStep = computed<number>(() => {
    const p = progressPercent.value;
    if (p < 20) return 0;
    if (p < 45) return 1;
    if (p < 75) return 2;
    return 3;
  });
  // 四步动态文案：i < cur 用 done 文案，其余用 base 文案
  const progressSteps = computed<string[]>(() => {
    const cur = currentProgressStep.value;
    const list: string[] = [];
    for (let i = 0; i < source.steps.base.length; i++) list.push(i < cur ? source.steps.done[i] : source.steps.base[i]);
    return list;
  });
  return { progressPercent, currentProgressStep, progressIcons: source.icons, progressSteps };
}
