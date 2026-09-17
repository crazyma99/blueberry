// T3b（P1-29~31/34~35）：BuildRequest 闭集＋realpath 校验、隔离 run 目录（唯一 runId 不覆盖）、
// 模板白名单复制 → 结构化应用 Profile → 生成 Profile 配置/Token → 固定锁安装 → 构建 → verify → 写 manifest。
// 纪律：所有目标来自显式请求字段，不以调用者 cwd 或工具仓 Profile 猜目标（P1-29）。
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseProfileText, validateProfile } from "./profile-schema.mjs";
import { generateProfile } from "./generate-profile.mjs";
import { generateTokens } from "./generate-tokens.mjs";
import { verifyTarget } from "./verify-target.mjs";

export const ENGINES = ["legacy", "vue3"];
/** 模板白名单（P1-31）：node_modules/dist/.work/docs/tests 不进隔离目录 */
export const TEMPLATE_WHITELIST = [
  "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
  "tsconfig.json", "vite.config.ts", "index.html", "shims-uni.d.ts",
  "src", "tokens",
];

const RUN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PROFILE_KEY_RE = /^[a-z][a-z0-9-]{0,31}$/;
const SHA_RE = /^[0-9a-f]{7,64}$/;

function inside(child, parent) {
  const c = realpathSync(resolve(child));
  const p = realpathSync(resolve(parent));
  return c === p || c.startsWith(p + sep);
}

function stripJsonc(s) {
  // JSONC 注释剥离：字符串感知（串内 // 不误删，如 https:// URL）；
  // 支持 /* */ 与行尾 // 两种注释——首版只删整行注释，被 P1-31 用例抓出行尾注释漏删（真 bug）。
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "/" && s[i + 1] === "*") { const j = s.indexOf("*/", i + 2); if (j < 0) break; i = j + 1; continue; }
    if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i++; out += "\n"; continue; }
    out += c;
  }
  return out;
}

/** profileDigest 语义：sha256(JSON.stringify(parseProfileText(profileFile)))——对给定文件稳定可复算 */
export function profileDigestOf(profilePath) {
  const parsed = parseProfileText(readFileSync(resolve(profilePath), "utf-8"));
  return createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
}

export function validateBuildRequest(req, { repoRoot }) {
  if (req == null || typeof req !== "object") return { ok: false, errors: ["request must be object"] };
  const errors = [];
  const repo = resolve(repoRoot);
  // 闭集（P1-29/33）：新端构建器只认 vue3；legacy 走旧脚本，不在此混用
  if (req.engine !== "vue3") errors.push("new-end builder requires explicit engine=vue3, got: " + req.engine);
  if (!["mp-weixin", "mp-toutiao", "mp-xhs"].includes(req.platform)) errors.push("unknown platform: " + req.platform);
  if (!["develop", "trial", "release"].includes(req.environment)) errors.push("unknown environment: " + req.environment);
  for (const f of ["repoRoot", "sourceRoot", "projectRoot", "profilePath", "profileKey", "sourceCommit", "profileDigest", "tokenDigest", "runId"]) {
    if (typeof req[f] !== "string" || req[f].length === 0) errors.push("missing field: " + f);
  }
  if (errors.length) return { ok: false, errors };
  if (!RUN_ID_RE.test(req.runId)) errors.push("bad runId charset: " + req.runId);
  if (!PROFILE_KEY_RE.test(req.profileKey)) errors.push("bad profileKey charset: " + req.profileKey);
  if (!SHA_RE.test(req.sourceCommit)) errors.push("bad sourceCommit: " + req.sourceCommit);
  if (!/^[0-9a-f]{64}$/.test(req.profileDigest)) errors.push("bad profileDigest format");
  if (!/^[0-9a-f]{64}$/.test(req.tokenDigest)) errors.push("bad tokenDigest format");
  // realpath 隔离（P1-29）：sourceRoot/profilePath 须在 repoRoot 内；projectRoot 须在 repoRoot/.work 内
  for (const [field, mustExist] of [["sourceRoot", true], ["profilePath", true]]) {
    try {
      const p = resolve(req[field]);
      if (mustExist && !existsSync(p)) errors.push(field + " not exists: " + p);
      else if (!inside(p, repo)) errors.push(field + " outside repoRoot: " + p);
    } catch {
      errors.push(field + " unresolvable");
    }
  }
  const workRoot = join(repo, ".work");
  if (!resolve(req.projectRoot).startsWith(workRoot + sep)) {
    errors.push("projectRoot must be under repoRoot/.work");
  }
  if (errors.length) return { ok: false, errors };
  // 来源验证（P1-30）：profileDigest 与 profilePath 实际内容一致；Profile 语义校验（平台 appid 必填不回落）
  const parsed = parseProfileText(readFileSync(resolve(req.profilePath), "utf-8"));
  const actual = createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
  if (actual !== req.profileDigest) {
    errors.push("profileDigest mismatch: request=" + req.profileDigest.slice(0, 12) + " actual=" + actual.slice(0, 12));
  }
  const v = validateProfile(parsed, { platform: req.platform, environment: req.environment });
  if (!v.ok) errors.push(...v.errors.map((e) => "profile: " + e));
  return errors.length ? { ok: false, errors } : { ok: true, profile: v.profile };
}

