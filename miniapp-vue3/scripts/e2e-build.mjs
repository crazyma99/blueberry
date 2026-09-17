// 合成 Profile 驱动的**端到端构建验证**（P1-37 CR P0-5：证明抖音路径可走通；此前只有 mp-weixin 旧 E2E）。
// 用法：node scripts/e2e-build.mjs [platform]   （默认 mp-toutiao；合成 Profile＝tests/fixtures/profiles/A.json）
// 说明：走完整管线（复制模板白名单→应用 Profile→生成 Token→冻结锁安装→平台构建→产物 verify→写 manifest），
//       **不触碰真实 Profile/凭证**；git 忽略 .work/ 目录。
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { profileDigestOf } from "./build-target.mjs";
import { generateTokens } from "./generate-tokens.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const platform = process.argv[2] ?? "mp-toutiao";
const profilePath = join(ROOT, "tests/fixtures/profiles/A.json");
const { digest: tokenDigest } = generateTokens({ sourceFile: join(ROOT, "tokens/source.json"), outputDir: mkdtempSync(join(tmpdir(), "tok-")) });
const req = {
  engine: "vue3",
  repoRoot: ROOT,
  sourceRoot: ROOT,
  projectRoot: join(ROOT, ".work", "e2e"),
  profilePath,
  profileKey: "profile-a",
  platform,
  environment: "trial",
  sourceCommit: "95528cd0f33846ebc98d3760d0fc0e857a16b2f5",
  profileDigest: profileDigestOf(profilePath),
  tokenDigest,
  runId: "e2e-" + platform + "-" + Date.now().toString(36),
  forbiddenResidues: ["合成品牌A"],
};
const reqPath = join(mkdtempSync(join(tmpdir(), "req-")), "build-request.json");
writeFileSync(reqPath, JSON.stringify(req, null, 2));
const out = execFileSync(process.execPath, [join(ROOT, "scripts/build-target.mjs"), "--request", reqPath], { stdio: "pipe", timeout: 600000, cwd: ROOT }).toString();
const parsed = JSON.parse(out);
console.log(JSON.stringify({ platform, workDir: parsed.workDir, verify: parsed.verify }, null, 2));
if (!parsed.verify?.ok) process.exit(1);
