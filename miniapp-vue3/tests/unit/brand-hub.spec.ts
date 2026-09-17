// P1-10 品牌馆严格 boolean 测试（先红后绿：实现见 src/domain/brand-hub.ts）
// 来源口径：旧端 src/utils/pageConfig.uts（2026-09-17 迁移移植核对）
import { describe, expect, it } from "vitest";
import { brandHubEnabled, parseBrandHubResponse } from "../../src/domain/brand-hub";

describe("brandHubEnabled 严格 boolean（缺实现即红）", () => {
  it.each<[unknown, boolean]>([
    [undefined, false],
    [null, false],
    [42, false],
    [{}, false],
    ["", false],
    ["broken", false],
    ["{}", false],
    ["null", false],
    ["[]", false],
    ['{"enabled":false}', false],
    ['{"enabled":"true"}', false],
    ['{"enabled":1}', false],
    ['{"enabled":true}', true],
    ['{"enabled":true,"extra":1}', true],
  ])("brandHubEnabled(%j) === %j", (input, expected) => {
    expect(brandHubEnabled(input)).toBe(expected);
  });
});

describe("parseBrandHubResponse（移植旧端 page-config 响应口径）", () => {
  const wrap = (data: unknown, code: unknown = 200) => ({ code, data });
  const comp = (config: unknown) => ({ type: "brand_hub", config });

  it("null/undefined 响应 → false", () => {
    expect(parseBrandHubResponse(null)).toBe(false);
    expect(parseBrandHubResponse(undefined)).toBe(false);
  });
  it("code 非 200 → false", () => {
    expect(parseBrandHubResponse(wrap([comp('{"enabled":true}')], 500))).toBe(false);
  });
  it("data 非数组 → false", () => {
    expect(parseBrandHubResponse(wrap("not-array"))).toBe(false);
  });
  it("无 brand_hub 组件 → false", () => {
    expect(parseBrandHubResponse(wrap([{ type: "banner", config: '{"enabled":true}' }]))).toBe(false);
  });
  it("brand_hub config 空串/缺失 → false", () => {
    expect(parseBrandHubResponse(wrap([comp("")]))).toBe(false);
    expect(parseBrandHubResponse(wrap([comp(null)]))).toBe(false);
  });
  it("config 非法 JSON → false", () => {
    expect(parseBrandHubResponse(wrap([comp("broken")]))).toBe(false);
  });
  it("enabled 严格 true → true；字符串 true → false", () => {
    expect(parseBrandHubResponse(wrap([comp('{"enabled":true}')]))).toBe(true);
    expect(parseBrandHubResponse(wrap([comp('{"enabled":"true"}')]))).toBe(false);
  });
});
