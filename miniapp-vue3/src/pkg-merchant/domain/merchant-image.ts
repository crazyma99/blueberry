// 商家端相册图片：纯逻辑（规整 / 排序换位 / 试衣状态 / 选择态）· issue #14 M2。**纯函数**，无平台依赖。
//
// 后端事实（只读核对 photoalbum.go）：
//   · 图片列表 GET /photo-albums/albums/get?albumId=&shopId= → AlbumImage[]（按 sortOrder 升序；字段 id、shopId、albumId、imageUrl、sortOrder、
//     aiTryonStatus 0=已隐藏(含未判定/API 错误) 1=可展示、aiTryonReason、aiTryonManual、aiTryonCheckedAt）；
//   · 排序 PUT /photo-albums/albums/sort?shopId= body 为数组 [{id,sortOrder}]：**无效项静默跳过**（id 不存在/不属于该 shop），始终返回成功 ⇒
//     提交后以刷新结果为准；
//   · 上传后异步打标（百度 V3），**新图 aiTryonStatus 初始 0** ⇒ 试衣开关 UI 必须容忍「刚上传显示隐藏、稍后变可展示」；
//   · 试衣开关 PUT /photo-albums/albums/:id/tryon-status?shopId= body {status:0|1}（后端原为 PATCH，另增 PUT 别名；小程序侧只发 PUT），人工覆盖后系统重判不覆盖。
import { cosThumb } from "../../application/image";

export interface MerchantImage {
  id: number;
  albumId: number;
  imageUrl: string;
  sortOrder: number;
  /** 1 可展示 / 0 已隐藏（含未判定） */
  aiTryonStatus: number;
  aiTryonReason: string;
  /** 1＝商家人工设置过（系统重判不覆盖） */
  aiTryonManual: number;
}

function toInt(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
}
function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function normalizeImage(raw: unknown): MerchantImage {
  const i = (raw ?? {}) as Record<string, unknown>;
  return {
    id: toInt(i.id),
    albumId: toInt(i.albumId),
    imageUrl: toStr(i.imageUrl),
    sortOrder: toInt(i.sortOrder),
    aiTryonStatus: toInt(i.aiTryonStatus) === 1 ? 1 : 0,
    aiTryonReason: toStr(i.aiTryonReason),
    aiTryonManual: toInt(i.aiTryonManual) === 1 ? 1 : 0,
  };
}

/** 网格缩略图（经 cosThumb 收口到 CDN 域） */
export function imageThumb(url: string, width = 300): string {
  return url.trim() === "" ? "" : cosThumb(url, width);
}

/** 按 sortOrder 升序、同序按 id（后端已排好；客户端再稳定排一次，不改入参） */
export function sortImages<T extends Pick<MerchantImage, "id" | "sortOrder">>(list: readonly T[]): T[] {
  return list.slice().sort((a, b) => (a.sortOrder === b.sortOrder ? a.id - b.id : a.sortOrder - b.sortOrder));
}

export type MoveDirection = "up" | "down";

/** 能否移动：首张不能上移、末张不能下移；id 不在列表里不能移 */
export function canMove(list: readonly Pick<MerchantImage, "id">[], id: number, dir: MoveDirection): boolean {
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return false;
  return dir === "up" ? i > 0 : i < list.length - 1;
}

/**
 * 上/下移一位后，生成要提交的排序体：**对整个相册重新连号**（0..n-1），而不只交换两张。
 * 原因：后端上传时 sortOrder = maxSort+1，历史数据里可能出现重复/断号（并发上传、手工改库），只交换两个值在重复值下不能产生确定顺序。
 * 重新连号后顺序唯一确定。返回 null＝无法移动。
 */
export function planMove(list: readonly Pick<MerchantImage, "id">[], id: number, dir: MoveDirection): Array<{ id: number; sortOrder: number }> | null {
  if (!canMove(list, id, dir)) return null;
  const ids = list.map((x) => x.id);
  const i = ids.indexOf(id);
  const j = dir === "up" ? i - 1 : i + 1;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids.map((x, idx) => ({ id: x, sortOrder: idx }));
}

/** 提交后核对：刷新结果的 id 顺序是否等于预期顺序（无效项静默跳过 ⇒ 不能只信 code=200） */
export function orderMatches(actual: readonly Pick<MerchantImage, "id">[], plan: ReadonlyArray<{ id: number; sortOrder: number }>): boolean {
  const expected = plan.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.id);
  if (actual.length !== expected.length) return false;
  return actual.every((a, i) => a.id === expected[i]);
}

/** 试衣状态展示：manual=1 人工；status=1 可展示；0 且无人工 ⇒ 「待判定/已隐藏」（新图上传后异步打标，容忍） */
export function describeTryon(img: Pick<MerchantImage, "aiTryonStatus" | "aiTryonManual">): { label: string; on: boolean } {
  if (img.aiTryonStatus === 1) return { label: "试衣可用", on: true };
  return { label: img.aiTryonManual === 1 ? "试衣已关闭" : "试衣未启用", on: false };
}

/** 单图试衣开关目标值 */
export function nextTryonStatus(img: Pick<MerchantImage, "aiTryonStatus">): 0 | 1 {
  return img.aiTryonStatus === 1 ? 0 : 1;
}

// ——— 选择态（批量删除）———
export function toggleSelected(selected: readonly number[], id: number): number[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}
/** 只保留仍存在于列表中的选中项（刷新后被删/不存在的自动剔除） */
export function pruneSelected(selected: readonly number[], list: readonly Pick<MerchantImage, "id">[]): number[] {
  const alive = new Set(list.map((x) => x.id));
  return selected.filter((x) => alive.has(x));
}

/** 批量删除的确认文案（单张/多张） */
export function describeImageDelete(count: number): { title: string; msg: string } {
  return count <= 1
    ? { title: "删除图片", msg: "确认删除这张图片吗？删除后无法恢复。" }
    : { title: "批量删除图片", msg: `确认删除选中的 ${count} 张图片吗？删除后无法恢复。` };
}
