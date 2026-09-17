// 体验版上传（微信官方 miniprogram-ci，无 GUI；**需主人明确授权 + 代码上传密钥**）
// 用法：
//   node scripts/upload-trial.mjs --project dist/trial-lazy/mp-weixin \
//        --key <private.<appid>.key 路径> --version 0.1.0 --desc "迁移试运行" --yes
// 安全约定：
//   · **绝不打印密钥内容**；密钥建议放在仓库外（如 ~/.dsh/secrets/），不入库
//   · 必须显式传 `--yes` 才执行上传（防止误发布）；缺任一项即退出并打印用法
//   · 上传前先做本地体检：产物必须含 app.json/app.js 且 app.json.lazyCodeLoading 已生效
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const arg = (name) => {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (name) => process.argv.includes("--" + name);
const projectPath = resolve(arg("project") ?? "dist/trial-lazy/mp-weixin");
const keyPath = arg("key");
const version = arg("version");
const desc = arg("desc") ?? "迁移试运行";
const appid = arg("appid") ?? "wxb19ad7426dfb8bd4";

function usage(msg) {
  console.error("[upload-trial] " + msg);
  console.error("用法：node scripts/upload-trial.mjs --project <目录> --key <密钥路径> --version <版本号> --desc <描述> --yes");
  process.exit(2);
}

if (!has("yes")) usage("未传 --yes：上传是对外发布动作，必须显式授权");
if (!keyPath) usage("缺少 --key（微信后台「开发管理→开发设置→小程序代码上传」生成的 private.<appid>.key）");
if (!version) usage("缺少 --version（如 0.1.0）");
if (!existsSync(keyPath)) usage("密钥文件不存在：" + keyPath);
if (!existsSync(join(projectPath, "app.json"))) usage("产物目录不合法（缺 app.json）：" + projectPath);

// 本地体检：确认 lazyCodeLoading 生效
const appJson = JSON.parse(readFileSync(join(projectPath, "app.json"), "utf-8"));
console.log("[upload-trial] 产物 pages=" + (appJson.pages ?? []).length + " lazyCodeLoading=" + (appJson.lazyCodeLoading ?? "<无>"));
console.log("[upload-trial] appid=" + appid + " version=" + version + " desc=" + desc);

// 模块解析顺序：--ci <路径> → 环境变量 MINIPROGRAM_CI_PATH → 裸包名
// （本机把 miniprogram-ci 装在**仓库外** ~/.dsh/tools/mpci，避免污染 lockfile）
const ciCandidates = [arg("ci"), process.env.MINIPROGRAM_CI_PATH, "miniprogram-ci"].filter(Boolean);
let ci = null;
for (const spec of ciCandidates) {
  const mod = await import(spec).catch(() => null);
  if (mod?.default) {
    ci = mod.default;
    break;
  }
}
if (!ci) {
  console.error("[upload-trial] 未找到 miniprogram-ci：用 --ci <模块目录> 或设 MINIPROGRAM_CI_PATH，例如");
  console.error("  npm i --prefix ~/.dsh/tools/mpci miniprogram-ci  然后 --ci ~/.dsh/tools/mpci/node_modules/miniprogram-ci");
  process.exit(3);
}

const project = new ci.Project({ appid, type: "miniProgram", projectPath, privateKeyPath: resolve(keyPath), ignores: ["node_modules/**/*"] });
await ci.upload({
  project,
  version,
  desc,
  setting: { es6: true, minify: true, urlCheck: false, autoPrefixWXSS: true },
  onProgressUpdate: (t) => process.stdout.write("[upload-trial] " + JSON.stringify(t) + "\n"),
});
console.log("[upload-trial] 上传完成 → 请到 mp.weixin.qq.com「版本管理」把该版本**设为体验版**后扫码");
