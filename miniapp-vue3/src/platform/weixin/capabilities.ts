// 微信端能力适配（T8 S1）：截屏保护＋订阅消息——旧端 aiTryOn/aiTryOnResult 使用（:310-340／:456-481）。
// 纪律：容器安全（无 wx/无 API 一律 fail-soft，不抛、不阻断业务）；抖音端不注册 AI 页，本模块仅微信运行时生效。
// ⚠️ 截屏保护**必须在 onUnload 恢复**（旧端教训：redirectTo/reLaunch 只触发 onUnload，残留会污染全局导致其他页无法截屏）。
// 实现说明：`wx` 不声明为全局类型（避免引入平台 d.ts 依赖），统一经 globalThis 收窄访问。
interface WxLike {
  canIUse?: (schema: string) => boolean;
  setVisualEffectOnCapture?: (options: { visualEffect: string }) => void;
  requestSubscribeMessage?: (options: {
    tmplIds: string[];
    success: (res: Record<string, unknown>) => void;
    fail: (err?: { errMsg?: string; errCode?: number }) => void;
  }) => void;
  showShareMenu?: (options: { menus?: string[] }) => void;
}

function wxGlobal(): WxLike | undefined {
  return (typeof globalThis === "undefined" ? undefined : (globalThis as { wx?: WxLike }).wx);
}

export interface CaptureGuard {
  /** 试衣/结果页进入：禁止截屏（capabilities 守卫） */
  enable(): void;
  /** 离页恢复（幂等，可重复调用） */
  disable(): void;
}

export function createCaptureGuard(): CaptureGuard {
  function setCapture(hidden: boolean): void {
    try {
      const wx = wxGlobal();
      if (wx == null || typeof wx.setVisualEffectOnCapture !== "function") return;
      // canIUse 守卫：低版本/非微信端无该能力
      if (typeof wx.canIUse === "function" && !wx.canIUse("setVisualEffectOnCapture")) return;
      wx.setVisualEffectOnCapture({ visualEffect: hidden ? "hidden" : "none" });
    } catch {
      // 静默：能力缺失不影响业务
    }
  }
  return {
    enable: () => setCapture(true),
    disable: () => setCapture(false),
  };
}

/**
 * 右上角菜单开放「分享给朋友／分享到朋友圈」（2026-09-22 试衣页新增分享处理器后补：菜单需显式开放朋友圈入口，
 * 否则 `onShareTimeline` 不可达）。fail-soft：无 `wx`／无该 API／调用异常一律静默（容器安全纪律）。
 */
export function enableShareMenu(): void {
  try {
    const wx = wxGlobal();
    if (wx == null || typeof wx.showShareMenu !== "function") return;
    wx.showShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
  } catch {
    /* 基础库/容器差异：菜单开放失败不影响页面 */
  }
}

export interface TaskNotifyResult {
  ok: boolean;
  /** 用户拒绝/环境不支持时 false（**fail-soft：不阻断提交**） */
  reason?: "rejected" | "unsupported";
}

/** 订阅消息（任务完成通知）：旧端 :456-481，失败一律放行（onDone 必被调用） */
export function requestTaskNotify(tmplIds: string[]): Promise<TaskNotifyResult> {
  return new Promise((resolve) => {
    try {
      const wx = wxGlobal();
      if (wx == null || typeof wx.requestSubscribeMessage !== "function") {
        resolve({ ok: false, reason: "unsupported" });
        return;
      }
      wx.requestSubscribeMessage({
        tmplIds,
        success: () => resolve({ ok: true }),
        fail: () => resolve({ ok: false, reason: "rejected" }),
      });
    } catch {
      resolve({ ok: false, reason: "unsupported" });
    }
  });
}

// ———————————————————————————————————————————————————————————————
// 预约保证金订阅消息（逐模板解析版）：预约结果/完成通知两个模板，模板 ID 由后端下发（不写死）。
// 与 requestTaskNotify 的区别：本函数**逐模板返回** accept/reject/ban/filter，供页面据此决定是否重新引导订阅；
// requestTaskNotify 行为/返回值不变（旧 AI 链路继续用它，现有测试必须仍绿）。
// ———————————————————————————————————————————————————————————————

