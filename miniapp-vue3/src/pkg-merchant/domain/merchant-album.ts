// 商家端相册：纯逻辑（规整/校验/分段渲染/强确认文案）· issue #14 M2。**纯函数**，无平台依赖。
//
// 后端契约（只读核对 lanmei-backend-golang `internal/admin/handler/photoalbum.go`、`routes.go`；权限键 album）：
//   ⚠️ shopId 参数名**各接口不统一**，按各 handler 实际读取处：
//     · 列表 GET /photo-albums/photo?shop_id=&parent_id=&child_id=&keyword=   （query `shop_id`；**无分页**，全量返回）
//     · 新建 POST /photo-albums/add-photo?shop_id=                            （query `shop_id`；body JSON）
//     · 修改 PUT  /photo-albums/update/:id?shopId=                             （query **`shopId`**；body JSON；⚠️ 整条 Save：body 里未带的字段会被清零）
//     · 删除 DELETE /photo-albums/delete/:albumId?shop_id=                     （query `shop_id`；**级联**删 COS 文件、图片、AI 模板）
//     · 封面 POST /photo-albums/upload-cover  multipart：表单字段 `shopId`、文件字段 `file`；返回 data.image_url
//     · 图片列表 GET /photo-albums/albums/get?albumId=&shopId=
//     · 图片排序 PUT /photo-albums/albums/sort?shopId=  body 数组 [{id,sortOrder}]（无效项**静默跳过**）
//     · 图片删除 DELETE /photo-albums/albums/delete/:id?shopId=              （对不存在/无权**静默返回成功**）
//     · 试衣开关 PUT  /photo-albums/albums/:id/tryon-status?shopId=  body {status:0|1}（后端另有 PATCH 原路由；小程序只发 PUT）
//   · 详情 GET /photo-albums/:id 恒返回 data:null（后端历史 bug）⇒ **不使用**，相册信息取自列表项；
//   · 列表项：id、shopId、childId、title、coverImageUrl、price（decimal，JSON 为字符串）、packageDesc、aiDesc、sortOrder、
//     tryonDisabled、tryonCount、childName、parentId、createTime、updateTime；
//   · ⚠️ UpdateAlbumHandler 用整条 `Save(&a)`（只设 ID/ShopID）：**修改时必须带齐全部可编辑字段**（childId、title、coverImageUrl、price、
//     packageDesc、aiDesc、sortOrder），否则漏带的字段会被写成零值（相册被移出分类、封面/价格被清空）——所以更新体以「原值 + 变更」合成。
//   · 新建：必填由业务判定——title 非空、childId>0（相册必须挂二级分类）；coverImageUrl 可空；price<0 后端修正为 0。
import { cosThumb } from "../../application/image";
import { isPositiveId } from "./merchant-http";

export const ALBUM_TITLE_MAX = 100;
export const ALBUM_DESC_MAX = 500;
export const ALBUM_PRICE_MAX_FEN = 99_999_999; // 999,999.99 元，防 decimal(10,2) 溢出
export const ALBUM_PAGE_STEP = 20;

export interface MerchantAlbum {
  id: number;
  shopId: number;
  childId: number;
  parentId: number;
  childName: string;
  title: string;
  coverImageUrl: string;
  /** 价格（元，字符串原样；展示/编辑用） */
  price: string;
  packageDesc: string;
  aiDesc: string;
  sortOrder: number;
  tryonCount: number;
}

function toInt(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
}
function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}
/** decimal 序列化可能是字符串或数字；规整成「元」字符串，非法 ⇒ "0" */
function toPriceStr(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return v.trim();
  return "0";
}

export function normalizeAlbum(raw: unknown): MerchantAlbum {
  const a = (raw ?? {}) as Record<string, unknown>;
  return {
    id: toInt(a.id),
    shopId: toInt(a.shopId),
    childId: toInt(a.childId),
    parentId: toInt(a.parentId),
    childName: toStr(a.childName),
    title: toStr(a.title),
    coverImageUrl: toStr(a.coverImageUrl),
    price: toPriceStr(a.price),
    packageDesc: toStr(a.packageDesc),
    aiDesc: toStr(a.aiDesc),
    sortOrder: toInt(a.sortOrder),
    tryonCount: toInt(a.tryonCount),
  };
}

/** 封面缩略图（经 cosThumb 收口到 CDN 域；空封面返回空串，页面显示占位） */
export function albumCoverThumb(url: string, width = 400): string {
  return url.trim() === "" ? "" : cosThumb(url, width);
}

