// 新建相册编排（issue #14 · m2b 真机批次 3）：**后台同款顺序**——
//   步骤0 先把**所有图片（含封面）串行严格压缩**，任一失败 ⇒ 整体中止（此时尚未上传任何东西、没有创建相册，零副作用）；
//   步骤1 上传封面（可选；不选封面时默认第一张）；
//   步骤2 创建相册（只发生一次；一旦成功，后续任何失败都不会再创建）；
//   步骤3 其余图片**串行**逐张上传（沿用 merchant-album-uploader：1 请求 1 张、条数核对、逐张进度、失败单张重试）。
// 串行依据：后端上传接口每请求先读 maxSort 再连号，并发会让 sortOrder 重复。
// 步骤3 部分失败 ⇒ outcome=partial（相册已创建，失败项保留在 uploader 里供「重试失败项」或引导去详情页补传），**绝不重复创建相册**。
// 纯编排：全部依赖注入（压缩/封面上传/创建/上传器工厂），便于单测。
import type { ImageCompressPort } from "../../platform/weixin/image-compress";
import type { AlbumUploader } from "./merchant-album-uploader";
import type { CoverUploadResult } from "./merchant-cover-uploader";
import { validateAlbumForm } from "../domain/merchant-album";
import { COMPRESS_FAIL_TEXT, type UploadQueueItem } from "../domain/merchant-upload";
import { describeCreateProgress, describePartialFailure, orderedForUpload, type CreatePhase, type CreatePhotoState } from "../domain/merchant-album-create";
import { isPositiveId } from "../domain/merchant-http";

export interface CreateFormInput {
  title: string;
  childId: number;
  price: string;
  packageDesc: string;
}

export interface CreateProgress {
  phase: CreatePhase;
  /** 当前第几张（1 起；封面算第 1 张） */
  index: number;
  total: number;
  /** 总体进度 0-100（压缩与上传各占一半） */
  percent: number;
  text: string;
}

export type CreateOutcome =
  /** 全部成功（含「没选照片的空相册」） */
  | { status: "created"; albumId: number; title: string }
  /** 表单校验未通过（没有任何副作用） */
  | { status: "invalid"; message: string }
  /** 压缩失败（没有任何副作用：未上传、未创建） */
  | { status: "compress-failed"; index: number; message: string }
  /** 封面上传/创建相册失败（相册**未**创建；封面若已传成功会成为云端孤儿文件，同后台行为） */
  | { status: "failed"; stage: "cover" | "create"; message: string; authExpired: boolean; coverOrphan?: boolean }
  /** 用户在创建相册之前取消（零副作用或仅有孤儿封面；coverOrphan＝封面已上传但相册未建，云端留有未使用的封面文件，与后台行为一致） */
  | { status: "cancelled"; albumId: null; coverOrphan?: boolean }
  /** 相册已创建，但有图片未传成功（含创建后被取消 / 登录失效）：失败项保留供重试 */
  | { status: "partial"; albumId: number; title: string; failed: number; total: number; authExpired: boolean; message: string };

/** 直通压缩：创建流程已在步骤0 严格压缩过全部图片，封面/其余上传器不得再压一遍（原文件原样返回） */
export const PASS_THROUGH_COMPRESS: ImageCompressPort = {
  compress: async (filePath: string, knownSize: number) => ({ path: filePath, size: knownSize, width: 0, height: 0, reused: true }),
};

export interface AlbumCreatorDeps {
  /** 严格压缩（失败返回 null，绝不回退原图） */
  compress: ImageCompressPort;
  /** 上传**已压缩**的封面（不得再次压缩）；返回封面 URL */
  uploadCover: (input: { path: string; size: number }, onProgress?: (percent: number) => void) => Promise<CoverUploadResult>;
  /** 创建相册（只调用一次）；成功回相册 id */
  createAlbum: (form: CreateFormInput & { coverImageUrl: string }) => Promise<{ ok: true; albumId: number } | { ok: false; kind: string; message: string }>;
  /** 为已创建的相册造上传器（页面注入真实 createAlbumUploader，且其 compress 为直通——文件已压缩过） */
  newUploader: (albumId: number, hooks: { onChange: (items: readonly UploadQueueItem[]) => void; onFinished: () => void; onAuthExpired: () => void }) => AlbumUploader;
  /** 取消封面上传中的请求 */
  cancelCoverUpload?: () => void;
  onProgress?: (p: CreateProgress) => void;
  /** 步骤3 上传队列变化（页面刷新失败项列表） */
  onQueue?: (items: readonly UploadQueueItem[]) => void;
}

