// T6（P2-11）：首页 VM——轮播与店铺并行加载、单侧失败不拖垮另一侧（旧端 .catch(()=>null) 语义）；
// 双侧皆失败才置 error；品牌馆开关经 controller（在飞去重由 controller 保证）。
import { ref } from "vue";
import type { RequestContext } from "../ports/context";
import type { CarouselItem, RepoResult } from "../infrastructure/repositories/carousels";
import type { ShopBrief } from "../infrastructure/repositories/shops";
import { cosThumb } from "../application/image";

export interface HomeDeps {
  carousels: { getImage: (ctx: RequestContext) => Promise<RepoResult<CarouselItem[]>> };
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
    const [cr, sr] = await Promise.all([
      deps.carousels.getImage(context).then(
        (r) => (r.ok ? r.value : null),
        () => null,
      ),
      deps.shops.getShops(context).then(
        (r) => (r.ok ? r.value : null),
        () => null,
      ),
    ]);
    if (cr != null) carousels.value = cr;
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
