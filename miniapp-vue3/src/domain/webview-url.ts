// P2-22 域规则：webview 准入白名单（纯 TS，可测）。
// ⭐ 有意加固（行为修正）：旧端 src/pages/webview/index.uvue 对 url 参数**无任何校验**——decodeURIComponent 后
// 直接透传 <web-view :src>，即旧端可打开任意 URL。phases P2-22 要求「只允许既有合法 URL 策略，不放开任意 URL」，
// 故新端在此收口：仅 http(s) 且 host 精确命中白名单或为其子域（沿用 imageLoader.uts:33-38 的精确主域口径，
// 防 `xx-lanmei66.cloud.evil.com` 子串误命中）。产品依据＝phases P2-22 条文；登记见 docs/migration/deviations.md。
//
// 容器安全：**不使用 URL 构造函数**（小程序 JS 运行时不保证存在），改以正则解析 scheme/authority。

/** 默认白名单（Profile 未注入时的兜底；页面侧以 PROFILE.apiBases 派生为准） */
export const DEFAULT_WEBVIEW_HOSTS: readonly string[] = ["lanmei66.cloud", "crazyma99.xyz"];

/** http(s) URL 的 scheme + authority 解析（无 URL 构造器依赖）。
 * ⚠️ authority 字符类**必须排除反斜杠**：WHATWG（Chromium/WKWebView）在 special scheme 下把 `\` 视作 `/`，
 * 若允许则 `https://evil.com\.lanmei66.cloud/x` 会被本校验器判为白名单子域、而容器实际打开 evil.com
 * （`https://evil.com\@lanmei66.cloud/x` 同理）——CR 🔴1 旁路，已在字符类内排除并在 t29 先红后绿锁定。 */
const HTTP_URL_RE = /^(https?):\/\/([^/?#\s\\]+)([/?#].*)?$/i;

/**
 * 取 http(s) URL 的主机名（小写）。
 * 非法输入／非 http(s)（含 `javascript:`、`data:`、`file:`、相对路径）一律返回 null。
 */
export function webviewHost(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const m = HTTP_URL_RE.exec(input.trim());
  if (m === null) return null;
  let authority = m[2];
  const at = authority.lastIndexOf("@"); // 去 userinfo
  if (at >= 0) authority = authority.slice(at + 1);
  const colon = authority.lastIndexOf(":"); // 去端口
  if (colon >= 0) authority = authority.slice(0, colon);
  const host = authority.toLowerCase();
  return host === "" ? null : host;
}

/** 精确命中或为其子域（`a.lanmei66.cloud` ✅；`lanmei66.cloud.evil.com` ❌） */
export function hostAllowed(host: string, allowed: readonly string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((a) => {
    const al = a.toLowerCase();
    return al !== "" && (h === al || h.endsWith("." + al));
  });
}

/** webview 准入：仅 http(s)＋白名单 host（含子域） */
export function isAllowedWebviewUrl(input: unknown, opts?: { allowedHosts?: readonly string[] }): boolean {
  const host = webviewHost(input);
  if (host === null) return false;
  return hostAllowed(host, opts?.allowedHosts ?? DEFAULT_WEBVIEW_HOSTS);
}
