// P2-19 repositories · 收藏与搜索（旧端实测四端点，均公开或需登录标注如下）。
// ⭐ 红线（phases P2-19）：收藏列表默认一次性获取全部（GET /api/favorite/list 无分页参数），
// 不得在迁移中偷偷引入默认分页；分页仅存在于搜索模式（GET /api/search?keyword&page&size）。
// 旧端 api.uts:290-327：toggleFavorite POST /api/favorite body {albumId} → {favorited}（需登录）；
// getFavoriteStatus GET /api/favorite/status?albumIds → Array<{albumId,favorited}>（需登录）；
// getFavoriteList GET /api/favorite/list?shopId 可选 → AlbumBasic[]（需登录，一次性全部）；
// searchAlbums（api.uts:344-352）GET /api/search?keyword&page&size → SearchPageResult（公开，分页）。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "./carousels";

/** 旧端 AlbumBasic（api.uts:73-81） */
export interface FavoriteAlbum {
  id: number;
  title: string;
  coverImageUrl: string;
  shopId: number;
  price?: number;
  likeCount: number;
  tryonDisabled?: boolean;
}

/** 旧端搜索响应：可能为数组或 {list,total}（页面侧 getSearchItems/getSearchTotal 双形态收窄） */
export interface SearchPageResult {
  list?: FavoriteAlbum[];
  total?: number;
}

export interface FavoriteStatusItem {
  albumId: number;
  favorited: boolean;
}

export function createFavoriteRepository(deps: { client: ClientLike }) {
  return {
    /** 旧端 getFavoriteList：GET /api/favorite/list，shopId 可选筛选；一次性返回全部（红线：不分页） */
    getFavoriteList(
      context: RequestContext,
      options?: { shopId?: number },
    ): Promise<RepoResult<FavoriteAlbum[]>> {
      const query: Record<string, string> = {};
      if (options?.shopId != null) query.shopId = String(options.shopId);
      return deps.client.request<FavoriteAlbum[]>({
        method: "GET",
        url: "/api/favorite/list",
        query,
        authRequired: true,
        replayPolicy: "idempotent",
        context,
      });
    },
    /** 旧端 getFavoriteStatus：GET /api/favorite/status?albumIds（逗号分隔） */
    getFavoriteStatus(
      context: RequestContext,
      albumIds: string,
    ): Promise<RepoResult<FavoriteStatusItem[]>> {
      return deps.client.request<FavoriteStatusItem[]>({
        method: "GET",
        url: "/api/favorite/status",
        query: { albumIds },
        authRequired: true,
        replayPolicy: "idempotent",
        context,
      });
    },
    /** 旧端 toggleFavorite：POST /api/favorite body {albumId} → {favorited}（状态变更，禁自动重放） */
    toggleFavorite(
      context: RequestContext,
      albumId: number,
    ): Promise<RepoResult<{ favorited: boolean }>> {
      return deps.client.request<{ favorited: boolean }>({
        method: "POST",
        url: "/api/favorite",
        body: { albumId },
        authRequired: true,
        replayPolicy: "never",
        context,
      });
    },
    /** 旧端 searchAlbums：GET /api/search（公开，分页——唯一允许分页的路径） */
    searchAlbums(
      context: RequestContext,
      params: { keyword: string; page?: number; size?: number },
    ): Promise<RepoResult<SearchPageResult | FavoriteAlbum[]>> {
      return deps.client.request<SearchPageResult | FavoriteAlbum[]>({
        method: "GET",
        url: "/api/search",
        query: {
          keyword: params.keyword,
          page: String(params.page ?? 1),
          size: String(params.size ?? 10),
        },
        replayPolicy: "idempotent",
        context,
      });
    },
  };
}
