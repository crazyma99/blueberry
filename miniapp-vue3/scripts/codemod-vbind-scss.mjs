// 一次性 codemod（2026-09-19 抖音兼容）：<style> 内 v-bind("tokens.*") → scss 编译期常量。
// 背景：抖音 TTSS 不支持 CSS 变量，v-bind 样式在抖音端整条失效（白底/tab 无样式事故）。
// 规则：
//   v-bind("tokens.semantic.colorPage")          → $color-page
//   v-bind("tokens.primitive.spaceMd")           → $space-md
//   v-bind("tokens.component.popupRadiusRpx + 'rpx'") → #{$popup-radius-rpx}rpx
// 含替换的 <style> 块自动补 lang="scss"；script 中仅服务样式的 tokens import 自动移除。
// 幂等：无 v-bind( 的文件不动。
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

function kebab(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

const VBIND_RE = /v-bind\(\s*"tokens\.(semantic|primitive|component)\.([A-Za-z0-9]+)(\s*\+\s*'rpx')?"\s*\)/g;

const files = execSync("grep -rl 'v-bind(' src --include='*.vue'", { encoding: "utf-8" })
  .trim()
  .split("\n")
  .filter(Boolean);

let changedFiles = 0;
let totalSites = 0;
for (const file of files) {
  const src = readFileSync(file, "utf-8");
  // 逐 <style> 块处理
  let out = "";
  let rest = src;
  let fileChanged = false;
  for (;;) {
    const m = /<style[^>]*>/.exec(rest);
    if (!m) { out += rest; break; }
    const tag = m[0];
    const tagStart = m.index;
    const closeIdx = rest.indexOf("</style>", tagStart + tag.length);
    if (closeIdx === -1) { out += rest; break; }
    const body = rest.slice(tagStart + tag.length, closeIdx);
    let sites = 0;
    const newBody = body.replace(VBIND_RE, (_all, _layer, key, plusRpx) => {
      sites += 1;
      const v = "$" + kebab(key);
      return plusRpx ? `#{$${kebab(key)}}rpx` : v;
    });
    if (sites > 0) {
      fileChanged = true;
      totalSites += sites;
      let newTag = tag;
      if (!/lang=["']scss["']/.test(tag)) {
        newTag = tag.replace("<style", '<style lang="scss"');
      }
      out += rest.slice(0, tagStart) + newTag + newBody + "</style>";
    } else {
      out += rest.slice(0, closeIdx + "</style>".length);
    }
    rest = rest.slice(closeIdx + "</style>".length);
  }
  if (!fileChanged) continue;

  // tokens import 清理：script 中不再出现 tokens. 才删
  const importRe = /^\s*import\s*\{\s*tokens\s*\}\s*from\s*"[^"]*generated\/tokens";\s*\n/m;
  const withoutImport = out.replace(importRe, "");
  if (importRe.test(out) && !/\btokens\./.test(withoutImport)) {
    out = withoutImport;
  }

  writeFileSync(file, out);
  changedFiles += 1;
  console.log("codemod:", file);
}
console.log(`done: ${changedFiles} files, ${totalSites} v-bind sites`);
