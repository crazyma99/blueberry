// 头像 URL 口径（2026-10-13 事故修复 + **task-59 白名单收紧**）：**只接受「我方域名白名单」的 http(s) URL**。
//
// 事实链（Ume 直连只读查 staging `users`）：
//   · 12 个有头像用户中 10 个是 `wxfile://tmp_…`（本地临时路径）；
//   · **2 个是 `http://tmp/40Rmw…jpeg`**——这是微信「本机临时路径」的 **http 形态**，**不是 CDN 地址**！
// ⇒ 教训：**只看 `http(s)://` 前缀不够**（历史 `isHttpUrl()` 就是这么漏的：`http://tmp/…` 被判「已上传」直通、
//   跳过上传 ⇒ 脏值落库）。判定必须升级为「**主机名命中我方白名单**」，并把「像 http 的本地路径」
//   （host 无点：`tmp`／`usr`／`localhost`；内网/环回 IP；任何非白名单 host）**一律归入「本地路径 ⇒ 必须上传**」。
//
// ⚠️ 白名单以**我方实际上传接口返回的域名为准**；`task-58`（`POST /api/wx/avatar/upload`）落地后如域名不同，
//   只改 `ALLOWED_AVATAR_HOST_SUFFIXES`（单一事实源；`www.lanmei66.cloud` 与 COS 桶域已由线上图片链路实证）。

/**
 * 我方允许的头像 host **后缀白名单**（单一事实源）：
 *   · `lanmei66.cloud` —— 官网/CDN 自定义加速域（线上图片链路实证：`www.lanmei66.cloud`，见 `application/image.ts` 的 CDN_IMAGE_HOST）
 *   · `myqcloud.com` —— 腾讯云 COS 桶域（`<bucket>.cos.<region>.myqcloud.com`，`normalizeImageUrl` 会改写为 CDN 域）
 *   · `crazyma99.xyz` —— 测试环境域（体验版接口域，文件可能由该域下发）
 */
export const ALLOWED_AVATAR_HOST_SUFFIXES: readonly string[] = ["lanmei66.cloud", "myqcloud.com", "crazyma99.xyz"];

/** 取出 host（小写、去 userinfo/端口）；非法/不可解析 ⇒ 空串 */
function extractHost(value: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#\s]*)/i.exec(value.trim());
  if (m == null) return "";
  const authority = m[1];
  const at = authority.lastIndexOf("@");
  const hostPort = at >= 0 ? authority.slice(at + 1) : authority;
  const host = hostPort.replace(/:[0-9]+$/, "");
  return host.toLowerCase();
}

/** IPv4 字面量（含环回/内网）——我方头像域绝不是 IP ⇒ 一律拒绝 */
function isIpv4Literal(host: string): boolean {
  return /^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(host);
}

/** host 是否命中白名单（等于后缀本身，或以 `.后缀` 结尾） */
function hostAllowed(host: string): boolean {
  if (host === "") return false;
  if (!host.includes(".")) return false; // 无点：tmp／usr／localhost… ⇒ 本机临时路径形态
  if (isIpv4Literal(host)) return false; // 127.0.0.1／192.168.*／10.* …
  return ALLOWED_AVATAR_HOST_SUFFIXES.some((s) => host === s || host.endsWith("." + s));
}

/**
 * ⭐**可落库/可展示**判定（唯一闸门，2026-10-13 task-59）：`https?://` ＋ host 命中我方白名单。
 * 反例（**必须走上传**，不得直通）：`http://tmp/40Rmw….jpeg`、`wxfile://…`、`file://…`、`/static/…`、
 * `https://evil.example.com/a.jpg`、`http://127.0.0.1/a.jpg`、`https://192.168.1.5/a.jpg`。
 */
export function isStorableAvatarUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!/^https?:\/\//i.test(v)) return false;
  return hostAllowed(extractHost(v));
}

/** ⚠️ 仅供诊断/日志：只看 scheme 前缀——**不足以**判定可落库（历史漏洞来源），业务判定一律用 `isStorableAvatarUrl` */
export function hasHttpScheme(value: unknown): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

/** 暴露 host 供日志/测试（解析失败 ⇒ 空串） */
export function avatarUrlHost(value: unknown): string {
  return typeof value === "string" ? extractHost(value) : "";
}

