// 进入参数读取（2026-10-19 · task-71 扫码切换商户 P0）：**热启动时 onLoad 不再执行**（微信官方社区 2024-02-02：
// 「微信扫码，onLoad 不是每次都执行的」；已驻留的 tab 页再次扫码只走 onShow）⇒ 必须在 onShow 用 `uni.getEnterOptionsSync()` 取本次进入参数。
//
// 口径要点：
//   · `enterOptions.scene` 是**场景值数字**（如 1047/1011），**不是**小程序码里的参数；扫码参数在 **`query.scene`**（字符串）里；
//   · 分享卡片走 `query.brandId`；
//   · 端差异与容器 API 调用**全部收口在本文件**（platform/**），逻辑层零 #ifdef；任何异常/缺失一律返回空值（fail-soft，绝不抛）。
export interface EnterOptions {
  /** 小程序码参数（`query.scene`，已做 decode 容错）；无则空串 */
  scene: string;
  /** 分享卡片参数 `query.brandId`；无则空串 */
  queryBrandId: string;
}

interface UniApiLike {
  getEnterOptionsSync?: () => { scene?: unknown; query?: Record<string, unknown> } | null;
}

function uniApi(): UniApiLike | undefined {
  const injected = typeof globalThis === "undefined" ? undefined : (globalThis as { uni?: UniApiLike }).uni;
  if (injected != null) return injected;
  return typeof uni !== "undefined" ? (uni as unknown as UniApiLike) : undefined;
}

function decodeLoose(raw: string): string {
  if (raw === "") return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw; // 非法百分号编码：按原样（不抛）
  }
}

/** 读取本次进入参数（热启动/再次扫码都能取到）；容器不支持或异常 ⇒ 全空 */
export function readEnterOptions(): EnterOptions {
  const empty: EnterOptions = { scene: "", queryBrandId: "" };
  try {
    const api = uniApi();
    if (typeof api?.getEnterOptionsSync !== "function") return empty;
    const enter = api.getEnterOptionsSync();
    if (enter == null) return empty;
    const query = enter.query ?? {};
    const sceneRaw = query.scene != null ? String(query.scene) : "";
    const brandRaw = query.brandId != null ? String(query.brandId) : "";
    return { scene: decodeLoose(sceneRaw), queryBrandId: decodeLoose(brandRaw) };
  } catch (err) {
    console.warn("[enter-options] getEnterOptionsSync 读取失败（fail-soft）:", err);
    return empty;
  }
}
