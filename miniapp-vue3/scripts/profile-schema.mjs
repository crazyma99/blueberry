// Profile 语义校验（P1-14~16）：纯 ESM，不 eval/source；未知值 fail-closed。
// 旧字段对齐：plan §5.2 全部 14 个 legacy 字段；平台 appid 按目标构建必填、不回落微信。

export const LEGACY_REQUIRED_FIELDS = [
  "PROJECT_KEY", "PACKAGE_NAME", "MANIFEST_NAME", "DESCRIPTION", "MP_WEIXIN_APPID",
  "NAVIGATION_TITLE", "BRAND_NAME", "COPYRIGHT_TEXT", "CONTACT_PHONE_TEXT", "CONTACT_QR_SRC",
  "PRICE_FALLBACK_TITLE", "API_BASE_URL", "APP_CODE", "MINI_APP_NAME",
];

export const PLATFORMS = ["mp-weixin", "mp-toutiao", "mp-xhs"];
export const ENVIRONMENTS = ["develop", "trial", "release"];

// 17 页全量（旧端 pages.json 顺序）；抖音 Profile＝前 11 页（2026-09-17 主人拍板，SPEC §10F）
export const PAGES_ALL = [
  "pages/index/index", "pages/brandHub/index", "pages/demoDetail/index", "pages/priceList/index",
  "pages/targetPhotoDetail/index", "pages/priceHomePage/index", "pages/mine/index", "pages/favorites/index",
  "pages/webview/index", "pages/policies/user", "pages/policies/privacy",
  "pages/aiTryOn/index", "pages/aiTryOnResult/index", "pages/aiTryOnHistory/index",
  "pages/aiRecommend/index", "pages/aiRecommendLoading/index", "pages/aiRecommendResult/index",
];

