// P4-12（扫描规则）：平台 API 只允许出现在登记的目录/例外里——**对源码**扫描，**不对第三方 bundle 盲 grep**。
// 规则（与 phases P4-12 一致）：
//   · 允许目录：`src/platform/**`（平台适配）、`src/ui/**`（Wot 门面）、`src/generated/**`（生成物）
//   · 敏感集：平台 SDK／能力（`wx.*`、`tt.*`、`uni.request|uploadFile|downloadFile|login|authorize|openSetting|
//     getImageInfo|chooseImage|saveImageToPhotosAlbum|getEnterOptionsSync|requestSubscribeMessage|requestPayment`）
//   · UI 类 API（toast/modal/loading/导航/getSystemInfoSync 等）**允许出现在任意层**（属 uni 基础 UI，不是平台分支）
//   · 例外须**显式登记**并写理由；注释中的提及不算命中（去注释后判定）
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";

const SENSITIVE = /\bwx\.[a-zA-Z]\w*|\btt\.[a-zA-Z]\w*|uni\.(request|uploadFile|downloadFile|login|authorize|openSetting|getImageInfo|chooseImage|saveImageToPhotosAlbum|getEnterOptionsSync|requestSubscribeMessage|requestPayment|vibrateShort|canIUse|getProvider|getUserProfile|createVKSession|setVisualEffectOnCapture)\b/g;

/** 已登记的例外（P4-12：例外必须显式登记并说明理由） */
export const REGISTERED_EXCEPTIONS = [
  {
    file: "src/application/ai-share-routing.ts",
    api: "uni.getEnterOptionsSync",
    reason: "分享落地必须在**入口解析**时读 scene（1154 单页模式判定）；已用 try/catch 守卫且对测试可注入 `deps.scene`，下沉端口会增加无收益的间接层",
  },
];

const ALLOWED_DIRS = ["src/platform/", "src/ui/", "src/generated/"];

/** 绕过形态（2026-09-17 加固）：直接 `wx.` 之外，还要拦住「换名/换取值方式」的平台访问——
 *  ①`globalThis.wx`／`globalThis.uni` ②`const w = wx`／`= uni` 别名 ③`const { request } = uni` 解构 ④`wx["request"]` 方括号 */
const BYPASS_PATTERNS = [
  { name: "globalThis-access", re: /\bglobalThis\s*\.\s*(wx|uni)\b/g },
  { name: "alias-assignment", re: /=\s*(wx|uni)\b(?![\w.$])/g },
  { name: "destructure", re: /\{[^}]*\}\s*=\s*(wx|uni)\b/g },
  { name: "bracket-access", re: /\b(wx|uni)\s*\[|\bglobalThis\s*\[\s*["'](wx|uni)["']\s*\]/g },
];

/** 去注释（**单遍状态机，字符串感知**）：
 *  · 只把「注释」替换为空格，**字符串/模板字面量原样保留** —— 既避免字符串里的 `//` 把其后真实代码当注释吞掉
 *    （CR 🔴3 实测漏报），又保证 `globalThis["wx"]` 这类**方括号取值**仍能被后续规则匹配。
 *  · 取舍：字符串里逐字写出 `wx.request(` 的极端情形会误报（宁可误报，不可漏报）。 */
function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let state = "code"; // code | line | block | sq | dq | tpl
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === "code") {
      if (c === "/" && c2 === "/") { state = "line"; i += 2; continue; }
      if (c === "/" && c2 === "*") { state = "block"; i += 2; continue; }
      if (c === "'" || c === '"' || c === "`") { state = c === "'" ? "sq" : c === '"' ? "dq" : "tpl"; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; out += c; }
      i++; continue;
    }
    if (state === "block") {
      if (c === "*" && c2 === "/") { state = "code"; i += 2; out += " "; continue; }
      i++; continue;
    }
    // 字符串/模板：原样保留（含转义）
    if (c === "\\") { out += c + (c2 ?? ""); i += 2; continue; }
    if ((state === "sq" && c === "'") || (state === "dq" && c === '"') || (state === "tpl" && c === "`")) state = "code";
    out += c; i++; continue;
  }
  return out;
}
/** 扫描单个文件内容，返回命中的敏感 API 列表 */
export function scanSource(file, src, exceptions = REGISTERED_EXCEPTIONS) {
  if (ALLOWED_DIRS.some((d) => file.startsWith(d))) return [];
  const code = stripComments(src);
  const found = new Set();
  for (const m of code.matchAll(SENSITIVE)) found.add(m[0]);
  for (const b of BYPASS_PATTERNS) {
    for (const _m of code.matchAll(b.re)) found.add("bypass:" + b.name);
  }
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

// ——— 配置/编译侧规则（P4-12 的「配置/编译」两侧；2026-09-17 补，CR 指出的缺口）———
//  适用文件：`src/pages.json`／`src/manifest.json`／`vite.config.*`（**不含**构建产物）
//  规则：①`#ifdef`/`#ifndef` 的宏必须在**登记集合**内（未知宏拼写错误会静默失效）②标记必须**配对**（栈式校验）
//        ③`condition`（调试启动模式）**不得用于平台裁剪**（P4-07）
export const REGISTERED_MACROS = ["MP-WEIXIN", "MP-TOUTIAO", "MP-XHS", "H5", "APP-PLUS", "MP", "APP"];

const MARKER_RE = /^\s*\/\/\s*#(ifdef|ifndef|endif|else|elif)\s*([A-Za-z0-9_|-]*)/;

export function scanConfigPlatformUsage(files) {
  const violations = [];
  for (const { file, src } of files) {
    const isConfig = /(^|\/)(pages\.json|manifest\.json|vite\.config\.[a-z]+)$/.test(file);
    if (!isConfig) continue;
    // ①/② 标记检查（仅 JSONC/JS 配置；逐行栈式）
    const stack = [];
    src.split("\n").forEach((line, i) => {
      const m = line.match(MARKER_RE);
      if (!m) return;
      const [, kind, macros] = m;
      const at = file + ":" + (i + 1);
      if (kind === "ifdef" || kind === "ifndef") {
        const list = macros.split("||").map((x) => x.trim()).filter(Boolean);
        if (list.length === 0) violations.push({ file, api: "config:empty-macro", at });
        for (const macro of list) {
          if (!REGISTERED_MACROS.includes(macro)) violations.push({ file, api: "config:unknown-macro:" + macro, at });
        }
        stack.push(kind);
      } else if (kind === "endif") {
        if (stack.pop() === undefined) violations.push({ file, api: "config:unbalanced-endif", at });
      }
    });
    if (stack.length > 0) violations.push({ file, api: "config:unclosed-ifdef", at: file });
    // ③ condition 不得用于平台裁剪（P4-07）
    if (/"condition"\s*:/.test(src)) violations.push({ file, api: "config:condition-for-platform", at: file });
  }
  return violations;
}
