// 商家端分类管理：纯逻辑（校验/排序/关联统计文案/强确认文案）· issue #14 M2。**纯函数**，无平台依赖。
//
// 后端契约（只读核对 lanmei-backend-golang `internal/admin/handler/category.go`、`routes.go`；权限键 category）：
//   · 分类挂在 **shopId（「系列」）** 下，不是 merchant 下 ⇒ 先用登录响应 shopList 选 shop；
//   · 一级：GET /shop/parent/list?shopId=；POST /shop/parent/create（body：name、sortOrder、shopId；后端强制 depth=1）；
//     PUT /shop/parent/update?id=（body：name、sortOrder；shop 以库内为准）；DELETE /shop/parent/delete?id=&shopId=；
//   · 二级：GET /shop/sub/get-by-parent?parentId=；POST /shop/sub/create（body：name、sortOrder、parentId；shop 取父分类）；
//     PUT /shop/sub/update?id=（body：name、sortOrder、**parentId 必填**——不传会报「parentId 不能为空」）；DELETE /shop/sub/delete?id=；
//   · ⚠️ **不要用 GET /shop/sub/list**：返回裸数组（无 {code,message,data} 信封）且 N+1；
//   · 字段：id、name、sortOrder、shopId、parentId、depth(1/2)，**无封面图**；
//   · 同名：一级在 shop 内、二级在父分类内——冲突返回业务错误，message 友好展示；
//   · ⚠️ 创建时 shopId 为空会被 CheckShopPermission(0) 放行 ⇒ 无归属脏分类 ⇒ 前端必须始终带 shopId 且本地校验 >0；
//   · ⚠️ 删除是**级联**：一级 ⇒ 子分类 + 其下相册 + 图片；二级 ⇒ 其下相册 + 图片；后端**无关联校验**、无关联数接口 ⇒
//     商家端删除前先统计关联数并在确认框明示，需两次确认。
import { isPositiveId } from "./merchant-http";

export const CATEGORY_NAME_MAX = 50;
export const CATEGORY_SORT_MIN = 0;
export const CATEGORY_SORT_MAX = 9999;

export interface MerchantCategory {
  id: number;
  name: string;
  sortOrder: number;
  shopId: number;
  /** 二级才有；一级为 0 */
  parentId: number;
  depth: 1 | 2;
}

function toInt(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
}
function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** 规整后端分类：缺字段安全默认；depth 只认 1/2（其它按 id 所在接口决定，由调用方传入 fallbackDepth） */
export function normalizeCategory(raw: unknown, fallbackDepth: 1 | 2): MerchantCategory {
  const c = (raw ?? {}) as Record<string, unknown>;
  const depth = c.depth === 2 ? 2 : c.depth === 1 ? 1 : fallbackDepth;
  return { id: toInt(c.id), name: toStr(c.name), sortOrder: toInt(c.sortOrder), shopId: toInt(c.shopId), parentId: toInt(c.parentId), depth };
}

/** 排序：sortOrder 升序，同序按 id 升序（稳定，不改入参） */
export function sortCategories<T extends Pick<MerchantCategory, "id" | "sortOrder">>(list: readonly T[]): T[] {
  return list.slice().sort((a, b) => (a.sortOrder === b.sortOrder ? a.id - b.id : a.sortOrder - b.sortOrder));
}

export type CategoryFormError = { field: "name" | "sortOrder" | "shopId" | "parentId"; message: string };

/** 解析排序号输入：纯数字串（0..9999）；空串视为 0 */
export function parseSortOrder(raw: string | number): number | null {
  if (typeof raw === "number") return Number.isInteger(raw) && raw >= CATEGORY_SORT_MIN && raw <= CATEGORY_SORT_MAX ? raw : null;
  const t = String(raw).trim();
  if (t === "") return 0;
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = Number.parseInt(t, 10);
  return n >= CATEGORY_SORT_MIN && n <= CATEGORY_SORT_MAX ? n : null;
}

/** 名称：去首尾空白，非空，≤50 字（按码点计，避免 emoji 被拆） */
export function validateCategoryName(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const v = raw.trim();
  if (v === "") return { ok: false, message: "请输入分类名称" };
  if ([...v].length > CATEGORY_NAME_MAX) return { ok: false, message: `分类名称不能超过 ${CATEGORY_NAME_MAX} 个字` };
  return { ok: true, value: v };
}

