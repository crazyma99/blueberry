// T3b（P1-32）：产物 verify——全部命中产物文件，不用源码命中代替产物命中。
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

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
    if (manifest.appid && pc.appid !== manifest.appid) {
      errors.push("appid mismatch: artifact=" + pc.appid + " expected=" + manifest.appid);
    } else checked.push("appid");
  }

  // 5) 导航标题（产物 app.json window）
  const navTitle = appJson.window ? appJson.window.navigationBarTitleText : undefined;
  if (manifest.navTitle && navTitle !== manifest.navTitle) {
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
  checked.push("residue-scan");

  // 阶段说明（诚实登记，不假装已验）：appCode/apiBase 命中产物属 Phase 2 HTTP 层接入后的检查——
  // 当前 src 尚无 HTTP 消费方，profile 配置已生成于 src/generated/（构建目录内可查）。
  checked.push("appCode/apiBase: pending-http-layer(Phase2)");

  return { ok: errors.length === 0, errors, checked };
}
