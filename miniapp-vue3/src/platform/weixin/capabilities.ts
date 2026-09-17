// 微信端能力适配（T8 S1）：截屏保护＋订阅消息——旧端 aiTryOn/aiTryOnResult 使用（:310-340／:456-481）。
// 纪律：容器安全（无 wx/无 API 一律 fail-soft，不抛、不阻断业务）；抖音端不注册 AI 页，本模块仅微信运行时生效。
// ⚠️ 截屏保护**必须在 onUnload 恢复**（旧端教训：redirectTo/reLaunch 只触发 onUnload，残留会污染全局导致其他页无法截屏）。
// 实现说明：`wx` 不声明为全局类型（避免引入平台 d.ts 依赖），统一经 globalThis 收窄访问。
interface WxLike {
  canIUse?: (schema: string) => boolean;
  setVisualEffectOnCapture?: (options: { visualEffect: string }) => void;
  requestSubscribeMessage?: (options: { tmplIds: string[]; success: () => void; fail: () => void }) => void;
}

function wxGlobal(): WxLike | undefined {
  return (globalThis as { wx?: WxLike }).wx;
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
