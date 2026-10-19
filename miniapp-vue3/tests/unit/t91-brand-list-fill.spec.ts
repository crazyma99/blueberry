// T91（2026-10-19 · task-71 **层2**）：干净环境扫码进「线上存在但离线种子没有」的商户也必须生效。
// 铁证（Lead 双向对照）：线上 prod /api/brands 9 条 = Here_Stadio／PLATFORM／chayu／huahua／huajianjiu／lanmei／qiyue／shiyue／xiaochen，
// 而旧种子只有 9 条里 3 条 ⇒ 新用户 lm.brands.v1 为空 & 未进过品牌馆时，扫其余 6 个商户会被 saveBrandId **静默拒写**
// ⇒ 冷热启动都切不过去（层2）。修法：①种子按线上补齐（只增不删）②判定放宽为「命中已知列表 ∪ 形态合法」（后端 d13654f 容错回落）
// ③命中缺失时后台补拉一次 GET /api/brands（一次/会话、超时、失败静默、不阻塞首屏）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KNOWN_BRAND_CODES_SEED, isAdmissibleBrandCode } from "../../src/domain/brand-code";
import { normalizeScene, resolveEnterBrand } from "../../src/domain/enter-brand";
import { createVersionedStorage } from "../../src/infrastructure/storage/versioned";
import { __resetBrandAllowlistRefresh, refreshKnownBrandCodesOnce } from "../../src/application/brand-allowlist";
import { syncBrandFromEnterOptionsAsync } from "../../src/application/enter-brand-sync";
import type { StoragePort } from "../../src/ports/storage";

const root = resolve(__dirname, "../..");
// 线上 prod /api/brands 实测（Lead 提供）
const PROD_CODES = ["Here_Stadio", "PLATFORM", "chayu", "huahua", "huajianjiu", "lanmei", "qiyue", "shiyue", "xiaochen"];

afterEach(() => __resetBrandAllowlistRefresh());

function memStorage(init: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(init));
  const port: StoragePort = {
    get: (k) => (map.has(k) ? (map.get(k) as string) : null),
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
  return { port, map };
}
function buildVersioned(init: Record<string, string> = {}) {
  const s = memStorage(init);
  return { versioned: createVersionedStorage({ backend: s.port, platform: "mp-weixin", profileKey: "blueberry" }), map: s.map };
}

describe("t91 · ①离线种子按线上补齐（只增不删）", () => {
  it("⭐线上 9 个商户编码全部在种子里（旧 6 条也保留，不删）", () => {
    for (const code of PROD_CODES) expect(KNOWN_BRAND_CODES_SEED, code).toContain(code);
    // 只增不删：旧种子里的历史值仍在
    for (const old of ["123323", "123456789", "jiandan", "nj-qiyue-qipao", "dd985", "dd985-2"]) {
      expect(KNOWN_BRAND_CODES_SEED, old).toContain(old);
    }
  });
});

describe("t91 · ②干净环境（lm.brands.v1 为空）⇒ 种子外商户也能写入（旧行为＝静默拒写）", () => {
  it("⭐saveBrandId('xiaochen') 在空缓存下必须生效（形态合法即接受）", () => {
    const { versioned, map } = buildVersioned(); // 干净环境
    versioned.saveBrandId("xiaochen");
    expect(map.get("lm.brand.v1")).toBe("xiaochen");
    expect(versioned.loadBrandId()).toBe("xiaochen");
    // ⭐task-72：**形态即准入**（名单不再是闸门）
    expect(isAdmissibleBrandCode("xiaochen")).toBe(true);
    expect(isAdmissibleBrandCode("huajianjiu")).toBe(true);
    expect(isAdmissibleBrandCode("brand_new_x")).toBe(true); // ⒜ 任何名单都没有、形态合法 ⇒ 接受
    const c = buildVersioned(); // 干净环境 + 任何名单都没有的编码 ⇒ **旧行为＝静默拒写**，新行为＝接受
    c.versioned.saveBrandId("some-brand-2026");
    expect(c.map.get("lm.brand.v1")).toBe("some-brand-2026");
    const d = buildVersioned();
    d.versioned.saveBrandId("brand_new_x");
    expect(d.map.get("lm.brand.v1")).toBe("brand_new_x");
    // ⒞ 脏形态仍拒写（含空格/中文/超长/以连字符开头）
    for (const bad of ["lan mei", "蓝梅", "a".repeat(70), "-abc"]) {
      expect(isAdmissibleBrandCode(bad), bad).toBe(false);
      const h = buildVersioned();
      h.versioned.saveBrandId(bad);
      expect(h.map.has("lm.brand.v1"), bad).toBe(false);
    }
  });
});

