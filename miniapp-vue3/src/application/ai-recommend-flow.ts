// T9b（Phase 3.3）AI 推荐闭环内核 —— P3-16/P3-17/P3-18 的**纯逻辑与请求纪律**部分。
// ⭐ 同步扣费合同（旧端 api.uts:800-820 冻结）：`POST /api/aiface/recommend` 是**同步扣费**接口
//   （每次调用扣 1 次推荐余额，耗时 1~3 分钟）⇒ 沿用 **180s 超时**；
//   **等待页绝不能用重复 POST 当轮询**（每次重发都会再扣 1 次），也**不得超时后自动再扣第二次**；
//   同 `operationId` 的重复触发**复用同一在飞过程**（与支付协调器同口径），失败后由用户显式重试才再次发起。
// P3-18：返回 DTO **显式包含 `finalScore`**；显示条件＝`finalScore > 0`（旧端 aiRecommendResult:56 `v-if="rec.finalScore > 0"`），
//   缺失/0/异常值一律**不显示**，**禁止用原始 score 凑分**。
// P3-17：`paid 与余额同时满足后只续跑一次`——由调用方（页面）以「一次续跑标记」实现；本内核只保证「单次请求」语义。
import type { RequestContext } from "../ports/context";
import type { RepoResult } from "../infrastructure/repositories/carousels";

/** P3-16：现行同步 180 秒请求合同（旧端 :816 `timeout: 180000`） */
export const RECOMMEND_REQUEST_TIMEOUT_MS = 180000;

export interface RecommendItem {
  /** 展示用最终分：**仅 finalScore > 0 才显示**（旧端 :56） */
  finalScore: number | null;
  [key: string]: unknown;
}

/**
 * finalScore 归一（P3-18）：`number` 且 `> 0` 才保留（可带小数）；其余（缺失/null/0/负数/字符串/NaN）→ null。
 * **不使用** 原始 `score` 兜底——那是被明确禁止的「凑分」。
 */
export function normalizeFinalScore(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  return raw;
}

export function shouldShowScore(item: { finalScore?: unknown }): boolean {
  return normalizeFinalScore(item.finalScore) != null;
}

export type RecommendFailureKind = "INSUFFICIENT_CREDITS" | "BUSINESS" | "NETWORK" | "AUTH_EXPIRED";

export type RecommendOutcome =
  | { ok: true; items: RecommendItem[]; analysis: Record<string, unknown> | null }
  | { ok: false; kind: RecommendFailureKind; message: string };

export interface RecommendRepositoryLike {
  getRecommend(
    context: RequestContext,
    params: { user_photo_filename: string; shop_id: number },
  ): Promise<RepoResult<Record<string, unknown>>>;
}

export function createRecommendRunner(deps: {
  ai: RecommendRepositoryLike;
  nextContext: () => RequestContext;
}) {
  const inFlight = new Map<string, Promise<RecommendOutcome>>();

  async function runOnce(input: { userPhotoFilename: string; shopId: number }): Promise<RecommendOutcome> {
    let res: RepoResult<Record<string, unknown>>;
    try {
      res = await deps.ai.getRecommend(deps.nextContext(), {
        user_photo_filename: input.userPhotoFilename,
        shop_id: input.shopId,
      });
    } catch (err) {
      console.error("[recommend] 请求异常:", err);
      return { ok: false, kind: "NETWORK", message: "网络异常，请重试" };
    }
    if (!res.ok) {
      const kind: RecommendFailureKind =
        res.error.kind === "INSUFFICIENT_CREDITS"
          ? "INSUFFICIENT_CREDITS"
          : res.error.kind === "AUTH_EXPIRED"
            ? "AUTH_EXPIRED"
            : res.error.kind === "NETWORK"
              ? "NETWORK"
              : "BUSINESS";
      const message = typeof res.error.message === "string" && res.error.message !== "" ? res.error.message : "推荐失败，请重试";
      return { ok: false, kind, message };
    }
    const items = normalizeItems(res.value);
    const analysis = extractAnalysis(res.value);
    // 旧端 :819-826 以 `res.data` 真值判定成功；「ok 但载荷为空」在旧端走 failed ⇒ 此处对齐（不得静默转场到空白结果页）
    if (items.length === 0 && analysis == null) {
      return { ok: false, kind: "BUSINESS", message: "推荐结果为空，请重试" };
    }
    return { ok: true, items, analysis };
  }

  /** 列表归一：显式产出 `finalScore`（缺失→null），并把原始 DTO 原样保留供页面展示其它字段。
   *  ⭐兼容三种载荷形态（旧端 /api/aiface/recommend 实测为 `{analysis, recommendations}`；
   *  历史/其它出口可能是顶层数组或 `{data:[]}`）——**不得只认数组**，否则会丢 analysis 且列表为空。 */
  function extractList(raw: unknown): unknown[] {
    if (Array.isArray(raw)) return raw;
    if (raw == null || typeof raw !== "object") return [];
    const obj = raw as { data?: unknown; recommendations?: unknown };
    if (Array.isArray(obj.recommendations)) return obj.recommendations;
    if (Array.isArray(obj.data)) return obj.data;
    return [];
  }
  function extractAnalysis(raw: unknown): Record<string, unknown> | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const a = (raw as { analysis?: unknown }).analysis;
    return a != null && typeof a === "object" && !Array.isArray(a) ? (a as Record<string, unknown>) : null;
  }
  function normalizeItems(raw: unknown): RecommendItem[] {
    const list = extractList(raw);
    return list.map((item) => {
      const obj = (item ?? {}) as Record<string, unknown>;
      return { ...obj, finalScore: normalizeFinalScore(obj.finalScore ?? obj.final_score) };
    });
  }

  /**
   * 发起一次推荐（**单次 POST**）。
   * `operationId` 非空时：同 op 在飞复用同一 Promise（不发起第二次请求、也不扣第二次费）。
   */
  function run(input: { userPhotoFilename: string; shopId: number; operationId?: string }): Promise<RecommendOutcome> {
    const key = input.operationId;
    if (key == null || key === "") return runOnce(input);
    const existing = inFlight.get(key);
    if (existing != null) return existing;
    const p = runOnce(input).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, p);
    return p;
  }

  return { run };
}
