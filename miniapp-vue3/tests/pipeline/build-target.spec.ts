// P1-29~34 流水线测试：BuildRequest 闭集/realpath 隔离、runId 唯一不覆盖、
// 结构化应用 Profile、产物 verify（旧产物冒充新引擎/错 appid/路由不匹配/品牌残留每项必须失败）。
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import {
  validateBuildRequest, allocateWorkDir, applyProfile, profileDigestOf, expectedRoutesForPlatform, stripJsonc,
} from "../../scripts/build-target.mjs";
import { verifyTarget } from "../../scripts/verify-target.mjs";

const repoRoot = resolve(__dirname, "../../..");
const sourceRoot = join(repoRoot, "miniapp-vue3");
const profilePath = join(repoRoot, "profiles/blueberry/project.env");
const realDigest = profileDigestOf(profilePath);
const ZERO64 = "0".repeat(64);

function baseReq(over = {}) {
  return {
    engine: "vue3",
    repoRoot,
    sourceRoot,
    projectRoot: join(repoRoot, ".work", "test", "req-" + Math.random().toString(36).slice(2)),
    profilePath,
    profileKey: "blueberry",
    platform: "mp-weixin",
    environment: "release",
    sourceCommit: "95528cd0f33846ebc98d3760d0fc0e857a16b2f5",
    profileDigest: realDigest,
    tokenDigest: ZERO64,
    runId: "run-" + Math.random().toString(36).slice(2, 10),
    ...over,
  };
}

