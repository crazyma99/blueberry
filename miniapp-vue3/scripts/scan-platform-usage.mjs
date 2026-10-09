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

// ——— 多端兼容守卫（`docs/migration/compat-and-dev-spec.md` v1.0：C3／C4／C5／C6）———
//  纪律源头：`src/ui/ui-platform.ts` §8.12（平台分支一律运行时可判定；`#ifdef` 只允许出现在模板/样式且不得承载唯一逻辑）。
//  C3 逻辑层（`.ts`/`.uts`）**零 `#ifdef`**  —— vitest 不处理条件编译 ⇒ 写在逻辑层必然测不到、且易漏端
//  C4 条件编译块**无 `#else` 兜底 ⇒ 必须登记**（COMPAT_DECLARATIONS，带"影响端＋用户可见后果"）
//  C5 `ports/*.ts` **× 三端矩阵齐全**（PORT_MATRIX）
//  C6 `src/platform/<端或适配层>` **目录必须登记**（PLATFORM_DIRS）

/** 多端闭集（与 `src/ports/context.ts` 的 `PLATFORMS` 对齐；新增端先改那里再改这里） */
export const ENDS = ["wx", "tt", "xhs"];

/** 端 → 条件编译宏 */
export const END_MACROS = { wx: "MP-WEIXIN", tt: "MP-TOUTIAO", xhs: "MP-XHS" };

/** C6 登记：`src/platform/` 下已登记的适配层/端目录 */
export const PLATFORM_DIRS = ["ui-bridge", "uni", "weixin"];

/** 条件编译**指令行**：注释开启符后**紧跟** `#ifdef/#ifndef/#else/#elif/#endif`。
 *  刻意要求"紧跟"，以**不匹配散文里的提法**（如 `ui/ui-platform.ts` 的纪律说明、`BaseFeedback.vue` 的注释），避免误报。 */
const DIRECTIVE_RE = /^\s*(?:\/\/|\/\*|<!--)\s*#(ifdef|ifndef|else|elif|endif)\b[ \t]*([A-Za-z0-9_|-]*)/;

/** C4 登记：**无 `#else` 兜底**的条件编译块（键＝`file|macro`，见 SPEC §七①） */
export const COMPAT_DECLARATIONS = [
  {
    file: "src/pages.json",
    macro: "MP-WEIXIN",
    ends: ["tt", "xhs"],
    reason:
      "抖音/小红书侧**不注册**这些页面（AI 六页＋微信专属页；2026-09-17 主人拍板），且两端入口亦不下发 ⇒ 用户看不到、无功能缺口。属**有意平台裁剪**，非漏兜底。",
  },
  {
    file: "src/App.vue",
    macro: "MP-TOUTIAO",
    ends: ["wx", "xhs"],
    reason:
      "样式级 `@font-face` 差异：仅抖音端注入该字体族；其余端不命中该规则即回落全局字体（**样式级天然兜底**），微信端另有其字体注入位点 ⇒ 无功能缺口。",
  },
];

/** C5 登记：端口 × 端矩阵（`src/ports/*.ts` 每个文件一条，**三端齐全**，见 SPEC §七②） */
export const PORT_MATRIX = [
  { port: "src/ports/context.ts",
    wx: { status: "neutral", at: "src/ports/context.ts", note: "纯类型/闭集，无平台 API" },
    tt: { status: "neutral", at: "src/ports/context.ts" },
    xhs: { status: "neutral", at: "src/ports/context.ts" } },
  { port: "src/ports/clock.ts",
    wx: { status: "neutral", at: "src/ports/clock.ts", note: "纯 TS，由调用方注入；无平台 API" },
    tt: { status: "neutral", at: "src/ports/clock.ts" },
    xhs: { status: "neutral", at: "src/ports/clock.ts" } },
  { port: "src/ports/http.ts",
    wx: { status: "impl", at: "src/platform/uni/transport.ts（uni.request 跨端）" },
    tt: { status: "impl", at: "src/platform/uni/transport.ts" },
    xhs: { status: "impl", at: "src/platform/uni/transport.ts" } },
  { port: "src/ports/storage.ts",
    wx: { status: "impl", at: "src/platform/uni/storage.ts（＋infrastructure/storage/versioned.ts 版本化包装）" },
    tt: { status: "impl", at: "src/platform/uni/storage.ts" },
    xhs: { status: "impl", at: "src/platform/uni/storage.ts" } },
  { port: "src/ports/upload.ts",
    wx: { status: "impl", at: "src/platform/uni/upload.ts" },
    tt: { status: "impl", at: "src/platform/uni/upload.ts" },
    xhs: { status: "impl", at: "src/platform/uni/upload.ts" } },
  { port: "src/ports/payments.ts",
    wx: { status: "impl", at: "src/platform/weixin/payments.ts（微信 JSAPI）" },
    tt: { status: "unsupported", reason: "抖音端**明确返回 unsupported**（不假装成功、不构造假单据）；抖音侧付费页不注册 ⇒ 用户看不到支付入口" },
    xhs: { status: "unsupported", reason: "同抖音端：无微信支付能力，返回 unsupported；小红书端待开发（类目/备案门禁）" } },
  { port: "src/ports/media.ts",
    note: "⚠️ **悬空抽象（2026-10-09 实测）**：全仓零引用——`MediaPort`／`PickedImage`／`UploadResult` 在 `src`＋`tests` 的外部引用均为 **0 处**（无实现、无调用方；选图/上传/存相册实际走 `platform/uni/chooser.ts`／`album-save.ts`／`upload.ts` 既有通路）。待实现侧二选一：**补实现并接入页面**，或 **删除该端口文件**（删除属代码改动，需主人点头）",
    wx: { status: "todo", issue: "见 note（端口整体悬空，非分端问题）" },
    tt: { status: "todo", issue: "见 note" },
    xhs: { status: "todo", issue: "见 note" } },
  { port: "src/ports/identity.ts",
    note: "⚠️ **悬空抽象（2026-10-09 实测）**：全仓零引用——`IdentityPort`／`IdentityTicket` 外部引用 **0 处**（无实现、无调用方；登录/换票实际走 `platform/uni/login.ts`＋`application/auth-coordinator.ts`／`login-flow.ts` 既有通路）。待实现侧二选一：**补实现并接入**，或 **删除该端口文件**（需主人点头）",
    wx: { status: "todo", issue: "见 note（端口整体悬空，非分端问题）" },
    tt: { status: "todo", issue: "见 note" },
    xhs: { status: "todo", issue: "见 note" } },
];

