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
