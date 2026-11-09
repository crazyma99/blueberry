// 商家端档期仓储（issue #14 · M1）：档期列表/新增/改（容量·启停）+ 模板列表/套用。
// 信封沿用 {code,message,data}：业务失败 HTTP200+code=500+中文 message（冲突文案如「与已有启用档期 10:00-11:00 时间重叠」原样展示）。
// 商家范围由服务端按 JWT 收敛：**一律不传 merchantId**；写接口 `replayPolicy:"never"`；模板套用 body.dryRun 必填。
// 不做：档期模板自身的增删改（M1 只查看+套用）、预约保证金规则。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "../../infrastructure/repositories/carousels";
import {
  normalizeApplyResult,
  normalizeSlot,
  normalizeTemplate,
  type MerchantSlotView,
  type SlotPatch,
  type SlotTemplateView,
  type TemplateApplyResult,
} from "../domain/merchant-slot";

export function createMerchantSlotRepository(deps: { client: ClientLike }) {
  return {
    /** 全部档期（含停用；幂等读） */
    async list(context: RequestContext): Promise<RepoResult<MerchantSlotView[]>> {
      const res = await deps.client.request<unknown>({ method: "GET", url: "/booking/slots", authRequired: true, replayPolicy: "idempotent", context });
      if (!res.ok) return res;
      return { ok: true, value: Array.isArray(res.value) ? res.value.map((s) => normalizeSlot(s)) : [] };
    },

    async create(
      context: RequestContext,
      body: { startTime: string; endTime: string; capacity: number },
    ): Promise<RepoResult<MerchantSlotView>> {
      const res = await deps.client.request<unknown>({
        method: "POST",
        url: "/booking/slots",
        body: { startTime: body.startTime, endTime: body.endTime, capacity: body.capacity },
        authRequired: true,
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: normalizeSlot(res.value) };
    },

    /** 仅容量/启停可改（时间创建后不可改，服务端强制）；patch 至少一个字段 */
    async update(context: RequestContext, id: number, patch: SlotPatch): Promise<RepoResult<MerchantSlotView>> {
      const body: Record<string, number> = {};
      if (patch.capacity !== undefined) body.capacity = patch.capacity;
      if (patch.status !== undefined) body.status = patch.status;
      const res = await deps.client.request<unknown>({
        method: "PUT",
        url: "/booking/slots/" + encodeURIComponent(String(id)),
        body,
        authRequired: true,
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: normalizeSlot(res.value) };
    },

    /** 模板列表（内置恒在第 0 项 + 本商家自定义；幂等读） */
    async listTemplates(context: RequestContext): Promise<RepoResult<SlotTemplateView[]>> {
      const res = await deps.client.request<unknown>({ method: "GET", url: "/booking/slot-templates", authRequired: true, replayPolicy: "idempotent", context });
      if (!res.ok) return res;
      return { ok: true, value: Array.isArray(res.value) ? res.value.map((t) => normalizeTemplate(t)) : [] };
    },

    /**
     * 套用模板：`dryRun` **必填**（后端缺失即拒绝，不让「漏传」静默变成真实执行）。
     * dryRun=true 全程只读（先预览）；dryRun=false 才写库。模板 ID 是字符串（须 encode）。
     */
    async applyTemplate(
      context: RequestContext,
      templateId: string,
      args: { dryRun: boolean; capacity?: number },
    ): Promise<RepoResult<TemplateApplyResult>> {
      const body: Record<string, unknown> = { dryRun: args.dryRun };
      if (args.capacity !== undefined) body.capacity = args.capacity;
      const res = await deps.client.request<unknown>({
        method: "POST",
        url: "/booking/slot-templates/" + encodeURIComponent(templateId) + "/apply",
        body,
        authRequired: true,
        replayPolicy: "never",
        context,
      });
      if (!res.ok) return res;
      return { ok: true, value: normalizeApplyResult(res.value) };
    },
  };
}
