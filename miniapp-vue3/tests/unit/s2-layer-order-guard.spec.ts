// S2（瘦包回归热修 · 2026-11-05）：「不透明背景图」不得盖住同级内容的**图层守卫**。
//
// 事故：S1 瘦包把 contact-bg.png（整图半透明）换成不透明 JPEG（扁平化到 #160F04）后，`ServiceContact` 里
// `.contact-bg`（position:absolute 铺满）按 CSS 绘制顺序（定位元素 step 6 画在静态块内容 step 3 之上）盖住了
// 静态的 `.label` / `.val`（联系电话、商务合作及两个号码）。旧图半透明，文字从下面透出，所以一直没暴露；
// S1 的守卫只管体积/格式/引用，抓不到图层。
//
// 本守卫**只读源码文本**（不伪造渲染）：解析 `<style>` 的平铺规则 + `<template>` 的 DOM 先后，断言
//   ① 凡「不透明 JPEG 做的 position:absolute 铺满背景图」都已登记在册（新增未登记 ⇒ 红，逼人来验层叠）；
//   ② 背景层 z-index 未设或 <1；其同级内容节点是定位元素且 z-index ≥1（或在 DOM 中位于背景之后且 z 不低于背景）；
//   ③ ServiceContact 的 `.code` / `.label` / `.val` 全部 `position:relative|absolute` + `z-index≥1`；
//      `.tit`（"长按二维码扫码添加客服"）位于 `.contact-main` 之外（几何上与 contact-bg 不相交）——若将来被挪进
//      `.contact-main`，则同样必须 relative + z-index≥1；
//   ④ demo1/demo2 的 `<image>` 是卡片的唯一子节点（没有可被盖住的同级内容）。
// 真机验收仍不可替代（微信 WebView 的命中/绘制以真机为准）。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

// ───────────────────────── 源码解析工具（纯文本） ─────────────────────────
interface Parsed {
  rel: string;
  template: string;
  rules: { selectors: string[]; decls: Record<string, string> }[];
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function parseDecls(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of body.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).replace(/!important/i, "").trim();
    if (k !== "") out[k] = v;
  }
  return out;
}

function parseVue(rel: string): Parsed {
  const src = readFileSync(resolve(root, rel), "utf-8");
  const tpl = /^<template>\n([\s\S]*?)^<\/template>/m.exec(src);
  const sty = /<style[^>]*>([\s\S]*?)<\/style>/.exec(src);
  expect(tpl, `${rel}: 未找到顶层 <template>`).not.toBeNull();
  expect(sty, `${rel}: 未找到 <style>`).not.toBeNull();
  const css = stripComments(sty![1]);
  const rules: Parsed["rules"] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (sel.startsWith("@")) continue;
    rules.push({
      selectors: sel.split(",").map((s) => s.trim().replace(/\s+/g, " ")),
      decls: parseDecls(m[2]),
    });
  }
  return { rel, template: tpl![1], rules };
}

/** 精确选择器（如 ".service-contain .contact-main .label"）的合并声明（按源码顺序，后者覆盖前者） */
function declsOf(p: Parsed, selector: string): Record<string, string> {
  const want = selector.trim().replace(/\s+/g, " ");
  const merged: Record<string, string> = {};
  let hit = 0;
  for (const r of p.rules) {
    if (r.selectors.includes(want)) {
      Object.assign(merged, r.decls);
      hit += 1;
    }
  }
  expect(hit, `${p.rel}: 找不到选择器 ${want} 对应的规则（守卫失效或被改名）`).toBeGreaterThan(0);
  return merged;
}

/** 末级复合选择器含 `.cls` 的所有规则的合并声明（用于自动发现，不要求精确路径） */
function declsOfClassAnywhere(p: Parsed, cls: string): Record<string, string> {
  const merged: Record<string, string> = {};
  const re = new RegExp("\\." + cls.replace(/[-]/g, "\\-") + "(?![\\w-])");
  for (const r of p.rules) {
    if (r.selectors.some((s) => re.test(s.split(" ").pop() ?? ""))) Object.assign(merged, r.decls);
  }
  return merged;
}

