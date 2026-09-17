// P2-09 provider 验证（受控测试环境，只读 GET；写/付费调用不在本范围）。
// 纪律：fixture 与 provider 不一致要修合同，不假造 mock 通过。
import { describe, expect, it } from "vitest";
import { createHttpClient } from "../../src/infrastructure/http/client";
import type { HttpPort, HttpResponse } from "../../src/ports/http";
import type { RequestContext, Result } from "../../src/ports/context";
import {
  createShopRepository, createCarouselRepository, createAlbumRepository, createLikeRepository,
} from "../../src/infrastructure/repositories";

const BASE = "https://crazyma99.xyz";
const ctx: RequestContext = {
  platform: "mp-weixin", environment: "trial", brandId: null, requestId: "p209",
  profileKey: "blueberry", appCode: "blueBerry", scopeRevision: 1, authRevision: 1,
};
const noAuth = { waitForLogin: async () => ({ ok: false as const, reason: "not-needed" }) };

// 真实传输适配：node fetch → 业务信封解码（code/data/message），与 client 合同对齐
const transport: HttpPort = {
  request: async <T,>(req: { url: string; method: string; query?: Record<string, string>; headers?: Record<string, string> }) => {
    const url = new URL(req.url, BASE);
    if (req.query) for (const [k, v] of Object.entries(req.query)) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), { method: req.method, headers: req.headers });
    const text = await res.text();
    let body: { code?: unknown; message?: string; data?: unknown } | null = null;
    try { body = JSON.parse(text) as typeof body; } catch { body = null; }
    return {
      ok: true,
      value: {
        status: res.status,
        businessCode: typeof body?.code === "number" ? body.code : null,
        requestId: null,
        data: (body?.data ?? body) as T,
      },
    } as unknown as Result<HttpResponse<T>>;
  },
  cancel: () => {},
};

const client = createHttpClient({ transport, authCoordinator: noAuth });
const shops = createShopRepository({ client });
const carousels = createCarouselRepository({ client });
const albums = createAlbumRepository({ client });
const likes = createLikeRepository({ client });

function shape(v: unknown): string {
  if (Array.isArray(v)) return "array[" + v.length + "] first=" + (v[0] ? Object.keys(v[0]).sort().join(",") : "empty");
  if (v && typeof v === "object") return "object keys=" + Object.keys(v).sort().join(",");
  return typeof v;
}

describe.runIf(process.env.RUN_PROVIDER === "1")("P2-09 只读 provider 报文核对（测试域）", () => {
  it("getShops：真实信封与 DTO 宽型一致", async () => {
    const r = await shops.getShops(ctx);
    expect(r.ok).toBe(true);
    if (r.ok) { console.log("[p2-09] /api/shops →", shape(r.value)); expect(Array.isArray(r.value)).toBe(true); }
  }, 30000);
  it("getImage：轮播信封", async () => {
    const r = await carousels.getImage(ctx);
    expect(r.ok).toBe(true);
    if (r.ok) console.log("[p2-09] /wechat/carousels →", shape(r.value));
  }, 30000);
  it("getCategories/getAlbumList/getAlbumDetail/getLikeStatus：切片链路真实报文", async () => {
    const rs = await shops.getShops(ctx);
    expect(rs.ok).toBe(true);
    if (!rs.ok) return;
    const shopId = String((rs.value[0] as Record<string, unknown>).id ?? (rs.value[0] as Record<string, unknown>).shopId ?? "");
    console.log("[p2-09] shop0 keys=", Object.keys(rs.value[0] as object).sort().join(","), "shopId=", shopId);
    const rc = await albums.getCategories(ctx, shopId);
    if (rc.ok) console.log("[p2-09] /wechat/categories →", shape(rc.value));
    const rl = await albums.getAlbumList(ctx, { shopId });
    expect(rl.ok).toBe(true);
    if (rl.ok) {
      console.log("[p2-09] /wechat/albums →", shape(rl.value));
      const list = (rl.value as Record<string, unknown>).albums ?? [];
      const first = Array.isArray(list) ? (list[0] as Record<string, unknown>) : null;
      if (first) {
        console.log("[p2-09] album0 keys=", Object.keys(first).sort().join(","));
        const idx = first.id;
        const albumType = String((first as Record<string, unknown>).type ?? "");
        const rd = await albums.getAlbumDetail(ctx, { params: { albumId: String(idx), type: albumType } });
        if (rd.ok) console.log("[p2-09] /wechat/album/detail →", shape(rd.value));
        const rlike = await likes.getLikeStatus(ctx, String(idx));
        if (rlike.ok) console.log("[p2-09] /api/like/status →", shape(rlike.value));
      }
    }
  }, 60000);
});
