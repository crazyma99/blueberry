// T72（2026-10-13 · 抖音登录契约对接）：**单次登录（loginCode ＋ phoneCode）**＋错误兜底＋平台参数。
// 契约事实源：后端仓 .project-wiki/docs/modules/login-frontend-integration.md（2026-10-13）。
// 本 spec 守卫：①契约 §5 错误关键字映射（单一事实源 mapLoginFailureMessage）；②单次提交（一次请求、无 bindPhone）；
// ③缺 phoneCode/取不到 loginCode 时零请求 fail-closed；④token 为空不建会话；⑤异常不抛；
// ⑥平台取码参数（抖音 force:true＋provider=toutiao；微信不带 force）；⑦LoginPopup 文案与接线（抖音同一按钮）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createPhoneLoginFlow, mapLoginFailureMessage } from "../../src/application/login-flow";
import { createUniLoginCode } from "../../src/platform/uni/login";
import type { RequestContext } from "../../src/ports/context";

const ctx: RequestContext = {
  platform: "mp-toutiao",
  environment: "trial",
  brandId: null,
  requestId: "r",
  profileKey: "blueberry",
  appCode: "blueBerry",
  scopeRevision: 1,
  authRevision: 1,
};

interface AuthCall { params: unknown }

/** 假登录仓储：记录每次 login 的入参（仓储面**不含** bindPhone——旧链路步骤已废弃） */
function fakeAuth(outcome: unknown | "throw") {
  const calls: AuthCall[] = [];
  return {
    calls,
    repo: {
      login: async (_c: RequestContext, params: unknown) => {
        calls.push({ params });
        if (outcome === "throw") throw new Error("boom");
        return outcome;
      },
    },
  };
}

function makeFlow(authOutcome: unknown | "throw", codeOutcome: string | null = "LOGIN-CODE") {
  const auth = fakeAuth(authOutcome);
  const sessions: Array<Record<string, unknown>> = [];
  const saved: Array<Record<string, unknown>> = [];
  const flow = createPhoneLoginFlow({
    wxAuth: auth.repo as never,
    authCoordinator: { completeLogin: (s: Record<string, unknown>) => sessions.push(s) } as never,
    userStore: { save: (u: Record<string, unknown>) => saved.push(u) } as never,
    context: () => ctx,
    platform: "mp-toutiao",
    profileKey: "blueberry",
    loginCode: { request: async () => codeOutcome },
  });
  return { flow, auth, sessions, saved };
}

describe("t72 · 契约 §5 错误兜底映射（mapLoginFailureMessage 单一事实源）", () => {
  it("⭐关键字表逐条映射；不把后端原文直接上屏；未知一律给通用可重试文案", () => {
    expect(mapLoginFailureMessage("登录失败：phoneCode 不能为空：本小程序需授权手机号后才能登录")).toContain("需授权手机号");
    expect(mapLoginFailureMessage("登录失败：手机号授权失败，请重试")).toBe("手机号获取失败，请重试");
    expect(mapLoginFailureMessage("getPhoneNumber err: no phone number")).toContain("尚未绑定手机号");
    expect(mapLoginFailureMessage("not login")).toBe("请先登录抖音，再继续");
    expect(mapLoginFailureMessage("invalid session")).toBe("请先登录抖音，再继续");
    expect(mapLoginFailureMessage("抖音登录未开通：appid/secret 未配置")).toContain("联系技术人员");
    // 抖音常见 code 错误码：过期(28005187)／不合法(28005185) ⇒ 提示重试
    expect(mapLoginFailureMessage("code expired 28005187")).toContain("请重试");
    expect(mapLoginFailureMessage("invalid code 28005185")).toContain("请重试");
    expect(mapLoginFailureMessage("28005186")).toContain("不匹配");
    expect(mapLoginFailureMessage("28005191")).toContain("公钥");
    expect(mapLoginFailureMessage("登录失败：服务器繁忙")).toBe("登录失败，请稍后重试");
    expect(mapLoginFailureMessage("")).toBe("登录失败，请稍后重试");
  });
});