describe("validateBuildRequest（P1-29 闭集＋realpath 隔离；P1-33 新端必须显式 vue3）", () => {
  it("合法请求放行（真实 profile＋真实路径）", () => {
    const r = validateBuildRequest(baseReq(), { repoRoot });
    expect(r.ok).toBe(true);
    expect(r.profile.appid).toBe("wxb19ad7426dfb8bd4");
  });
  it("legacy engine 拒绝（新端构建器只认 vue3）", () => {
    expect(validateBuildRequest(baseReq({ engine: "legacy" }), { repoRoot }).errors[0]).toContain("engine=vue3");
  });
  it("闭集外 platform/env 拒绝", () => {
    expect(validateBuildRequest(baseReq({ platform: "mp-kuaishou" }), { repoRoot }).ok).toBe(false);
    expect(validateBuildRequest(baseReq({ environment: "production" }), { repoRoot }).ok).toBe(false);
  });
  it("缺字段/字符集非法（runId 带路径穿越、profileKey 大写）拒绝", () => {
    const missing = baseReq(); delete (missing as Record<string, unknown>).runId;
    expect(validateBuildRequest(missing, { repoRoot }).ok).toBe(false);
    expect(validateBuildRequest(baseReq({ runId: "../evil" }), { repoRoot }).ok).toBe(false);
    expect(validateBuildRequest(baseReq({ profileKey: "BlueBerry" }), { repoRoot }).ok).toBe(false);
  });
  it("sourceRoot/profilePath 在 repoRoot 外、projectRoot 不在 .work 下 拒绝（P1-29 realpath）", () => {
    expect(validateBuildRequest(baseReq({ sourceRoot: "/tmp" }), { repoRoot }).errors.join(" ")).toContain("outside repoRoot");
    expect(validateBuildRequest(baseReq({ profilePath: "/etc/hosts" }), { repoRoot }).errors.join(" ")).toContain("outside repoRoot");
    expect(validateBuildRequest(baseReq({ projectRoot: "/tmp/not-in-work" }), { repoRoot }).errors.join(" ")).toContain(".work");
  });
  it("profileDigest 与文件实际内容不符拒绝（P1-30 来源验证）", () => {
    const r = validateBuildRequest(baseReq({ profileDigest: "a".repeat(64) }), { repoRoot });
    expect(r.errors.join(" ")).toContain("profileDigest mismatch");
  });
  it("抖音构建缺 MP_TOUTIAO_APPID 拒绝（P1-14 不回落微信）", () => {
    // 真实 profile 已登记抖音 AppID（2026-09-18 主人提供 ttd6aba01648cc1bf701）；
    // 本用例改用「剥掉该字段」的临时副本，继续验证「缺字段拒绝、不回落微信 appid」语义。
    const stripped = readFileSync(profilePath, "utf-8").split("\n").filter((l) => !l.startsWith("MP_TOUTIAO_APPID=")).join("\n");
    const noAppidPath = join(repoRoot, ".work", "test", "no-tt-appid-" + Math.random().toString(36).slice(2) + ".env");
    mkdirSync(dirname(noAppidPath), { recursive: true });
    writeFileSync(noAppidPath, stripped);
    const r = validateBuildRequest(
      baseReq({ platform: "mp-toutiao", profilePath: noAppidPath, profileDigest: profileDigestOf(noAppidPath) }),
      { repoRoot },
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("MP_TOUTIAO_APPID");
  });
});

describe("allocateWorkDir（P1-30 runId 唯一不覆盖；P1-34 同 run 并发/非空覆盖必失败）", () => {
  it("首次分配创建目录；再次分配同 runId 且目录非空 → 抛错", () => {
    const req = baseReq();
    const dir = allocateWorkDir(req, { repoRoot });
    expect(existsSync(dir)).toBe(true);
    expect(dir).toContain(join(".work", "build", "vue3", "blueberry", "mp-weixin"));
    writeFileSync(join(dir, "artifact.bin"), "x"); // 变非空
    expect(() => allocateWorkDir(req, { repoRoot })).toThrow(/non-empty/);
  });
});

describe("applyProfile（P1-31 结构化编辑，源目录不动）", () => {
  it("隔离目录 manifest.json 收到 name/description/平台 appid；pages.json 收到导航标题", () => {
    const dir = mkdtempSync(join(tmpdir(), "applyprof-"));
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src/manifest.json"), '{\n  "name": "", /* 注释 */\n  "appid": "",\n  "mp-weixin": { "appid": "" }\n}\n');
    writeFileSync(join(dir, "src/pages.json"), '{\n  "pages": [], // 注释\n  "globalStyle": {}\n}\n');
    const v = validateBuildRequest(baseReq(), { repoRoot });
    applyProfile(dir, v.profile);
    const man = JSON.parse(readFileSync(join(dir, "src/manifest.json"), "utf-8"));
    expect(man.name).toBe("blueBerry");
    expect(man["mp-weixin"].appid).toBe("wxb19ad7426dfb8bd4");
    // ⭐P1-37 CR 🔴1 后：pages.json **保留注释与 `#ifdef` 标记**（有意行为）⇒ 解析前先剥注释
    const pagesRaw = readFileSync(join(dir, "src/pages.json"), "utf-8");
    expect(pagesRaw).toContain("// 注释"); // 注释未被抹掉
    const pages = JSON.parse(stripJsonc(pagesRaw));
    expect(pages.globalStyle.navigationBarTitleText).toBe("蓝梅旗袍·汉服·民...");
  });
});

// —— verifyTarget 合成产物 fixtures（P1-32/34）——
function makeArtifact(over: {
  pages?: string[]; appid?: string; navTitle?: string; vue3Marker?: boolean; residue?: string; noAppJs?: boolean; noAppJson?: boolean;
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "artifact-"));
  if (!over.noAppJson) {
    writeFileSync(join(dir, "app.json"), JSON.stringify({
      pages: over.pages ?? ["pages/index/index", "pages/_probe/wot-sample"],
      window: { navigationBarTitleText: over.navTitle ?? "蓝梅旗袍·汉服·民..." },
    }));
  }
  if (!over.noAppJs) writeFileSync(join(dir, "app.js"), "// app" + (over.residue ? " " + over.residue : ""));
  writeFileSync(join(dir, "project.config.json"), JSON.stringify({ appid: over.appid ?? "wxb19ad7426dfb8bd4" }));
  mkdirSync(join(dir, "common"));
  writeFileSync(join(dir, "common/vendor.js"), (over.vue3Marker === false ? "// legacy uts runtime" : "var a=require;createApp(a)") + (over.residue ? " " + over.residue : ""));
  return dir;
}
const manifestBase = {
  engine: "vue3", profileKey: "blueberry", platform: "mp-weixin", environment: "release",
  appid: "wxb19ad7426dfb8bd4", appCode: "blueBerry", navTitle: "蓝梅旗袍·汉服·民...",
  expectedRoutes: ["pages/_probe/wot-sample", "pages/index/index"], forbiddenResidues: ["蓝梅云B残留"],
};

