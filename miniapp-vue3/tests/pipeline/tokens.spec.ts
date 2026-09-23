// P1-21 Token 生成测试：失败用例（循环引用/未知引用/错误单位）＋幂等＋只写 outputDir
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateTokens } from "../../scripts/generate-tokens.mjs";

const root = resolve(__dirname, "../..");
const realSource = resolve(root, "tokens/source.json");

function tmpWithFixture(fixture) {
  const dir = mkdtempSync(join(tmpdir(), "tokens-"));
  const src = join(dir, "source.json");
  writeFileSync(src, JSON.stringify(fixture));
  return { dir, src };
}

describe("generateTokens 真实源（P1-20 盘点值落地）", () => {
  it("生成 tokens.ts/theme.css/theme.scss，语义引用解析到 primitive 值", () => {
    const out = mkdtempSync(join(tmpdir(), "tokout-"));
    const r = generateTokens({ sourceFile: realSource, outputDir: out });
    expect(r.files.sort()).toEqual(["theme.css", "theme.scss", "tokens.ts"]);
    const css = readFileSync(join(out, "theme.css"), "utf-8");
    const ts = readFileSync(join(out, "tokens.ts"), "utf-8");
    const scss = readFileSync(join(out, "theme.scss"), "utf-8");
    // semantic colorAction 解析为 primitive.gold 的实测值
    expect(css).toContain("--color-action: #F1CD91");
    expect(ts).toContain('"colorAction": "#F1CD91"');
    expect(scss).toContain("$color-action: #F1CD91;");
    // component 数值
    expect(css).toContain("--button-height-rpx: 88");
    // digest 稳定字段
    expect(typeof r.digest).toBe("string");
    expect(r.digest).toMatch(/^[0-9a-f]{64}$/);
  });
  it("幂等：同源两次生成字节一致", () => {
    const o1 = mkdtempSync(join(tmpdir(), "tokA-"));
    const o2 = mkdtempSync(join(tmpdir(), "tokB-"));
    const r1 = generateTokens({ sourceFile: realSource, outputDir: o1 });
    const r2 = generateTokens({ sourceFile: realSource, outputDir: o2 });
    expect(r2.digest).toBe(r1.digest);
    for (const f of r1.files) {
      expect(readFileSync(join(o2, f), "utf-8")).toBe(readFileSync(join(o1, f), "utf-8"));
    }
  });
  it("只写 outputDir（sourceDir sentinel 未动）", () => {
    const dir = mkdtempSync(join(tmpdir(), "toksrc-"));
    writeFileSync(join(dir, "sentinel.txt"), "keep");
    const src = join(dir, "source.json");
    writeFileSync(src, readFileSync(realSource, "utf-8"));
    const out = join(dir, "out"); mkdirSync(out);
    generateTokens({ sourceFile: src, outputDir: out });
    expect(readdirSync(dir).sort()).toEqual(["out", "sentinel.txt", "source.json"]);
    expect(readFileSync(join(dir, "sentinel.txt"), "utf-8")).toBe("keep");
  });
});

describe("失败用例（漏检即红）", () => {
  it("循环引用必须报错", () => {
    const { dir, src } = tmpWithFixture({
      primitive: { a: "#FFFFFF" },
      semantic: { x: "{semantic.y}", y: "{semantic.x}" },
      component: {},
    });
    const out = join(dir, "out"); mkdirSync(out);
    expect(() => generateTokens({ sourceFile: src, outputDir: out })).toThrow(/circular/i);
  });
  it("未知引用必须报错", () => {
    const { dir, src } = tmpWithFixture({
      primitive: { a: "#FFFFFF" },
      semantic: { x: "{primitive.nope}" },
      component: {},
    });
    const out = join(dir, "out"); mkdirSync(out);
    expect(() => generateTokens({ sourceFile: src, outputDir: out })).toThrow(/unknown/i);
  });
  it("错误单位（px）必须报错——uni 端只认 rpx/ms/s/%/纯数", () => {
    const { dir, src } = tmpWithFixture({
      primitive: { gap: "12px" },
      semantic: {},
      component: {},
    });
    const out = join(dir, "out"); mkdirSync(out);
    expect(() => generateTokens({ sourceFile: src, outputDir: out })).toThrow(/unit/i);
  });
  it("空层/缺层必须报错（source 三层结构必需）", () => {
    const { dir, src } = tmpWithFixture({ primitive: { a: "#FFFFFF" } });
    const out = join(dir, "out"); mkdirSync(out);
    expect(() => generateTokens({ sourceFile: src, outputDir: out })).toThrow();
  });

  it("仓库内已提交的三产物 == 由 source.json 重生成（CR 🟡8：防手改/漏重生成）", () => {
    const out = mkdtempSync(join(tmpdir(), "tok-guard-"));
    generateTokens({ sourceFile: join(root, "tokens/source.json"), outputDir: out });
    for (const f of ["tokens.ts", "theme.scss", "theme.css"]) {
      expect(readFileSync(join(out, f), "utf-8"), f).toBe(readFileSync(join(root, "src/generated", f), "utf-8"));
    }
  });
});
