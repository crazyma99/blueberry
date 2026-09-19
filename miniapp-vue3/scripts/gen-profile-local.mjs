// 本地直出构建（非 build-target 隔离管线）前置步骤：按目标平台重新生成 src/generated/profile.config.ts。
// 背景：仓库提交的 profile.config.ts 是微信风味快照；本地 npm run build:mp-toutiao 不经过 build-target 的
// generateProfile ⇒ 抖音包会错带微信 features（「我的」页 AI 菜单/AI 文案——2026-09-19 主人反馈）。
// 与管线互斥：build-target 隔离副本中 profiles/ 不在模板白名单内，本脚本找不到即跳过（副本已由管线正确生成）。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseProfileText, validateProfile } from "./profile-schema.mjs";
import { generateProfile } from "./generate-profile.mjs";

const platform = process.argv[2];
if (!["mp-weixin", "mp-toutiao", "mp-xhs"].includes(platform)) {
  console.error("usage: node scripts/gen-profile-local.mjs <mp-weixin|mp-toutiao|mp-xhs> [profileKey=blueberry]");
  process.exit(1);
}
const profileKey = process.argv[3] ?? "blueberry";
const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), ".."); // miniapp-vue3/
const profilePath = join(projectDir, "..", "profiles", profileKey, "project.env");
if (!existsSync(profilePath)) {
  // build-target 隔离副本：profiles/ 不在白名单 ⇒ 跳过（副本 src/generated 已被管线按平台生成）
  console.log("[gen-profile-local] skip (profile env not found, isolated pipeline already generated): " + profilePath);
  process.exit(0);
}
const parsed = parseProfileText(readFileSync(profilePath, "utf-8"));
const v = validateProfile(parsed, { platform, environment: "trial" });
if (!v.ok) {
  console.error("[gen-profile-local] invalid profile: " + v.errors.join("; "));
  process.exit(1);
}
const out = generateProfile({ profile: v.profile, sourceRoot: join(projectDir, "src"), projectRoot: join(projectDir, "src") });
console.log("[gen-profile-local] " + platform + " features=" + JSON.stringify(v.profile.features) + " digest=" + out.digest.slice(0, 12));
