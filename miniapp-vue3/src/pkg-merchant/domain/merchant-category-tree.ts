// 相册页的分类筛选/选择项（issue #14 · M2）：把「一级 → 二级」展开成 BasePicker 可用的扁平选项。纯函数。
// 相册必须挂在**二级分类**下（后端 child_id 必填>0）；列表筛选可选「全部 / 某一级下全部 / 某二级」。
import type { MerchantCategory } from "./merchant-category";

export interface CategoryTreeNode {
  parent: MerchantCategory;
  subs: MerchantCategory[];
}

/** 构建树：subsByParent 以一级 id 为键；一级按 sortOrder 排 */
export function buildCategoryTree(parents: readonly MerchantCategory[], subsByParent: Readonly<Record<number, readonly MerchantCategory[]>>): CategoryTreeNode[] {
  return parents
    .slice()
    .sort((a, b) => (a.sortOrder === b.sortOrder ? a.id - b.id : a.sortOrder - b.sortOrder))
    .map((p) => ({ parent: p, subs: (subsByParent[p.id] ?? []).slice().sort((a, b) => (a.sortOrder === b.sortOrder ? a.id - b.id : a.sortOrder - b.sortOrder)) }));
}

export interface PickOption {
  label: string;
  /** 二级分类 id */
  value: number;
}

/** 新建/改相册时可选的二级分类（label＝「一级 / 二级」） */
export function subCategoryOptions(tree: readonly CategoryTreeNode[]): PickOption[] {
  const out: PickOption[] = [];
  for (const n of tree) for (const s of n.subs) out.push({ label: `${n.parent.name} / ${s.name}`, value: s.id });
  return out;
}

/** 列表筛选项：全部 + 每个二级；用 value 编码（0=全部，正数=二级 id） */
export function filterOptions(tree: readonly CategoryTreeNode[]): PickOption[] {
  return [{ label: "全部分类", value: 0 }, ...subCategoryOptions(tree)];
}

export function labelOfSub(tree: readonly CategoryTreeNode[], subId: number): string {
  return subCategoryOptions(tree).find((o) => o.value === subId)?.label ?? "";
}

// —— 级联（一级 → 二级）选择器用（issue #14 · m2b 真机：分类选择应为级联）——
// 节点形状与 ui/picker-util 的 PickerOption 一致（{label,value,children?}）；叶子（二级）无 children。
export interface CascadeNode {
  label: string;
  value: number;
  children?: CascadeNode[];
}

/** 新建/改相册的所属分类：一级 → 二级。**没有二级的一级不出现**（相册必须挂二级，后端 child_id 必填>0） */
export function cascadeSubOptions(tree: readonly CategoryTreeNode[]): CascadeNode[] {
  return tree.filter((n) => n.subs.length > 0).map((n) => ({ label: n.parent.name, value: n.parent.id, children: n.subs.map((s) => ({ label: s.name, value: s.id })) }));
}

/** 列表筛选：顶部「全部分类」(值 0、无下级) + 一级 → 二级 */
export function cascadeFilterOptions(tree: readonly CategoryTreeNode[]): CascadeNode[] {
  return [{ label: "全部分类", value: 0, children: [] }, ...cascadeSubOptions(tree)];
}

/** 二级 id → 级联路径 [一级id, 二级id]；0 或找不到 ⇒ []（选择器自行补全默认路径） */
export function cascadePathOfSub(tree: readonly CategoryTreeNode[], subId: number): number[] {
  if (!(subId > 0)) return [];
  for (const n of tree) if (n.subs.some((s) => s.id === subId)) return [n.parent.id, subId];
  return [];
}

/** 级联选择器 confirm 的值数组 → 二级 id：取最后一项；「全部分类」(值 [0]) ⇒ 0；非法 ⇒ null */
export function subIdFromCascadeValue(v: readonly (string | number)[]): number | null {
  if (v.length === 0) return null;
  const n = Number(v[v.length - 1]);
  if (!Number.isFinite(n) || n < 0) return null;
  // 只有一级被选且它不是「全部」：说明该一级没有二级（不应出现在选项里），视为非法
  if (v.length === 1 && n > 0) return null;
  return n;
}
