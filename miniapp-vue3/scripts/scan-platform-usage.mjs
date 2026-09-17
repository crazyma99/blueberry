// P4-12（扫描规则）：平台 API 只允许出现在登记的目录/例外里——**对源码**扫描，**不对第三方 bundle 盲 grep**。
// 规则（与 phases P4-12 一致）：
//   · 允许目录：`src/platform/**`（平台适配）、`src/ui/**`（Wot 门面）、`src/generated/**`（生成物）
//   · 敏感集：平台 SDK／能力（`wx.*`、`tt.*`、`uni.request|uploadFile|downloadFile|login|authorize|openSetting|
//     getImageInfo|chooseImage|saveImageToPhotosAlbum|getEnterOptionsSync|requestSubscribeMessage|requestPayment`）
//   · UI 类 API（toast/modal/loading/导航/getSystemInfoSync 等）**允许出现在任意层**（属 uni 基础 UI，不是平台分支）
//   · 例外须**显式登记**并写理由；注释中的提及不算命中（去注释后判定）
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";

const SENSITIVE = /\bwx\.[a-zA-Z]\w*|\btt\.[a-zA-Z]\w*|uni\.(request|uploadFile|downloadFile|login|authorize|openSetting|getImageInfo|chooseImage|saveImageToPhotosAlbum|getEnterOptionsSync|requestSubscribeMessage|requestPayment)\b/g;

/** 已登记的例外（P4-12：例外必须显式登记并说明理由） */
export const REGISTERED_EXCEPTIONS = [
  {
    file: "src/application/ai-share-routing.ts",
    api: "uni.getEnterOptionsSync",
    reason: "分享落地必须在**入口解析**时读 scene（1154 单页模式判定）；已用 try/catch 守卫且对测试可注入 `deps.scene`，下沉端口会增加无收益的间接层",
  },
];

const ALLOWED_DIRS = ["src/platform/", "src/ui/", "src/generated/"];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** 扫描单个文件内容，返回命中的敏感 API 列表 */
export function scanSource(file, src, exceptions = REGISTERED_EXCEPTIONS) {
  if (ALLOWED_DIRS.some((d) => file.startsWith(d))) return [];
  const code = stripComments(src);
  const found = new Set();
  for (const m of code.matchAll(SENSITIVE)) found.add(m[0]);
  return [...found].filter((api) => !exceptions.some((e) => e.file === file && e.api === api));
}

/** 扫描一组 {file, src}；返回违规列表 */
export function scanPlatformUsage(files, exceptions = REGISTERED_EXCEPTIONS) {
  const violations = [];
  for (const { file, src } of files) {
    for (const api of scanSource(file, src, exceptions)) violations.push({ file, api });
  }
  return violations;
}

/** 便捷：遍历仓库 src 下 ts/vue（供 CLI/测试复用） */
export function collectSources(root, walk) {
  return walk(root)
    .filter((p) => [".ts", ".vue"].includes(extname(p)))
    .map((p) => ({ file: p.slice(p.indexOf("src/")), src: readFileSync(p, "utf-8") }));
}

export { join };
