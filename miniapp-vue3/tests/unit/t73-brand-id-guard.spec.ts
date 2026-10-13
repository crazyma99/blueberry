// T73（2026-10-13 真机全站空白事故的根因修复）：**X-Brand-Id 必须是「商家编码」**，非法值不写不发。
// 事故链：真机带 X-Brand-Id:<数字>（历史脏值）⇒ 后端 resolveRequestMerchant 对已存在的品牌头**不回落**、
// 直接 500「品牌不存在或已停用」⇒ 所有接口只剩 64 字节 ⇒ 真机整站空白（IDE 无该头故正常）。
// 本 spec 守卫：①形态＋命中列表校验（domain）②versioned 写入/读取双闸＋存量脏值清理
// ③**生产链路**下脏值 ⇒ 请求头里**不得出现 X-Brand-Id**；合法编码 ⇒ 正常带 ④品牌馆拉到列表后新商家可通过校验。
import { beforeEach, describe, expect, it } from "vitest";
import {
  KNOWN_BRAND_CODES_SEED,
  __resetBrandCodeWarnings,
  isBrandCodeShape,
  isKnownBrandCode,
  rememberKnownBrandCodes,
} from "../../src/domain/brand-code";
import { createVersionedStorage } from "../../src/infrastructure/storage/versioned";
import { createContextFactory } from "../../src/application/request-context";
import { createHttpClient } from "../../src/infrastructure/http/client";
import type { StoragePort } from "../../src/ports/storage";

/** 内存 storage 端口（同 versioned-storage.spec 口径） */
function memStorage(init: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(init));
  const port: StoragePort = {
    get: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    set: (k: string, v: string) => void map.set(k, v),
    remove: (k: string) => void map.delete(k),
  };
  return { port, map };
}

function buildVersioned(init: Record<string, string> = {}) {
  const s = memStorage(init);
  const versioned = createVersionedStorage({ backend: s.port, platform: "mp-weixin", profileKey: "blueberry" });
  return { versioned, map: s.map };
}

/** 生产链路：versioned → ctxFactory → http client（记录真的发出去的请求头） */
function buildClientWithBrand(brandRaw: string | null) {
  const init: Record<string, string> = {};
  if (brandRaw != null) init["lm.brand.v1"] = brandRaw;
  const s = memStorage(init);
  const versioned = createVersionedStorage({ backend: s.port, platform: "mp-weixin", profileKey: "blueberry" });
  const ctxFactory = createContextFactory({
    platform: "mp-weixin",
    environment: "trial",
    profileKey: "blueberry",
    appCode: "blueBerry",
    getBrandId: () => versioned.loadBrandId(),
  });
  const seen: Array<{ headers: Record<string, string> }> = [];
  const client = createHttpClient({
    transport: {
      request: async (input: { headers: Record<string, string> }) => {
        seen.push({ headers: input.headers });
        return { ok: true, value: { status: 200, businessCode: 200, message: "ok", requestId: "r", data: null } };
      },
    } as never,
    authCoordinator: {
      waitForLogin: async () => ({
        ok: true,
        value: { userId: "u", token: "t", platform: "mp-weixin", profileKey: "blueberry", authRevision: 0 },
      }),
    } as never,
  });
  return { client, ctxFactory, seen, map: s.map, versioned };
}

async function sendAndGetBrandHeader(f: ReturnType<typeof buildClientWithBrand>): Promise<string | undefined> {
  await f.client.request({ method: "GET", url: "/api/x", context: f.ctxFactory.next() });
  return f.seen[0].headers["X-Brand-Id"];
}

beforeEach(() => __resetBrandCodeWarnings());

