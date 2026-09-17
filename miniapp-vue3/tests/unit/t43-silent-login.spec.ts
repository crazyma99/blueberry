// P2-03 provider 侧测试：平台取 code（容器安全）＋静默换票（fail-closed，绝不伪造会话）。
import { beforeEach, describe, expect, it } from "vitest";
import { createUniLoginCode } from "../../src/platform/uni/login";
import { createSilentIdentityExchange } from "../../src/application/silent-login";
import type { RequestContext } from "../../src/ports/context";
import type { RepoResult } from "../../src/infrastructure/repositories/carousels";
import type { WxLoginResult } from "../../src/infrastructure/repositories/wx-auth";

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

beforeEach(() => {
  delete (globalThis as { uni?: unknown }).uni;
});

describe("platform/uni/login（P2-03 取 code）", () => {
  it("容器无 uni.login → null（不抛）", async () => {
    await expect(createUniLoginCode().request()).resolves.toBeNull();
  });

  it("成功：透传 code；缺 code／空串 → null；fail → null；容器抛错 → null", async () => {
    const okStub = (payload: Record<string, unknown>) => {
      (globalThis as { uni?: unknown }).uni = {
        login: (o: Record<string, unknown>) => (o.success as (r: unknown) => void)(payload),
      };
    };
    okStub({ code: "CODE-1" });
    await expect(createUniLoginCode().request()).resolves.toBe("CODE-1");
    okStub({});
    await expect(createUniLoginCode().request()).resolves.toBeNull();
    okStub({ code: "" });
    await expect(createUniLoginCode().request()).resolves.toBeNull();

    (globalThis as { uni?: unknown }).uni = {
      login: (o: Record<string, unknown>) => (o.fail as () => void)(),
    };
    await expect(createUniLoginCode().request()).resolves.toBeNull();

    (globalThis as { uni?: unknown }).uni = {
      login: () => {
        throw new Error("container boom");
      },
    };
    await expect(createUniLoginCode().request()).resolves.toBeNull();
  });

  it("调用参数：provider=weixin", async () => {
    let seen: Record<string, unknown> = {};
    (globalThis as { uni?: unknown }).uni = {
      login: (o: Record<string, unknown>) => {
        seen = o;
        (o.success as (r: unknown) => void)({ code: "C" });
      },
    };
    await createUniLoginCode().request();
    expect(seen.provider).toBe("weixin");
  });
});

describe("application/silent-login（P2-03 静默换票 · fail-closed）", () => {
  function make(loginResult: RepoResult<WxLoginResult> | "throw") {
    const calls: Array<Record<string, unknown>> = [];
    const exchange = createSilentIdentityExchange({
      getWxAuth: () => ({
        login: async (_c: RequestContext, params: { code: string }) => {
          calls.push(params as unknown as Record<string, unknown>);
          if (loginResult === "throw") throw new Error("boom");
          return loginResult;
        },
      }),
      loginCode: { request: async () => "CODE-1" },
      platform: "mp-weixin",
      profileKey: "blueberry",
    });
    return { exchange, calls };
  }

  it("成功：code → POST 换票 → Session（token/platform/profileKey/userId=openid；authRevision 由协调器覆盖）", async () => {
    const f = make({ ok: true, value: { token: "TK", userInfo: { openid: "o1" } } });
    await expect(f.exchange(ctx)).resolves.toEqual({
      ok: true,
      value: { userId: "o1", token: "TK", platform: "mp-weixin", profileKey: "blueberry", authRevision: 0 },
    });
    expect(f.calls[0]).toEqual({ code: "CODE-1" });
  });

  it("userInfo 无 openid → userId 为空串（不伪造）", async () => {
    const f = make({ ok: true, value: { token: "TK", userInfo: {} } });
    const r = await f.exchange(ctx);
    expect(r.ok && r.value.userId).toBe("");
  });

  it("⭐fail-closed：取不到 code／换票失败／token 为空／仓储抛错 → 一律 {ok:false, reason:'auth'}", async () => {
    // 取不到 code
    const noCode = createSilentIdentityExchange({
      getWxAuth: () => ({ login: async () => ({ ok: true, value: { token: "TK", userInfo: {} } }) }),
      loginCode: { request: async () => null },
      platform: "mp-weixin",
      profileKey: "blueberry",
    });
    await expect(noCode(ctx)).resolves.toEqual({ ok: false, reason: "auth" });

    for (const res of [
      { ok: false as const, error: { kind: "NETWORK" } },
      { ok: true as const, value: { token: "", userInfo: {} } },
      "throw" as const,
    ]) {
      const f = make(res);
      await expect(f.exchange(ctx)).resolves.toEqual({ ok: false, reason: "auth" });
    }
  });
});
