// 商家端分享卡片（issue #14 · UX P0）：图片链路边界 + 失败静默 + C 端三键不回归。
// 背景（Ume 核实）：库里存「原图 URL」（后台压缩 best-effort，失败降级原图，可能数 MB）；服务端四档 JPEG 开关 serve_image_tiers 在 staging/prod 未启用，
// ⇒ 分享缩略**完全靠小程序端 cosThumbJpg 拼万象参数**。硬要求：任何情况下都不得把库里原图 URL 直接交给微信。
// 变异靶点：①去掉 cosThumbJpg（解析器直传原图）②非白名单域不收口为空串 ③已带 imageMogr2 的 URL 叠加第二段参数 ④解析失败时抛错/卡死
//          ⑤默认标题被改 ⑥商家 client 带了 authRequired/Authorization ⑦C 端三键默认值/兜底顺序被改。
import { describe, expect, it, vi } from "vitest";
import { createShareCardResolver, DEFAULT_SHARE_CARDS } from "../../src/application/share-card";
import { cosThumbJpg } from "../../src/application/image-share";
import { createMerchantShare, MERCHANT_SHARE_THUMB_WIDTH, safeShareImage, sanitizeShareImageSource } from "../../src/pkg-merchant/composables/use-merchant-share";
import type { RequestContext } from "../../src/ports/context";
import type { ClientLike } from "../../src/infrastructure/repositories/carousels";

const ctx = { requestId: "r", brandId: null } as unknown as RequestContext;
const COS = "https://lanmei-1250000000.cos.ap-guangzhou.myqcloud.com/a/b.jpg";
const CDN = "https://www.lanmei66.cloud/a/b.jpg";
const THUMB = (w: number) => `imageMogr2/thumbnail/${w}x/format/jpg`;

function clientWith(items: unknown[], opts?: { fail?: "throw" | "business" | "hang"; seen?: Array<Record<string, unknown>> }): ClientLike {
  return {
    request: async <T,>(input: Record<string, unknown>) => {
      opts?.seen?.push(input);
      if (opts?.fail === "throw") throw new Error("boom");
      if (opts?.fail === "hang") return await new Promise<never>(() => undefined);
      if (opts?.fail === "business") return { ok: false, error: { kind: "BUSINESS", message: "x", businessCode: 500, requestId: null, retryable: false } } as never;
      return { ok: true, value: [{ type: "share_card", items }] as unknown as T };
    },
  } as unknown as ClientLike;
}
const mk = (items: unknown[], opts?: Parameters<typeof clientWith>[1], timeoutMs?: number) =>
  createMerchantShare({ client: clientWith(items, opts), nextContext: () => ctx, path: "/pkg-merchant/login/index", timeoutMs });