describe("verifyTarget（P1-32 产物命中；P1-34 每项负向必须失败）", () => {
  it("正常产物通过，检查项完整", () => {
    const v = verifyTarget({ manifest: manifestBase, artifactDir: makeArtifact() });
    expect(v.ok).toBe(true);
    expect(v.checked).toContain("engine:vue3");
    expect(v.checked).toContain("appid");
  });
  it("旧产物冒充新引擎（无 createApp 指纹）必须失败", () => {
    const v = verifyTarget({ manifest: manifestBase, artifactDir: makeArtifact({ vue3Marker: false }) });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("engine fingerprint");
  });
  it("错误 appid 必须失败", () => {
    const v = verifyTarget({ manifest: manifestBase, artifactDir: makeArtifact({ appid: "wx0000000000000000" }) });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("appid mismatch");
  });
  it("路由集合不匹配必须失败（阶段期望集合）", () => {
    const v = verifyTarget({ manifest: manifestBase, artifactDir: makeArtifact({ pages: ["pages/index/index"] }) });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("route set mismatch");
  });
  it("导航标题不匹配必须失败", () => {
    const v = verifyTarget({ manifest: manifestBase, artifactDir: makeArtifact({ navTitle: "别的标题" }) });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("nav title mismatch");
  });
  it("错误品牌残留（A 读 B 产物场景）必须失败", () => {
    const v = verifyTarget({ manifest: manifestBase, artifactDir: makeArtifact({ residue: "蓝梅云B残留" }) });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("forbidden residue");
  });
  it("缺 app.json / 缺 app.js 必须失败", () => {
    expect(verifyTarget({ manifest: manifestBase, artifactDir: makeArtifact({ noAppJson: true }) }).ok).toBe(false);
    const v = verifyTarget({ manifest: manifestBase, artifactDir: makeArtifact({ noAppJs: true }) });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("app.js missing");
  });
});

describe("P1-37 CR 回归（🔴1 条件编译保留／🔴2 期望集合按平台求值／P0-3 目录原子化）", () => {
  const realPagesText = () => readFileSync(resolve(__dirname, "../../src/pages.json"), "utf-8");

  it("⭐applyProfile **不得抹掉 `#ifdef` 标记**（实测曾 22→0，导致抖音侧 18 页全量注册）", () => {
    const dir = mkdtempSync(join(tmpdir(), "ap-"));
    mkdirSync(join(dir, "src"), { recursive: true });
    const raw = realPagesText();
    writeFileSync(join(dir, "src/pages.json"), raw);
    writeFileSync(join(dir, "src/manifest.json"), '{\n  "name": "",\n  "mp-toutiao": { "appid": "" }\n}\n');
    const before = (raw.match(/^\s*\/\/\s*#(ifdef|ifndef|endif)/gm) ?? []).length;
    applyProfile(dir, {
      manifestName: "X", description: "d", platform: "mp-toutiao", appid: "tt0000000000000001", navigationTitle: "标题X",
    });
    const after = readFileSync(join(dir, "src/pages.json"), "utf-8");
    const afterCount = (after.match(/^\s*\/\/\s*#(ifdef|ifndef|endif)/gm) ?? []).length;
    expect(afterCount).toBe(before); // 标记原样保留
    expect(after).toContain("navigationBarTitleText");
    expect(after).toContain('"标题X"'); // 标题确实被替换
  });

  it("⭐expectedRoutes 按平台求值（不再恒等）：微信 18 ／ 抖音 12（11 业务＋探针）", () => {
    const t = realPagesText();
    expect(expectedRoutesForPlatform(t, "mp-weixin").length).toBe(18);
    const tt = expectedRoutesForPlatform(t, "mp-toutiao");
    expect(tt.length).toBe(12);
    expect(tt.some((r) => r.startsWith("pages/aiTryOn"))).toBe(false); // AI 六页仅在微信宏内
  });

  it("⭐runId 目录分配原子化：同目录二次分配抛错（非递归 mkdir + EEXIST）", () => {
    const dir = mkdtempSync(join(tmpdir(), "alloc-"));
    const req = baseReq({ repoRoot: dir, sourceRoot: dir, profilePath: profilePath, projectRoot: join(dir, ".work") });
    const d1 = allocateWorkDir(req, { repoRoot: dir });
    expect(existsSync(d1)).toBe(true);
    expect(() => allocateWorkDir(req, { repoRoot: dir })).toThrow(/already exists|non-empty/);
  });
});
