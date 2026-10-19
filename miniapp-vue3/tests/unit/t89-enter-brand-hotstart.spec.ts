// T89（2026-10-19 · task-71 扫码切换商户 P0）：**热启动时 onLoad 不再执行** ⇒ onShow 必须消费本次进入参数。
// 真机现象：扫 A 进小程序后再扫 B（不杀进程）⇒ 仍停在 A。根因：唯一消费 scene/?brandId= 的是 onLoad；onShow 只比对基线。
// 口径：优先级＝扫码 scene > 分享卡片 ?brandId= > 记忆值；**与当前不同才**切换（防抖）＋ bumpScope() 作废在飞旧品牌响应；
// 「已知商家编码」校验仍由 versioned.saveBrandId 把关（2026-10-13 脏值 500 事故，不得绕过）。
// 唯一可信验收＝**真机热启动**（扫 A→切后台不杀→扫 B 必落 B）；本 spec 锁「纯函数优先级」「进入参数读取」「接线与变异靶点」。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeScene, resolveEnterBrand } from "../../src/domain/enter-brand";
import { readEnterOptions } from "../../src/platform/uni/enter-options";

const root = resolve(__dirname, "../..");
const g = globalThis as unknown as Record<string, unknown>;

afterEach(() => {
  delete g.uni;
});

describe("t89 · ①纯函数优先级：扫码 scene > 分享卡片 query.brandId > 记忆值 > 无", () => {
  it("⭐扫码优先：同时有 scene 与 query 时取 scene（source=scene）", () => {
    expect(resolveEnterBrand({ scene: "chayu", queryBrandId: "lanmei", storedBrandId: "huahua" })).toEqual({
      brandId: "chayu",
      source: "scene",
    });
  });

  it("⭐分享卡片次之：无 scene 时取 query.brandId", () => {
    expect(resolveEnterBrand({ scene: "", queryBrandId: "lanmei", storedBrandId: "huahua" })).toEqual({
      brandId: "lanmei",
      source: "query",
    });
  });

  it("⭐都无参数 ⇒ 回落记忆值；记忆也没有 ⇒ none（不动作）", () => {
    expect(resolveEnterBrand({ scene: "", queryBrandId: "", storedBrandId: "huahua" })).toEqual({
      brandId: "huahua",
      source: "stored",
    });
    expect(resolveEnterBrand({ scene: "", queryBrandId: "", storedBrandId: "" })).toEqual({ brandId: "", source: "none" });
  });

  it("⭐scene 两种线上形态都命中：整串即编码／kv 形态（brand=、b=、brandId=）／百分号编码／非法编码不抛", () => {
    expect(normalizeScene("lanmei")).toBe("lanmei");
    expect(normalizeScene("brand%3Dchayu")).toBe("chayu");
    expect(normalizeScene("b=chayu")).toBe("chayu");
    expect(normalizeScene("brandId=chayu&x=1")).toBe("chayu");
    expect(normalizeScene("%E8%93%9D%E6%A2%85")).toBe("蓝梅"); // 编码值可解
    expect(normalizeScene("a=%zz")).toBe(""); // kv 无品牌键 ⇒ 视为无参数（不误判成品牌）
    expect(() => normalizeScene("%")).not.toThrow(); // 非法编码不抛
    expect(normalizeScene("")).toBe("");
    expect(normalizeScene(null)).toBe("");
  });
});

describe("t89 · ②进入参数读取：query.scene（非场景值数字）＋ query.brandId；容器缺失/异常 fail-soft", () => {
  it("⭐真实形态：scene 是场景值数字、参数在 query.scene ⇒ 只取 query 里的值", () => {
    g.uni = { getEnterOptionsSync: () => ({ scene: 1047, query: { scene: "chayu", brandId: "lanmei" } }) };
    expect(readEnterOptions()).toEqual({ scene: "chayu", queryBrandId: "lanmei" });
  });

  it("⭐容器没有该 API／抛异常 ⇒ 全空且不抛（fail-soft，绝不阻断页面）", () => {
    expect(readEnterOptions()).toEqual({ scene: "", queryBrandId: "" });
    g.uni = {
      getEnterOptionsSync: () => {
        throw new Error("boom");
      },
    };
    expect(() => readEnterOptions()).not.toThrow();
    expect(readEnterOptions()).toEqual({ scene: "", queryBrandId: "" });
  });
});

describe("t89 · ③接线与变异靶点（首页 onShow 必须消费参数、必须 bumpScope）", () => {
  const src = readFileSync(resolve(root, "src/pages/index/index.vue"), "utf-8");

  it("⭐onShow 里调用 readEnterOptions() 并交给 applyEnterBrand（否则热启动丢商户）", () => {
    const onShow = src.slice(src.indexOf("onShow(() =>"), src.indexOf("onMounted(() =>"));
    expect(onShow).toContain("readEnterOptions()");
    expect(onShow).toContain("applyEnterBrand(");
  });

  it("⭐applyEnterBrand 只做本页注入（逻辑单一事实源＝编排器）：注入 bumpScope 与 onChanged", () => {
    const fn = src.slice(src.indexOf("function applyEnterBrand"), src.indexOf("onLoad((options)"));
    expect(fn).toContain("syncBrandFromEnterOptionsAsync(");
    expect(fn).toContain("refreshBrandCodes:");
    expect(fn).toContain("bumpScope:");
    expect(fn).toContain("onChanged:");
    // 顺序守卫下沉到编排器（compare → save → bump）
    const orch = readFileSync(resolve(root, "src/application/enter-brand-sync.ts"), "utf-8");
    const iCompare = orch.indexOf("resolved.brandId === current");
    const iSave = orch.indexOf("saveBrandId(resolved.brandId)");
    const iBump = orch.indexOf("bumpScope?.()");
    expect(iCompare).toBeGreaterThan(-1);
    expect(iSave).toBeGreaterThan(iCompare); // 相同则不写
    expect(iBump).toBeGreaterThan(iSave); // 写成功后才 bumpScope
  });

  it("⭐onLoad 也走同一 helper（冷启动/热启动同一套解析，不双份逻辑）", () => {
    const onLoad = src.slice(src.indexOf("onLoad((options)"), src.indexOf("// 右上角胶囊菜单"));
    expect(onLoad).toContain("applyEnterBrand(");
    expect(onLoad).not.toContain("versioned.saveBrandId("); // 只在 helper 里写
  });
});
