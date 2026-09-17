// P2-07 品牌馆展示入口 controller：严格开关＋并发治理。
// 纪律：解析复用 domain/brand-hub 的 brandHubEnabled（单一事实源）；安全默认 false（不展示）。
// 行为：同 scope 在飞去重（onLoad/onShow 重叠只查一次）；成功后热恢复必须重查（不缓存结果）；
//      迟到旧 scope 响应不写入（切品牌治理）；invalidate 作废在飞请求并复位安全默认。
import type { RequestContext } from "../ports/context";
import { brandHubEnabled } from "../domain/brand-hub";

export interface BrandHubController {
  refresh(context: RequestContext): Promise<void>;
  readonly enabled: boolean;
  invalidate(): void;
}

export function createBrandHubController(deps: {
  loadConfig: (context: RequestContext) => Promise<string>;
}): BrandHubController {
  let enabled = false;
  let appliedScope = -1; // 已应用结果的 scope 代次
  let epoch = 0; // invalidate 递增：跨切品牌的在飞请求一律作废
  let inFlightScope: number | null = null;
  let inFlight: Promise<void> | null = null;

  function refresh(context: RequestContext): Promise<void> {
    // 同 scope 在飞去重
    if (inFlight !== null && inFlightScope === context.scopeRevision) {
      return inFlight;
    }
    const scope = context.scopeRevision;
    const myEpoch = epoch;
    const p = (async () => {
      try {
        const raw = await deps.loadConfig(context);
        if (myEpoch !== epoch) return; // invalidate 后迟到：作废
        if (scope < appliedScope) return; // 迟到旧 scope：不写入
        enabled = brandHubEnabled(raw);
        appliedScope = scope;
      } catch {
        // 坏 JSON／网络失败：隐藏（安全默认），不向上抛
        if (myEpoch !== epoch) return;
        if (scope < appliedScope) return;
        enabled = false;
        appliedScope = scope;
      } finally {
        // 按 scope 判定清理（避免闭包自引用 promise；若已被更新 scope 的查询接管则不清理）
        if (inFlightScope === scope) {
          inFlight = null;
          inFlightScope = null;
        }
      }
    })();
    inFlight = p;
    inFlightScope = scope;
    return p;
  }

  function invalidate(): void {
    epoch += 1;
    inFlight = null;
    inFlightScope = null;
    appliedScope = -1;
    enabled = false;
  }

  return {
    refresh,
    get enabled() {
      return enabled;
    },
    invalidate,
  };
}
