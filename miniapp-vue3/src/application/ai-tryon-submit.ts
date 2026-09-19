// T8 S4：AI 试衣提交用例（旧端 aiTryOn:531-628 `handleGenerate`/`runSubmitFlow` ＋ :629-643 `loadCreditInfo`）。
// 纪律：
//  · **页面零自建轮询**——次数不足（4001／已知余额≤0）时不由页面自己拉支付轮询，而是把
//    「需要充值」作为结果返回，由页面调用共享 `payment-coordinator.recharge/resume`（T9a 单一出口）；
//  · 守卫顺序与提示文案逐字保留（登录 → 上传中 → 未选照片 → 上传失败 → 无模板 → 未选中模板 → 付费前置充值）；
//  · 成功即扣 1 次（旧端本地 -1，仅付费模式且余额>0 时）；随后跳结果页 taskId＋shopId。
//  · `onSubmittingChange`（2026-09-19 主人指示 loading 与原版一致）：网络提交在飞期间通知页面挂/摘
//    「提交中...」loading（旧端 :583/:622 仅在请求区间 showLoading，守卫早退不挂）。
// 有意偏差（已声明）：`loadCredit` 成功判定＝客户端 Result.ok（兼容 aiface 的 code 0 与 200）；旧端此处**严格 ===200**，
// 会把 code 0 误判为失败（旧端自身口径不一致），新端按全站口径统一。
import type { RequestContext } from "../ports/context";
import type { RepoResult } from "../infrastructure/repositories/carousels";

export interface AiTemplateLike {
  id?: number;
}

export interface SubmitInput {
  /** 已上传服务端文件名（空串＝上传失败/未完成） */
  uploadedFilename: string;
  /** 本地已选照片路径（空＝未选） */
  photoPath: string;
  isUploading: boolean;
  isSubmitting: boolean;
  isLoggedIn: boolean;
  /** 门店 ID（字符串，旧端 parseInt 后使用） */
  shopId: string;
  templates: AiTemplateLike[];
  currentTemplateIndex: number;
  /** 付费模式（priceFenPerCredit > 0）与当前余额 */
  isPaidMode: boolean;
  creditBalance: number;
  bodyTypeText: string;
  ageRange: string;
  openid: string;
}

export type SubmitOutcome =
  | { kind: "ignored" } // 重复点击（isSubmitting）
  | { kind: "need-login" }
  | { kind: "toast"; message: string }
  | { kind: "need-recharge"; reason: "no-credits" | "insufficient" }
  | { kind: "submitted"; taskId: number; shopId: number; balanceAfter: number };

export interface AiSubmitRepositoryLike {
  submitTryOnTask(
    context: RequestContext,
    params: {
      templateId: number;
      userPhotoFilename: string;
      shopId: number;
      userOpenid?: string;
      category?: string;
      bodyType?: string;
      ageRange?: string;
    },
  ): Promise<RepoResult<{ task_id: number }>>;
}

export interface AiCreditRepositoryLike {
  getBalance(
    context: RequestContext,
    params?: { shopId?: number; feature?: string; taskId?: number },
  ): Promise<RepoResult<{ balance: number; inited: boolean; priceFenPerCredit: number }>>;
}

/** 次数与定价（旧端 loadCreditInfo）：失败静默由调用方处理（本函数只负责成功语义） */
export async function loadCreditInfo(
  deps: { credits: AiCreditRepositoryLike; context: RequestContext },
  input: { shopId: string },
): Promise<{ balance: number; priceFenPerCredit: number } | null> {
  const shopIdNum = parseInt(input.shopId, 10) || 0;
  const res = await deps.credits.getBalance(deps.context, shopIdNum > 0 ? { shopId: shopIdNum } : undefined);
  if (!res.ok) return null;
  return { balance: res.value.balance, priceFenPerCredit: res.value.priceFenPerCredit };
}

export function createTryOnSubmitter(deps: {
  ai: AiSubmitRepositoryLike;
  nextContext: () => RequestContext;
  /** 提交请求在飞通知（true=挂「提交中...」／false=摘）；守卫早退不触发（旧端 :583 仅在请求区间 showLoading） */
  onSubmittingChange?: (active: boolean) => void;
}) {
  async function submit(input: SubmitInput): Promise<SubmitOutcome> {
    // 守卫顺序与文案逐字（旧端 :539-577）
    if (input.isSubmitting) return { kind: "ignored" };
    if (!input.isLoggedIn) return { kind: "need-login" };
    if (input.isUploading) return { kind: "toast", message: "照片上传中，请稍候" };
    if (input.photoPath === "") return { kind: "toast", message: "请先上传照片" };
    if (input.uploadedFilename === "") return { kind: "toast", message: "照片上传失败，请重新选择" };
    if (input.templates.length === 0) return { kind: "toast", message: "暂无可用模板" };
    const current = input.templates[input.currentTemplateIndex];
    if (current == null) return { kind: "toast", message: "请选择模板" };
    if (typeof current.id !== "number") return { kind: "toast", message: "请选择模板" };
    // 付费模式且已知无剩余次数：直接拉起支付，省一次必败请求（旧端 :578-581）
    if (input.isPaidMode && input.creditBalance <= 0) {
      return { kind: "need-recharge", reason: "no-credits" };
    }

    const shopIdNum = parseInt(input.shopId, 10) || 0;
    deps.onSubmittingChange?.(true);
    let res: RepoResult<{ task_id: number }>;
    try {
      res = await deps.ai.submitTryOnTask(deps.nextContext(), {
        templateId: current.id,
        userPhotoFilename: input.uploadedFilename,
        shopId: shopIdNum,
        ...(input.openid !== "" ? { userOpenid: input.openid } : {}),
        category: "travel",
        bodyType: input.bodyTypeText,
        ageRange: input.ageRange,
      });
    } finally {
      deps.onSubmittingChange?.(false);
    }

    if (res.ok && res.value != null) {
      // 任务创建成功即扣 1 次（仅付费模式且余额>0 时同步本地角标）
      const balanceAfter = input.isPaidMode && input.creditBalance > 0 ? input.creditBalance - 1 : input.creditBalance;
      return { kind: "submitted", taskId: res.value.task_id, shopId: shopIdNum, balanceAfter };
    }
    // 次数不足（4001 → client 映射 INSUFFICIENT_CREDITS，旧端按 code===4001 处理）→ 交由共享支付协调器
    if (!res.ok && res.error.kind === "INSUFFICIENT_CREDITS") {
      return { kind: "need-recharge", reason: "insufficient" };
    }
    // 其余业务错误：优先服务端 message（旧端 submitRes.message || '提交失败'）
    const message = !res.ok && typeof res.error.message === "string" && res.error.message !== "" ? res.error.message : "提交失败";
    return { kind: "toast", message };
  }

  return { submit };
}