/** 客户端分段渲染：后端列表无分页，每次多显示 step 条；返回应渲染的切片与是否还有更多 */
export function sliceVisible<T>(all: readonly T[], visibleCount: number): { items: T[]; hasMore: boolean } {
  const n = Math.max(0, Math.trunc(Number.isFinite(visibleCount) ? visibleCount : 0));
  return { items: all.slice(0, n), hasMore: all.length > n };
}
export function nextVisibleCount(current: number, total: number, step = ALBUM_PAGE_STEP): number {
  return Math.min(total, Math.max(0, current) + step);
}

/** 价格输入（元）→ 规范化字符串：非负、最多 2 位小数、≤ 999999.99；空串视为 "0" */
export function parsePriceYuan(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const t = raw.trim();
  if (t === "") return { ok: true, value: "0" };
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return { ok: false, message: "价格需为非负数，最多 2 位小数" };
  const fen = Math.round(Number(t) * 100);
  if (fen > ALBUM_PRICE_MAX_FEN) return { ok: false, message: "价格超出范围" };
  return { ok: true, value: String(Number(t)) };
}

export interface AlbumForm {
  title: string;
  childId: number;
  coverImageUrl: string;
  price: string;
  packageDesc: string;
  aiDesc: string;
  sortOrder: number;
}

export type AlbumFormError = { field: "title" | "childId" | "price" | "packageDesc" | "aiDesc"; message: string };

export function validateAlbumForm(input: {
  title: string;
  childId: number;
  coverImageUrl: string;
  price: string;
  packageDesc: string;
  aiDesc: string;
  sortOrder: number;
}): { ok: true; form: AlbumForm } | { ok: false; error: AlbumFormError } {
  const title = input.title.trim();
  if (title === "") return { ok: false, error: { field: "title", message: "请输入相册名称" } };
  if ([...title].length > ALBUM_TITLE_MAX) return { ok: false, error: { field: "title", message: `相册名称不能超过 ${ALBUM_TITLE_MAX} 个字` } };
  if (!isPositiveId(input.childId)) return { ok: false, error: { field: "childId", message: "请选择所属二级分类" } };
  const price = parsePriceYuan(input.price);
  if (!price.ok) return { ok: false, error: { field: "price", message: price.message } };
  if ([...input.packageDesc].length > ALBUM_DESC_MAX) return { ok: false, error: { field: "packageDesc", message: `套餐说明不能超过 ${ALBUM_DESC_MAX} 个字` } };
  if ([...input.aiDesc].length > ALBUM_DESC_MAX) return { ok: false, error: { field: "aiDesc", message: `AI 描述不能超过 ${ALBUM_DESC_MAX} 个字` } };
  return {
    ok: true,
    form: { title, childId: input.childId, coverImageUrl: input.coverImageUrl.trim(), price: price.value, packageDesc: input.packageDesc, aiDesc: input.aiDesc, sortOrder: toInt(input.sortOrder) },
  };
}

/**
 * 修改相册的请求体：以**原相册全部字段**为底，叠加表单里的变更（整条 Save 会清零漏带字段，见头注释）。
 * 保证 aiDesc / sortOrder / packageDesc 等本期页面不编辑的字段**原样带回**，不被清空。
 */
export function mergeAlbumUpdate(original: MerchantAlbum, changes: Partial<Pick<AlbumForm, "title" | "childId" | "coverImageUrl" | "price" | "packageDesc">>): AlbumForm {
  return {
    title: changes.title ?? original.title,
    childId: changes.childId ?? original.childId,
    coverImageUrl: changes.coverImageUrl ?? original.coverImageUrl,
    price: changes.price ?? original.price,
    packageDesc: changes.packageDesc ?? original.packageDesc,
    aiDesc: original.aiDesc,
    sortOrder: original.sortOrder,
  };
}

/** 相册删除确认文案（第一次：明示级联到图片数；图片数未知时写「全部图片」） */
export function describeAlbumDelete(title: string, imageCount: number | null): { title: string; msg: string } {
  const n = imageCount == null ? "全部" : `${imageCount} 张`;
  return { title: "删除相册", msg: `删除相册「${title}」将同时删除其中${n}图片和 AI 试衣模板，云端文件一并清除，不可恢复。` };
}
export function describeAlbumFinalConfirm(title: string): { title: string; msg: string } {
  return { title: "再次确认删除", msg: `真的要删除相册「${title}」吗？图片将被永久删除，无法找回。` };
}