describe("t91 · ③后台补齐已知列表：一次/会话、超时/失败静默、不重试风暴", () => {
  it("⭐成功补齐一次 ⇒ rememberBrandCodes 被调用；二次调用不再发起请求", async () => {
    let fetches = 0;
    const remembered: string[][] = [];
    const deps = {
      fetchBrandCodes: async () => {
        fetches += 1;
        return ["lanmei", "xiaochen"];
      },
      rememberBrandCodes: (codes: string[]) => void remembered.push(codes),
    };
    expect(await refreshKnownBrandCodesOnce(deps)).toBe(true);
    expect(fetches).toBe(1);
    expect(remembered[0]).toEqual(["lanmei", "xiaochen"]);
    expect(await refreshKnownBrandCodesOnce(deps)).toBe(false); // 已封盘
    expect(fetches).toBe(1); // 不重复拉取
  });

  it("⭐失败/超时 ⇒ 返回 false 且**本会话不再重试**（防风暴）", async () => {
    let fetches = 0;
    const deps = {
      fetchBrandCodes: async () => {
        fetches += 1;
        return null;
      },
      rememberBrandCodes: () => undefined,
    };
    expect(await refreshKnownBrandCodesOnce(deps)).toBe(false);
    expect(await refreshKnownBrandCodesOnce(deps)).toBe(false);
    expect(fetches).toBe(1);
  });
});

describe("t91 · ③b 补齐失败（网络错）⇒ 仍按形态接受并切换", () => {
  it("⭐fetchBrandCodes 抛错时切换照样成立（名单只作离线兜底）", async () => {
    const { versioned } = buildVersioned({ "lm.brand.v1": "lanmei" });
    const result = await syncBrandFromEnterOptionsAsync({
      readEnterOptions: () => ({ scene: "shiyue", queryBrandId: "" }),
      loadBrandId: () => versioned.loadBrandId(),
      saveBrandId: (id) => versioned.saveBrandId(id),
      bumpScope: () => undefined,
      refreshBrandCodes: {
        fetchBrandCodes: async () => {
          throw new Error("network down");
        },
        rememberBrandCodes: () => undefined,
      },
      onChanged: () => undefined,
    });
    expect(result).toEqual({ changed: true, brandId: "shiyue", source: "scene" });
    expect(versioned.loadBrandId()).toBe("shiyue");
  });
});

describe("t91 · ④不阻塞：未知编码也立即切换（补齐在后台进行）", () => {
  it("⭐fetch 永不返回时，切换依然立刻完成（先写上下文，再后台补齐）", async () => {
    const { versioned } = buildVersioned({ "lm.brand.v1": "lanmei" });
    const bumps: string[] = [];
    const never = new Promise<string[] | null>(() => undefined);
    const result = await syncBrandFromEnterOptionsAsync({
      readEnterOptions: () => ({ scene: "qiyue", queryBrandId: "" }),
      loadBrandId: () => versioned.loadBrandId(),
      saveBrandId: (id) => versioned.saveBrandId(id),
      bumpScope: () => void bumps.push("bump"),
      refreshBrandCodes: { fetchBrandCodes: () => never, rememberBrandCodes: () => undefined },
      onChanged: () => undefined,
    });
    expect(result).toEqual({ changed: true, brandId: "qiyue", source: "scene" });
    expect(bumps).toEqual(["bump"]);
    expect(versioned.loadBrandId()).toBe("qiyue"); // 已落上下文（未等网络）
  });
});

describe("t91 · ④b PLATFORM（平台占位品牌）⇒ 视为「无品牌上下文」，不切换商户", () => {
  it("⭐normalizeScene(PLATFORM)=\"\"；resolveEnterBrand 回落到下一优先级", () => {
    expect(normalizeScene("PLATFORM")).toBe("");
    expect(normalizeScene("brand%3DPLATFORM")).toBe(""); // kv 形态同样过滤
    expect(resolveEnterBrand({ scene: "PLATFORM", queryBrandId: "", storedBrandId: "lanmei" })).toEqual({
      brandId: "lanmei",
      source: "stored",
    });
  });
});

describe("t91 · ⑤接线守卫（变异靶点）", () => {
  it("⭐首页把 refreshBrandCodes 注入编排器（去掉 ⇒ 已知列表永不补齐）", () => {
    const src = readFileSync(resolve(root, "src/pages/index/index.vue"), "utf-8");
    expect(src).toContain("refreshBrandCodes:");
    expect(src).toContain("brandRepo.getBrands(");
    const orch = readFileSync(resolve(root, "src/application/enter-brand-sync.ts"), "utf-8");
    expect(orch).toContain("refreshKnownBrandCodesOnce(");
  });
});
