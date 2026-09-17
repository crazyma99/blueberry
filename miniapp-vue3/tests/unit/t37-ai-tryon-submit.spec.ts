// T8 S4：AI 试衣提交用例测试——守卫顺序与文案逐字、付费前置充值、4001→充值、成功扣 1 次、错误 message 优先、次数查询。
import { describe, expect, it } from "vitest";
import { createTryOnSubmitter, loadCreditInfo, type SubmitInput } from "../../src/application/ai-tryon-submit";
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

const base: SubmitInput = {
  uploadedFilename: "up.png",
  photoPath: "/tmp/a.jpg",
  isUploading: false,
  isSubmitting: false,
  isLoggedIn: true,
  shopId: "7",
  templates: [{ id: 11 }, { id: 12 }],
  currentTemplateIndex: 1,
  isPaidMode: true,
  creditBalance: 3,
  bodyTypeText: "标准",
  ageRange: "18-25",
  openid: "o1",
};

function makeSubmitter(result: { ok: true; value: { task_id: number } } | { ok: false; error: { kind: string; message?: string } }) {
  const calls: Array<Record<string, unknown>> = [];
  const submitter = createTryOnSubmitter({
    ai: {
      submitTryOnTask: async (_c, params) => {
        calls.push(params as unknown as Record<string, unknown>);
        return result;
      },
    },
    nextContext: () => ctx,
  });
  return { submitter, calls };
}

describe("application/ai-tryon-submit（T8 S4 提交用例）", () => {
  it("⭐守卫顺序与文案逐字：重复点击→登录→上传中→未选照片→上传失败→无模板→未选中模板", async () => {
    const { submitter, calls } = makeSubmitter({ ok: true, value: { task_id: 1 } });
    expect((await submitter.submit({ ...base, isSubmitting: true })).kind).toBe("ignored");
    expect((await submitter.submit({ ...base, isLoggedIn: false })).kind).toBe("need-login");
    expect(await submitter.submit({ ...base, isUploading: true })).toEqual({ kind: "toast", message: "照片上传中，请稍候" });
    expect(await submitter.submit({ ...base, photoPath: "" })).toEqual({ kind: "toast", message: "请先上传照片" });
    expect(await submitter.submit({ ...base, uploadedFilename: "" })).toEqual({ kind: "toast", message: "照片上传失败，请重新选择" });
    expect(await submitter.submit({ ...base, templates: [] })).toEqual({ kind: "toast", message: "暂无可用模板" });
    expect(await submitter.submit({ ...base, currentTemplateIndex: 5 })).toEqual({ kind: "toast", message: "请选择模板" });
    expect(calls.length).toBe(0); // 守卫阶段零提交
  });

  it("⭐付费模式且余额≤0 → 直接 need-recharge（省一次必败请求，不提交）", async () => {
    const { submitter, calls } = makeSubmitter({ ok: true, value: { task_id: 1 } });
    const out = await submitter.submit({ ...base, isPaidMode: true, creditBalance: 0 });
    expect(out).toEqual({ kind: "need-recharge", reason: "no-credits" });
    expect(calls.length).toBe(0);
  });

  it("成功：提交参数逐字（category travel／bodyType／ageRange／userOpenid），付费模式余额 -1 并回传 taskId", async () => {
    const { submitter, calls } = makeSubmitter({ ok: true, value: { task_id: 99 } });
    const out = await submitter.submit(base);
    expect(out).toEqual({ kind: "submitted", taskId: 99, shopId: 7, balanceAfter: 2 });
    expect(calls[0]).toEqual({
      templateId: 12,
      userPhotoFilename: "up.png",
      shopId: 7,
      userOpenid: "o1",
      category: "travel",
      bodyType: "标准",
      ageRange: "18-25",
    });
  });

  it("非付费模式：余额不变；openid 为空则不传该字段", async () => {
    const { submitter, calls } = makeSubmitter({ ok: true, value: { task_id: 5 } });
    const out = await submitter.submit({ ...base, isPaidMode: false, openid: "" });
    expect(out).toMatchObject({ kind: "submitted", balanceAfter: 3 });
    expect("userOpenid" in (calls[0] ?? {})).toBe(false);
  });

  it("⭐4001（INSUFFICIENT_CREDITS）→ need-recharge(insufficient)，页面交由共享协调器而非自建轮询", async () => {
    const { submitter } = makeSubmitter({ ok: false, error: { kind: "INSUFFICIENT_CREDITS" } });
    await expect(submitter.submit(base)).resolves.toEqual({ kind: "need-recharge", reason: "insufficient" });
  });

  it("其它业务错误：优先服务端 message；无 message 时回「提交失败」；网络错误同口径", async () => {
    const withMsg = makeSubmitter({ ok: false, error: { kind: "BUSINESS", message: "功能未启用" } });
    await expect(withMsg.submitter.submit(base)).resolves.toEqual({ kind: "toast", message: "功能未启用" });
    const noMsg = makeSubmitter({ ok: false, error: { kind: "BUSINESS" } });
    await expect(noMsg.submitter.submit(base)).resolves.toEqual({ kind: "toast", message: "提交失败" });
    const net = makeSubmitter({ ok: false, error: { kind: "NETWORK" } });
    await expect(net.submitter.submit(base)).resolves.toEqual({ kind: "toast", message: "提交失败" });
  });
});

describe("application/ai-tryon-submit · loadCreditInfo（旧端 :629-643）", () => {
  function credits(result: { ok: true; value: { balance: number; inited: boolean; priceFenPerCredit: number } } | { ok: false; error: { kind: string } }) {
    const seen: Array<Record<string, unknown> | undefined> = [];
    return {
      seen,
      repo: {
        getBalance: async (_c: RequestContext, params?: { shopId?: number }) => {
          seen.push(params as Record<string, unknown> | undefined);
          return result;
        },
      },
    };
  }

  it("shopId>0 时带参数；成功返回 balance/priceFenPerCredit", async () => {
    const f = credits({ ok: true, value: { balance: 2, inited: true, priceFenPerCredit: 990 } });
    await expect(loadCreditInfo({ credits: f.repo, context: ctx }, { shopId: "7" })).resolves.toEqual({
      balance: 2,
      priceFenPerCredit: 990,
    });
    expect(f.seen[0]).toEqual({ shopId: 7 });
  });

  it("shopId 非法/为 0 → 不带参数；失败 → null（页面静默保持原按钮）", async () => {
    const f = credits({ ok: true, value: { balance: 1, inited: true, priceFenPerCredit: 0 } });
    await loadCreditInfo({ credits: f.repo, context: ctx }, { shopId: "abc" });
    expect(f.seen[0]).toBeUndefined();
    const bad = credits({ ok: false, error: { kind: "NETWORK" } });
    await expect(loadCreditInfo({ credits: bad.repo, context: ctx }, { shopId: "7" })).resolves.toBeNull();
  });
});
