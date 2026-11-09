// 商家端分类用例（issue #14 · M2）：加载一级/二级、新增/改名改排序、删除（先统计关联数）。
// 纪律：仓储只回 Result 不抛；AppError 统一映射中文文案（同名冲突等后端 message 原样）；写操作串行化；
// 创建前本地校验 shopId>0 / parentId>0（防无归属脏分类，见 domain/merchant-category.ts）。
import type { RequestContext } from "../../ports/context";
import type { createMerchantCategoryRepository } from "../infrastructure/merchant-categories";
import type { createMerchantAlbumRepository } from "../infrastructure/merchant-albums";
import {
  sortCategories,
  summarizeParentImpact,
  validateEditCategory,
  validateNewParent,
  validateNewSub,
  type CascadeImpact,
  type MerchantCategory,
} from "../domain/merchant-category";
import { isPositiveId } from "../domain/merchant-http";
import { hasPermission, PERM, type MerchantProfile } from "../domain/merchant-auth";
import { createExclusive, failFrom, type FlowFail } from "./merchant-flow-common";

type CatRepo = ReturnType<typeof createMerchantCategoryRepository>;
type AlbumRepo = ReturnType<typeof createMerchantAlbumRepository>;

export function createCategoryUseCases(deps: { categories: CatRepo; albums: AlbumRepo }) {
  const lock = createExclusive();

  return {
    isBusy: lock.isBusy,

    async loadParents(context: RequestContext, shopId: number): Promise<{ ok: true; list: MerchantCategory[] } | FlowFail> {
      if (!isPositiveId(shopId)) return { ok: false, kind: "validation", message: "请先选择系列" };
      const r = await deps.categories.listParents(context, shopId);
      if (!r.ok) return failFrom(r.error, "分类加载失败，请重试");
      return { ok: true, list: sortCategories(r.value) };
    },

    async loadSubs(context: RequestContext, parentId: number): Promise<{ ok: true; list: MerchantCategory[] } | FlowFail> {
      if (!isPositiveId(parentId)) return { ok: false, kind: "validation", message: "请先选择一级分类" };
      const r = await deps.categories.listSubs(context, parentId);
      if (!r.ok) return failFrom(r.error, "子分类加载失败，请重试");
      return { ok: true, list: sortCategories(r.value) };
    },

    createParent(context: RequestContext, input: { shopId: number; name: string; sortOrder: string | number }) {
      return lock.run<{ ok: true; category: MerchantCategory }>(async () => {
        const v = validateNewParent(input);
        if (!v.ok) return { ok: false, kind: "validation", message: v.error.message };
        const r = await deps.categories.createParent(context, v.body);
        if (!r.ok) return failFrom(r.error, "新增分类失败，请重试"); // 同名冲突：后端文案原样
        return { ok: true, category: r.value };
      });
    },

    createSub(context: RequestContext, input: { parentId: number; name: string; sortOrder: string | number }) {
      return lock.run<{ ok: true; category: MerchantCategory }>(async () => {
        const v = validateNewSub(input);
        if (!v.ok) return { ok: false, kind: "validation", message: v.error.message };
        const r = await deps.categories.createSub(context, v.body);
        if (!r.ok) return failFrom(r.error, "新增子分类失败，请重试");
        return { ok: true, category: r.value };
      });
    },

    /** 改名/改排序；二级需带原 parentId（后端必填，本期不做移动） */
    edit(context: RequestContext, target: MerchantCategory, input: { name: string; sortOrder: string | number }) {
      return lock.run<{ ok: true; category: MerchantCategory }>(async () => {
        if (!isPositiveId(target.id)) return { ok: false, kind: "validation", message: "分类不存在" };
        const v = validateEditCategory(input);
        if (!v.ok) return { ok: false, kind: "validation", message: v.error.message };
        if (v.name === target.name && v.sortOrder === target.sortOrder) return { ok: false, kind: "validation", message: "没有需要修改的内容" };
        if (target.depth === 2) {
          if (!isPositiveId(target.parentId)) return { ok: false, kind: "validation", message: "子分类数据异常，请刷新后重试" };
          const r = await deps.categories.updateSub(context, target.id, { parentId: target.parentId, name: v.name, sortOrder: v.sortOrder });
          if (!r.ok) return failFrom(r.error, "修改失败，请重试");
          return { ok: true, category: r.value };
        }
        const r = await deps.categories.updateParent(context, target.id, { name: v.name, sortOrder: v.sortOrder });
        if (!r.ok) return failFrom(r.error, "修改失败，请重试");
        return { ok: true, category: r.value };
      });
    },

    /**
     * 删除前统计关联数（后端无关联校验、无关联数接口）：
     *   · 一级：子分类数（get-by-parent）+ 每个子分类下的相册数（相册列表 child_id）；
     *   · 二级：该二级下的相册数。
     * **任何一次统计失败都整体失败（fail-closed）**——拿不到真实规模就不允许进入删除确认，避免「不知道删多少」。
     */
    async measureImpact(context: RequestContext, target: MerchantCategory, shopId: number): Promise<{ ok: true; impact: CascadeImpact } | FlowFail> {
      if (!isPositiveId(shopId)) return { ok: false, kind: "validation", message: "请先选择系列" };
      if (target.depth === 2) {
        const r = await deps.albums.list(context, { shopId, childId: target.id });
        if (!r.ok) return failFrom(r.error, "无法统计关联相册，已取消删除");
        return { ok: true, impact: { subCount: 0, albumCount: r.value.length } };
      }
      const subs = await deps.categories.listSubs(context, target.id);
      if (!subs.ok) return failFrom(subs.error, "无法统计关联子分类，已取消删除");
      const counts: number[] = [];
      for (const s of subs.value) {
        const a = await deps.albums.list(context, { shopId, childId: s.id });
        if (!a.ok) return failFrom(a.error, "无法统计关联相册，已取消删除");
        counts.push(a.value.length);
      }
      return { ok: true, impact: summarizeParentImpact(counts) };
    },

    /** 执行删除（调用方须已完成两次确认）；权限不足/参数非法不发请求 */
    remove(context: RequestContext, profile: Pick<MerchantProfile, "permissions"> | null, target: MerchantCategory, shopId: number) {
      return lock.run<{ ok: true }>(async () => {
        if (!hasPermission(profile, PERM.category)) return { ok: false, kind: "failed", message: "无权限执行此操作" };
        if (!isPositiveId(target.id) || !isPositiveId(shopId)) return { ok: false, kind: "validation", message: "参数不合法" };
        const r = target.depth === 2 ? await deps.categories.deleteSub(context, target.id) : await deps.categories.deleteParent(context, target.id, shopId);
        if (!r.ok) return failFrom(r.error, "删除失败，请重试");
        return { ok: true };
      });
    },
  };
}
