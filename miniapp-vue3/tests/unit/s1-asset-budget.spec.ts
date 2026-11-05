// S1 小程序主包瘦身（微信 80051「主包 > 2MB」）的守卫：防止以后又把大图塞回包里。
//
// 背景：IDE 上传报 `source size 2159KB exceed max limit 2MB`；构建产物曾为 1,567,461 B，其中图片约 900KB。
// 2026-11 起图片压缩后产物为 ~1,004,344 B。IDE 上传时 ES6 转译会让 JS 膨胀（本机无法精确复现），
// 所以**图片预算要守紧**：图片体积不受转译影响，省多少就是多少。
//
// 守卫三件：
//   ① 体积预算：`src/static` 与 `src/assets` 下任一图片 ≤ 50KB，且图片合计 ≤ 400KB；
//   ② 引用完整性：源码里所有 `/static/xxx` 字面量必须对应真实文件（本次改了 5 张图的扩展名，防漏改）；
//   ③ 扁平化前提：demo／banner／contact-bg／shop-top 已**扁平化为不透明 JPEG**（原为带 alpha 的 PNG），
//      视觉等价的前提是它们底下就是页面底色 `#160F04`（`$color-page`）；底色一改，这些图的圆角/半透明处会露馅。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

/** 单张上限：当前最大为 contact-bg.jpg ≈ 45.7KB，留约 4KB 余量；再大请先压缩或改走 CDN */
const MAX_SINGLE_IMAGE_BYTES = 50 * 1024;
/** 全部包内图片合计上限：当前 359,984 B ≈ 351.6KiB（jpg 256,299 + png 91,563 + svg 12,122） */
const MAX_TOTAL_IMAGE_BYTES = 400 * 1024;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const imageFiles = (): { rel: string; size: number }[] =>
  [...walk(resolve(root, "src/static")), ...walk(resolve(root, "src/assets"))]
    .filter((p) => IMAGE_EXT.has(extname(p).toLowerCase()))
    .map((p) => ({ rel: relative(root, p), size: statSync(p).size }));

describe("S1 · 包内图片体积预算", () => {
  it(`任一图片 ≤ ${MAX_SINGLE_IMAGE_BYTES} B`, () => {
    const files = imageFiles();
    expect(files.length).toBeGreaterThan(20); // 防止目录写错导致空跑
    const over = files.filter((f) => f.size > MAX_SINGLE_IMAGE_BYTES).map((f) => `${f.rel} = ${f.size} B`);
    expect(over, `超限图片（先压缩，或改走 CDN）：\n${over.join("\n")}`).toEqual([]);
  });

  it(`图片合计 ≤ ${MAX_TOTAL_IMAGE_BYTES} B`, () => {
    const total = imageFiles().reduce((s, f) => s + f.size, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_IMAGE_BYTES);
  });
});

describe("S1 · 静态资源引用完整性", () => {
  const SRC_EXT = new Set([".vue", ".ts", ".json", ".scss", ".css", ".wxss", ".wxml"]);
  // `/static/<path>.<ext>`：路径段只含字母数字 _ . - /（模板拼接/变量不在此列，另有各自测试）
  const STATIC_REF = /\/static\/([A-Za-z0-9_\-./]+\.(?:png|jpe?g|webp|gif|svg))/g;

  // 存量「有意的死引用」白名单（须写理由；新增死引用 = 失败）
  const KNOWN_DEAD_REFS = new Set([
    // priceList 兜底图：旧端仓库同样不存在，迁移时「保持死引用一致」，页面头部注释已登记（priceList/index.vue:12）
    "/static/honghe-price.png",
    // 探针页故意引用不存在的图以验证 image 的 error 分支（pages/_probe/wot-sample.vue）
    "/static/logo-missing.png",
  ]);

  it("源码中每个 /static/xxx 字面量都对应存在的文件（登记过的存量死引用除外）", () => {
    const missing: string[] = [];
    let refCount = 0;
    for (const abs of walk(resolve(root, "src"))) {
      if (!SRC_EXT.has(extname(abs))) continue;
      const text = readFileSync(abs, "utf-8");
      for (const m of text.matchAll(STATIC_REF)) {
        refCount++;
        if (KNOWN_DEAD_REFS.has(`/static/${m[1]}`)) continue;
        try {
          statSync(resolve(root, "src/static", m[1]));
        } catch {
          missing.push(`${relative(root, abs)} → /static/${m[1]}`);
        }
      }
    }
    expect(refCount).toBeGreaterThan(10); // 防止正则失效空跑
    expect(missing, `引用了不存在的静态资源：\n${missing.join("\n")}`).toEqual([]);
  });

  it("被压缩改名的旧 .png 引用不得残留（demo1/demo2/banner/contact-bg/shop-top 已改 .jpg）", () => {
    const stale = /\/static\/(demo1|demo2|ai-recom-banner|contact-bg|shop-container-top)\.png/;
    const hits: string[] = [];
    for (const abs of walk(resolve(root, "src"))) {
      if (!SRC_EXT.has(extname(abs))) continue;
      if (stale.test(readFileSync(abs, "utf-8"))) hits.push(relative(root, abs));
    }
    expect(hits).toEqual([]);
  });
});

describe("S1 · 扁平化 JPEG 的前提：页面底色 #160F04", () => {
  const FLATTENED = ["demo1", "demo2", "ai-recom-banner", "contact-bg", "shop-container-top"].map(
    (n) => `src/static/${n}.jpg`,
  );

  it("5 张扁平化资产均为真 JPEG（SOI 魔数 FFD8FF），不是改了扩展名的 PNG", () => {
    for (const f of FLATTENED) {
      const head = readFileSync(resolve(root, f)).subarray(0, 3);
      expect([...head], f).toEqual([0xff, 0xd8, 0xff]);
    }
  });

  it("页面底色 $color-page 仍为 #160F04（扁平化图的合成底色）", () => {
    const theme = readFileSync(resolve(root, "src/generated/theme.scss"), "utf-8");
    expect(theme).toMatch(/\$color-page:\s*#160F04\b/i);
    expect(readFileSync(resolve(root, "src/App.vue"), "utf-8")).toMatch(/background-color:\s*#160F04/i);
  });
});