const POSITIONED = new Set(["relative", "absolute", "fixed", "sticky"]);
const isPositioned = (d: Record<string, string>): boolean => POSITIONED.has((d.position ?? "static").trim());
const zOf = (d: Record<string, string>): number | null => {
  const v = d["z-index"];
  if (v === undefined) return null;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};
/** 「显式置顶」：定位元素 + z-index ≥ 1 ⇒ 无论 DOM 先后都画在 z-index 未设/0 的背景层之上 */
const isLifted = (d: Record<string, string>): boolean => isPositioned(d) && (zOf(d) ?? 0) >= 1;

/** 从 `<view class="X"` 起点，数 <view>/</view> 配平，返回该元素完整片段 */
function viewElement(template: string, cls: string): string {
  const start = template.indexOf(`<view class="${cls}"`);
  expect(start, `模板中找不到 <view class="${cls}">`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (const m of template.slice(start).matchAll(/<view\b[^>]*?(\/?)>|<\/view>/g)) {
    if (m[0].startsWith("</view")) depth -= 1;
    else if (m[1] !== "/") depth += 1;
    if (depth === 0) return template.slice(start, start + (m.index ?? 0) + m[0].length);
  }
  throw new Error(`<view class="${cls}"> 未配平`);
}

const isJpeg = (rel: string): boolean => {
  const b = readFileSync(resolve(root, rel));
  return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
};

// ───────────────────────── 登记表：不透明 JPEG 的「绝对定位铺满背景」 ─────────────────────────
const CONTACT = "src/components/ServiceContact/ServiceContact.vue";
const DEMO_DETAIL = "src/pages/demoDetail/index.vue";
const HOME = "src/pages/index/index.vue";

const REGISTERED_ABS_BG = [
  { vue: CONTACT, src: "/static/contact-bg.jpg", cls: "contact-bg" },
  { vue: DEMO_DETAIL, src: "/static/ai-recom-banner.jpg", cls: "ai-recommend-bg" },
  { vue: HOME, src: "/static/shop-container-top.jpg", cls: "shop-top" },
] as const;

function vueFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...vueFiles(p));
    else if (p.endsWith(".vue")) out.push(p);
  }
  return out;
}

describe("S2 · 不透明背景图登记表（新增绝对定位 JPEG 背景必须先登记并验层叠）", () => {
  it("登记的背景图确为 JPEG（不可能带 alpha）且被对应模板引用", () => {
    for (const b of REGISTERED_ABS_BG) {
      expect(isJpeg("src" + b.src), `${b.src} 不是 JPEG`).toBe(true);
      expect(parseVue(b.vue).template, `${b.vue} 未引用 ${b.src}`).toContain(`src="${b.src}"`);
    }
  });

  it("⭐自动发现：src 下所有「/static/*.jpg 且 position:absolute」的 <image> 必须全部在登记表内", () => {
    const found = new Set<string>();
    for (const f of vueFiles(resolve(root, "src"))) {
      const rel = relative(root, f);
      const text = readFileSync(f, "utf-8");
      if (!/\/static\/[^"']+\.jpe?g/.test(text)) continue;
      const p = parseVue(rel);
      for (const m of p.template.matchAll(/<image\b[^>]*>/g)) {
        const tag = m[0];
        if (!/\bsrc="\/static\/[^"]+\.jpe?g"/.test(tag)) continue;
        const cm = /\sclass="([^"]+)"/.exec(tag);
        for (const cls of (cm?.[1] ?? "").split(/\s+/).filter(Boolean)) {
          if ((declsOfClassAnywhere(p, cls).position ?? "").trim() === "absolute") found.add(`${rel}::${cls}`);
        }
      }
    }
    const registered = new Set(REGISTERED_ABS_BG.map((b) => `${b.vue}::${b.cls}`));
    expect([...found].sort(), "出现未登记的绝对定位 JPEG 背景：请在本守卫登记并补层叠断言").toEqual([...registered].sort());
  });
});

