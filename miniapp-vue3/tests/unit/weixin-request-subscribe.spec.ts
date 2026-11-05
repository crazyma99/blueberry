// requestSubscribe（预约保证金订阅消息逐模板解析）单测：accept/reject/ban/filter/混合/无wx/fail/截断/空串/去重/canIUse。
// 并验证 requestTaskNotify 行为未变（现有 AI 链路继续用它）。
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_SUBSCRIBE_TMPL_IDS,
  requestSubscribe,
  requestTaskNotify,
} from "../../src/platform/weixin/capabilities";

type SubscribeOpts = {
  tmplIds: string[];
  success: (res: Record<string, unknown>) => void;
  fail: (err?: { errMsg?: string; errCode?: number }) => void;
};
type WxStub = {
  canIUse?: (schema: string) => boolean;
  requestSubscribeMessage?: (opts: SubscribeOpts) => void;
};

function setWx(stub: WxStub | undefined): void {
  if (stub === undefined) delete (globalThis as { wx?: unknown }).wx;
  else (globalThis as { wx?: unknown }).wx = stub;
}

afterEach(() => {
  delete (globalThis as { wx?: unknown }).wx;
});

describe("requestSubscribe：逐模板解析", () => {
  it("官方上限常量=5（见代码注释出处 URL）", () => {
    expect(MAX_SUBSCRIBE_TMPL_IDS).toBe(5);
  });

  it("全部 accept → ok=true，逐模板映射 accept", async () => {
    setWx({
      requestSubscribeMessage: (o) => o.success({ T1: "accept", T2: "accept" }),
    });
    const r = await requestSubscribe(["T1", "T2"]);
    expect(r).toEqual({ ok: true, results: { T1: "accept", T2: "accept" } });
  });

  it("全部 reject → ok=false（reject 不当成功）", async () => {
    setWx({ requestSubscribeMessage: (o) => o.success({ T1: "reject" }) });
    const r = await requestSubscribe(["T1"]);
    expect(r).toEqual({ ok: false, results: { T1: "reject" } });
  });

  it("混合 accept/reject/ban/filter → 有 accept 即 ok=true，逐模板如实映射", async () => {
    setWx({
      requestSubscribeMessage: (o) => o.success({ T1: "accept", T2: "reject", T3: "ban", T4: "filter" }),
    });
    const r = await requestSubscribe(["T1", "T2", "T3", "T4"]);
    expect(r.ok).toBe(true);
    expect(r.results).toEqual({ T1: "accept", T2: "reject", T3: "ban", T4: "filter" });
  });

  it("success 返回缺键/非法值 → 该模板记 unknown，不算 accept", async () => {
    setWx({ requestSubscribeMessage: (o) => o.success({ T1: "weird" }) }); // T2 缺键
    const r = await requestSubscribe(["T1", "T2"]);
    expect(r).toEqual({ ok: false, results: { T1: "unknown", T2: "unknown" } });
  });

  it("fail 回调（如关闭订阅总开关）→ fail-soft：ok=false、reason=failed、已请求模板置 reject，不抛", async () => {
    setWx({ requestSubscribeMessage: (o) => o.fail({ errCode: 20004, errMsg: "main switch off" }) });
    const r = await requestSubscribe(["T1", "T2"]);
    expect(r).toEqual({ ok: false, results: { T1: "reject", T2: "reject" }, reason: "failed" });
  });

  it("无 wx → unsupported（不抛）", async () => {
    setWx(undefined);
    expect(await requestSubscribe(["T1"])).toEqual({ ok: false, results: {}, reason: "unsupported" });
  });

  it("无 requestSubscribeMessage API → unsupported", async () => {
    setWx({});
    expect(await requestSubscribe(["T1"])).toEqual({ ok: false, results: {}, reason: "unsupported" });
  });

  it("canIUse=false（低基础库）→ unsupported，不调用", async () => {
    let called = false;
    setWx({
      canIUse: () => false,
      requestSubscribeMessage: () => {
        called = true;
      },
    });
    expect(await requestSubscribe(["T1"])).toEqual({ ok: false, results: {}, reason: "unsupported" });
    expect(called).toBe(false);
  });

  it("空数组/空串/全空白 → unsupported（不调 wx）", async () => {
    let called = false;
    setWx({ requestSubscribeMessage: () => (called = true) });
    expect(await requestSubscribe([])).toEqual({ ok: false, results: {}, reason: "unsupported" });
    expect(await requestSubscribe(["", "   "])).toEqual({ ok: false, results: {}, reason: "unsupported" });
    expect(called).toBe(false);
  });

  it("去重：重复模板只请求一次", async () => {
    let got: string[] = [];
    setWx({
      requestSubscribeMessage: (o) => {
        got = o.tmplIds;
        o.success({ T1: "accept" });
      },
    });
    await requestSubscribe(["T1", "T1", " T1 "]);
    expect(got).toEqual(["T1"]);
  });

  it("超过 5 条 → 截断取前 5 条", async () => {
    let got: string[] = [];
    setWx({
      requestSubscribeMessage: (o) => {
        got = o.tmplIds;
        const res: Record<string, string> = {};
        for (const id of o.tmplIds) res[id] = "accept";
        o.success(res);
      },
    });
    await requestSubscribe(["A", "B", "C", "D", "E", "F", "G"]);
    expect(got).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("requestSubscribeMessage 抛异常 → unsupported（容器安全）", async () => {
    setWx({
      requestSubscribeMessage: () => {
        throw new Error("boom");
      },
    });
    expect(await requestSubscribe(["T1"])).toEqual({ ok: false, results: {}, reason: "unsupported" });
  });
});

describe("requestTaskNotify：行为未变（旧 AI 链路继续使用）", () => {
  it("无 wx → unsupported", async () => {
    setWx(undefined);
    expect(await requestTaskNotify(["T1"])).toEqual({ ok: false, reason: "unsupported" });
  });
  it("success → ok:true（整体成功，不逐模板）", async () => {
    setWx({ requestSubscribeMessage: (o) => (o.success as () => void)() });
    expect(await requestTaskNotify(["T1"])).toEqual({ ok: true });
  });
  it("fail → ok:false reason rejected", async () => {
    setWx({ requestSubscribeMessage: (o) => (o.fail as () => void)() });
    expect(await requestTaskNotify(["T1"])).toEqual({ ok: false, reason: "rejected" });
  });
});
