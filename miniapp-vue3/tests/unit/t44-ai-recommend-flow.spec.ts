// T9b 内核测试：finalScore 归一口径、列表归一、⭐单次 POST（同 operationId 复用不重发）、失败分类与 message 优先级。
import { describe, expect, it } from "vitest";
import {
  createRecommendRunner,
  normalizeFinalScore,
  RECOMMEND_REQUEST_TIMEOUT_MS,
  shouldShowScore,
} from "../../src/application/ai-recommend-flow";
import type { RequestContext } from "../../src/ports/context";
import type { RepoResult } from "../../src/infrastructure/repositories/carousels";

const ctx: RequestContext = {
  platform: "mp-weixin",
  environment: "trial",
  brandId: null,
  requestId: "r",
  profileKey: "blueberry",
  appCode: "blueBerry",
  scopeRevision: 1,
  authRevision: 1,
};

describe("ai-recommend-flow · finalScore（P3-18）", () => {
  it("⭐仅 number>0 保留（含小数）；缺失/0/负数/字符串/NaN/null → null（禁止用原始 score 凑分）", () => {
    expect(normalizeFinalScore(88)).toBe(88);
    expect(normalizeFinalScore(88.5)).toBe(88.5);
    expect(normalizeFinalScore(0)).toBeNull();
    expect(normalizeFinalScore(-3)).toBeNull();
    expect(normalizeFinalScore(undefined)).toBeNull();
    expect(normalizeFinalScore(null)).toBeNull();
    expect(normalizeFinalScore("90")).toBeNull();
    expect(normalizeFinalScore(Number.NaN)).toBeNull();
    expect(normalizeFinalScore(Number.POSITIVE_INFINITY)).toBeNull();
    // 显示条件等价于「>0 且为有限数」
    expect(shouldShowScore({ finalScore: 1 })).toBe(true);
    expect(shouldShowScore({ finalScore: 0 })).toBe(false);
    expect(shouldShowScore({ score: 90 })).toBe(false); // 原始 score 不参与
  });

  it("同步扣费合同常量＝180s（旧端 :816）", () => {
    expect(RECOMMEND_REQUEST_TIMEOUT_MS).toBe(180000);
  });

  it("列表归一：显式产出 finalScore（缺失→null），其余字段原样保留", async () => {
    const { runner } = makeRunner({
      ok: true,
      value: { data: [{ id: 1, final_score: 77, style: "汉服" }, { id: 2, style: "旗袍", score: 99 }] },
    });
    const out = await runner.run({ userPhotoFilename: "u.png", shopId: 7 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.items[0].finalScore).toBe(77);
    expect(out.items[0].style).toBe("汉服");
    expect(out.items[1].finalScore).toBeNull(); // 只有原始 score → 不显示（不凑分）
  });
});

function makeRunner(result: RepoResult<Record<string, unknown>> | "throw", defer = false) {
  let calls = 0;
  const params: Array<Record<string, unknown>> = [];
  let resolveDeferred: (() => void) | null = null;
  const runner = createRecommendRunner({
    ai: {
      getRecommend: async (_c, p) => {
        calls += 1;
        params.push(p as unknown as Record<string, unknown>);
        if (defer) {
          await new Promise<void>((resolve) => {
            resolveDeferred = resolve;
          });
        }
        if (result === "throw") throw new Error("boom");
        return result;
      },
    },
    nextContext: () => ctx,
  });
  return { runner, calls: () => calls, params, release: () => resolveDeferred?.() };
}

describe("ai-recommend-flow · 请求纪律（P3-16/P3-17）", () => {
  it("⭐单次 POST：同 operationId 复用同一在飞过程（只 1 次请求，不扣第二次）", async () => {
    const f = makeRunner({ ok: true, value: { data: [] } }, true);
    const p1 = f.runner.run({ userPhotoFilename: "u.png", shopId: 7, operationId: "op-1" });
    const p2 = f.runner.run({ userPhotoFilename: "u.png", shopId: 7, operationId: "op-1" });
    expect(p1).toBe(p2); // 复用而非重发
    f.release();
    await Promise.all([p1, p2]);
    expect(f.calls()).toBe(1);
  });

  it("失败后**不自动重发**：仅调用方显式再次 run 才发起第二次", async () => {
    const f = makeRunner({ ok: false, error: { kind: "NETWORK" } });
    await expect(f.runner.run({ userPhotoFilename: "u.png", shopId: 7, operationId: "op-2" })).resolves.toMatchObject({ ok: false, kind: "NETWORK" });
    expect(f.calls()).toBe(1);
    await f.runner.run({ userPhotoFilename: "u.png", shopId: 7, operationId: "op-2" }); // 显式重试
    expect(f.calls()).toBe(2);
  });

  it("入参逐字：user_photo_filename／shop_id", async () => {
    const f = makeRunner({ ok: true, value: { data: [] } });
    await f.runner.run({ userPhotoFilename: "up.png", shopId: 7 });
    expect(f.params[0]).toEqual({ user_photo_filename: "up.png", shop_id: 7 });
  });

  it("失败分类与文案：4001→INSUFFICIENT_CREDITS（页面据此走共享支付）、AUTH_EXPIRED、NETWORK、业务 message 优先", async () => {
    const cases: Array<[RepoResult<Record<string, unknown>>, string]> = [
      [{ ok: false, error: { kind: "INSUFFICIENT_CREDITS" } }, "INSUFFICIENT_CREDITS"],
      [{ ok: false, error: { kind: "AUTH_EXPIRED" } }, "AUTH_EXPIRED"],
      [{ ok: false, error: { kind: "NETWORK" } }, "NETWORK"],
      [{ ok: false, error: { kind: "BUSINESS", message: "功能未启用" } }, "BUSINESS"],
    ];
    for (const [res, kind] of cases) {
      const f = makeRunner(res);
      const out = await f.runner.run({ userPhotoFilename: "u.png", shopId: 7 });
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.kind).toBe(kind);
        if (kind === "BUSINESS") expect(out.message).toBe("功能未启用");
      }
    }
    // 异常 → 网络类失败（不抛）
    const t = makeRunner("throw");
    await expect(t.runner.run({ userPhotoFilename: "u.png", shopId: 7 })).resolves.toMatchObject({ ok: false, kind: "NETWORK" });
  });
});
