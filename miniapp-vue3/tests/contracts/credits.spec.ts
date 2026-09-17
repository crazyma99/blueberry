// T9a contracts：credits 四端点请求形状（旧端 api.uts:678-780 冻结值）——method/url/参数位/认证/重放策略。
import { describe, expect, it } from "vitest";
import { createCreditRepository } from "../../src/infrastructure/repositories/credits";
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

describe("credits 契约（T9a，四端点均需登录）", () => {
  it("getBalance：GET /api/aiface/credit/balance 参数按需携带（shopId/feature/taskId）", async () => {
    const f = fakeClient([{ ok: true, value: { balance: 1, inited: true, priceFenPerCredit: 990 } }]);
    const repo = createCreditRepository({ client: f.client });
    await repo.getBalance(ctx);
    expect(f.seen[0]).toMatchObject({
      method: "GET",
      url: "/api/aiface/credit/balance",
      authRequired: true,
      replayPolicy: "idempotent",
    });
    expect(Object.keys(f.seen[0].query ?? {})).toEqual([]); // 全可选：不传就不带
    const f2 = fakeClient([{ ok: true, value: {} }]);
    await createCreditRepository({ client: f2.client }).getBalance(ctx, {
      shopId: 7,
      feature: "recommend",
      taskId: 33,
    });
    expect(f2.seen[0].query).toEqual({ shopId: "7", feature: "recommend", taskId: "33" });
  });

  it("createRecharge：POST 下单（含 feature/taskId 条件字段），never 重放", async () => {
    const f = fakeClient([{ ok: true, value: { outTradeNo: "T1" } }]);
    await createCreditRepository({ client: f.client }).createRecharge(ctx, { shopId: 1, credits: 1 });
    expect(f.seen[0]).toMatchObject({
      method: "POST",
      url: "/api/aiface/credit/recharge",
      authRequired: true,
      replayPolicy: "never",
    });
    // 严格等值（CR 🟡6）：最小入参不得多带 feature/taskId（含 undefined）
    expect(f.seen[0].body).toEqual({ shopId: 1, credits: 1 });
    const f2 = fakeClient([{ ok: true, value: {} }]);
    await createCreditRepository({ client: f2.client }).createRecharge(ctx, {
      shopId: 1,
      credits: 1,
      feature: "download",
      taskId: 9,
    });
    expect(f2.seen[0].body).toEqual({ shopId: 1, credits: 1, feature: "download", taskId: 9 });
  });

  it("getRechargeStatus：GET ?outTradeNo（轮询到账用）；redeemCode：POST {code}", async () => {
    const f = fakeClient([{ ok: true, value: { outTradeNo: "T1", status: 1, paid: true, credits: 1, balance: 5 } }]);
    await createCreditRepository({ client: f.client }).getRechargeStatus(ctx, "T1");
    expect(f.seen[0]).toMatchObject({
      method: "GET",
      url: "/api/aiface/credit/recharge/status",
      query: { outTradeNo: "T1" },
      authRequired: true,
      replayPolicy: "idempotent",
    });
    const f2 = fakeClient([{ ok: true, value: { creditsAdded: 1, balance: 2 } }]);
    await createCreditRepository({ client: f2.client }).redeemCode(ctx, "ABC123456789");
    expect(f2.seen[0]).toMatchObject({
      method: "POST",
      url: "/api/aiface/credit/redeem",
      body: { code: "ABC123456789" },
      authRequired: true,
      replayPolicy: "never",
    });
  });
});
