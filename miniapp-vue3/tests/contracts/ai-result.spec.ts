// T8 S5-2 契约测试：结果三端点（任务详情 / 下载扣费）——method/url/认证/重放策略与 token 口径。
import { describe, expect, it } from "vitest";
import { createAiResultRepository } from "../../src/infrastructure/repositories/ai-result";
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

function fakeClient() {
  const seen: Array<Record<string, unknown>> = [];
  return {
    seen,
    client: {
      request: async <R,>(input: Record<string, unknown>) => {
        seen.push(input);
        return { ok: true, value: {} } as unknown as RepoResult<R>;
      },
    } as never,
  };
}

describe("ai-result 契约（T8 S5-2）", () => {
  it("任务详情：GET /api/aiface/tasks/{taskId}，**需登录（authRequired）**＋idempotent（2026-09-20 修正：后端仅本人可读）", async () => {
    const f = fakeClient();
    await createAiResultRepository({ client: f.client }).getResult(ctx, "42");
    expect(f.seen[0]).toMatchObject({ method: "GET", url: "/api/aiface/tasks/42", replayPolicy: "idempotent" });
    expect(f.seen[0].authRequired).toBe(true); // 2026-09-20：详情需本人身份
  });

  it("⭐下载：GET /api/aiface/tasks/{taskId}/download，**需登录**且 `replayPolicy:'never'`（扣 1 次出签名 URL，禁自动重放）", async () => {
    const f = fakeClient();
    await createAiResultRepository({ client: f.client }).downloadResult(ctx, "42");
    expect(f.seen[0]).toMatchObject({
      method: "GET",
      url: "/api/aiface/tasks/42/download",
      authRequired: true,
      replayPolicy: "never",
    });
  });
});

describe("⭐2026-09-20 修复：任务详情必须带登录态（authRequired）", () => {
  it("getResult 的请求入参 authRequired === true（无 token 会被后端 401 ⇒ 曾误显示「生成失败」）", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const repo = createAiResultRepository({
      client: {
        request: async <R,>(input: Record<string, unknown>) => {
          seen.push(input);
          return { ok: true, value: { id: 1, status: "completed", result_image_url: "u" } } as unknown as RepoResult<R>;
        },
      } as never,
    });
    await repo.getResult(ctx, 141);
    expect(seen[0].authRequired).toBe(true);
    expect(String(seen[0].url)).toContain("/api/aiface/tasks/141");
  });
});
