// 商家端相册用例（issue #14 · M2）：列表 / 新建 / 修改 / 删除（先统计图片数）。
// 修改一律「原值 + 变更」合成全量 body（后端整条 Save，漏带字段会被清零，见 domain/merchant-album.ts）。
// 删除前统计图片数：图片列表接口 GET /photo-albums/albums/get；统计失败整体拦下（fail-closed）。
// 写操作串行；缺 album 权限/参数非法不发请求。
import type { RequestContext } from "../../ports/context";
import type { createMerchantAlbumRepository } from "../infrastructure/merchant-albums";
import type { createMerchantImageRepository } from "../infrastructure/merchant-images";
import { mergeAlbumUpdate, validateAlbumForm, type MerchantAlbum } from "../domain/merchant-album";
import { isPositiveId } from "../domain/merchant-http";
import { hasPermission, PERM, type MerchantProfile } from "../domain/merchant-auth";
import { createExclusive, failFrom, type FlowFail } from "./merchant-flow-common";

type AlbumRepo = ReturnType<typeof createMerchantAlbumRepository>;
type ImageRepo = ReturnType<typeof createMerchantImageRepository>;

type FormInput = { title: string; childId: number; coverImageUrl: string; price: string; packageDesc: string; aiDesc: string; sortOrder: number };

export function createAlbumUseCases(deps: { albums: AlbumRepo; images: ImageRepo }) {
  const lock = createExclusive();
  const denied = (profile: Pick<MerchantProfile, "permissions"> | null): FlowFail | null =>
    hasPermission(profile, PERM.album) ? null : { ok: false, kind: "failed", message: "无权限执行此操作" };

  return {
    isBusy: lock.isBusy,

    async load(context: RequestContext, args: { shopId: number; parentId?: number; childId?: number; keyword?: string }): Promise<{ ok: true; list: MerchantAlbum[] } | FlowFail> {
      if (!isPositiveId(args.shopId)) return { ok: false, kind: "validation", message: "请先选择系列" };
      const r = await deps.albums.list(context, args);
      if (!r.ok) return failFrom(r.error, "相册加载失败，请重试");
      return { ok: true, list: r.value };
    },

    create(context: RequestContext, profile: Pick<MerchantProfile, "permissions"> | null, shopId: number, input: FormInput) {
      return lock.run<{ ok: true; album: MerchantAlbum }>(async () => {
        const d = denied(profile);
        if (d) return d;
        if (!isPositiveId(shopId)) return { ok: false, kind: "validation", message: "请先选择系列" };
        const v = validateAlbumForm(input);
        if (!v.ok) return { ok: false, kind: "validation", message: v.error.message };
        const r = await deps.albums.create(context, shopId, v.form);
        if (!r.ok) return failFrom(r.error, "新建相册失败，请重试");
        return { ok: true, album: r.value };
      });
    },

    /** 修改：changes 只含变更项，其余字段取自原相册（本期不编辑的 aiDesc/sortOrder 原样带回） */
    update(
      context: RequestContext,
      profile: Pick<MerchantProfile, "permissions"> | null,
      shopId: number,
      original: MerchantAlbum,
      changes: Partial<Pick<FormInput, "title" | "childId" | "coverImageUrl" | "price" | "packageDesc">>,
    ) {
      return lock.run<{ ok: true; album: MerchantAlbum }>(async () => {
        const d = denied(profile);
        if (d) return d;
        if (!isPositiveId(shopId) || !isPositiveId(original.id)) return { ok: false, kind: "validation", message: "参数不合法" };
        const merged = mergeAlbumUpdate(original, changes);
        const v = validateAlbumForm(merged);
        if (!v.ok) return { ok: false, kind: "validation", message: v.error.message };
        const r = await deps.albums.update(context, shopId, original.id, v.form);
        if (!r.ok) return failFrom(r.error, "保存失败，请重试");
        return { ok: true, album: r.value };
      });
    },

    /** 删除前统计图片数（失败 fail-closed） */
    async measureImages(context: RequestContext, shopId: number, albumId: number): Promise<{ ok: true; count: number } | FlowFail> {
      if (!isPositiveId(shopId) || !isPositiveId(albumId)) return { ok: false, kind: "validation", message: "参数不合法" };
      const r = await deps.images.list(context, shopId, albumId);
      if (!r.ok) return failFrom(r.error, "无法统计相册图片，已取消删除");
      return { ok: true, count: r.value.length };
    },

    /** 执行删除（调用方须已完成两次确认） */
    remove(context: RequestContext, profile: Pick<MerchantProfile, "permissions"> | null, shopId: number, albumId: number) {
      return lock.run<{ ok: true }>(async () => {
        const d = denied(profile);
        if (d) return d;
        if (!isPositiveId(shopId) || !isPositiveId(albumId)) return { ok: false, kind: "validation", message: "参数不合法" };
        const r = await deps.albums.remove(context, shopId, albumId);
        if (!r.ok) return failFrom(r.error, "删除失败，请重试");
        return { ok: true };
      });
    },
  };
}