/** 单模板订阅结果：accept 同意／reject 拒绝／ban 后台封禁／filter 同名被过滤／unknown 返回缺该键或非法值 */
export type SubscribeDecision = "accept" | "reject" | "ban" | "filter" | "unknown";

export interface SubscribeOutcome {
  /** 汇总：至少有一个模板 accept 才为 true（reject 不算成功） */
  ok: boolean;
  /** 逐模板结果映射：key=模板 ID，value=该模板的订阅决定 */
  results: Record<string, SubscribeDecision>;
  /** fail-soft 原因：unsupported（无 wx/无 API/低基础库/空输入）｜failed（fail 回调，如用户关闭订阅总开关） */
  reason?: "unsupported" | "failed";
}

/**
 * 微信一次最多可订阅 **5** 条消息模板（官方文档：
 *   https://developers.weixin.qq.com/miniprogram/dev/api/open-api/subscribe-message/wx.requestSubscribeMessage.html
 *   「tmplIds …一次调用最多可订阅5条消息」）。超过则**截断取前 5 条**。
 */
export const MAX_SUBSCRIBE_TMPL_IDS = 5;

/** 把微信 success 回调里 [模板ID]→'accept'|'reject'|'ban'|'filter' 的动态键收窄为 SubscribeDecision */
function toDecision(v: unknown): SubscribeDecision {
  return v === "accept" || v === "reject" || v === "ban" || v === "filter" ? v : "unknown";
}

/**
 * 逐模板订阅：
 *  · 去重后为空（含空串/空数组/全非法）→ 直接 unsupported-or-empty 的 fail-soft 返回，不调 wx。
 *  · 无 wx/无 API/低基础库 → unsupported。
 *  · fail 回调（如用户关闭订阅总开关 errCode=20004）→ failed（fail-soft，results 内已请求的模板置 reject）。
 *  · reject 不当成功；仅存在 accept 时 ok=true。
 *  · 永不 reject（Promise 一定 resolve）。
 */
export function requestSubscribe(tmplIds: string[]): Promise<SubscribeOutcome> {
  return new Promise((resolve) => {
    // 规整输入：去空串、去重；超过上限截断取前 MAX_SUBSCRIBE_TMPL_IDS 条
    const cleaned = Array.isArray(tmplIds)
      ? [...new Set(tmplIds.filter((t) => typeof t === "string" && t.trim() !== "").map((t) => t.trim()))]
      : [];
    const ids = cleaned.slice(0, MAX_SUBSCRIBE_TMPL_IDS);
    if (ids.length === 0) {
      resolve({ ok: false, results: {}, reason: "unsupported" });
      return;
    }
    try {
      const wx = wxGlobal();
      if (wx == null || typeof wx.requestSubscribeMessage !== "function") {
        resolve({ ok: false, results: {}, reason: "unsupported" });
        return;
      }
      if (typeof wx.canIUse === "function" && !wx.canIUse("requestSubscribeMessage")) {
        resolve({ ok: false, results: {}, reason: "unsupported" });
        return;
      }
      wx.requestSubscribeMessage({
        tmplIds: ids,
        success: (res) => {
          const results: Record<string, SubscribeDecision> = {};
          let anyAccept = false;
          for (const id of ids) {
            const d = toDecision((res as Record<string, unknown>)?.[id]);
            results[id] = d;
            if (d === "accept") anyAccept = true;
          }
          resolve({ ok: anyAccept, results });
        },
        fail: () => {
          // fail-soft：用户关闭订阅总开关/网络失败等 ⇒ 不阻断业务，已请求模板统一置 reject
          const results: Record<string, SubscribeDecision> = {};
          for (const id of ids) results[id] = "reject";
          resolve({ ok: false, results, reason: "failed" });
        },
      });
    } catch {
      resolve({ ok: false, results: {}, reason: "unsupported" });
    }
  });
}
