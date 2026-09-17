// T8/T9b contracts：AI（aiface）五端点请求形状（旧端 api.uts:440-664/800-820 冻结值）。
// 口径：aiface 成功码 0 或 200；recommend 为**同步扣费**（180s、never、禁重发）。
import { describe, expect, it } from "vitest";
import { createAiRepository } from "../../src/infrastructure/repositories/ai";
import type { ClientRequestInput, ClientResult } from "../../src/infrastructure/http/client";
import type { RequestContext } from "../../src/ports/context";

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

function fakeClient<T>(responses: Array<ClientResult<T>>) {
  const seen: ClientRequestInput[] = [];
  let i = 0;
  return {
    seen,
    client: {
      request: async <R,>(input: ClientRequestInput) => {
        seen.push(input);
        return responses[Math.min(i++, responses.length - 1)] as unknown as ClientResult<R>;
      },
    },
  };
}

describe("ai 契约（T8/T9b）", () => {
  it("getTemplates／getStyles：公开读 idempotent；空值参数不传（含空串）", async () => {
    const f = fakeClient([{ ok: true, value: [] }]);
    const repo = createAiRepository({ client: f.client });
    await repo.getTemplates(ctx);
    expect(f.seen[0]).toMatchObject({ method: "GET", url: "/api/aiface/templates", replayPolicy: "idempotent" });
    expect(Object.keys(f.seen[0].query ?? {})).toEqual([]);
    expect(f.seen[0].authRequired).toBeFalsy();
    const f2 = fakeClient([{ ok: true, value: [] }]);
    await createAiRepository({ client: f2.client }).getTemplates(ctx, {
      style: "汉服",
      keyword: "",
      shop_id: "3",
    });
    expect(f2.seen[0].query).toEqual({ style: "汉服", shop_id: "3" }); // keyword='' 不传
    const f3 = fakeClient([{ ok: true, value: [] }]);
    await createAiRepository({ client: f3.client }).getStyles(ctx, { shop_id: 3, category: "旗袍" });
    expect(f3.seen[0]).toMatchObject({ url: "/api/aiface/styles" });
    expect(f3.seen[0].query).toEqual({ category: "旗袍", shop_id: "3" });
  });

  it("submitTryOnTask：POST /api/aiface/tasks（需登录·never）；缺省可选字段不传", async () => {
    const f = fakeClient([{ ok: true, value: { task_id: 9 } }]);
    await createAiRepository({ client: f.client }).submitTryOnTask(ctx, {
      templateId: 11,
      userPhotoFilename: "u.png",
      shopId: 2,
    });
    expect(f.seen[0]).toMatchObject({
      method: "POST",
      url: "/api/aiface/tasks",
      authRequired: true,
      replayPolicy: "never",
    });
    expect(f.seen[0].body).toEqual({ templateId: 11, userPhotoFilename: "u.png", shopId: 2 });
    const f2 = fakeClient([{ ok: true, value: {} }]);
    await createAiRepository({ client: f2.client }).submitTryOnTask(ctx, {
      templateId: 11,
      userPhotoFilename: "u.png",
      shopId: 2,
      userOpenid: "o1",
      category: "汉服",
      bodyType: "标准",
      ageRange: "18-25",
    });
    expect(f2.seen[0].body).toEqual({
      templateId: 11,
      userPhotoFilename: "u.png",
      shopId: 2,
      userOpenid: "o1",
      category: "汉服",
      bodyType: "标准",
      ageRange: "18-25",
    });
  });

  it("getTasks：GET ?openid（需登录·idempotent）", async () => {
    const f = fakeClient([{ ok: true, value: [] }]);
    await createAiRepository({ client: f.client }).getTasks(ctx, "o1");
    expect(f.seen[0]).toMatchObject({
      method: "GET",
      url: "/api/aiface/tasks",
      query: { openid: "o1" },
      authRequired: true,
      replayPolicy: "idempotent",
    });
  });

  it("⭐getRecommend：POST（需登录·never·**timeout 180s 同步扣费禁重发**）", async () => {
    const f = fakeClient([{ ok: true, value: {} }]);
    await createAiRepository({ client: f.client }).getRecommend(ctx, { user_photo_filename: "u.png", shop_id: 2 });
    expect(f.seen[0]).toMatchObject({
      method: "POST",
      url: "/api/aiface/recommend",
      body: { user_photo_filename: "u.png", shop_id: 2 },
      authRequired: true,
      replayPolicy: "never",
      timeoutMs: 180000,
    });
  });
});
