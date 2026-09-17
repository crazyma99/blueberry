// T3b（P1-32）：产物 verify——全部命中产物文件，不用源码命中代替产物命中。
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TEXT_EXT = new Set([".js", ".json", ".wxml", ".wxss", ".ttml", ".ttss", ".css", ".html", ".jss", ".qss"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function verifyTarget({ manifest, artifactDir }) {
  const errors = [];
  const warnings = []; // 非阻断但必须上报（如产物 appid 为占位 ⇒ 无法真机出码）
  const checked = [];
  const A = resolve(artifactDir);
  if (!existsSync(A)) return { ok: false, errors: ["artifactDir missing: " + A], checked };
  const readJson = (p) => JSON.parse(readFileSync(p, "utf-8"));

  // 1) app.json 存在且可解析
  const appJsonPath = join(A, "app.json");
  if (!existsSync(appJsonPath)) return { ok: false, errors: ["app.json missing"], checked };
  const appJson = readJson(appJsonPath);
  checked.push("app.json");

  // 2) app.js 存在（抖音硬规则；vue3 产物亦必有）
  if (!existsSync(join(A, "app.js"))) errors.push("app.js missing");
  else checked.push("app.js");

  // 3) 路由集合 == 阶段期望集合（P1-32）
  const pages = (appJson.pages ?? []).slice().sort();
  const expected = (manifest.expectedRoutes ?? []).slice().sort();
  if (JSON.stringify(pages) !== JSON.stringify(expected)) {
    errors.push("route set mismatch: artifact=[" + pages.join(",") + "] expected=[" + expected.join(",") + "]");
  } else checked.push("routes:" + pages.length);

  // 4) appid 命中 project.config.json（产物侧）
  const pcPath = join(A, "project.config.json");
  if (!existsSync(pcPath)) errors.push("project.config.json missing");
  else {
    const pc = readJson(pcPath);
    // P1-37 CR P0-4：不再 fail-open——manifest 缺 appid 属契约缺失，报错而非「跳过且谎报 checked」
    if (!manifest.appid) {
      errors.push("manifest.appid missing: 无法核对产物 appid（不得跳过）");
    } else if (pc.appid !== manifest.appid) {
      errors.push("appid mismatch: artifact=" + pc.appid + " expected=" + manifest.appid);
    } else checked.push("appid");
  }

  // 5) 导航标题（产物 app.json window）
  const navTitle = appJson.window ? appJson.window.navigationBarTitleText : undefined;
  // P1-37 CR P0-4：同上——缺 navTitle 报错，不虚报 checked
  if (!manifest.navTitle) {
    errors.push("manifest.navTitle missing: 无法核对产物导航标题（不得跳过）");
  } else if (navTitle !== manifest.navTitle) {
    errors.push("nav title mismatch: artifact=" + navTitle + " expected=" + manifest.navTitle);
  } else checked.push("navTitle");

  // 6) 引擎指纹：vue3 产物必含 common/vendor.js 且含 vue 运行时标记 createApp
  //    （旧 uni-app x 产物无此指纹——防「旧 artifact 冒充新 engine」，P1-34）
  const vendor = join(A, "common/vendor.js");
  if (!existsSync(vendor) || !readFileSync(vendor, "utf-8").includes("createApp")) {
    errors.push("engine fingerprint missing: vue3 marker createApp in common/vendor.js");
  } else checked.push("engine:vue3");

  // 7) 错误品牌/配置残留（产物全文扫描，仅文本类文件）
  for (const bad of manifest.forbiddenResidues ?? []) {
    if (!bad) continue;
    for (const f of walk(A)) {
      if (!TEXT_EXT.has(extname(f))) continue;
      if (readFileSync(f, "utf-8").includes(bad)) {
        errors.push("forbidden residue " + JSON.stringify(bad) + " found in " + f.slice(A.length + 1));
        break;
      }
    }
  }
  // P1-37 CR P0-4：residues 为空时不 push——避免「声称扫过」的空覆盖
  if ((manifest.forbiddenResidues ?? []).filter(Boolean).length > 0) checked.push("residue-scan");
  else warnings.push("forbiddenResidues empty: 未执行跨品牌残留扫描（调用方需显式提供）");

  // 阶段说明（诚实登记，不假装已验）：appCode/apiBase 命中产物属 Phase 2 HTTP 层接入后的检查——
  // 当前 src 尚无 HTTP 消费方，profile 配置已生成于 src/generated/（构建目录内可查）。
  checked.push("appCode/apiBase: pending-http-layer(Phase2)");

  // 8) P4-07/P4-13：平台作用域路由断言——**未迁移/不注册的页必须不在产物里**
  //    （抖音＝客片展示版：AI 六页不注册；靠产物命中判定，不用源码推断）
  //    2026-09-17 CR 🟡：**含 subPackages**（若 AI 页改挂分包，只看 pages 会漏判）
  const allPages = [
    ...(appJson.pages ?? []),
    ...((appJson.subPackages ?? []).flatMap((sp) => (sp.pages ?? []).map((p) => (sp.root ?? "") + p))),
  ];
  checked.push("subPackages:" + String((appJson.subPackages ?? []).length));
  for (const forbidden of manifest.forbiddenRoutes ?? []) {
    if (!forbidden) continue;
    const hit = allPages.find((p) => p.startsWith(forbidden));
    if (hit) errors.push("forbidden route present: " + hit + " (platform=" + manifest.platform + ")");
  }
  checked.push("forbiddenRoutes:" + String((manifest.forbiddenRoutes ?? []).length));

  // 9) P4-13：平台专属产物指纹——抖音产物须自带 tt 前缀样式 `app.ttss`
  if (manifest.platform === "mp-toutiao") {
    if (!existsSync(join(A, "app.ttss"))) errors.push("mp-toutiao artifact missing app.ttss (tt-prefixed style)");
    else checked.push("platform:mp-toutiao(tt-files)");
  }

  // 10) appid 占位 = **阻断**（P4-11/P4-13；2026-09-17 CR 🟡：原来只进 warnings，而下游只读 `ok` ⇒ 会被误读为通过）
  //    占位 appid 的产物无法真机出码，必须让 `ok=false`，不得伪装通过。
  const pcForAppid = existsSync(join(A, "project.config.json")) ? readJson(join(A, "project.config.json")) : {};
  if (!manifest.appid || String(pcForAppid.appid ?? "") === "testAppId") {
    errors.push("artifact appid is placeholder (testAppId): 不可用于真机出码（须经 build-target 管线注入平台 AppID）");
  } else checked.push("appid-non-placeholder");

  return { ok: errors.length === 0, errors, warnings, checked };
}

// CLI（phases 验收命令）：node scripts/verify-target.mjs --manifest <release-manifest.json> [--artifact <dir>]
// 默认产物目录＝清单所在目录下的 dist/build/<platform>（build-target 产出的 release-manifest.json 即此布局）。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argOf = (flag) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const manifestPath = argOf("--manifest");
  if (!manifestPath) {
    console.error("usage: node scripts/verify-target.mjs --manifest <release-manifest.json> [--artifact <dir>]");
    process.exit(2);
  }
  const manifestFile = resolve(manifestPath);
  const manifest = JSON.parse(readFileSync(manifestFile, "utf-8"));
  const artifactDir = argOf("--artifact") ?? join(dirname(manifestFile), "dist", "build", manifest.platform ?? "");
  const result = verifyTarget({ manifest, artifactDir });
  console.log(JSON.stringify({ artifactDir, ...result }, null, 2));
  process.exit(result.ok ? 0 : 1);
}