// ───────────────────────── ServiceContact（本次事故现场） ─────────────────────────
describe("S2 · ServiceContact：contact-bg 必须在最底层，内容全部显式置顶", () => {
  const p = parseVue(CONTACT);
  const MAIN = ".service-contain .contact-main";

  it("⭐.contact-bg：position:absolute 且 z-index 未设或 <1（不得压过内容）", () => {
    const d = declsOf(p, `${MAIN} .contact-bg`);
    expect(d.position).toBe("absolute");
    expect(zOf(d) ?? 0, ".contact-bg 的 z-index 必须 <1").toBeLessThan(1);
  });

  it("⭐.code / .label / .val：全部 position 已定位 + z-index≥1（label/val 缺失即本次事故）", () => {
    for (const cls of ["code", "label", "val"]) {
      const d = declsOf(p, `${MAIN} .${cls}`);
      expect(isLifted(d), `.${cls} 必须 position:relative|absolute 且 z-index≥1，当前 position=${d.position} z-index=${d["z-index"]}`).toBe(true);
    }
  });

  it("⭐模板穷举：.contact-main 内除 contact-bg 外的每个带 class 的子节点，都必须解析到「定位 + z≥1」的规则", () => {
    const el = viewElement(p.template, "contact-main");
    const inner = el.slice(el.indexOf(">") + 1); // 去掉根元素开标签（含 :class 修饰）
    const tokens = new Set<string>();
    let elements = 0;
    for (const m of inner.matchAll(/<(?:view|image|text)\b[^>]*?\sclass="([^"]+)"/g)) {
      elements += 1;
      const cls = m[1].split(/\s+/).filter((t) => t !== "" && t !== "font-noto-serif");
      cls.forEach((t) => tokens.add(t));
      if (cls.includes("contact-bg")) continue;
      const ok = cls.some((t) => isLifted(declsOf(p, `${MAIN} .${t}`)));
      expect(ok, `.contact-main 内 class="${m[1]}" 未显式置顶（会被 contact-bg 盖住）`).toBe(true);
    }
    expect(elements, "解析到的子节点数异常，守卫可能失效").toBeGreaterThanOrEqual(6); // bg + code + 2 label + 2 val
    for (const t of ["contact-bg", "code", "label", "val"]) expect(tokens.has(t), `未解析到 ${t}`).toBe(true);
  });

  it("⭐.tit（长按二维码扫码添加客服）：在 .contact-main 之外（与 contact-bg 几何不相交）；若被挪进去则必须 relative + z≥1", () => {
    const tpl = p.template;
    const main = viewElement(tpl, "contact-main");
    const mainStart = tpl.indexOf(main);
    const contactTitIdx = tpl.indexOf("长按二维码扫码添加客服");
    expect(contactTitIdx, "找不到客服指引标题").toBeGreaterThan(0);
    const insideMain = contactTitIdx > mainStart && contactTitIdx < mainStart + main.length;
    if (insideMain) {
      expect(isLifted(declsOf(p, ".service-contain .tit")), ".tit 进入 .contact-main 后必须 relative + z-index≥1").toBe(true);
    } else {
      expect(contactTitIdx, ".tit 应位于 .contact-main 之前（流内上方）").toBeLessThan(mainStart);
    }
  });

  it("点击/长按语义不变：.code 仍绑 @click=previewQr 且保留 show-menu-by-longpress", () => {
    expect(p.template).toMatch(/class="code"[\s\S]*?:show-menu-by-longpress="true"[\s\S]*?@click="previewQr\(qrSrc\)"/);
  });

  it("抖音变体 .contact-main--im 不带定位/z-index（新增样式不外溢到 IM 客服变体）", () => {
    const d = declsOf(p, ".service-contain .contact-main--im");
    expect(d.position).toBeUndefined();
    expect(d["z-index"]).toBeUndefined();
  });
});

