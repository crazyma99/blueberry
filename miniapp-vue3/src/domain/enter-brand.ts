// 进入参数 → 品牌上下文解析（2026-10-19 · task-71 扫码切换商户 P0）。**纯函数**，无平台依赖，便于单测。
//
// 优先级（主人要求）：**扫码 scene > 分享卡片 ?brandId= > 记忆值 > 无**。
// 典型事故：微信对已驻留 tab 页再次扫码**不执行 onLoad**，旧实现在 onLoad 里消费 scene ⇒ 热启动时新商户被丢弃、
// 仍停在旧商户（线上 P0）。修复后由页面 onShow 调用本函数取「本次进入」的品牌，并仅在**与当前不同**时才切换。

export type EnterBrandSource = "scene" | "query" | "stored" | "none";

/**
 * 扩展位（**本期不启用**）：将来「一店一码」可能让 scene 携带**纯数字 shopId**。
 * 现在 scene 只承载**商家编码**（后端 `GetUnlimitedQRCode` 原样透传 merchant.MerchantCode，纯编码如 lanmei／brand_one）；
 * 若届时出现纯数字，用它识别并走「先按 shopId 反查品牌」的另一条链路，**不得**当成商家编码写入（数字会被白名单拒）。
 */
export function looksLikeNumericShopId(value: string): boolean {
  return /^[0-9]+$/.test(value.trim());
}

export interface EnterBrandInput {
  /** 扫码参数（小程序码 query.scene，可含百分号编码） */
  scene?: string | null;
  /** 分享卡片参数 query.brandId */
  queryBrandId?: string | null;
  /** 当前记忆值（versioned.loadBrandId()） */
  storedBrandId?: string | null;
}

export interface EnterBrandResult {
  /** 解析出的品牌（商家编码）；无法解析则空串 */
  brandId: string;
  source: EnterBrandSource;
}

const KV_KEY_RE = /^(brand|brandId|bid|b)$/i;

/**
 * 归一化扫码参数：兼容两种线上形态——
 *   ⒜ `scene=lanmei`（整串即商家编码，现有实现口径）；
 *   ⒝ `scene=brand%3Dlanmei` / `b=lanmei` / `brandId=lanmei`（kv 形态）⇒ 取对应键的值。
 * 非法编码按原样处理（不抛）。
 */
/** 平台管理占位品牌：扫码落地到它时应视为「无品牌上下文」（平台范围），不切换商户上下文 */
export const PLATFORM_BRAND_CODE = "PLATFORM";

export function normalizeScene(raw: string | null | undefined): string {
  let s = typeof raw === "string" ? raw.trim() : "";
  if (s === "") return "";
  try {
    s = decodeURIComponent(s).trim();
  } catch {
    /* 保留原样 */
  }
  if (s.includes("=")) {
    for (const seg of s.split("&")) {
    const i = seg.indexOf("=");
      if (i <= 0) continue;
      const k = seg.slice(0, i).trim();
      const v = seg.slice(i + 1).trim();
      if (KV_KEY_RE.test(k) && v !== "") return v === PLATFORM_BRAND_CODE ? "" : v; // kv 形态同样过滤平台占位品牌
    }
    return ""; // 是 kv 但无品牌键 ⇒ 视为无品牌参数
  }
  return s === PLATFORM_BRAND_CODE ? "" : s;
}

/** 按优先级解析本次进入应使用的品牌；全部为空 ⇒ `{brandId:"", source:"none"}` */
export function resolveEnterBrand(input: EnterBrandInput): EnterBrandResult {
  const scene = normalizeScene(input.scene);
  if (scene !== "") return { brandId: scene, source: "scene" };
  const fromQuery = typeof input.queryBrandId === "string" ? normalizeScene(input.queryBrandId) : "";
  if (fromQuery !== "") return { brandId: fromQuery, source: "query" };
  const stored = typeof input.storedBrandId === "string" ? input.storedBrandId.trim() : "";
  if (stored !== "") return { brandId: stored, source: "stored" };
  return { brandId: "", source: "none" };
}