/** 新建一级分类表单校验：shopId 必须 >0（防无归属脏分类） */
export function validateNewParent(input: { shopId: number; name: string; sortOrder: string | number }):
  | { ok: true; body: { shopId: number; name: string; sortOrder: number } }
  | { ok: false; error: CategoryFormError } {
  if (!isPositiveId(input.shopId)) return { ok: false, error: { field: "shopId", message: "请先选择系列" } };
  const n = validateCategoryName(input.name);
  if (!n.ok) return { ok: false, error: { field: "name", message: n.message } };
  const s = parseSortOrder(input.sortOrder);
  if (s == null) return { ok: false, error: { field: "sortOrder", message: `排序号需为 ${CATEGORY_SORT_MIN}-${CATEGORY_SORT_MAX} 的整数` } };
  return { ok: true, body: { shopId: input.shopId, name: n.value, sortOrder: s } };
}

/** 新建二级分类：parentId 必须 >0；shopId 不由客户端传（后端取父分类） */
export function validateNewSub(input: { parentId: number; name: string; sortOrder: string | number }):
  | { ok: true; body: { parentId: number; name: string; sortOrder: number } }
  | { ok: false; error: CategoryFormError } {
  if (!isPositiveId(input.parentId)) return { ok: false, error: { field: "parentId", message: "请先选择一级分类" } };
  const n = validateCategoryName(input.name);
  if (!n.ok) return { ok: false, error: { field: "name", message: n.message } };
  const s = parseSortOrder(input.sortOrder);
  if (s == null) return { ok: false, error: { field: "sortOrder", message: `排序号需为 ${CATEGORY_SORT_MIN}-${CATEGORY_SORT_MAX} 的整数` } };
  return { ok: true, body: { parentId: input.parentId, name: n.value, sortOrder: s } };
}

/** 改名/改排序：只校验字段，二级更新需带 parentId（后端必填） */
export function validateEditCategory(input: { name: string; sortOrder: string | number }):
  | { ok: true; name: string; sortOrder: number }
  | { ok: false; error: CategoryFormError } {
  const n = validateCategoryName(input.name);
  if (!n.ok) return { ok: false, error: { field: "name", message: n.message } };
  const s = parseSortOrder(input.sortOrder);
  if (s == null) return { ok: false, error: { field: "sortOrder", message: `排序号需为 ${CATEGORY_SORT_MIN}-${CATEGORY_SORT_MAX} 的整数` } };
  return { ok: true, name: n.value, sortOrder: s };
}

// ——— 删除关联统计与强确认文案 ———
export interface CascadeImpact {
  /** 将被级联删除的子分类数（删一级才有） */
  subCount: number;
  /** 将被级联删除的相册数 */
  albumCount: number;
}

/** 汇总：把各子分类下的相册数累加（子分类数 = 传入的子分类个数） */
export function summarizeParentImpact(subAlbumCounts: readonly number[]): CascadeImpact {
  return { subCount: subAlbumCounts.length, albumCount: subAlbumCounts.reduce((s, n) => s + (Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0), 0) };
}

/** 第一次确认框正文：明示级联规模与不可恢复（删一级写子分类+相册，删二级只写相册） */
export function describeDeleteImpact(kind: "parent" | "sub", name: string, impact: CascadeImpact): { title: string; msg: string } {
  const parts: string[] = [];
  if (kind === "parent") parts.push(`${impact.subCount} 个子分类`);
  parts.push(`${impact.albumCount} 个相册`);
  const scope = parts.join(" / ");
  return {
    title: kind === "parent" ? "删除一级分类" : "删除二级分类",
    msg: `删除「${name}」将同时删除 ${scope}及其全部图片，不可恢复。`,
  };
}

/** 第二次（最终）确认框：再次点名对象，避免手滑连点 */
export function describeFinalConfirm(name: string, impact: CascadeImpact): { title: string; msg: string } {
  const heavy = impact.albumCount > 0 || impact.subCount > 0;
  return {
    title: "再次确认删除",
    msg: heavy ? `真的要删除「${name}」吗？关联的相册和图片将被永久删除，无法找回。` : `确认删除「${name}」吗？`,
  };
}