export interface AlbumCreator {
  run(input: { form: CreateFormInput; photos: CreatePhotoState }): Promise<CreateOutcome>;
  /** 重试步骤3 的全部失败项；返回仍失败的张数（相册已创建，绝不再创建） */
  retryFailed(): Promise<{ failed: number; total: number; authExpired: boolean }>;
  /** 取消：压缩/封面阶段尽快中止；已创建后中止上传并保留失败项 */
  cancel(): void;
  isRunning(): boolean;
  /** 当前上传队列快照（创建之前为空） */
  queue(): UploadQueueItem[];
}

export function createAlbumCreator(deps: AlbumCreatorDeps): AlbumCreator {
  let cancelled = false;
  let running = false;
  let uploader: AlbumUploader | null = null;
  let authExpired = false;
  let waiter: (() => void) | null = null;
  let createdId: number | null = null;
  let createdTitle = "";

  function progress(phase: CreatePhase, index: number, total: number, done: number, units: number): void {
    try {
      deps.onProgress?.({ phase, index, total, percent: units <= 0 ? 0 : Math.min(100, Math.round((done / units) * 100)), text: describeCreateProgress(phase, index, total) });
    } catch {
      /* 页面回调异常静默 */
    }
  }
  function waitFinish(): Promise<void> {
    return new Promise((resolve) => {
      waiter = resolve;
    });
  }
  function tally(): { failed: number; total: number } {
    const q = uploader?.items() ?? [];
    return { failed: q.filter((i) => i.status === "failed").length, total: q.length };
  }

  async function runUpload(): Promise<void> {
    // 等 uploader 把队列处理完（onFinished 在其 run 的 finally 里触发）
    await waitFinish();
  }

  return {
    isRunning: () => running,
    queue: () => uploader?.items() ?? [],
    cancel() {
      cancelled = true;
      try {
        deps.cancelCoverUpload?.();
      } catch {
        /* 静默 */
      }
      uploader?.cancel();
    },
    async run(input) {
      if (running) return { status: "invalid", message: "正在处理，请稍候" };
      running = true;
      cancelled = false;
      authExpired = false;
      try {
        // 校验放最前：表单不合法就不做任何压缩/上传（零副作用）
        const v = validateAlbumForm({ ...input.form, coverImageUrl: "", aiDesc: "", sortOrder: 0 });
        if (!v.ok) return { status: "invalid", message: v.error.message };
        const { cover, others } = orderedForUpload(input.photos);
        const ordered = [...(cover ? [cover] : []), ...others];
        const total = ordered.length;
        const units = total * 2; // 压缩 + 上传各占一半

        // 步骤0：串行严格压缩全部（含封面）；任一失败整体中止（尚无副作用）
        const compressed: Array<{ path: string; size: number }> = [];
        for (let i = 0; i < ordered.length; i++) {
          if (cancelled) return { status: "cancelled", albumId: null };
          progress("compress", i + 1, total, i, units);
          const c = await deps.compress.compress(ordered[i].path, ordered[i].size);
          if (cancelled) return { status: "cancelled", albumId: null };
          if (c == null) return { status: "compress-failed", index: i + 1, message: `第 ${i + 1} 张图片处理失败（${COMPRESS_FAIL_TEXT}）。未上传任何图片、未创建相册，请移除该图或更换后重试` };
          compressed.push({ path: c.path, size: c.size });
        }

        // 步骤1：上传封面（可选）
        let coverUrl = "";
        let coverUploaded = false;
        if (cover != null) {
          if (cancelled) return { status: "cancelled", albumId: null };
          progress("cover", 1, total, total, units);
          const r = await deps.uploadCover(compressed[0], (p) => progress("cover", 1, total, total + Math.round(p / 100), units));
          // 封面若已上传成功（r.ok）而此刻被取消：云端留有未使用的封面文件 ⇒ 标记 coverOrphan 供页面提示
          if (cancelled) return { status: "cancelled", albumId: null, coverOrphan: r.ok };
          if (!r.ok) return { status: "failed", stage: "cover", message: "封面上传失败：" + r.message, authExpired: r.kind === "auth-expired" };
          coverUrl = r.url;
          coverUploaded = true;
        }

        // 步骤2：创建相册（只发生一次）
        if (cancelled) return { status: "cancelled", albumId: null, coverOrphan: coverUploaded };
        progress("create", 0, total, cover != null ? total + 1 : total, units);
        const created = await deps.createAlbum({ title: v.form.title, childId: v.form.childId, price: v.form.price, packageDesc: v.form.packageDesc, coverImageUrl: coverUrl });
        if (!created.ok) return { status: "failed", stage: "create", message: created.message, authExpired: created.kind === "auth-expired", coverOrphan: coverUploaded };
        createdId = created.albumId;
        createdTitle = v.form.title;
        const rest = compressed.slice(cover != null ? 1 : 0);
        if (!isPositiveId(created.albumId)) {
          // 相册已建但没拿到编号：无法补传，提示去列表进入该相册
          return { status: "partial", albumId: created.albumId, title: createdTitle, failed: rest.length, total: rest.length, authExpired: false, message: `相册「${createdTitle}」已创建，但未能获取相册编号，请刷新列表后进入该相册补传图片（请勿重复新建）。` };
        }

        // 步骤3：其余图片串行逐张上传
        if (rest.length === 0) return { status: "created", albumId: created.albumId, title: createdTitle };
        if (cancelled) {
          // 创建请求在途时用户点了取消：相册已存在，不再发起上传；交给页面引导去图片管理补传
          return { status: "partial", albumId: created.albumId, title: createdTitle, failed: rest.length, total: rest.length, authExpired: false, message: `相册「${createdTitle}」已创建，已取消图片上传。请到该相册的图片管理中补传（请勿重复新建）。` };
        }
        const coverUnits = cover != null ? 1 : 0;
        const doneBase = total + coverUnits; // 已完成的「单位数」：全部压缩 + 封面
        uploader = deps.newUploader(created.albumId, {
          onChange: (items) => {
            try {
              deps.onQueue?.(items);
            } catch {
              /* 静默 */
            }
            const fin = items.filter((i) => i.status === "done" || i.status === "failed").length;
            progress("upload", coverUnits + Math.min(items.length, fin + 1), total, doneBase + fin, units);
          },
          onFinished: () => {
            const w = waiter;
            waiter = null;
            w?.();
          },
          onAuthExpired: () => {
            authExpired = true;
          },
        });
        const finished = runUpload();
        uploader.enqueue(rest);
        await finished;
        const t = tally();
        if (t.failed === 0 && !cancelled && !authExpired) return { status: "created", albumId: created.albumId, title: createdTitle };
        return {
          status: "partial",
          albumId: created.albumId,
          title: createdTitle,
          failed: t.failed,
          total: t.total,
          authExpired,
          message: authExpired ? `相册「${createdTitle}」已创建，但登录已失效，${t.failed} 张图片未上传。请重新登录后到该相册的图片管理中补传（请勿重复新建）。` : describePartialFailure(createdTitle, t.failed, t.total),
        };
      } finally {
        running = false;
      }
    },
    async retryFailed() {
      if (uploader == null || createdId == null || running) return { failed: tally().failed, total: tally().total, authExpired };
      running = true;
      cancelled = false;
      authExpired = false;
      try {
        const finished = runUpload();
        uploader.retryAllFailed();
        await finished;
        const t = tally();
        return { failed: t.failed, total: t.total, authExpired };
      } finally {
        running = false;
      }
    },
  };
}
