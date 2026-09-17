// T6（P2-11）：首页 VM——轮播与店铺并行加载、单侧失败不拖垮另一侧（旧端 .catch(()=>null) 语义）；
// 双侧皆失败才置 error；品牌馆开关经 controller（在飞去重由 controller 保证）。
import { ref } from "vue";
import type { RequestContext } from "../ports/context";
import type { CarouselItem, RepoResult } from "../infrastructure/repositories/carousels";
import type { ShopBrief } from "../infrastructure/repositories/shops";

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
    if (sr != null) shops.value = sr;
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
