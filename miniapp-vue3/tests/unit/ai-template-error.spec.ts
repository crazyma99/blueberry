import { describe, expect, it } from "vitest";
import { TEMPLATE_LOAD_FAIL_TEXT, templateLoadErrorMessage } from "../../src/domain/ai-template-error";

describe("templateLoadErrorMessage（仅 BUSINESS 透传服务端 message）", () => {
  const cases: Array<[string, { kind: string; message: string } | null | undefined, string]> = [
    ["BUSINESS 透传", { kind: "BUSINESS", message: "服务繁忙" }, "服务繁忙"],
    ["BUSINESS 空 message 回落", { kind: "BUSINESS", message: "  " }, TEMPLATE_LOAD_FAIL_TEXT],
    ["NETWORK 回落", { kind: "NETWORK", message: "transport failure: network" }, TEMPLATE_LOAD_FAIL_TEXT],
    ["TIMEOUT 回落", { kind: "TIMEOUT", message: "transport failure: timeout" }, TEMPLATE_LOAD_FAIL_TEXT],
    ["AUTH_EXPIRED 回落", { kind: "AUTH_EXPIRED", message: "token expired" }, TEMPLATE_LOAD_FAIL_TEXT],
    ["UNKNOWN 回落", { kind: "UNKNOWN", message: "unexpected" }, TEMPLATE_LOAD_FAIL_TEXT],
    ["CANCELLED 回落", { kind: "CANCELLED", message: "transport failure: cancelled" }, TEMPLATE_LOAD_FAIL_TEXT],
    ["null 回落", null, TEMPLATE_LOAD_FAIL_TEXT],
  ];
  it.each(cases)("%s", (_n, err, expected) => {
    expect(templateLoadErrorMessage(err)).toBe(expected);
  });
  it("非 BUSINESS 的输出不含英文技术串", () => {
    for (const k of ["NETWORK", "TIMEOUT", "AUTH_EXPIRED", "UNKNOWN"]) {
      expect(templateLoadErrorMessage({ kind: k, message: "transport failure: x" })).not.toMatch(/[A-Za-z]/);
    }
  });
});
