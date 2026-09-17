// T6（P2-11）：targetPhotoDetail 导航入参忠实解析——旧端 demoDetail:735 实测六参数
// (?idx&liked&type&category&subCategory&style)；缺 idx 视为无法定位作品（安全失败 null）。
export interface DetailParams {
  /** 旧端导航参数名为 idx，即作品 id（API 侧名为 albumId，见 contracts.md P2-09 修正） */
  albumId: string;
  liked: boolean;
  /** 旧端 type 参数承载店铺 id（demoDetail:735 传 this.idx） */
  shopId: string;
  category: string;
  subCategory: string;
  style: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function parseDetailParams(query: Record<string, unknown>): DetailParams | null {
  const albumId = str(query.idx);
  if (albumId.length === 0) return null;
  let style = str(query.style);
  try {
    style = decodeURIComponent(style);
  } catch {
    // 非法编码保持原样，不阻断进入
  }
  return {
    albumId,
    liked: str(query.liked) === "1" || str(query.liked) === "true",
    shopId: str(query.type),
    category: str(query.category),
    subCategory: str(query.subCategory),
    style,
  };
}

/** demoDetail 导航入参（旧端 index:578-582 实测：?idx=店铺id&from=banner 可选） */
export interface ListPageParams {
  shopId: string;
  from: string;
}

export function parseListParams(query: Record<string, unknown>): ListPageParams | null {
  const shopId = str(query.idx);
  if (shopId.length === 0) return null;
  return { shopId, from: str(query.from) };
}