// ───────────────────────── demoDetail：AI 推荐 banner ─────────────────────────
describe("S2 · demoDetail：ai-recom-banner.jpg 不得盖住标题/副标题", () => {
  const p = parseVue(DEMO_DETAIL);

  it("⭐bg 与内容同在 .ai-recommend-banner 内：内容定位且（z 更高，或 z 相等且在 DOM 之后）", () => {
    const bg = declsOf(p, ".ai-recommend-bg");
    const content = declsOf(p, ".ai-recommend-content");
    expect(bg.position).toBe("absolute");
    expect(isPositioned(content), ".ai-recommend-content 必须是定位元素（否则被 absolute 的 bg 盖住）").toBe(true);
    const zb = zOf(bg) ?? 0;
    const zc = zOf(content) ?? 0;
    const bgIdx = p.template.indexOf('class="ai-recommend-bg"');
    const contentIdx = p.template.indexOf('class="ai-recommend-content"');
    expect(bgIdx).toBeGreaterThan(0);
    expect(contentIdx).toBeGreaterThan(0);
    expect(zc > zb || (zc === zb && contentIdx > bgIdx), "内容须 z 更高，或 z 相等且 DOM 在 bg 之后").toBe(true);
  });

  it("标题/副标题是 .ai-recommend-content 的后代（随定位父层一起绘制，而非独立静态层）", () => {
    const content = viewElement(p.template, "ai-recommend-content");
    expect(content).toContain('class="ai-recommend-title');
    expect(content).toContain('class="ai-recommend-subtitle"');
  });
});

// ───────────────────────── index：shop-container-top ─────────────────────────
describe("S2 · 首页：shop-container-top.jpg 不得盖住作品区标题", () => {
  const p = parseVue(HOME);

  it("⭐.shop-top 仅在 .shop-header-wrap 内；其后的 .shop-container 是定位元素，z-index 不低于 header-wrap，且 DOM 在其后", () => {
    const wrapEl = viewElement(p.template, "shop-header-wrap");
    expect(wrapEl).toContain('class="shop-top"');
    expect(wrapEl, "header-wrap 内不应有其它内容节点").not.toContain("shop-title");
    const wrapIdx = p.template.indexOf('class="shop-header-wrap"');
    const contIdx = p.template.indexOf('class="shop-container"');
    expect(contIdx, ".shop-container 必须在 .shop-header-wrap 之后").toBeGreaterThan(wrapIdx);

    const wrap = declsOf(p, ".shop-header-wrap");
    const cont = declsOf(p, ".shop-container");
    expect(declsOf(p, ".shop-top").position).toBe("absolute");
    expect(isPositioned(cont), ".shop-container 必须是定位元素").toBe(true);
    expect(zOf(cont) ?? 0, ".shop-container 的 z 不得低于 header-wrap").toBeGreaterThanOrEqual(zOf(wrap) ?? 0);
  });

  it("⭐.shop-header（标题）在 .shop-container 内，是定位元素，DOM 在 header-wrap 之后", () => {
    const cont = viewElement(p.template, "shop-container");
    expect(cont).toContain('class="shop-header"');
    expect(isPositioned(declsOf(p, ".shop-header"))).toBe(true);
    expect(p.template.indexOf('class="shop-header"')).toBeGreaterThan(p.template.indexOf('class="shop-header-wrap"'));
  });
});

// ───────────────────────── demo1/demo2：普通流内图片 ─────────────────────────
describe("S2 · demo1/demo2.jpg：卡片内唯一子节点（无可被盖住的同级内容）", () => {
  for (const [rel, cardCls] of [
    ["src/components/PhotoGrid/PhotoGrid.vue", "shopCard"],
    [HOME, "photo-card"],
  ] as const) {
    it(`${rel}：demo1/demo2 的 <image> 各自独占一个 .${cardCls}`, () => {
      const p = parseVue(rel);
      for (const n of [1, 2]) {
        const re = new RegExp(
          `<view[^>]*class="${cardCls}"[^>]*>\\s*<image[^>]*src="/static/demo${n}\\.jpg"[^>]*/>\\s*</view>`,
        );
        expect(re.test(p.template), `${rel} 的 demo${n}.jpg 不再是卡片唯一子节点，请复核层叠`).toBe(true);
      }
    });
  }
});
