// 新建相册「先选照片、可选封面、一次保存」（issue #14 · m2b 真机批次 3）的纯逻辑。**纯函数**，无平台依赖。
// 对齐后台 admin-web `Albums.tsx` 新建模式（只读参照）：选多张图（addFiles），**第一张默认为封面**，点击某图可设为封面，可移除某张；
// 封面可选——一张都不选也允许创建空相册（后端 AddAlbumHandler 只要求 shop_id/title/childId，封面与图片都不强制）。
// 不选封面时默认用第一张图作封面（主人 2026-11 确认，与后台一致）。
import { MERCHANT_UPLOAD_MAX_QUEUE } from "./merchant-upload";

/** 新建时最多选多少张（含封面）：与上传队列上限同源（MERCHANT_UPLOAD_MAX_QUEUE=30），超出提示分批——创建后可在图片管理里继续补传 */
export const CREATE_PHOTO_MAX = MERCHANT_UPLOAD_MAX_QUEUE;

export interface CreatePhoto {
  /** 稳定 id（不依赖路径） */
  key: number;
  /** 本地临时路径（chooseMedia） */
  path: string;
  /** 原图字节数；0＝未知（压缩阶段按未知保守处理） */
  size: number;
}

export interface CreatePhotoState {
  photos: CreatePhoto[];
  /** 用户显式点选的封面 key；不在 photos 里（含从未选过 / 已被移除）⇒ 回退第一张 */
  coverKey: number | null;
  nextKey: number;
}

export const EMPTY_PHOTO_STATE: CreatePhotoState = { photos: [], coverKey: null, nextKey: 1 };

/** 追加选择结果：超出上限的截断并返回被丢弃数；同一路径不重复加入 */
export function addPhotos(s: CreatePhotoState, picked: ReadonlyArray<{ path: string; size: number }>): { state: CreatePhotoState; dropped: number } {
  const have = new Set(s.photos.map((p) => p.path));
  const fresh = picked.filter((p) => p.path !== "" && !have.has(p.path));
  const room = Math.max(0, CREATE_PHOTO_MAX - s.photos.length);
  const take = fresh.slice(0, room);
  const added: CreatePhoto[] = take.map((p, i) => ({ key: s.nextKey + i, path: p.path, size: Number.isFinite(p.size) && p.size > 0 ? Math.trunc(p.size) : 0 }));
  return { state: { photos: [...s.photos, ...added], coverKey: s.coverKey, nextKey: s.nextKey + added.length }, dropped: fresh.length - take.length };
}

/** 移除一张；若移除的是封面，封面自动回退到剩余的第一张（由 effectiveCoverKey 体现） */
export function removePhoto(s: CreatePhotoState, key: number): CreatePhotoState {
  return { ...s, photos: s.photos.filter((p) => p.key !== key), coverKey: s.coverKey === key ? null : s.coverKey };
}

/** 设为封面（未知 key 忽略） */
export function setCover(s: CreatePhotoState, key: number): CreatePhotoState {
  return s.photos.some((p) => p.key === key) ? { ...s, coverKey: key } : s;
}

/** 当前生效的封面 key：显式选择优先，否则第一张；没有照片 ⇒ null（创建无封面相册） */
export function effectiveCoverKey(s: CreatePhotoState): number | null {
  if (s.coverKey !== null && s.photos.some((p) => p.key === s.coverKey)) return s.coverKey;
  return s.photos.length > 0 ? s.photos[0].key : null;
}

/** 上传顺序：封面单独先传（用于创建相册），其余保持选择顺序 */
export function orderedForUpload(s: CreatePhotoState): { cover: CreatePhoto | null; others: CreatePhoto[] } {
  const ck = effectiveCoverKey(s);
  const cover = ck === null ? null : (s.photos.find((p) => p.key === ck) ?? null);
  return { cover, others: s.photos.filter((p) => p.key !== ck) };
}

export type CreatePhase = "compress" | "cover" | "create" | "upload";

/** 进度文案：「处理图片 第 N / 共 M 张」/「上传封面…」/「创建相册…」/「上传图片 第 N / 共 M 张」（封面算第 1 张） */
export function describeCreateProgress(phase: CreatePhase, index: number, total: number): string {
  const n = Math.max(0, Math.min(index, total));
  if (phase === "compress") return `处理图片 第 ${n} / 共 ${total} 张`;
  if (phase === "cover") return "上传封面…";
  if (phase === "create") return "创建相册…";
  return `上传图片 第 ${n} / 共 ${total} 张`;
}

/** 部分失败的提示文案（相册已创建；避免商家重复新建） */
export function describePartialFailure(title: string, failed: number, total: number): string {
  return `相册「${title}」已创建，但 ${failed} / ${total} 张图片上传失败。可点「重试失败项」，或稍后在该相册的图片管理中补传（请勿重复新建）。`;
}
