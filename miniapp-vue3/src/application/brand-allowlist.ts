// 「已知商家编码」列表补齐（2026-10-19 · task-71 层2）：扫到**线上存在但离线种子没有**的商户时，
// 先异步拉一次公开品牌列表 `GET /api/brands` ⇒ `rememberBrandCodes()` ⇒ 之后该编码即「已知」。
//
// 纪律（Lead 要求）：
//   · **一次/会话**（成功即封盘；失败也**不再重试**，避免重试风暴）；
//   · **超时**（默认 5s，超时按失败处理，绝不悬挂页面）；
//   · **失败静默**（只 console.warn，不打断首屏/不弹 toast）；
//   · 不阻塞首屏：调用方 `await` 的只是「切换品牌」这一步，首屏渲染早已完成。
export interface BrandAllowlistRefreshDeps {
  /** 拉取公开品牌列表的 brandId（`GET /api/brands`）；失败返回 null */
  fetchBrandCodes(): Promise<string[] | null>;
  rememberBrandCodes(codes: string[]): void;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;
let inflight: Promise<boolean> | null = null;
let settled = false; // 本会话已成功补齐 or 已失败过 ⇒ 不再发起

/** 仅供测试复位会话状态 */
export function __resetBrandAllowlistRefresh(): void {
  inflight = null;
  settled = false;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/** 补齐一次已知列表；返回是否补到（失败/超时/已封盘 ⇒ false，且**不重试**） */
export function refreshKnownBrandCodesOnce(deps: BrandAllowlistRefreshDeps): Promise<boolean> {
  if (settled) return Promise.resolve(false);
  if (inflight != null) return inflight;
  inflight = (async () => {
    try {
      const codes = await withTimeout(deps.fetchBrandCodes(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      if (Array.isArray(codes) && codes.length > 0) {
        deps.rememberBrandCodes(codes);
        settled = true;
        return true;
      }
      settled = true; // 空列表/失败：本会话不再重试（防风暴）
      console.warn("[brand-allowlist] 品牌列表补齐未成功（本会话不再重试）");
      return false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