const LINE_RE = /^([A-Z][A-Z0-9_]*)="([^"]*)"$/;
const INJECTION_RE = /`|\$\(|\$\{/;
const PROJECT_KEY_RE = /^[a-z][a-z0-9-]*$/;
const API_HOSTS = ["lanmei66.cloud", "www.lanmei66.cloud", "crazyma99.xyz"];
const QR_HOSTS = ["lanmei66.cloud", "www.lanmei66.cloud", "crazyma99.xyz", "lanmeiimgstore-1311468332.cos.ap-shanghai.myqcloud.com"];

/** project.env 文本 → 原始键值对象。逐行正则解析，绝不 eval/source；畸形行与注入表达式即抛错。 */
export function parseProfileText(text) {
  if (typeof text !== "string") throw new Error("profile text must be string");
  const out = {};
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const m = LINE_RE.exec(line);
    if (!m) throw new Error("malformed profile line " + (i + 1) + ": " + line);
    if (INJECTION_RE.test(m[2])) throw new Error("injection pattern in " + m[1]);
    out[m[1]] = m[2];
  }
  return out;
}

// 包内静态资源路径（huahua profile 实测使用 /static/contactQRCode.jpg）：
// 只允许 static/ 前缀、无 .. 穿越、字符集受限；https URL 仍走 host 白名单。
function isStaticAssetPath(v) {
  if (v.includes("..")) return false;
  return /^\/?static\/[A-Za-z0-9._\-/]+$/.test(v);
}
function qrSrcOk(v) {
  return httpsHostOk(v, QR_HOSTS) || isStaticAssetPath(v);
}
function httpsHostOk(url, allow) {
  let u;
  try { u = new URL(url); } catch { return false; }
  return u.protocol === "https:" && allow.includes(u.hostname);
}

/**
 * 原始键值对象 → NormalizedProfile 或明确错误清单。
 * 闭集：platform∈{mp-weixin,mp-toutiao,mp-xhs}；environment∈{develop,trial,release}（未知即拒，不落生产也不默认 trial）。
 */
export function validateProfile(raw, target) {
  const errors = [];
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["profile raw must be object"] };
  }
  const platform = target?.platform;
  const environment = target?.environment;
  if (!PLATFORMS.includes(platform)) errors.push("unknown platform: " + platform);
  if (!ENVIRONMENTS.includes(environment)) errors.push("unknown environment: " + environment);

  for (const f of LEGACY_REQUIRED_FIELDS) {
    const v = raw[f];
    if (typeof v !== "string" || v.length === 0) errors.push("missing required field: " + f);
    else if (INJECTION_RE.test(v)) errors.push("injection pattern in: " + f);
  }

  // 平台 appid：按目标构建必填，不用微信 appid 兜底（P1-14）
  let appid = null;
  if (platform === "mp-weixin") {
    appid = raw.MP_WEIXIN_APPID ?? null;
    if (typeof appid === "string" && !/^wx[0-9a-fA-F]{16}$/.test(appid)) errors.push("invalid MP_WEIXIN_APPID format");
  } else if (platform === "mp-toutiao") {
    appid = raw.MP_TOUTIAO_APPID ?? null;
    if (typeof appid !== "string" || appid.length === 0) errors.push("missing required field: MP_TOUTIAO_APPID");
    else if (!/^tt[0-9a-zA-Z]{16}$/.test(appid)) errors.push("invalid MP_TOUTIAO_APPID format");
  } else if (platform === "mp-xhs") {
    appid = raw.MP_XHS_APPID ?? null;
    if (typeof appid !== "string" || appid.length === 0) errors.push("missing required field: MP_XHS_APPID");
  }

  if (typeof raw.PROJECT_KEY === "string" && raw.PROJECT_KEY.length > 0 && !PROJECT_KEY_RE.test(raw.PROJECT_KEY)) {
    errors.push("PROJECT_KEY illegal (path traversal or bad charset): " + raw.PROJECT_KEY);
  }
  if (typeof raw.API_BASE_URL === "string" && raw.API_BASE_URL.length > 0 && !httpsHostOk(raw.API_BASE_URL, API_HOSTS)) {
    errors.push("API_BASE_URL host not allowlisted: " + raw.API_BASE_URL);
  }
  if (typeof raw.CONTACT_QR_SRC === "string" && raw.CONTACT_QR_SRC.length > 0 && !qrSrcOk(raw.CONTACT_QR_SRC)) {
    errors.push("CONTACT_QR_SRC not allowlisted (https 白名单 ∪ static/ 包内路径): " + raw.CONTACT_QR_SRC);
  }

  if (errors.length > 0) return { ok: false, errors };

  // API_BASE_URL＝该 Profile 的 release 地址；trial/develop 走受控映射（P1-15）
  const apiBases = {
    release: raw.API_BASE_URL,
    trial: "https://crazyma99.xyz/",
    develop: "https://crazyma99.xyz/",
  };

  const isDouyin = platform === "mp-toutiao";
  const pageRegistry = isDouyin ? PAGES_ALL.slice(0, 11) : PAGES_ALL.slice();
  const features = {
    // 抖音侧「我的」页菜单只留「我的喜欢」（2026-09-17 主人拍板）
    mineMenu: isDouyin ? ["favorites"] : ["favorites", "aiTryOnHistory"],
    mineHintText: isDouyin ? "登录后可收藏" : "登录后可收藏与体验AI试衣",
    navStyle: isDouyin ? "default" : "custom",
    tabBarCustom: !isDouyin,
  };

  return {
    ok: true,
    profile: {
      profileKey: raw.PROJECT_KEY,
      packageName: raw.PACKAGE_NAME,
      manifestName: raw.MANIFEST_NAME,
      description: raw.DESCRIPTION,
      platform,
      environment,
      appid,
      appCode: raw.APP_CODE,
      miniAppName: raw.MINI_APP_NAME,
      navigationTitle: raw.NAVIGATION_TITLE,
      brandName: raw.BRAND_NAME,
      copyrightText: raw.COPYRIGHT_TEXT,
      contactPhoneText: raw.CONTACT_PHONE_TEXT,
      contactQrSrc: raw.CONTACT_QR_SRC,
      priceFallbackTitle: raw.PRICE_FALLBACK_TITLE,
      apiBases,
      pageRegistry,
      features,
    },
  };
}
