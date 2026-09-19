// 一次性 codemod（2026-09-19 抖音兼容）：直写的 var(--*) → 字面量。
// 背景：抖音 TTSS 不支持 CSS 变量（官方文档「变量等特性编译暂不支持」）。
// 映射表取自 src/App.vue page{--*} 定义块（design-token.md 常量）。
// 跳过 // 行注释、/* */ 块注释、<!-- --> 模板注释（注释里的「旧 var(--x)」是历史记录，不篡改）。
// --gp-node-size 是 GenerationProgress 组件内局部变量，不在本表，单独手工处理。
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const MAP = {
  "--color-bg": "#160F04",
  "--color-primary": "#F1CD91",
  "--color-primary-deep": "#B28A56",
  "--color-surface": "#1D1105",
  "--color-primary-70": "rgba(241, 205, 145, 0.7)",
  "--color-primary-50": "rgba(241, 205, 145, 0.5)",
  "--color-primary-30": "rgba(241, 205, 145, 0.3)",
  "--color-primary-20": "rgba(241, 205, 145, 0.2)",
  "--color-primary-10": "rgba(241, 205, 145, 0.1)",
  "--color-primary-06": "rgba(241, 205, 145, 0.06)",
  "--color-border-soft": "rgba(255, 255, 221, 0.3)",
  "--color-topbar-bg": "rgba(0, 0, 0, 0.2)",
  "--color-popup": "#1A1A1A",
  "--color-popup-card": "#262626",
  "--gradient-btn-primary": "linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%)",
  "--radius-2xs": "4rpx",
  "--radius-xs": "8rpx",
  "--radius-card": "14rpx",
  "--radius-sm": "16rpx",
  "--radius-item": "18rpx",
  "--radius-md": "20rpx",
  "--radius-container": "24rpx",
  "--radius-lg": "32rpx",
  "--radius-pill": "39rpx",
  "--radius-xl": "44rpx",
  "--radius-2xl": "48rpx",
  "--radius-avatar": "64rpx",
  "--radius-full": "999rpx",
  "--icon-xs": "32rpx",
  "--icon-sm": "40rpx",
  "--icon-md": "48rpx",
  "--spacing-2xs": "6rpx",
  "--spacing-xs": "10rpx",
  "--spacing-sm": "20rpx",
  "--spacing-24": "24rpx",
  "--spacing-md": "28rpx",
  "--spacing-lg": "32rpx",
  "--font-display": "'NotoSerifSC-Bold', serif",
  "--font-body": "'HarmonyOS-Sans-SC', sans-serif",
  "--font-size-display-xl": "46rpx",
  "--font-size-display": "38rpx",
  "--font-size-slogan": "34rpx",
  "--font-size-body-lg": "26rpx",
  "--font-size-body-plus": "28rpx",
  "--font-size-body": "24rpx",
  "--font-size-body-sm": "22rpx",
  "--font-size-body-xs": "20rpx",
  "--font-size-caption-md": "18rpx",
  "--font-size-caption": "14rpx",
};

const VAR_RE = /var\((--[a-z0-9-]+)\)/g;

function replaceOutsideComments(text) {
  let out = "";
  let i = 0;
  let sites = 0;
  const n = text.length;
  while (i < n) {
    if (text.startsWith("//", i)) {
      const e = text.indexOf("\n", i);
      const end = e === -1 ? n : e;
      out += text.slice(i, end);
      i = end;
    } else if (text.startsWith("/*", i)) {
      const e = text.indexOf("*/", i + 2);
      const end = e === -1 ? n : e + 2;
      out += text.slice(i, end);
      i = end;
    } else if (text.startsWith("<!--", i)) {
      const e = text.indexOf("-->", i + 4);
      const end = e === -1 ? n : e + 3;
      out += text.slice(i, end);
      i = end;
    } else {
      // 普通字符段：一直吃到下一个注释起点
      let j = i + 1;
      while (j < n && !text.startsWith("//", j) && !text.startsWith("/*", j) && !text.startsWith("<!--", j)) j++;
      const seg = text.slice(i, j);
      out += seg.replace(VAR_RE, (all, name) => {
        if (MAP[name] == null) {
          console.error("!! 未映射变量:", name);
          process.exitCode = 1;
          return all;
        }
        sites += 1;
        return MAP[name];
      });
      i = j;
    }
  }
  return { out, sites };
}

const files = execSync("grep -rl 'var(--' src --include='*.vue'", { encoding: "utf-8" })
  .trim()
  .split("\n")
  .filter(Boolean);

let changedFiles = 0;
let totalSites = 0;
for (const file of files) {
  const src = readFileSync(file, "utf-8");
  const { out, sites } = replaceOutsideComments(src);
  if (sites > 0 && out !== src) {
    writeFileSync(file, out);
    changedFiles += 1;
    totalSites += sites;
    console.log(`codemod: ${file} (${sites})`);
  }
}
console.log(`done: ${changedFiles} files, ${totalSites} var() sites`);
