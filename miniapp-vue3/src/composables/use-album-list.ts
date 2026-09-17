// T6（P2-11）：相册列表 VM——分页/noMore（旧端 demoDetail:497：页码达 ceil(total/size) 或本页不满）、
// 搜索 keyword 透传、loadFirst 重置、noMore 后不再请求。
import { ref } from "vue";
import type { RequestContext } from "../ports/context";
import type { AlbumBrief, AlbumListPage, CategoryBrief } from "../infrastructure/repositories/albums";
import type { RepoResult } from "../infrastructure/repositories/carousels";

export interface AlbumListDeps {
  albums: {
    getAlbumList: (ctx: RequestContext, params: Record<string, string>) => Promise<RepoResult<AlbumListPage>>;
    getCategories?: (ctx: RequestContext, shopId: string | number) => Promise<RepoResult<CategoryBrief[]>>;
  };
}

export interface ListParams {
  shopId: string;
  categoryQuery?: Record<string, string>;
  keyword?: string;
}

export function createAlbumListViewModel(deps: AlbumListDeps, options?: { pageSize?: number }) {
  const pageSize = options?.pageSize ?? 10; // 旧端 albumSize/searchSize 默认 10（demoDetail:256/265）
  const items = ref<AlbumBrief[]>([]);
  const page = ref(0);
  const total = ref(0);
  const noMore = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);

  function buildQuery(p: ListParams, pageNo: number): Record<string, string> {
    const q: Record<string, string> = { shopId: p.shopId, page: String(pageNo), size: String(pageSize) };
    if (p.categoryQuery) for (const [k, v] of Object.entries(p.categoryQuery)) q[k] = v;
    if (p.keyword != null && p.keyword.length > 0) q.keyword = p.keyword;
    return q;
  }

  async function fetchPage(ctx: RequestContext, params: ListParams, pageNo: number, replace: boolean): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const r = await deps.albums.getAlbumList(ctx, buildQuery(params, pageNo));
      if (!r.ok) {
        error.value = r.error.message || "加载失败";
        return;
      }
      const batch = r.value.albums ?? [];
      total.value = r.value.total ?? 0;
      page.value = pageNo;
      items.value = replace ? batch : items.value.concat(batch);
      // 旧端 demoDetail:497 双条件：页码达上限 或 本页不满页大小
      const totalPages = total.value > 0 ? Math.ceil(total.value / pageSize) : Number.MAX_SAFE_INTEGER;
      noMore.value = pageNo >= totalPages || batch.length < pageSize;
    } catch {
      error.value = "加载失败";
    } finally {
      loading.value = false;
    }
  }

  function loadFirst(ctx: RequestContext, params: ListParams): Promise<void> {
    items.value = [];
    page.value = 0;
    total.value = 0;
    noMore.value = false;
    return fetchPage(ctx, params, 1, true);
  }

  function loadMore(ctx: RequestContext, params: ListParams): Promise<void> {
    if (loading.value || noMore.value) return Promise.resolve();
    return fetchPage(ctx, params, page.value + 1, false);
  }

  return { items, page, total, noMore, loading, error, pageSize, loadFirst, loadMore };
}
