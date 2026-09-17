// P3-13 契约：share 端点形状（从 tests/unit/t40 迁入 tests/contracts，收口 G2 复核 🟡②）。
import { describe, expect, it } from "vitest";
import { createAiRepository } from "../../src/infrastructure/repositories/ai";
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

describe("ai 契约 · getSharedTask（P3-13）", () => {
  it("GET /api/aiface/tasks/share/{token}（公开、无需登录、idempotent、token 编码）", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const repo = createAiRepository({
      client: {
        request: async <R,>(input: Record<string, unknown>) => {
          seen.push(input);
          return { ok: true, value: {} } as unknown as RepoResult<R>;
        },
      } as never,
    });
    await repo.getSharedTask(ctx, "a/b c");
    expect(seen[0]).toMatchObject({
      method: "GET",
      url: "/api/aiface/tasks/share/a%2Fb%20c",
      replayPolicy: "idempotent",
    });
    expect(seen[0].authRequired).toBeFalsy();
  });
});