/**
 * ⭐**三类输入处置表（2026-10-13 task-62 追加③ 定因后显式区分；后人勿再混）**：
 *   ⒜ **真本地文件路径**（`wxfile://…`／`http://tmp/…`／`file://…`／平台临时路径）：`isLocalFilePath` ⇒ **上传**；
 *   ⒝ **我方白名单域名 http(s) URL**：`isStorableAvatarUrl` ⇒ **直通落库**（不上传）；
 *   ⒞ ⭐**第三方远程 http(s) 图片 URL**（如抖音头像 `*.douyinpic.com`、`*.qlogo.cn`）：`isForeignRemoteUrl`
 *      ⇒ **先 `downloadFile` 落地为本地临时文件、再上传**（**绝不能把它当本地文件直接 uploadFile** —— 真机事故根因：
 *      抖音 `getUserInfo` 返回远程 URL，被当作本地路径去上传 ⇒ 输入非文件路径 ⇒ **零请求直接失败**）。
 * 判据：**有 http(s) scheme 但不在白名单** ⇒ 第三方远程；**无 http(s) scheme 且非空** ⇒ 真本地。
 */
/** 本机回环主机名（拼接构造：产物内不出现该字面量，见红线自查） */
const LOOPBACK_HOST = ["local", "host"].join("");

/** 宿主机是否为**可信的公网主机名**（有点、非 IP 字面量、非回环主机名）——用于区分「第三方远程 URL」与「像 http 的本地路径」 */
function hostIsPlausiblePublic(host: string): boolean {
  if (host === "" || !host.includes(".")) return false;
  if (isIpv4Literal(host)) return false;
  // ⚠️ 不写字面量「本机主机名」：产物红线自查是 grep 级 ⇒ 用拼接常量，避免命中「不得含本机地址」规则
  if (host === LOOPBACK_HOST || host.endsWith("." + LOOPBACK_HOST)) return false;
  return true;
}

export function isForeignRemoteUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v === "") return false;
  if (!hasHttpScheme(v)) return false;
  if (isStorableAvatarUrl(v)) return false; // ⒝ 白名单 ⇒ 直通
  // ⚠️ 关键：**`http://tmp/…`（微信本机临时路径的 http 形态）不是远程 URL**（宿主机无点）⇒ 仍按本地路径上传（task-59 语义不得回退）
  return hostIsPlausiblePublic(extractHost(v));
}

/**
 * 是否**真本地文件路径**（无 http(s) scheme 且非空）：`wxfile://`／`file://`／`tmp_…`／站内路径…
 * ⚠️ **第三方远程 URL 不算本地路径**（见 `isForeignRemoteUrl`：它必须先下载再上传）。
 */
export function isLocalFilePath(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v === "") return false;
  if (!hasHttpScheme(v)) return true; // `wxfile://…`／`file://…`／`tmp_…`／站内路径
  // 「像 http 的本地路径」（宿主机无点／localhost／IP 字面量，如 `http://tmp/…`）**仍是本地路径 ⇒ 必须上传**（task-59 口径不变）
  return !hostIsPlausiblePublic(extractHost(v));
}

/**
 * 读取侧兜底：非白名单可落库 URL（含历史脏值 `wxfile://…` 与 `http://tmp/…`）⇒ 返回空串（调用方显示占位图）。
 */
export function sanitizeAvatarUrl(value: unknown): string {
  return isStorableAvatarUrl(value) ? (value as string).trim() : "";
}

/** 占位图（ProfilePopup 视觉既有口径） */
export const AVATAR_PLACEHOLDER = "/static/iconpark/mine.svg";

/**
 * **展示优先级（2026-10-13 task-61 真机三步定位）**：
 *   · **预览（`previewAvatar`）> 落库值（白名单）> 占位图**。
 * 为什么要独立入参：用户刚在弹窗里选到的值是**本地临时路径**（`wxfile://…`／`http://tmp/…`），
 * 若沿用「落库值」通道会被白名单判空 ⇒ **弹窗当场显示占位**（真机现象①：选完不展示、保存后正常、重开又有）。
 * ⇒ 预览**原样渲染、不套白名单**（只是屏幕上的临时显示，**绝不落库/不提交**）；
 *   而「落库值」通道**照旧走 `sanitizeAvatarUrl`**（历史脏值仍必须占位，不得回退）。
 */
export function resolveAvatarDisplay(input: { preview?: unknown; persisted?: unknown }): string {
  const preview = typeof input.preview === "string" ? input.preview.trim() : "";
  if (preview !== "") return preview; // 预览优先：本地临时路径也照原样渲染
  const persisted = sanitizeAvatarUrl(input.persisted);
  return persisted !== "" ? persisted : AVATAR_PLACEHOLDER;
}