describe("t72 · runPhoneLogin 单次登录（不再有 bindPhone 步骤）", () => {
  it("⭐成功：**一次**请求提交 {loginCode, phoneCode} ⇒ full 会话＋保存用户信息＋phoneHasFullProfile", async () => {
    const f = makeFlow({
      ok: true,
      value: { token: "TK-1", userInfo: { id: 9, nickname: "蓝梅", avatarUrl: "https://cdn/a.png", phone: "138****0000" } },
    });
    await f.flow.prefetchLoginCode(); // 2026-10-13：**先预取**（点按钮之前）——回调路径内不得再 uni.login
    expect(f.flow.hasValidLoginCode()).toBe(true);
    const out = await f.flow.runPhoneLogin("PHONE-CODE");
    expect(out).toEqual({ ok: true, phoneHasFullProfile: true });
    expect(f.auth.calls.length, "只允许一次登录请求").toBe(1);
    expect(f.auth.calls[0].params).toEqual({ loginCode: "LOGIN-CODE", phoneCode: "PHONE-CODE" });
    expect(f.sessions[0]).toMatchObject({ token: "TK-1", userId: "9", platform: "mp-toutiao", kind: "full" });
    expect(f.saved[0]).toMatchObject({ id: 9, nickname: "蓝梅" });
  });

  it("昵称/头像缺一 ⇒ phoneHasFullProfile=false（页面据此再弹完善资料）", async () => {
    const f = makeFlow({ ok: true, value: { token: "TK", userInfo: { id: 1, nickname: "蓝梅" } } });
    await f.flow.prefetchLoginCode(); // 2026-10-13：**先预取**（点按钮之前）——回调路径内不得再 uni.login
    const out = await f.flow.runPhoneLogin("P");
    expect(out).toMatchObject({ ok: true, phoneHasFullProfile: false });
  });

  it("⭐缺 phoneCode ⇒ 零请求＋可行动提示（errorKind=phone，页面不会覆盖成通用文案）", async () => {
    const f = makeFlow({ ok: true, value: { token: "TK", userInfo: {} } });
    await f.flow.prefetchLoginCode(); // 2026-10-13：**先预取**（点按钮之前）——回调路径内不得再 uni.login
    const out = await f.flow.runPhoneLogin("");
    expect(out).toMatchObject({ ok: false, errorKind: "phone" });
    expect(out.errorMsg).toContain("需授权手机号");
    expect(f.auth.calls.length).toBe(0);
  });

  it("取不到 loginCode ⇒ 零请求 fail-closed（errorKind=login）", async () => {
    const f = makeFlow({ ok: true, value: { token: "TK", userInfo: {} } }, null);
    await f.flow.prefetchLoginCode(); // 2026-10-13：**先预取**（点按钮之前）——回调路径内不得再 uni.login
    const out = await f.flow.runPhoneLogin("PHONE-CODE");
    expect(out).toMatchObject({ ok: false, errorKind: "login" });
    expect(f.auth.calls.length).toBe(0);
  });

  it("⭐服务端拒绝（抖音未开通）⇒ 用户可读映射＋保留 errorRaw 供排查，且**不建会话**", async () => {
    const f = makeFlow({
      ok: false,
      error: { kind: "BUSINESS", businessCode: 500, message: "抖音登录未开通：appid/secret 未配置", requestId: "r", retryable: false },
    });
    await f.flow.prefetchLoginCode(); // 2026-10-13：**先预取**（点按钮之前）——回调路径内不得再 uni.login
    expect(f.flow.hasValidLoginCode()).toBe(true);
    const out = await f.flow.runPhoneLogin("PHONE-CODE");
    expect(out).toMatchObject({ ok: false, errorKind: "wxlogin" });
    expect(out.errorMsg).toContain("联系技术人员");
    expect(out.errorMsg).not.toContain("appid/secret");
    expect(out.errorRaw).toBe("抖音登录未开通：appid/secret 未配置");
    expect(f.sessions.length).toBe(0);
  });

  it("⭐token 为空 ⇒ 不建会话、不上屏内部细节", async () => {
    const f = makeFlow({ ok: true, value: { token: "", userInfo: {} } });
    await f.flow.prefetchLoginCode(); // 2026-10-13：**先预取**（点按钮之前）——回调路径内不得再 uni.login
    const out = await f.flow.runPhoneLogin("P");
    expect(out).toMatchObject({ ok: false, errorKind: "wxlogin" });
    expect(out.errorMsg).toBe("登录失败，请稍后重试");
    expect(f.sessions.length).toBe(0);
  });

  it("仓储抛错 ⇒ 收敛为 unknown＋通用文案（不抛、不卡死）", async () => {
    const f = makeFlow("throw");
    await f.flow.prefetchLoginCode(); // 2026-10-13：**先预取**（点按钮之前）——回调路径内不得再 uni.login
    const out = await f.flow.runPhoneLogin("P");
    expect(out).toMatchObject({ ok: false, errorKind: "unknown", phoneHasFullProfile: false });
    expect(f.sessions.length).toBe(0);
  });
});

describe("t72 · 平台取码参数（platform/uni/login：抖音 force:true）", () => {
  it("⭐抖音：provider=toutiao 且 force=true；微信：provider=weixin 且不带 force", async () => {
    const seen: Array<Record<string, unknown>> = [];
    (globalThis as { uni?: unknown }).uni = {
      login: (o: Record<string, unknown>) => {
        seen.push(o);
        (o.success as (r: { code: string }) => void)({ code: "C1" });
      },
    };
    await expect(createUniLoginCode({ platform: "mp-toutiao" }).request()).resolves.toBe("C1");
    expect(seen[0]).toMatchObject({ provider: "toutiao", force: true });
    await createUniLoginCode({ platform: "mp-weixin" }).request();
    expect(seen[1]).toMatchObject({ provider: "weixin" });
    expect("force" in seen[1]).toBe(false);
  });
});

describe("t72 · LoginPopup 文案与接线（含过期注释订正）", () => {
  const src = readFileSync(resolve(__dirname, "../../src/components/LoginPopup/LoginPopup.vue"), "utf-8");

  it("⭐按钮文案＝「手机号一键登录」（抖音审核口径），不再有「一键登录」裸文案与「登陆」错别字", () => {
    expect(src).toContain("手机号一键登录");
    expect(src).not.toContain(">一键登录</button>");
    expect(src).not.toContain("登陆");
  });

  it("⭐两端共用同一手机号按钮：open-type=getPhoneNumber ＋ getphonenumber 回调透传（无平台分叉）", () => {
    expect(src).toContain('open-type="getPhoneNumber"');
    expect(src).toContain("@getphonenumber=\"emit('get-phone', $event)\"");
    // 无平台分叉：不得出现按端切换按钮/slot 的写法（本组件两端共用同一按钮）
    expect(src).not.toContain("platform === \"mp-toutiao\"");
  });

  it("⭐过期注释已订正：不再声称「抖音端 button open-type 不可用」，且登记了基础库门槛与契约事实源", () => {
    expect(src).not.toContain("该 open-type 不可用");
    expect(src).not.toContain("抖音端 button open-type 不可用");
    expect(src).toContain("3.51.0");
    expect(src).toContain("login-frontend-integration.md");
  });
});
