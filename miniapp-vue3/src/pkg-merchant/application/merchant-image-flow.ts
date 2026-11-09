// 商家端相册图片用例（issue #14 · M2）：加载 / 上下移排序 / 单张与批量删除 / 试衣开关。
// 后端「静默成功」陷阱（见 domain/merchant-image.ts）：排序对无效项静默跳过、删除对不存在/无权静默成功 ⇒
// **提交后一律重新拉取，以刷新结果为准**，不能只信 code=200：
//   · 排序：刷新后核对顺序是否等于预期（orderMatches），不一致 ⇒ 返回 mismatch，页面提示「排序未完全生效，已刷新」；
//   · 删除：刷新后核对目标 id 是否仍在列表里，仍在 ⇒ 记为未删除（页面提示）。
// 批量删除串行逐张（后端无批量接口），遇 401 立即停止；单张失败不影响其余，最后汇总。写操作串行。
import type { RequestContext } from "../../ports/context";
import type { createMerchantImageRepository } from "../infrastructure/merchant-images";
import { orderMatches, planMove, sortImages, nextTryonStatus, type MerchantImage, type MoveDirection } from "../domain/merchant-image";
import { isPositiveId } from "../domain/merchant-http";
import { hasPermission, PERM, type MerchantProfile } from "../domain/merchant-auth";
import { createExclusive, failFrom, type FlowFail } from "./merchant-flow-common";

type ImageRepo = ReturnType<typeof createMerchantImageRepository>;
type Perm = Pick<MerchantProfile, "permissions"> | null;

export type MoveOutcome = { ok: true; images: MerchantImage[]; applied: boolean } | FlowFail;
export type DeleteOutcome = { ok: true; images: MerchantImage[]; deleted: number; remaining: number[]; failedMessage: string } | FlowFail;

export function createImageUseCases(deps: { images: ImageRepo }) {
  const lock = createExclusive();
  const denied = (p: Perm): FlowFail | null => (hasPermission(p, PERM.album) ? null : { ok: false, kind: "failed", message: "无权限执行此操作" });

  /**
   * 「写已成功、但刷新失败」的失败结果：**必须明说写已提交**，否则商家只看到通用的「网络异常」会误以为没成功而重复操作。
   * 401 仍走 auth-expired（失效就是失效）；其余一律用本文案（不透出通用网络文案）。
   */
  function committedButRefreshFailed(error: Parameters<typeof failFrom>[0], doneWhat: string): FlowFail {
    const base = failFrom(error, "");
    if (base.kind === "auth-expired") return base;
    return { ok: false, kind: "failed", message: doneWhat + "已提交，但刷新失败，请下拉刷新核对结果" };
  }

  async function fetchSorted(context: RequestContext, shopId: number, albumId: number) {
    const r = await deps.images.list(context, shopId, albumId);
    return r.ok ? { ok: true as const, images: sortImages(r.value) } : { ok: false as const, error: r.error };
  }

  return {
    isBusy: lock.isBusy,

    async load(context: RequestContext, shopId: number, albumId: number): Promise<{ ok: true; images: MerchantImage[] } | FlowFail> {
      if (!isPositiveId(shopId) || !isPositiveId(albumId)) return { ok: false, kind: "validation", message: "参数不合法" };
      const r = await fetchSorted(context, shopId, albumId);
      if (!r.ok) return failFrom(r.error, "图片加载失败，请重试");
      return { ok: true, images: r.images };
    },

    /** 上/下移一位：对整个相册重新连号后提交；提交后刷新并核对顺序（applied=false ⇒ 后端静默跳过了部分项） */
    move(context: RequestContext, perm: Perm, shopId: number, albumId: number, current: readonly MerchantImage[], id: number, dir: MoveDirection) {
      return lock.run<{ ok: true; images: MerchantImage[]; applied: boolean }>(async () => {
        const d = denied(perm);
        if (d) return d;
        if (!isPositiveId(shopId) || !isPositiveId(albumId)) return { ok: false, kind: "validation", message: "参数不合法" };
        const plan = planMove(current, id, dir);
        if (plan == null) return { ok: false, kind: "validation", message: dir === "up" ? "已经是第一张" : "已经是最后一张" };
        const r = await deps.images.sort(context, shopId, plan);
        if (!r.ok) return failFrom(r.error, "排序失败，请重试");
        const fresh = await fetchSorted(context, shopId, albumId);
        if (!fresh.ok) return committedButRefreshFailed(fresh.error, "排序");
        return { ok: true, images: fresh.images, applied: orderMatches(fresh.images, plan) };
      });
    },

    /** 删除一张或多张：串行逐张；全部结束后刷新，以刷新结果为准统计真实删除数 */
    remove(context: RequestContext, perm: Perm, shopId: number, albumId: number, ids: readonly number[]) {
      return lock.run<{ ok: true; images: MerchantImage[]; deleted: number; remaining: number[]; failedMessage: string }>(async () => {
        const d = denied(perm);
        if (d) return d;
        if (!isPositiveId(shopId) || !isPositiveId(albumId)) return { ok: false, kind: "validation", message: "参数不合法" };
        const targets = [...new Set(ids.filter((x) => isPositiveId(x)))];
        if (targets.length === 0) return { ok: false, kind: "validation", message: "请先选择图片" };
        let failedMessage = "";
        for (const id of targets) {
          const r = await deps.images.remove(context, shopId, id);
          if (!r.ok) {
            const f = failFrom(r.error, "删除失败，请重试");
            if (f.kind === "auth-expired") return f; // 登录失效：立即停止
            failedMessage = f.message; // 其余失败继续删后面的，最后以刷新为准
          }
        }
        const fresh = await fetchSorted(context, shopId, albumId);
        if (!fresh.ok) return committedButRefreshFailed(fresh.error, "删除");
        const alive = new Set(fresh.images.map((i) => i.id));
        const remaining = targets.filter((id) => alive.has(id));
        return { ok: true, images: fresh.images, deleted: targets.length - remaining.length, remaining, failedMessage };
      });
    },

    /** 单图试衣开关：PATCH 返回更新后的图；新图刚上传时异步打标，容忍（调用方用返回值更新本地项，失败只提示不回滚列表） */
    setTryon(context: RequestContext, perm: Perm, shopId: number, image: MerchantImage) {
      return lock.run<{ ok: true; image: MerchantImage }>(async () => {
        const d = denied(perm);
        if (d) return d;
        if (!isPositiveId(shopId) || !isPositiveId(image.id)) return { ok: false, kind: "validation", message: "参数不合法" };
        const r = await deps.images.setTryon(context, shopId, image.id, nextTryonStatus(image));
        if (!r.ok) return failFrom(r.error, "切换失败，请重试");
        return { ok: true, image: r.value };
      });
    },
  };
}