describe("⭐分享图 URL 生成：前后对比（脱敏域名）", () => {
  it("COS 源站原图 ⇒ 改写 CDN + 万象 JPG 缩略（变异：去掉 cosThumbJpg 即红）", async () => {
    const s = mk([{ bizName: "merchantLogin", title: "T", imageUrl: COS }]);
    await s.load();
    expect(s.appMessage().imageUrl).toBe(`${CDN}?${THUMB(MERCHANT_SHARE_THUMB_WIDTH)}`);
    expect(s.appMessage().imageUrl).not.toBe(COS);
    expect(s.appMessage().imageUrl).toContain("imageMogr2/thumbnail/500x/format/jpg");
  });
  it("CDN 域原图 ⇒ 追加缩略参数", async () => {
    const s = mk([{ bizName: "merchantLogin", title: "T", imageUrl: CDN }]);
    await s.load();
    expect(s.appMessage().imageUrl).toBe(`${CDN}?${THUMB(500)}`);
  });
  it("已带 query（?v=3）⇒ 用 & 拼接，不产生第二个 ?", async () => {
    const s = mk([{ bizName: "merchantLogin", title: "T", imageUrl: CDN + "?v=3" }]);
    await s.load();
    const u = s.appMessage().imageUrl;
    expect(u).toBe(`${CDN}?v=3&${THUMB(500)}`);
    expect(u.split("?").length).toBe(2);
  });
  it("⭐已带缩略参数（imageMogr2）⇒ 先剔除再重拼，只留一段（变异：不洗即出现两段 imageMogr2）", async () => {
    for (const given of [`${CDN}?imageMogr2/thumbnail/300x`, `${CDN}?imageMogr2/format/webp/thumbnail/300x`, `${COS}?imageMogr2/thumbnail/1200x/format/jpg`]) {
      const s = mk([{ bizName: "merchantLogin", title: "T", imageUrl: given }]);
      await s.load();
      const u = s.appMessage().imageUrl;
      expect(u, given).toBe(`${CDN}?${THUMB(500)}`);
      expect(u.match(/imageMogr2/g)?.length, given).toBe(1);
    }
  });
  it("已带 query 且带缩略参数：保留业务 query、替换缩略参数", async () => {
    const s = mk([{ bizName: "merchantLogin", title: "T", imageUrl: `${CDN}?v=3&imageMogr2/thumbnail/300x` }]);
    await s.load();
    expect(s.appMessage().imageUrl).toBe(`${CDN}?v=3&${THUMB(500)}`);
  });
  it("⭐非 COS 白名单域（外域大图）⇒ 一律空串，让微信用页面截图（变异：不收口即红）", async () => {
    for (const ext of ["https://example.com/big.jpg", "https://cdn.other.com/a.png?x=1", "http://127.0.0.1/a.jpg", "https://lanmei66.cloud.evil.com/a.jpg"]) {
      const s = mk([{ bizName: "merchantLogin", title: "T", imageUrl: ext }]);
      await s.load();
      expect(s.appMessage().imageUrl, ext).toBe("");
      expect(s.timeline().imageUrl, ext).toBe("");
    }
  });
  it("配置为空/缺字段 ⇒ imageUrl === ''；标题仍取配置或默认", async () => {
    const a = mk([{ bizName: "merchantLogin", title: "只有标题" }]);
    await a.load();
    expect(a.appMessage()).toMatchObject({ title: "只有标题", imageUrl: "" });
    const b = mk([{ bizName: "merchantLogin", title: "", imageUrl: "" }]);
    await b.load();
    expect(b.appMessage()).toMatchObject({ title: "蓝梅旅拍 · 商家工作台", imageUrl: "" });
    const c = mk([]);
    await c.load();
    expect(c.appMessage()).toMatchObject({ title: "蓝梅旅拍 · 商家工作台", imageUrl: "" });
  });
  it("无商家槽位但有别的卡片（如 index）⇒ 不串用，走默认", async () => {
    const s = mk([{ bizName: "index", title: "首页卡片", imageUrl: CDN }]);
    await s.load();
    expect(s.appMessage()).toMatchObject({ title: "蓝梅旅拍 · 商家工作台", imageUrl: "" });
  });
  it("纯函数：sanitizeShareImageSource / safeShareImage 边界", () => {
    expect(sanitizeShareImageSource("")).toBe("");
    expect(sanitizeShareImageSource(`${COS}?imageMogr2/thumbnail/300x`)).toBe(CDN);
    expect(sanitizeShareImageSource(`${CDN}?a=1&imageMogr2/x&b=2`)).toBe(`${CDN}?a=1&b=2`);
    expect(safeShareImage("")).toBe("");
    expect(safeShareImage(CDN)).toBe(""); // 没有缩略参数的原图一律不放行
    expect(safeShareImage(`${CDN}?${THUMB(500)}`)).toBe(`${CDN}?${THUMB(500)}`);
    expect(safeShareImage(`https://example.com/a.jpg?${THUMB(500)}`)).toBe("");
  });
  it("所选缩略宽度：500（沿用 C 端 share-card/aiTryOn/aiTryOnResult 既有取值；微信分享图建议 ≤128KB）", () => {
    expect(MERCHANT_SHARE_THUMB_WIDTH).toBe(500);
    expect(cosThumbJpg(CDN, MERCHANT_SHARE_THUMB_WIDTH)).toBe(`${CDN}?${THUMB(500)}`);
  });
});

describe("⭐解析失败/超时：静默回落默认标题与空图，分享对象永远可同步取得", () => {
  it("请求抛异常 / 业务失败 / 超时 ⇒ 默认卡片，load 不抛（变异：向外抛即红）", async () => {
    for (const fail of ["throw", "business"] as const) {
      const s = mk([], { fail });
      await expect(s.load()).resolves.toMatchObject({ title: "蓝梅旅拍 · 商家工作台", imageUrl: "" });
      expect(s.appMessage()).toEqual({ title: "蓝梅旅拍 · 商家工作台", path: "/pkg-merchant/login/index", imageUrl: "" });
    }
    const hang = mk([], { fail: "hang" }, 30);
    const t0 = Date.now();
    await expect(hang.load()).resolves.toMatchObject({ title: "蓝梅旅拍 · 商家工作台", imageUrl: "" });
    expect(Date.now() - t0).toBeLessThan(1000); // 超时即回落，不卡死
  });
  it("外层兜底：取请求上下文本身抛错（runtime 异常）也不向外抛，回落默认卡片（变异：外层 catch 改为重抛即红）", async () => {
    const s = createMerchantShare({ client: clientWith([]), nextContext: () => { throw new Error("ctx boom"); }, path: "/pkg-merchant/login/index" });
    await expect(s.load()).resolves.toMatchObject({ title: "蓝梅旅拍 · 商家工作台", imageUrl: "" });
    expect(s.appMessage().imageUrl).toBe("");
  });
  it("未解析好时（load 未完成）同步取分享对象 ⇒ 默认卡片，不为空白", () => {
    const s = mk([{ bizName: "merchantLogin", title: "T", imageUrl: CDN }]);
    expect(s.appMessage()).toEqual({ title: "蓝梅旅拍 · 商家工作台", path: "/pkg-merchant/login/index", imageUrl: "" });
    expect(s.timeline()).toEqual({ title: "蓝梅旅拍 · 商家工作台", query: "", imageUrl: "" });
  });
  it("分享路径固定为分包完整路径；朋友圈 query 为空（与路径一致，落到本页）", async () => {
    const s = mk([{ bizName: "merchantLogin", title: "T", imageUrl: "" }]);
    await s.load();
    expect(s.appMessage().path).toBe("/pkg-merchant/login/index");
    expect(s.timeline().query).toBe("");
  });
});