describe("t73 · 商家编码校验（形态＋命中列表，domain/brand-code）", () => {
  it("⭐形态：接受字母/数字/短横线/下划线组合；**刻意不禁止纯数字**（线上确有 123323／123456789 这类合法编码）", () => {
    for (const ok of ["lanmei", "chayu", "nj-qiyue-qipao", "dd985-2", "123323", "123456789"]) {
      expect(isBrandCodeShape(ok), ok).toBe(true);
    }
    for (const bad of ["", " ", "-abc", "_abc", "a".repeat(65), "lan mei", "蓝梅", null, undefined, 1]) {
      expect(isBrandCodeShape(bad as unknown), String(bad)).toBe(false);
    }
  });

  it("⭐命中：离线种子 ✓；未知编码（形态合法也会被后端 500）✗；运行期注入后 ✓", () => {
    expect(isKnownBrandCode("lanmei")).toBe(true);
    expect(isKnownBrandCode("123323")).toBe(true);
    expect(isKnownBrandCode("foo")).toBe(false);
    expect(isKnownBrandCode("1")).toBe(false);
    expect(isKnownBrandCode(null)).toBe(false);
    rememberKnownBrandCodes(["newshop"]);
    expect(isKnownBrandCode("newshop")).toBe(true);
    expect(KNOWN_BRAND_CODES_SEED).toContain("lanmei");
  });
});

describe("t73 · versioned 品牌上下文双闸 + 存量脏值清理", () => {
  it("⭐存量脏值：读到数字/未知值 ⇒ 视为无品牌**并清理键**（含旧键 brand_id）", () => {
    const a = buildVersioned({ "lm.brand.v1": "1" });
    expect(a.versioned.loadBrandId()).toBeNull();
    expect(a.map.has("lm.brand.v1"), "脏值必须被清掉，否则老用户被长期锁死").toBe(false);
    const b = buildVersioned({ "lm.brand.v1": "foo" });
    expect(b.versioned.loadBrandId()).toBeNull();
    expect(b.map.has("lm.brand.v1")).toBe(false);
    const c = buildVersioned({ brand_id: "74" });
    expect(c.versioned.loadBrandId()).toBeNull();
    expect(c.map.has("brand_id")).toBe(false);
  });

  it("⭐合法值：真实商家编码可读（含数字形态编码），旧键迁移只在合法时发生", () => {
    const a = buildVersioned({ "lm.brand.v1": "123323" });
    expect(a.versioned.loadBrandId()).toBe("123323");
    const b = buildVersioned({ brand_id: "lanmei" });
    expect(b.versioned.loadBrandId()).toBe("lanmei");
    expect(b.map.get("lm.brand.v1")).toBe("lanmei");
  });

  it("⭐写入闸：saveBrandId 拒绝非法值（不写入、保留既有合法值）", () => {
    const a = buildVersioned({ "lm.brand.v1": "lanmei" });
    a.versioned.saveBrandId("1");
    a.versioned.saveBrandId("foo");
    expect(a.versioned.loadBrandId()).toBe("lanmei");
    const b = buildVersioned();
    b.versioned.saveBrandId("1");
    expect(b.map.has("lm.brand.v1")).toBe(false);
    b.versioned.saveBrandId("chayu");
    expect(b.map.get("lm.brand.v1")).toBe("chayu");
  });
});

describe("t73 · 生产链路：脏值 ⇒ 请求头不得出现 X-Brand-Id", () => {
  it("⭐数字脏值 / 未知编码 ⇒ **不带** X-Brand-Id；合法 lanmei ⇒ 正常带", async () => {
    expect(await sendAndGetBrandHeader(buildClientWithBrand("1"))).toBeUndefined();
    expect(await sendAndGetBrandHeader(buildClientWithBrand("foo"))).toBeUndefined();
    expect(await sendAndGetBrandHeader(buildClientWithBrand("lanmei"))).toBe("lanmei");
    expect(await sendAndGetBrandHeader(buildClientWithBrand(null))).toBeUndefined();
  });

  it("⭐品牌馆拉到列表后（rememberBrandCodes）新商家可通过校验并带出", async () => {
    const f = buildClientWithBrand("newshop");
    f.versioned.rememberBrandCodes(["newshop"]);
    expect(await sendAndGetBrandHeader(f)).toBe("newshop");
  });
});
