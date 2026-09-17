// 品牌馆展示入口开关（领域规则，纯 TS）
// 移植来源：旧端 src/utils/pageConfig.uts（parseBrandHubEnabled）
// 安全默认：组件缺失 / config 空 / JSON 非法 / 接口失败 一律 false（不展示）。

/** 严格 boolean 解析：仅接受合法 JSON 字符串且 enabled === true（严格 true，"true"/1 均不算） */
export function brandHubEnabled(input: unknown): boolean {
  if (typeof input !== "string") return false;
  try {
    const parsed: unknown = JSON.parse(input);
    return (parsed as { enabled?: unknown } | null)?.enabled === true;
  } catch {
    return false;
  }
}

/** /api/page-config 响应解析（移植旧端口径：code===200 且 data 为数组，取首个 type==='brand_hub' 的 config） */
export function parseBrandHubResponse(res: unknown): boolean {
  if (res == null || typeof res !== "object") return false;
  const r = res as { code?: unknown; data?: unknown };
  if (r.code !== 200 || !Array.isArray(r.data)) return false;
  const list = r.data as Array<{ type?: unknown; config?: unknown }>;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c != null && c.type === "brand_hub") {
      const raw = c.config;
      if (raw == null || (raw as string).length === 0) return false;
      return brandHubEnabled(raw);
    }
  }
  return false;
}
