// 商家端 HTTP 小工具（issue #14 · M2）。**纯函数**。
//
// 为什么需要：共用 uni 传输（platform/uni/transport.ts）对**非 GET** 只发送 `body`，`query` 被忽略（GET 才把 query 当 data）。
// 而后端分类/相册的写接口大量把参数放在 **URL query**（如 `PUT /shop/parent/update?id=`、`DELETE /photo-albums/delete/:albumId?shop_id=`），
// 所以这些请求必须把 query **拼进 url 字符串**（传输层会原样保留查询串）。
export type QueryValue = string | number | undefined | null;

/** 把参数拼成 `path?a=1&b=2`；undefined/null/空串的项跳过；值做 encodeURIComponent；无任何有效参数 ⇒ 原样返回 path */
export function withQuery(path: string, params: Record<string, QueryValue>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
  }
  return parts.length === 0 ? path : path + (path.includes("?") ? "&" : "?") + parts.join("&");
}

/** 正整数 ID 校验（>0 的安全整数）。创建/删除前用来拦「shopId 为空会被后端 CheckShopPermission(0) 放行 ⇒ 无归属脏数据」 */
export function isPositiveId(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0;
}
