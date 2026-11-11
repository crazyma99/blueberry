// 商家端分享（issue #14 · UX P0）：登录页等商家页的「转发好友 / 朋友圈」卡片。
//
// 数据源与会话边界（与 use-merchant-footer 同口径）：
//   · `/api/page-config` 是公开接口；用**商家 runtime 的 client**、**不设 authRequired**、不带 X-Brand-Id ⇒ 取全局 `share_card` 配置；
//     绝不把商家 token 发往 C 端接口，也不碰 C 端 client。
//   · 卡片键 `merchantLogin`，三层兜底（品牌槽位 > 中台全局 > 代码默认）由共用解析器完成；**商家 client 无品牌上下文**（getBrandId 恒 ""），
//     标题里的 `{brand}` 占位符会被剔除；品牌列表仓储不会被调用。
//   · 图片：解析器内对配置的 imageUrl 一律经 `cosThumbJpg`（COS 源站→CDN 改写 + 万象 JPG 缩略参数）；
//     **非 COS 白名单域**（cosThumbJpg 会原样返回）⇒ 本文件再收口为空串，**绝不把外域大图/库里原图直传微信**（空串 ⇒ 微信用页面截图）。
//   · 解析失败/超时：静默回落默认标题 + 空图；分享对象永远可同步取得（当前已解析的卡片，未解析好则默认），不报错、不卡死。
// 分享路径固定为分包完整路径（调用方传入，如 /pkg-merchant/login/index）；朋友圈 query 与之一致。
import { ref } from "vue";
import { createShareCardResolver, DEFAULT_SHARE_CARDS, type ShareCard } from "../../application/share-card";
import { createPageConfigRepository } from "../../infrastructure/repositories/page-config";
import { isCosHost, normalizeImageUrl, qrPreviewUrl } from "../../application/image";
import { getMerchantRuntime } from "../application/merchant-runtime";
import type { RequestContext } from "../../ports/context";
import type { ClientLike } from "../../infrastructure/repositories/carousels";

/** 分享缩略宽度：好友卡片 5:4，微信对分享图体积较敏感（建议 ≤128KB）；沿用 C 端既有 500（share-card/aiTryOn/aiTryOnResult 同值），见汇报取舍 */
export const MERCHANT_SHARE_THUMB_WIDTH = 500;
/** 解析整体超时（ms）：超时按默认卡片，分享不等网络 */
export const MERCHANT_SHARE_TIMEOUT_MS = 3000;

/** 分享图收口：必须是 COS 白名单域（经 normalize 后）的 URL 才放行（解析器已拼好缩略参数）；否则空串 */
export function safeShareImage(url: string): string {
  if (url === "") return "";
  return isCosHost(normalizeImageUrl(url)) && url.includes("imageMogr2/thumbnail/") ? url : "";
}

/**
 * 解析器内部会对配置的 imageUrl 调 `cosThumbJpg`（直接在 URL 后追加 `imageMogr2/thumbnail/Nx/format/jpg`）。
 * 若 OPS 配的 URL 已带缩略参数（如 `…jpg?imageMogr2/thumbnail/300x`），会叠出两段 imageMogr2（非法/不可预期）。
 * 这里在交给解析器之前，先**剔除既有 imageMogr2 参数并改写源站→CDN**（复用 image.ts 的 qrPreviewUrl，其它 query 原样保留），
 * 使 cosThumbJpg 面对的永远是「干净的原图 URL」。
 */
export function sanitizeShareImageSource(url: string): string {
  return url === "" ? "" : qrPreviewUrl(url);
}

export interface MerchantShareDeps {
  client: ClientLike;
  nextContext: () => RequestContext;
  /** 分享落地路径（分包完整路径） */
  path: string;
  timeoutMs?: number;
}

export function createMerchantShare(deps: MerchantShareDeps) {
  const resolver = createShareCardResolver({
    pageConfig: {
      getPageConfig: async (ctx) => {
        const res = await createPageConfigRepository({ client: deps.client }).getPageConfig(ctx);
        if (!res.ok || !Array.isArray(res.value)) return res;
        // 只洗 share_card 条目里的 imageUrl（不改其它组件、不改入参）
        return {
          ok: true,
          value: res.value.map((c) =>
            c != null && c.type === "share_card" && Array.isArray(c.items)
              ? { ...c, items: (c.items as Array<Record<string, unknown>>).map((it) => (it != null && typeof it.imageUrl === "string" ? { ...it, imageUrl: sanitizeShareImageSource(it.imageUrl) } : it)) }
              : c,
          ),
        };
      },
    },
    // 商家端无品牌上下文：不取品牌名（`{brand}` 占位符由解析器剔除）
    brands: { getBrands: async () => ({ ok: false }) },
    getBrandId: () => "",
  });
  let card: ShareCard = { ...DEFAULT_SHARE_CARDS.merchantLogin };
  let started = false;

  /** 异步解析一次（永不抛、永不挂起）；成功后更新当前卡片 */
  async function load(): Promise<ShareCard> {
    if (started) return card;
    started = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const timeout = new Promise<null>((r) => {
        timer = setTimeout(() => r(null), deps.timeoutMs ?? MERCHANT_SHARE_TIMEOUT_MS);
      });
      const got = await Promise.race([resolver.resolve("merchantLogin", deps.nextContext()), timeout]);
      if (got != null) card = { title: got.title !== "" ? got.title : DEFAULT_SHARE_CARDS.merchantLogin.title, imageUrl: safeShareImage(got.imageUrl) };
    } catch {
      /* 静默：保持默认卡片 */
    } finally {
      // 解析先于超时完成时清掉超时定时器（否则它会在页面生命周期里白白挂 3s）
      if (timer !== null) clearTimeout(timer);
    }
    return card;
  }
  return {
    load,
    current: (): ShareCard => card,
    appMessage: () => ({ title: card.title, path: deps.path, imageUrl: card.imageUrl }),
    timeline: () => ({ title: card.title, query: "", imageUrl: card.imageUrl }),
  };
}

/** 页面用：创建并立刻后台解析；返回 appMessage()/timeline()（同步取当前卡片） */
export function useMerchantShare(path: string) {
  const rt = getMerchantRuntime();
  const share = createMerchantShare({ client: rt.client, nextContext: () => rt.nextContext(), path });
  const title = ref(share.current().title);
  void share.load().then((c) => {
    title.value = c.title;
  });
  return { appMessage: share.appMessage, timeline: share.timeline, title };
}
