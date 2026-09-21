// T6（P2-11）：首页 VM——轮播与店铺并行加载、单侧失败不拖垮另一侧（旧端 .catch(()=>null) 语义）；
// 双侧皆失败才置 error；品牌馆开关经 controller（在飞去重由 controller 保证）。
import { ref } from "vue";
import type { RequestContext } from "../ports/context";
import type { CarouselItem, RepoResult } from "../infrastructure/repositories/carousels";
import type { ShopBrief } from "../infrastructure/repositories/shops";
import { cosThumb } from "../application/image";

export interface HomeDeps {
  // options 与仓储真实签名对齐（旧端 getImage(method, params)；新端 params 走 query）——
  // 2026-09-21 下拉刷新防缓存需要透传 `t`，故 VM 依赖接口同步放开可选入参。
  carousels: {
    getImage: (
      ctx: RequestContext,
      options?: { method?: "GET" | "POST"; params?: Record<string, string> },
    ) => Promise<RepoResult<CarouselItem[]>>;
  };
  shops: { getShops: (ctx: RequestContext) => Promise<RepoResult<ShopBrief[]>> };
  brandHub: { refresh: (ctx: RequestContext) => Promise<void>; readonly enabled: boolean };
}

export function createHomeViewModel(deps: HomeDeps) {
  const loading = ref(false);
  const carousels = ref<CarouselItem[]>([]);
  const shops = ref<ShopBrief[]>([]);
  const error = ref<string | null>(null);

  async function load(context: RequestContext): Promise<void> {
    loading.value = true;
    error.value = null;
    // 旧端 index:356-357：两请求并行、各自容错
    // 2026-09-21（主人「首页下拉刷新功能丢失了」）：旧端 index.uvue:356 每次 load 都传 `t: Date.now()` 作
    // banner 防缓存——KB 03 分册「同批小程序改造：首页/客片页下拉刷新（banner 防缓存）」，下拉刷新必重新拉取轮播配置；
    // 新端同口径（合同 getImage 允许 `params?`，query 由 client 组装）。
    const [cr, sr] = await Promise.all([
      deps.carousels.getImage(context, { params: { t: String(Date.now()) } }).then(
        (r) => (r.ok ? r.value : null),
        () => null,
      ),
      deps.shops.getShops(context).then(
        (r) => (r.ok ? r.value : null),
        () => null,
      ),
    ]);
    if (cr != null) carousels.value = cr.map((c) => ({ ...c, imageUrl: cosThumb(c.imageUrl as string | null | undefined, 750) })); // ⭐CR P1：hero 图 750 缩略（旧端 index.uvue:365）
    // ⭐2026-09-20 修复：首页「客片欣赏」卡片直接用原图（几百 KB～1MB/张）⇒ 首屏慢。
    // 旧端 index.uvue:374 为 `item.homeImage = cosThumb(item.homeImage, 600)`，此处逐字对齐（COS 缩略 + webp）。
    // cosThumb 对空值/非 COS 域原样返回，安全。
    if (sr != null) shops.value = sr.map((s) => ({ ...s, homeImage: cosThumb(s.homeImage as string | null | undefined, 600) }));
    if (cr == null && sr == null) error.value = "加载失败";
    loading.value = false;
  }

  async function refreshBrandHub(context: RequestContext): Promise<void> {
    await deps.brandHub.refresh(context);
  }

  return {
    loading,
    carousels,
    shops,
    error,
    brandHubEnabled: () => deps.brandHub.enabled,
    load,
    refreshBrandHub,
  };
}
