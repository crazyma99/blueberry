// 平台埋点适配（2026-09-23）：后端契约 §7 要求上报 `ai_tryon_quality_reject{check_code}`（拦截率/成本节省的唯一度量口径）。
// 约束：**fail-soft**——容器无该 API / 调用抛错一律静默，绝不阻塞或影响主流程；**不引入任何第三方 SDK**、只调容器自带能力。
// 微信端 `uni.reportEvent(eventName, data)`（自定义分析事件）；其它端/测试环境自动降级为 no-op。
export interface AnalyticsPort {
  reportEvent(name: string, params: Record<string, string | number>): void;
}

interface UniAnalyticsLike {
  reportEvent?: (name: string, data?: Record<string, string | number>) => void;
  reportAnalytics?: (name: string, data?: Record<string, string | number>) => void;
}

/** 惰性取容器 API：注入桩优先（测试/H5），再回落裸 `uni`（mp 产物由编译器改写），口径同 storage/chooser/upload */
function uniApi(): UniAnalyticsLike | undefined {
  const injected = (globalThis as { uni?: UniAnalyticsLike }).uni;
  if (injected != null) return injected;
  return typeof uni !== "undefined" ? (uni as unknown as UniAnalyticsLike) : undefined;
}

export function createUniAnalytics(): AnalyticsPort {
  return {
    reportEvent(name, params) {
      try {
        const u = uniApi();
        const fn = typeof u?.reportEvent === "function" ? u.reportEvent : u?.reportAnalytics;
        if (typeof fn !== "function") return; // 容器不支持 ⇒ 静默（fail-soft）
        fn.call(u, name, { ...params });
      } catch {
        /* fail-soft：埋点绝不抛错 */
      }
    },
  };
}
