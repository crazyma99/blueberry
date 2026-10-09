// 多端兼容守卫测试（SPEC：`docs/migration/compat-and-dev-spec.md` v1.0）
//   覆盖 C3 逻辑层零 `#ifdef` ／ C4 无兜底必须登记 ／ C5 端口×三端矩阵 ／ C6 平台目录登记
// 口径：真实仓库断言＝**存量已按 SPEC §八 登记**（grandfather），**新账从严**（新增即红）。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPAT_DECLARATIONS,
  ENDS,
  PLATFORM_DIRS,
  PORT_MATRIX,
  parseDirectives,
  scanLogicLayerIfdefs,
  scanPlatformDirs,
  scanPortMatrix,
  scanUndeclaredIfdefs,
} from "../../scripts/scan-platform-usage.mjs";

const root = resolve(__dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** 收集 src 下参与条件编译/矩阵规则的文件（.ts/.uts/.vue/.json —— 含 pages.json） */
function collectCompatFiles(): Array<{ file: string; src: string }> {
  return walk(join(root, "src"))
    .filter((p) => /\.(ts|uts|vue|json)$/.test(p))
    .map((p) => ({ file: p.slice(p.indexOf("src/")), src: readFileSync(p, "utf-8") }));
}

describe("C3 逻辑层零 #ifdef（SPEC §二②）", () => {
  it("`.ts` 出现任何条件编译指令 → 违规；`.vue`／配置允许", () => {
    expect(scanLogicLayerIfdefs([{ file: "src/application/a.ts", src: "// #ifdef MP-WEIXIN\nfoo();\n// #endif" }]).map((v) => v.api)).toEqual([
      "logic-layer-ifdef:ifdef",
      "logic-layer-ifdef:endif",
    ]);
    expect(scanLogicLayerIfdefs([{ file: "src/pages/x/index.vue", src: "<!-- #ifdef MP-WEIXIN -->\n<view/>\n<!-- #endif -->" }])).toEqual([]);
    expect(scanLogicLayerIfdefs([{ file: "src/pages.json", src: '// #ifdef MP-WEIXIN\n{}\n// #endif' }])).toEqual([]);
  });

  it("散文里提到 #ifdef（如 ui-platform 纪律说明）**不算指令**，不误报", () => {
    const prose = "// 纪律：平台分支一律做成运行时可判定结构；#ifdef 只允许出现在模板/样式且不得承载唯一逻辑。";
    expect(parseDirectives(prose)).toEqual([]);
    expect(scanLogicLayerIfdefs([{ file: "src/ui/ui-platform.ts", src: prose }])).toEqual([]);
  });

  it("⭐真实仓库：逻辑层 0 处条件编译（`src/ui/ui-platform.ts` 的运行时可判定纪律已落实）", () => {
    const violations = scanLogicLayerIfdefs(collectCompatFiles());
    expect(violations, JSON.stringify(violations)).toEqual([]);
  });
});

describe("C4 无 #else 兜底必须登记（SPEC §七①）", () => {
  it("#else 兜底齐全 → 通过；无兜底且未登记 → 违规", () => {
    expect(scanUndeclaredIfdefs([{ file: "src/pages.json", src: '// #ifdef MP-WEIXIN\n{}\n// #else\n{}\n// #endif' }])).toEqual([]);
    // 显式传空登记表 ⇒ 该对未被登记，须报；传默认表时因存量已登记（grandfather）而免报（见下一条）
    const v = scanUndeclaredIfdefs([{ file: "src/pages.json", src: '// #ifdef MP-WEIXIN\n{}\n// #endif' }], []);
    expect(v.map((x) => x.api)).toContain("ifdef:no-fallback:MP-WEIXIN");
    expect(scanUndeclaredIfdefs([{ file: "src/pages.json", src: '// #ifdef MP-WEIXIN\n{}\n// #endif' }])).toEqual([]);
  });

  it("已登记的 (file|macro) 免报；同文件**新增另一宏**仍要登记", () => {
    const declared = [{ file: "src/pages.json", macro: "MP-WEIXIN", ends: ["tt"], reason: "有意裁剪" }];
    expect(scanUndeclaredIfdefs([{ file: "src/pages.json", src: '// #ifdef MP-WEIXIN\n{}\n// #endif' }], declared)).toEqual([]);
    const v = scanUndeclaredIfdefs([{ file: "src/pages.json", src: '// #ifdef MP-XHS\n{}\n// #endif' }], declared);
    expect(v.map((x) => x.api)).toContain("ifdef:no-fallback:MP-XHS");
  });

  it("样式级 `/* #ifdef */` 与模板级 `<!-- #ifdef -->` 同样识别（App.vue 形态）", () => {
    expect(parseDirectives("/* #ifdef MP-TOUTIAO */")[0]).toMatchObject({ kind: "ifdef", macros: ["MP-TOUTIAO"] });
    expect(parseDirectives("<!-- #ifdef MP-WEIXIN -->")[0]).toMatchObject({ kind: "ifdef", macros: ["MP-WEIXIN"] });
  });

  it("⭐真实仓库：所有无兜底块均已登记（存量清单以 COMPAT_DECLARATIONS 为准）", () => {
    const violations = scanUndeclaredIfdefs(collectCompatFiles());
    expect(violations, JSON.stringify(violations)).toEqual([]);
    // 登记表必须指向真实存在的文件（防幽灵登记）
    for (const d of COMPAT_DECLARATIONS) {
      expect(readFileSync(join(root, d.file), "utf-8")).toContain("#" + (d.macro === undefined ? "ifdef" : "ifdef"));
      expect(d.ends.length).toBeGreaterThan(0);
      expect(d.reason.length).toBeGreaterThan(10);
    }
  });
});

describe("C5 端口 × 三端矩阵齐全（SPEC §七②）", () => {
  it("缺条目／缺端／impl 无 at／unsupported 无 reason／todo 无 issue → 均违规", () => {
    expect(scanPortMatrix(["src/ports/a.ts"], []).map((v) => v.api)).toEqual(["port:unregistered"]);
    expect(scanPortMatrix(["src/ports/a.ts"], [{ port: "src/ports/a.ts", wx: { status: "impl", at: "x" } }]).map((v) => v.api)).toEqual([
      "port:missing-end:tt",
      "port:missing-end:xhs",
    ]);
    expect(scanPortMatrix(["src/ports/a.ts"], [{ port: "src/ports/a.ts", wx: { status: "impl" }, tt: { status: "impl", at: "x" }, xhs: { status: "impl", at: "x" } }]).map((v) => v.api)).toEqual([
      "port:impl-without-at:wx",
    ]);
    expect(
      scanPortMatrix(["src/ports/a.ts"], [{ port: "src/ports/a.ts", wx: { status: "unsupported" }, tt: { status: "todo" }, xhs: { status: "neutral", at: "x" } }]).map((v) => v.api),
    ).toEqual(["port:unsupported-without-reason:wx", "port:todo-without-issue:tt"]);
  });

  it("⭐真实仓库：每个 ports/*.ts 都有三端条目且字段合规", () => {
    const ports = readdirSync(join(root, "src/ports"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => "src/ports/" + f)
      .sort();
    expect(ports.length).toBeGreaterThanOrEqual(8); // 现役 8 个端口
    const violations = scanPortMatrix(ports);
    expect(violations, JSON.stringify(violations)).toEqual([]);
    // 矩阵不得登记已不存在的端口（防僵尸条目）
    for (const m of PORT_MATRIX) expect(ports).toContain(m.port);
    // 三端闭集一致
    expect(ENDS).toEqual(["wx", "tt", "xhs"]);
  });
});

describe("C6 平台目录登记（SPEC §七）", () => {
  it("未登记目录 → 违规；已登记 → 通过", () => {
    expect(scanPlatformDirs(["uni", "weixin", "xhs"], ["uni", "weixin"]).map((v) => v.api)).toEqual(["platform:unregistered-dir"]);
    expect(scanPlatformDirs(["uni", "weixin"], ["uni", "weixin"])).toEqual([]);
  });

  it("⭐真实仓库：src/platform 下目录均已登记（新增端/适配层必须同步 PLATFORM_DIRS）", () => {
    const dirs = readdirSync(join(root, "src/platform")).filter((d) => statSync(join(root, "src/platform", d)).isDirectory());
    expect(scanPlatformDirs(dirs), JSON.stringify(dirs)).toEqual([]);
    for (const d of PLATFORM_DIRS) expect(dirs).toContain(d);
  });
});