/** 解析文件中的条件编译指令行（行号 1-based） */
export function parseDirectives(src) {
  const out = [];
  src.split("\n").forEach((line, i) => {
    const m = line.match(DIRECTIVE_RE);
    if (!m) return;
    const [, kind, macros] = m;
    out.push({ kind, macros: macros.split("||").map((s) => s.trim()).filter(Boolean), line: i + 1 });
  });
  return out;
}

/** C3：逻辑层（`.ts`/`.uts`）出现任何条件编译指令即违规 */
export function scanLogicLayerIfdefs(files) {
  const violations = [];
  for (const { file, src } of files) {
    if (!/\.(ts|uts)$/.test(file)) continue;
    for (const d of parseDirectives(src)) {
      violations.push({ file, api: "logic-layer-ifdef:" + d.kind, at: file + ":" + d.line });
    }
  }
  return violations;
}

/** C4：无 `#else` 兜底的块必须在 COMPAT_DECLARATIONS 登记（键＝file|macro） */
export function scanUndeclaredIfdefs(files, decls = COMPAT_DECLARATIONS) {
  const violations = [];
  const declared = new Set(decls.flatMap((d) => (d.macro ? [d.file + "|" + d.macro] : [])));
  for (const { file, src } of files) {
    if (/\.(ts|uts)$/.test(file)) continue; // 逻辑层由 C3 直接禁掉，不重复报
    const stack = [];
    for (const d of parseDirectives(src)) {
      if (d.kind === "ifdef" || d.kind === "ifndef") {
        for (const macro of d.macros.length > 0 ? d.macros : ["<empty>"]) stack.push({ macro, line: d.line, hasElse: false });
      } else if (d.kind === "else" || d.kind === "elif") {
        if (stack.length > 0) stack[stack.length - 1].hasElse = true;
      } else if (d.kind === "endif") {
        const b = stack.pop();
        if (b && !b.hasElse && !declared.has(file + "|" + b.macro)) {
          violations.push({ file, api: "ifdef:no-fallback:" + b.macro, at: file + ":" + b.line });
        }
      }
    }
    for (const b of stack) {
      if (!b.hasElse && !declared.has(file + "|" + b.macro)) {
        violations.push({ file, api: "ifdef:unclosed-or-no-fallback:" + b.macro, at: file + ":" + b.line });
      }
    }
  }
  return violations;
}

/** C5：端口 × 三端矩阵齐全性（impl 必须给 at／unsupported 必须给 reason／todo 必须给 issue） */
export function scanPortMatrix(portFiles, matrix = PORT_MATRIX) {
  const violations = [];
  const byPort = new Map(matrix.map((m) => [m.port, m]));
  for (const port of portFiles) {
    const entry = byPort.get(port);
    if (entry == null) {
      violations.push({ file: port, api: "port:unregistered" });
      continue;
    }
    for (const end of ENDS) {
      const e = entry[end];
      if (e == null || typeof e.status !== "string") {
        violations.push({ file: port, api: "port:missing-end:" + end });
        continue;
      }
      if (!["impl", "neutral", "unsupported", "todo"].includes(e.status)) {
        violations.push({ file: port, api: "port:bad-status:" + end + "=" + e.status });
      } else if (e.status === "impl" && !e.at) {
        violations.push({ file: port, api: "port:impl-without-at:" + end });
      } else if (e.status === "unsupported" && !e.reason) {
        violations.push({ file: port, api: "port:unsupported-without-reason:" + end });
      } else if (e.status === "todo" && !e.issue) {
        violations.push({ file: port, api: "port:todo-without-issue:" + end });
      }
    }
  }
  return violations;
}

/** C6：`src/platform/` 下的目录必须登记 */
export function scanPlatformDirs(dirs, registered = PLATFORM_DIRS) {
  return dirs
    .filter((d) => !registered.includes(d))
    .map((d) => ({ file: "src/platform/" + d, api: "platform:unregistered-dir" }));
}
