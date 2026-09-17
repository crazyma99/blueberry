// P2-01 repositories · 分类/相册。
// ⭐ P2-09 真实 provider 报文核对（2026-09-17 测试域 https://crazyma99.xyz 实测）：
//  - /wechat/categories → 数组，键 id,parentName,sortOrder,subCategory（subCategory 内层未取样）
//  - /wechat/albums → {albums,page,size,total}；album 项键 coverImageUrl,id,likeCount,packageDesc,price,title
//  - /wechat/album/detail 入参＝albumId+type（旧端 targetPhotoDetail:221 实测，非 idx）；响应键 albumId,coverImageUrl,images,likeCount,packageDesc,price,title
// 未取样类型（price 数值形态、images 元素、subCategory 内层）保持 unknown，待 T6 页面迁移时取样登记。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "./carousels";

export interface CategoryBrief {
  id: number;
  parentName: string;
  sortOrder: number;
  subCategory: unknown;
}

export interface AlbumBrief {
  id: number;
  title: string;
  coverImageUrl: string;
  likeCount: number;
  packageDesc: string;
  price: unknown;
  /** 旧端 aiTryOn:346 随机相册过滤用（`tryonDisabled !== true` 才入池）。P2-09 取样未见到该键，
   * 但旧端按此语义过滤 ⇒ 保守保留为可选字段，避免把「不可试衣相册」选进随机池。 */
  tryonDisabled?: boolean;
}

export interface AlbumListPage {
  albums: AlbumBrief[];
  page: number;
  size: number;
  total: number;
}

export interface AlbumDetail extends AlbumBrief {
  albumId: number;
  images: unknown;
}

export function createAlbumRepository(deps: { client: ClientLike }) {
  return {
    getCategories(context: RequestContext, shopId: string | number): Promise<RepoResult<CategoryBrief[]>> {
      return deps.client.request<CategoryBrief[]>({
        method: "GET",
        url: "/wechat/categories",
        query: { shopId: String(shopId) },
        replayPolicy: "idempotent",
        context,
      });
    },
    getAlbumList(
      context: RequestContext,
      params: Record<string, string>,
    ): Promise<RepoResult<AlbumListPage>> {
      return deps.client.request<AlbumListPage>({
        method: "GET",
        url: "/wechat/albums",
        query: params,
        replayPolicy: "idempotent",
        context,
      });
    },
    /** P2-09 实测：入参 albumId+type（旧端 getalbumDetail('get', {albumId, type})） */
    getAlbumDetail(
      context: RequestContext,
      options: { method?: "GET" | "POST"; params: { albumId: string; type?: string } },
    ): Promise<RepoResult<AlbumDetail>> {
      const method = (options.method ?? "GET").toUpperCase() as "GET" | "POST";
      const params: Record<string, string> = { albumId: options.params.albumId };
      if (options.params.type != null) params.type = options.params.type;
      return deps.client.request<AlbumDetail>({
        method,
        url: "/wechat/album/detail",
        query: method === "GET" ? params : undefined,
        body: method === "GET" ? undefined : params,
        replayPolicy: "idempotent",
        context,
      });
    },
  };
}
