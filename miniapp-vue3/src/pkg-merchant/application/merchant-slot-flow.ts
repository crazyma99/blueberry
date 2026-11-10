// 商家端档期用例（issue #14 · M1）：列表加载、新增、改（容量/启停）、模板「先预览再确认」套用。
// 纪律：仓储只回 Result 不抛；AppError 统一映射为面向商家的中文文案（冲突类业务错误原样展示后端 message）；
// 写操作串行化（同一时刻只允许一个变更在飞——后端对重复/冲突返回业务错误，不能靠重试兜底）。
import type { RequestContext } from "../../ports/context";
import type { createMerchantSlotRepository } from "../infrastructure/merchant-slots";
import {
  buildSlotPatch,
  canConfirmApply,
  isValidDateStr,
  sortSlots,
  validateCapacity,
  validateNewSlot,
  type MerchantSlotView,
  type SlotFormError,
  type SlotTemplateView,
  type TemplateApplyResult,
} from "../domain/merchant-slot";
import { isMerchantAuthExpired, merchantErrorMessage } from "../domain/merchant-error";
import { canApplySlotTemplate, hasPermission, PERM, type MerchantProfile } from "../domain/merchant-auth";

type Repo = ReturnType<typeof createMerchantSlotRepository>;

export type Fail = { ok: false; kind: "failed" | "auth-expired" | "busy" | "validation"; message: string; field?: SlotFormError["field"] };

function failFrom(err: Parameters<typeof merchantErrorMessage>[0], fallback: string): Fail {
  return { ok: false, kind: isMerchantAuthExpired(err) ? "auth-expired" : "failed", message: merchantErrorMessage(err, fallback) };
}

export function createSlotUseCases(deps: { slots: Repo }) {
  let busy = false;
  /** 串行化包装：在飞期间拒绝一切新的写操作 */
  async function exclusive<T>(fn: () => Promise<T | Fail>): Promise<T | Fail> {
    if (busy) return { ok: false, kind: "busy", message: "正在处理，请稍候" };
    busy = true;
    try {
      return await fn();
    } finally {
      busy = false;
    }
  }

  return {
    isBusy: (): boolean => busy,

    /** 加载档期；`date` 缺省＝不带日期（不显示已占）；传了必须是合法 YYYY-MM-DD，**非法 ⇒ validation 且不发请求** */
    async load(context: RequestContext, date?: string): Promise<{ ok: true; slots: MerchantSlotView[] } | Fail> {
      if (date !== undefined && !isValidDateStr(date)) return { ok: false, kind: "validation", message: "日期格式应为 YYYY-MM-DD" };
      const r = await deps.slots.list(context, date !== undefined ? { date } : undefined);
      if (!r.ok) return failFrom(r.error, "档期加载失败，请重试");
      return { ok: true, slots: sortSlots(r.value) };
    },

    create(context: RequestContext, input: { startTime: string; endTime: string; capacity: string | number }) {
      return exclusive<{ ok: true; slot: MerchantSlotView }>(async () => {
        const v = validateNewSlot(input);
        if (!v.ok) return { ok: false, kind: "validation", message: v.error.message, field: v.error.field };
        const r = await deps.slots.create(context, v.body);
        if (!r.ok) return failFrom(r.error, "新增档期失败，请重试"); // 唯一/重叠冲突：后端文案原样
        return { ok: true, slot: r.value };
      });
    },

    /** 改容量（字符串输入）并/或启停；无变化 ⇒ validation，不发请求 */
    update(context: RequestContext, slot: MerchantSlotView, next: { capacity?: string | number; status?: number }) {
      return exclusive<{ ok: true; slot: MerchantSlotView }>(async () => {
        const p = buildSlotPatch(slot, next);
        if (!p.ok) return { ok: false, kind: "validation", message: p.message };
        const r = await deps.slots.update(context, slot.id, p.patch);
        if (!r.ok) return failFrom(r.error, "修改档期失败，请重试");
        return { ok: true, slot: r.value };
      });
    },

    async loadTemplates(context: RequestContext): Promise<{ ok: true; templates: SlotTemplateView[] } | Fail> {
      const r = await deps.slots.listTemplates(context);
      if (!r.ok) return failFrom(r.error, "模板加载失败，请重试");
      return { ok: true, templates: r.value };
    },

    /** 第 1 步：dryRun 预览（全程只读，不占 busy 锁以外的资源；仍串行化防并发） */
    previewTemplate(context: RequestContext, profile: Pick<MerchantProfile, "permissions"> | null, templateId: string, capacity?: string | number) {
      return exclusive<{ ok: true; result: TemplateApplyResult }>(async () => {
        if (!canApplySlotTemplate(profile)) return { ok: false, kind: "failed", message: "无权限套用档期模板" };
        const cap = capacity === undefined || capacity === "" ? undefined : validateCapacity(capacity);
        if (cap != null && !cap.ok) return { ok: false, kind: "validation", message: cap.message, field: "capacity" };
        const r = await deps.slots.applyTemplate(context, templateId, { dryRun: true, capacity: cap?.value });
        if (!r.ok) return failFrom(r.error, "模板预览失败，请重试");
        return { ok: true, result: r.value };
      });
    },

    /** 第 2 步：用户确认后真实套用（dryRun=false）。预览无可新增项时拒绝（避免空操作进审计） */
    applyTemplate(
      context: RequestContext,
      profile: Pick<MerchantProfile, "permissions"> | null,
      templateId: string,
      preview: TemplateApplyResult,
      capacity?: string | number,
    ) {
      return exclusive<{ ok: true; result: TemplateApplyResult }>(async () => {
        if (!canApplySlotTemplate(profile)) return { ok: false, kind: "failed", message: "无权限套用档期模板" };
        if (!canConfirmApply(preview)) return { ok: false, kind: "validation", message: "没有可新增的档期" };
        const cap = capacity === undefined || capacity === "" ? undefined : validateCapacity(capacity);
        if (cap != null && !cap.ok) return { ok: false, kind: "validation", message: cap.message, field: "capacity" };
        const r = await deps.slots.applyTemplate(context, templateId, { dryRun: false, capacity: cap?.value });
        if (!r.ok) return failFrom(r.error, "套用模板失败，请重试");
        return { ok: true, result: r.value };
      });
    },
  };
}

/** 档期页面可见性（体验层）：看/改档期需 booking_slot；模板区块需模板权限且需 booking_slot */
export function slotPageGates(profile: Pick<MerchantProfile, "permissions"> | null): { canManage: boolean; canTemplate: boolean } {
  return { canManage: hasPermission(profile, PERM.bookingSlot), canTemplate: canApplySlotTemplate(profile) };
}
