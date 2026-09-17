// 图片缩略（旧端 imageLoader.uts:33-46 忠实移植）：
// 仅精确主域匹配（防 "xx-lanmei66.cloud.yy" 子串误命中，旧端 CR 🟡）；COS 万象 WebP 缩略参数拼接。
export function isCosHost(url: string): boolean {
  const m = url.match(/^https?:\/\/([^\/?#]+)/);
  if (m == null) return false;
  const host = m[1];
  return host === "lanmei66.cloud" || host.endsWith(".lanmei66.cloud");
}

export function cosThumb(url: string, width: number): string {
  if (url === "") return url;
  if (!isCosHost(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "imageMogr2/format/webp/thumbnail/" + width + "x";
}

/** 详情图渐进加载（旧端 targetPhotoDetail:68-72 口径）：首图原图（高清主视觉）、其余 750 WebP 缩略 */
export function progressivePhotoSrc(url: string | undefined, index: number): string {
  const u = url ?? "";
  if (u === "") return "";
  return index === 0 ? u : cosThumb(u, 750);
}
