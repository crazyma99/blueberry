// 图片缩略（旧端 imageLoader.uts:33-46 忠实移植）：
// 仅精确主域匹配（防 "xx-lanmei66.cloud.yy" 子串误命中，旧端 CR 🟡）；COS 万象 WebP 缩略参数拼接。
//
// 2026-09-28 流量成本 PRD（R1/R5）：新增 `normalizeImageUrl` —— COS 外网直连单价 ¥0.50/GB，
// 是 CDN（¥0.21/GB）的 2.4 倍、占当月 COS 费用 97%。服务端若下发 COS 源站域名
// （`*.cos.<region>.myqcloud.com`），前端一律先改写为 CDN 域名再使用；
// `cosThumb`/`progressivePhotoSrc` 内部已接入，绑定层无需逐点处理。
// ⚠️ 保存原图链路的「5 分钟签名 URL」不经过本模块（签名绑 host，改写会破坏签名）——该链路由服务端 R11 治理。

/** 自家图片 CDN 域（COS 桶的自定义加速域；字体/图片已实证同内容可访问） */
export const CDN_IMAGE_HOST = "www.lanmei66.cloud";

/** 腾讯云 COS 源站域名形态：`<bucket>.cos.<region>.myqcloud.com` */
const COS_SOURCE_HOST_RE = /^[^/?#]+\.cos\.[^/?#]+\.myqcloud\.com$/i;

export function isCosHost(url: string): boolean {
  const m = url.match(/^https?:\/\/([^\/?#]+)/);
  if (m == null) return false;
  const host = m[1];
  return host === "lanmei66.cloud" || host.endsWith(".lanmei66.cloud");
}

/** COS 源站 URL → CDN 域改写（保留 path 与 query）；非源站/空值原样返回（对 null/undefined 健壮，同 cosThumb 口径） */
export function normalizeImageUrl(url: string | null | undefined): string {
  if (url == null || url === "") return (url ?? "") as string;
  const m = url.match(/^https?:\/\/([^\/?#]+)([\s\S]*)$/);
  if (m == null) return url;
  if (!COS_SOURCE_HOST_RE.test(m[1])) return url;
  return "https://" + CDN_IMAGE_HOST + m[2];
}

export function cosThumb(url: string | null | undefined, width: number): string {
  // 2026-09-20：对 null/undefined 健壮（首页店铺可能无封面图）——原实现会在 isCosHost 内崩
  if (url == null || url === "") return (url ?? "") as string;
  const u = normalizeImageUrl(url);
  if (!isCosHost(u)) return u;
  const sep = u.includes("?") ? "&" : "?";
  return u + sep + "imageMogr2/format/webp/thumbnail/" + width + "x";
}

/** 详情图渐进加载：首图 1080 预览、其余 750 WebP 缩略。
 *  2026-09-28 变更（流量成本 PRD R2/R14）：首图不再原图直出——原图仅「付费保存/下载」链路使用；
 *  1080 WebP 已覆盖主流屏幕宽度，观感无损、单图流量降一个数量级。 */
export function progressivePhotoSrc(url: string | undefined, index: number): string {
  const u = url ?? "";
  if (u === "") return "";
  return cosThumb(u, index === 0 ? 1080 : 750);
}
