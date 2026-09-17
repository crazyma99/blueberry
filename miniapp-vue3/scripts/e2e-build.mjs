// 合成 Profile 驱动的**端到端构建验证**（P1-37 CR P0-5 / P1-35 合成部分）
// 用法：node scripts/e2e-build.mjs [platform] [profile]   # platform 默认 mp-toutiao；profile ∈ A|B|both（默认 A）
// 说明：走完整管线（复制模板白名单→应用 Profile→生成 Token→冻结锁安装→平台构建→产物 verify→写 manifest），
//       **只用合成 fixture、不触碰真实 Profile/凭证**；产物落在 git 忽略的 `.work/` 下。
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { profileDigestOf } from "./build-target.mjs";
import { generateTokens } from "./generate-tokens.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const platform = process.argv[2] ?? "mp-toutiao";
const profileArg = process.argv[3] ?? "A"; // A | B | both
const SOURCE_COMMIT = "95528cd0f33846ebc98d3760d0fc0e857a16b2f5";

const { digest: tokenDigest } = generateTokens({
  sourceFile: join(ROOT, "tokens/source.json"),
  outputDir: mkdtempSync(join(tmpdir(), "tok-")),
});

function buildRequest(key) {
  const profilePath = join(ROOT, `tests/fixtures/profiles/${key}.json`);
  return {
    engine: "vue3",
    repoRoot: ROOT,
    sourceRoot: ROOT,
    projectRoot: join(ROOT, ".work", "e2e"),
    profilePath,
    profileKey: `profile-${key.toLowerCase()}`,
    platform,
    environment: "trial",
    sourceCommit: SOURCE_COMMIT,
    profileDigest: profileDigestOf(profilePath),
    tokenDigest,
    runId: `e2e-${key}-${platform}-${Date.now().toString(36)}`,
    // 跨品牌残留检查：用**另一套**合成品牌名做「不得出现」断言（P1-35 数据隔离的一部分）
    forbiddenResidues: [key === "A" ? "合成品牌B" : "合成品牌A"],
  };
}

function runOne(key) {
  const reqPath = join(mkdtempSync(join(tmpdir(), "req-")), "build-request.json");
  writeFileSync(reqPath, JSON.stringify(buildRequest(key), null, 2));
  const out = execFileSync(process.execPath, [join(ROOT, "scripts/build-target.mjs"), "--request", reqPath], {
    stdio: "pipe",
    timeout: 900000,
    cwd: ROOT,
  }).toString();
  return JSON.parse(out);
}

if (profileArg === "both") {
  const results = {};
  for (const key of ["A", "B"]) {
    const r = runOne(key);
    results[key] = { ok: r.verify?.ok, errors: r.verify?.errors, checked: r.verify?.checked, workDir: r.workDir };
  }
  const ok = results.A.ok === true && results.B.ok === true && results.A.workDir !== results.B.workDir;
  console.log(JSON.stringify({ platform, mode: "both", ok, results }, null, 2));
  if (!ok) process.exit(1);
} else {
  const out = runOne(profileArg);
  console.log(JSON.stringify({ platform, profile: profileArg, workDir: out.workDir, verify: out.verify }, null, 2));
  if (!out.verify?.ok) process.exit(1);
}