describe("超时定时器清理（CR 🟡7）", () => {
  it("解析先完成 ⇒ 不遗留待触发的超时定时器（变异：不 clearTimeout 即红）", async () => {
    vi.useFakeTimers();
    try {
      const s = mk([{ bizName: "merchantLogin", title: "T", imageUrl: "" }]);
      const p = s.load();
      await vi.advanceTimersByTimeAsync(0);
      await p;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("⭐会话边界：公开接口、不带商家 token、不带品牌头", () => {
  it("请求 /api/page-config：无 authRequired；未使用品牌仓储（brands 不被调用）（变异：加 authRequired 即红）", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const s = mk([{ bizName: "merchantLogin", title: "{brand} 商家", imageUrl: "" }], { seen });
    const card = await s.load();
    expect(seen.length).toBe(1);
    expect(seen[0].url).toBe("/api/page-config");
    expect(seen[0].method).toBe("GET");
    expect(seen[0].authRequired).toBeUndefined();
    expect((seen[0].context as { brandId: unknown }).brandId).toBeNull();
    expect(card.title).toBe(" 商家"); // 无品牌上下文：{brand} 占位符被剔除，标题仍可用
  });
  it("页面源码：登录页用 useMerchantShare（商家 runtime client），不引入 C 端 client/品牌存储", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const comp = readFileSync(resolve(__dirname, "../../src/pkg-merchant/composables/use-merchant-share.ts"), "utf-8");
    expect(comp).toContain("getMerchantRuntime");
    expect(comp).not.toMatch(/createUniTransport|versioned|loadBrandId|createAuthCoordinator/);
  });
});

describe("⭐C 端既有三键不回归（共用文件只增量：新增 merchantLogin）", () => {
  it("三键默认标题逐字不变；新增键默认标题为「蓝梅旅拍 · 商家工作台」且图为空", () => {
    expect(DEFAULT_SHARE_CARDS.index).toEqual({ title: "一键解锁AI推荐｜AI试衣｜客片展示", imageUrl: "" });
    expect(DEFAULT_SHARE_CARDS.demoDetail).toEqual({ title: "点击查看品牌客片展示", imageUrl: "" });
    expect(DEFAULT_SHARE_CARDS.targetPhotoDetail).toEqual({ title: "点击查看客片详情信息，也支持一键AI试衣哦～", imageUrl: "" });
    expect(DEFAULT_SHARE_CARDS.merchantLogin).toEqual({ title: "蓝梅旅拍 · 商家工作台", imageUrl: "" });
    expect(Object.keys(DEFAULT_SHARE_CARDS).sort()).toEqual(["demoDetail", "index", "merchantLogin", "targetPhotoDetail"]);
  });
  it("三键解析行为不变：槽位命中 ⇒ 标题 + 500 JPG 缩略；未命中/失败 ⇒ 默认；merchantLogin 槽位不影响三键", async () => {
    const r = createShareCardResolver({
      pageConfig: {
        getPageConfig: async () => ({
          ok: true,
          value: [{ type: "share_card", items: [{ bizName: "index", title: "I", imageUrl: CDN }, { bizName: "merchantLogin", title: "M", imageUrl: CDN }] }],
        }),
      },
      brands: { getBrands: async () => ({ ok: false }) },
      getBrandId: () => "",
    });
    expect(await r.resolve("index", ctx)).toEqual({ title: "I", imageUrl: `${CDN}?${THUMB(500)}` });
    expect(await r.resolve("demoDetail", ctx)).toEqual(DEFAULT_SHARE_CARDS.demoDetail);
    expect(await r.resolve("targetPhotoDetail", ctx)).toEqual(DEFAULT_SHARE_CARDS.targetPhotoDetail);
    expect(await r.resolve("merchantLogin", ctx)).toEqual({ title: "M", imageUrl: `${CDN}?${THUMB(500)}` });
  });
  it("品牌槽位优先于全局的既有顺序不变（后端合并后只看第一个 share_card 组件）", async () => {
    const r = createShareCardResolver({
      pageConfig: { getPageConfig: async () => ({ ok: true, value: [{ type: "share_card", items: [{ bizName: "index", title: "第一个" }] }, { type: "share_card", items: [{ bizName: "index", title: "第二个" }] }] }) },
      brands: { getBrands: async () => ({ ok: false }) },
      getBrandId: () => "",
    });
    expect((await r.resolve("index", ctx)).title).toBe("第一个");
  });
});
