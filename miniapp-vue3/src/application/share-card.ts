// 分享卡片三层解析（旧端 `utils/share.uts:1-90` 忠实移植，2026-09-21 主人：「首页/客片详情分享卡片迁移遗漏了」）。
// 三层兜底：品牌 `share_card` 槽位 > 中台全局同键 > 代码默认；字段级兜底＝title/imageUrl 任一为空取默认值。
// 数据源＝`GET /api/page-config`（公开读）的 `share_card` 组件：按 `type === 'share_card'` 定位组件，
// 再按 `items[].bizName` 命中页面槽位（后端已做「品牌缺槽位回退全局同键」合并，本文件只兜整体级与字段级默认）。
// 标题支持 `{brand}` 占位符 ⇒ 用当前品牌名替换（品牌名 60s 缓存；无品牌上下文／解析失败则**剔除占位符**，标题仍可用）。
// 与旧端的已知差异（据实登记，见 deviations #28）：
//   · 旧端 `getPageConfig(false)` 走旧端自身 60s 内存缓存；新端仓储无缓存（单一事实源＝brand-hub-controller 口径，
//     deviations #4）⇒ 每次调用一次 GET（下游调用点只在下拉刷新/品牌切换/首屏，频次低）。
//   · 旧端成功判定 `code === 200`；新端按全站口径 `res.ok`（client 已兼容 0/200，同 aiTryOnResult 偏差 ⑥）。
import type { RequestContext } from "../ports/context";
import type { BrandBrief } from "../infrastructure/repositories/brands";
import type { PageConfigItem } from "../infrastructure/repositories/page-config";

export interface ShareCard {
  title: string;
  imageUrl: string;
}

/** 分享卡片键（旧端三处调用点：首页 / 客片列表页 / 客片详情页） */
export type ShareCardKey = "index" | "demoDetail" | "targetPhotoDetail";

/** 代码默认卡片（旧端 `share.uts:13-21` 逐字；与 OPS 懒预置槽位一致；图片已随本轮拷入 `src/static/`） */
export const DEFAULT_SHARE_CARDS: Record<ShareCardKey, ShareCard> = {
  index: { title: "一键解锁AI推荐｜AI试衣｜客片展示", imageUrl: "/static/share-home.jpg" },
  demoDetail: { title: "点击查看品牌客片展示", imageUrl: "/static/share-album.jpg" },
  targetPhotoDetail: { title: "点击查看客片详情信息，也支持一键AI试衣哦～", imageUrl: "/static/share-aitryon.jpg" },
};

type PageConfigLike = {
  getPageConfig: (context: RequestContext) => Promise<{ ok: boolean; value?: PageConfigItem[] }>;
};
type BrandsLike = {
  getBrands: (context: RequestContext) => Promise<{ ok: boolean; value?: BrandBrief[] }>;
};

export interface ShareCardResolverDeps {
  pageConfig: PageConfigLike;
  brands: BrandsLike;
  /** 当前品牌上下文（空串＝无品牌，走中台全局槽位） */
  getBrandId: () => string;
}

export function createShareCardResolver(deps: ShareCardResolverDeps) {
  // 品牌名缓存（`{brand}` 替换用），60 秒（旧端 `share.uts:24-26` 同口径）
  let brandNameCache = "";
  let brandNameKey = "";
  let brandNameAt = 0;

  async function resolveBrandName(context: RequestContext): Promise<string> {
    const brandId = deps.getBrandId();
    if (brandId === "") return "";
    const now = Date.now();
    if (brandNameKey === brandId && brandNameCache !== "" && now - brandNameAt < 60 * 1000) return brandNameCache;
    try {
      const res = await deps.brands.getBrands(context);
      if (res.ok && Array.isArray(res.value)) {
        for (const b of res.value) {
          if (b != null && b.brandId === brandId) {
            brandNameCache = b.brandName;
            brandNameKey = brandId;
            brandNameAt = now;
            return brandNameCache;
          }
        }
      }
    } catch {
      // 品牌名解析失败静默：占位符剔除，标题仍可用（旧端同）
    }
    return "";
  }

  /**
   * 解析某页面的分享卡片（title + imageUrl）。
   * 优先级：品牌 `share_card` 槽位 > 中台全局同键 > 代码默认；字段级兜底；`{brand}` 占位符自动替换。
   */
  async function resolve(key: ShareCardKey, context: RequestContext): Promise<ShareCard> {
    const card: ShareCard = { ...DEFAULT_SHARE_CARDS[key] };
    try {
      const res = await deps.pageConfig.getPageConfig(context);
      if (res.ok && Array.isArray(res.value)) {
        for (const comp of res.value) {
          if (comp == null || comp.type !== "share_card") continue;
          const items = comp.items;
          if (Array.isArray(items)) {
            for (const it of items as Array<{ bizName?: string; title?: string; imageUrl?: string }>) {
              if (it == null || it.bizName !== key) continue;
              if (it.title != null && it.title !== "") card.title = it.title;
              if (it.imageUrl != null && it.imageUrl !== "") card.imageUrl = it.imageUrl;
              break;
            }
          }
          break; // 旧端：只看第一个 share_card 组件
        }
      }
    } catch {
      // 配置拉取失败静默兜底默认卡片（旧端同）
    }
    if (card.title.indexOf("{brand}") >= 0) {
      const brandName = await resolveBrandName(context);
      card.title = card.title.split("{brand}").join(brandName);
    }
    return card;
  }

  return { resolve };
}
