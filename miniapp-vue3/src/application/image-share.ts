// 分享卡片图片工具（旧端 imageLoader.uts:52-63 `cosThumbJpg` 忠实移植）。
// 为什么单独成文（需知悉）：`application/image.ts` 已冻结 cosThumb（WebP 缩略）且**不得修改既有文件**；
// 本函数是朋友圈/好友卡片专用的 **JPG** 变体（测试 bug #11：卡片对 WebP／本地临时文件兼容性差，偶发不显示图）。
// 域白名单复用 image.isCosHost（精确主域匹配，防 "xx-lanmei66.cloud.yy" 子串误命中）；非白名单域原样返回，不追加万象参数。
import { isCosHost } from "./image";

/** 旧端 imageLoader.uts:59-63：`{url}?imageMogr2/thumbnail/{width}x/format/jpg` */
export function cosThumbJpg(url: string, width: number): string {
  if (url === "") return url;
  if (!isCosHost(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}imageMogr2/thumbnail/${width}x/format/jpg`;
}
