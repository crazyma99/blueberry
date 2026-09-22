// 2026-09-22 主人：「抖音侧仅能使用抖音默认底 tab 导航，目前抖音侧底 tab 的 icon 太大，针对抖音侧进行 icon 大小优化（微信侧不动）」——
// 事实：**微信＝自绘 `custom-tab-bar`（图标 `static/iconpark/*.svg`，38rpx）**；**抖音＝pages.json 原生 tabBar（图标 `static/*-bar*.png`）**
// ⇒ 两套代码，本 spec 只守**抖音侧那 6 张 PNG**（微信侧图标不在此列，改动会红）。
// 优化口径：画布保持 114×114（不改平台缩放映射），把图标**内容**等比缩到 72×72 内并居中
//（占用率 ≤65%，线宽等比变细；原为 72%–93%，真机观感偏大）。
// 本 spec 用**纯 Node**（zlib + PNG 逐行反滤波）解出 alpha 包围盒，不引入图像依赖 ⇒ 可进 CI。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const pagesJson = readFileSync(resolve(root, "src/pages.json"), "utf-8");

/** 抖音底 tab 的 6 张图标（pages.json 原生 tabBar 用；微信侧自绘栏不用这些） */
const ICONS = ["home-bar", "home-bar-dim", "price-bar", "price-bar-dim", "my-bar", "my-bar-dim"] as const;

/** 画布尺寸与内容（alpha>0）包围盒：8bit RGBA、非隔行 PNG 的纯 JS 解码 */
function alphaBBox(path: string): { width: number; height: number; bbox: { x: number; y: number; w: number; h: number } } {
  const buf = readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not png: " + path);
  let off = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) throw new Error("expect 8bit RGBA non-interlaced: " + path);
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0; // 左
      const b = y > 0 ? px[(y - 1) * stride + x] : 0; // 上
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0; // 左上
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error("bad filter " + filter);
      px[y * stride + x] = v & 0xff;
    }
  }
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[y * stride + x * bpp + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { width, height, bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}

describe("抖音底 tab 图标：尺寸优化口径（微信侧不涉及）", () => {
  it("画布保持 114×114（不改平台缩放映射）", () => {
    for (const n of ICONS) {
      const r = alphaBBox(resolve(root, `src/static/${n}.png`));
      expect(r.width, n).toBe(114);
      expect(r.height, n).toBe(114);
    }
  });

  it("⭐图标内容 ≤ 72×72（占用率 ≤65%）——治「底 tab icon 太大」", () => {
    for (const n of ICONS) {
      const { bbox, width, height } = alphaBBox(resolve(root, `src/static/${n}.png`));
      expect(bbox.w, `${n} 内容宽`).toBeLessThanOrEqual(72);
      expect(bbox.h, `${n} 内容高`).toBeLessThanOrEqual(72);
      expect(bbox.h / height, `${n} 占用率`).toBeLessThanOrEqual(0.65);
      expect(bbox.w / width, `${n} 占用率`).toBeLessThanOrEqual(0.65);
    }
  });

  it("三个「选中态」图标统一装入 72×72 框（长边＝72、等比不变形）且居中（留白差 ≤2px）", () => {
    const selected = ["home-bar", "price-bar", "my-bar"] as const;
    for (const n of selected) {
      const { bbox, width, height } = alphaBBox(resolve(root, `src/static/${n}.png`));
      // 装框口径：等比缩放到 72×72 内 ⇒ 长边恰为 72（宽版图标如 price 的高会小于 72，属正确结果）
      expect(Math.max(bbox.w, bbox.h), `${n} 长边`).toBe(72);
      expect(bbox.w, `${n} 内容宽`).toBeLessThanOrEqual(72);
      expect(bbox.h, `${n} 内容高`).toBeLessThanOrEqual(72);
      expect(Math.abs(bbox.x - (width - bbox.x - bbox.w)), `${n} 水平居中`).toBeLessThanOrEqual(2);
      expect(Math.abs(bbox.y - (height - bbox.y - bbox.h)), `${n} 垂直居中`).toBeLessThanOrEqual(2);
    }
  });

  it("pages.json 原生 tabBar 仍按「dim＝未选中 / 原图＝选中」引用这 6 张（微信自绘栏用 iconpark SVG，不在本 spec）", () => {
    for (const [i, name] of ["home", "price", "my"].entries()) {
      expect(pagesJson, name).toContain(`"iconPath": "static/${name}-bar-dim.png"`);
      expect(pagesJson, name).toContain(`"selectedIconPath": "static/${name}-bar.png"`);
      if (i === 0) expect(pagesJson).toContain('"custom": true'); // 微信侧仍是自定义 tabBar（两套代码并存）
    }
    // 微信自绘栏图标不得被本 spec 触及
    const wxTabBar = readFileSync(resolve(root, "src/custom-tab-bar/index.js"), "utf-8");
    expect(wxTabBar).toContain("/static/iconpark/");
    expect(wxTabBar).not.toContain("-bar.png");
  });
});
