// 2026-09-22 主人「风格和主题请绑定 token」：字体族也要有单一事实源 ⇒ 生成器放行 `fontFamily*`（其余键仍严格白名单）。
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTokens } from "../../scripts/generate-tokens.mjs";

const base = (primitive: Record<string, unknown>): string => {
  const dir = mkdtempSync(join(tmpdir(), "tok-"));
  const f = join(dir, "source.json");
  writeFileSync(f, JSON.stringify({ primitive, semantic: { colorAction: "{primitive.gold}" }, component: {} }));
  return f;
};

describe("token：字体族白名单（fontFamily*）", () => {
  it("fontFamilyBody/Serif 字符串被放行，并生成 `$font-family-*` scss 变量", () => {
    const src = base({ gold: "#F1CD91", fontFamilyBody: "HarmonyOS-Sans-SC", fontFamilySerif: "NotoSerifSC-Bold" });
    const out = mkdtempSync(join(tmpdir(), "out-"));
    generateTokens({ sourceFile: src, outputDir: out });
    const scss = readFileSync(join(out, "theme.scss"), "utf-8");
    expect(scss).toContain("$font-family-body");
    expect(scss).toContain("$font-family-serif");
    expect(scss).toMatch(/\$font-family-body:\s*HarmonyOS-Sans-SC;/);
  });

  it("非 fontFamily 键仍严格（`px` 等非法单位继续报错）", () => {
    const src = base({ gold: "#F1CD91", gapPx: "12px" });
    expect(() => generateTokens({ sourceFile: src, outputDir: mkdtempSync(join(tmpdir(), "out-")) })).toThrow(/bad unit/);
  });
});