/** P1-30：run 目录唯一；已存在且非空即拒（不覆盖已有 run，同 run 并发必失败） */
export function allocateWorkDir(req, { repoRoot }) {
  const dir = join(
    resolve(repoRoot), ".work", "build", req.engine, req.profileKey, req.platform,
    req.sourceCommit.slice(0, 12), req.profileDigest.slice(0, 12), req.runId,
  );
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new Error("run dir exists and non-empty (runId must be unique): " + dir);
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function copyTemplate(sourceRoot, projectDir) {
  for (const item of TEMPLATE_WHITELIST) {
    const from = join(resolve(sourceRoot), item);
    if (!existsSync(from)) throw new Error("template whitelist item missing: " + item);
    cpSync(from, join(projectDir, item), { recursive: true });
  }
}

/** 结构化应用 Profile（P1-31/32）：只改隔离目录内的 JSONC 配置，源目录不动、无宽正则 */
export function applyProfile(projectDir, profile) {
  const mp = join(projectDir, "src/manifest.json");
  const man = JSON.parse(stripJsonc(readFileSync(mp, "utf-8")));
  man.name = profile.manifestName;
  man.description = profile.description;
  const node = man[profile.platform] ?? (man[profile.platform] = {});
  node.appid = profile.appid;
  writeFileSync(mp, JSON.stringify(man, null, 2) + "\n");
  const pp = join(projectDir, "src/pages.json");
  const pages = JSON.parse(stripJsonc(readFileSync(pp, "utf-8")));
  pages.globalStyle = pages.globalStyle ?? {};
  pages.globalStyle.navigationBarTitleText = profile.navigationTitle;
  writeFileSync(pp, JSON.stringify(pages, null, 2) + "\n");
  return { manifest: "src/manifest.json", pages: "src/pages.json" };
}

export function runBuild(req, { repoRoot, pnpmCmd = "pnpm", skipInstall = false } = {}) {
  const repo = resolve(repoRoot);
  // projectRoot 缺省时注入规范路径（与 allocateWorkDir 构造一致；字符集由 validate 把关）
  const req2 = req.projectRoot ? req : {
    ...req,
    projectRoot: join(repo, ".work", "build", String(req.engine), String(req.profileKey), String(req.platform),
      String(req.sourceCommit ?? "").slice(0, 12), String(req.profileDigest ?? "").slice(0, 12), String(req.runId)),
  };
  const v = validateBuildRequest(req2, { repoRoot: repo });
  if (!v.ok) throw new Error("invalid build request: " + v.errors.join("; "));
  const dir = allocateWorkDir(req2, { repoRoot: repo });
  const steps = [];
  copyTemplate(req.sourceRoot, dir);
  steps.push("copy-template");
  applyProfile(dir, v.profile);
  steps.push("apply-profile");
  // Profile 配置生成到 src/generated/（供未来 HTTP 层 import）
  const pg = generateProfile({ profile: v.profile, sourceRoot: req.sourceRoot, projectRoot: join(dir, "src") });
  steps.push("generate-profile:" + pg.digest.slice(0, 12));
  // Token 生成并校验请求携带的 tokenDigest（P1-30 来源验证）
  const tg = generateTokens({ sourceFile: join(dir, "tokens/source.json"), outputDir: join(dir, "src/generated") });
  if (tg.digest !== req.tokenDigest) {
    throw new Error("tokenDigest mismatch: request=" + req.tokenDigest.slice(0, 12) + " actual=" + tg.digest.slice(0, 12));
  }
  steps.push("generate-tokens:" + tg.digest.slice(0, 12));
  if (!skipInstall) {
    execFileSync(pnpmCmd, ["install", "--frozen-lockfile"], { cwd: dir, stdio: "pipe" });
    steps.push("install:frozen");
  }
  execFileSync(pnpmCmd, ["run", "build:" + req.platform], { cwd: dir, stdio: "pipe" });
  steps.push("build:" + req.platform);
  const artifactDir = join(dir, "dist/build", req.platform);
  // 阶段期望集合来自**源码** pages.json（应构建出什么）；不用产物自身回填，否则 verify 自证恒过
  const srcPagesJson = JSON.parse(stripJsonc(readFileSync(join(dir, "src/pages.json"), "utf-8")));
  const expectedRoutes = (srcPagesJson.pages ?? []).map((p) => p.path).sort();
  const manifest = {
    engine: req.engine,
    profileKey: req.profileKey,
    platform: req.platform,
    environment: req.environment,
    appid: v.profile.appid,
    appCode: v.profile.appCode,
    navTitle: v.profile.navigationTitle,
    apiBase: v.profile.apiBases[req.environment],
    expectedRoutes,
    forbiddenResidues: req.forbiddenResidues ?? [],
    sourceCommit: req.sourceCommit,
    profileDigest: req.profileDigest,
    generatedProfileDigest: pg.digest,
    tokenDigest: tg.digest,
    runId: req.runId,
    artifactDir: "dist/build/" + req.platform,
    steps,
  };
  const verify = verifyTarget({ manifest, artifactDir });
  manifest.verify = verify;
  writeFileSync(join(dir, "release-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  if (!verify.ok) throw new Error("verify failed: " + verify.errors.join("; "));
  return { workDir: dir, manifest };
}

// CLI：node scripts/build-target.mjs --request <build-request.json>
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--request");
  if (i < 0 || !process.argv[i + 1]) {
    console.error("usage: node scripts/build-target.mjs --request <build-request.json>");
    process.exit(2);
  }
  const req = JSON.parse(readFileSync(resolve(process.argv[i + 1]), "utf-8"));
  const out = runBuild(req, { repoRoot: req.repoRoot });
  console.log(JSON.stringify({ workDir: out.workDir, verify: out.manifest.verify, steps: out.manifest.steps }, null, 2));
}
