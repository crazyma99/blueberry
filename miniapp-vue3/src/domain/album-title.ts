// 相册标题截断（领域规则，纯 TS）
// 移植来源：旧端 src/utils/text.uts（formatAlbumTitle，主人 2026-09-15 指示）
// 规则：码点数 >6 时截前 6 码点 + "..."；按「码点」计数（代理对算一个字符），避免 UTF-16 乱码。

export function formatAlbumTitle(title: unknown): string {
  const s: string = typeof title === "string" ? title : "";
  if (s.length === 0) {
    return "";
  }
  let count = 0;
  let cut = 0;
  while (cut < s.length && count < 6) {
    const code = s.charCodeAt(cut);
    // 高位代理（0xD800-0xDBFF）与低位代理成对出现，视为一个字符
    if (code >= 0xd800 && code <= 0xdbff && cut + 1 < s.length) {
      cut += 2;
    } else {
      cut += 1;
    }
    count += 1;
  }
  if (count >= 6 && cut < s.length) {
    return s.substring(0, cut) + "...";
  }
  return s;
}
