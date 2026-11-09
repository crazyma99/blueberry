// 商家端图片上传：常量与纯函数（issue #14 · M2）。**纯函数**，无平台依赖。
//
// 压缩参数**商家端自己的一套**（对齐后台 admin-web/src/lib/image-compress.ts：长边 1600、≤3MB、质量 0.85→0.7 阶梯）；
// **不要碰** AI 试衣的 domain/photo-compress.ts（长边 1080 / ≤500KB）。
//
// 后端硬约束（只读核对 lanmei-backend-golang `internal/admin/handler/photoalbum.go` UploadImagesHandler）：
//   · multipart：字段 `files`（可多个）+ 表单 `shopId`、`albumId`；单次请求 >20 张**静默返回成功 0 张**；
//   · 非 image/* Content-Type、0 字节、>20MB 单张、COS 失败都**静默丢弃**（仍返回 code=200）；
//   · **每个请求都先读相册现有图片取 maxSort 再给新图连号** ⇒ 并发请求会读到同一个 maxSort ⇒ sortOrder 重复、排序错乱，
//     所以**上传必须串行**（并发=1）；
//   · wx.uploadFile 一次只能传 1 个文件 ⇒「1 请求 1 张」，天然远低于 nginx 20MB 的整体限制，不再需要「分批装箱」。
// ⇒ 成功判定**不能**看 code=200：必须解析响应的 data 数组，条数 === 1 才算这张成功（0 条＝被后端静默丢弃）。

/** 长边上限（px） */
export const MERCHANT_COMPRESS_MAX_LONG_EDGE = 1600;
/** 压缩后体积目标（字节）：≤3MB */
export const MERCHANT_COMPRESS_MAX_BYTES = 3 * 1024 * 1024;
/** 质量阶梯：先 0.85，仍超 3MB 再 0.7（与后台一致；wx.canvasToTempFilePath 的 quality 取 0-1） */
export const MERCHANT_COMPRESS_QUALITIES: readonly number[] = [0.85, 0.7];
/** 每次选图最多张数（wx.chooseMedia 上限 9） */
export const MERCHANT_PICK_MAX_COUNT = 9;
/** 单次选择累计上限（防一次排队过多；超出提示分次上传） */
export const MERCHANT_UPLOAD_MAX_QUEUE = 30;
/** 单张上传超时（ms）：3MB 在弱网下给足时间，但不无限挂起 */
export const MERCHANT_UPLOAD_TIMEOUT_MS = 90_000;

/** 等比缩放到长边 ≤ maxLongEdge；不放大、不裁剪；尺寸取整且 ≥1 */
export function computeMerchantTargetSize(
  width: number,
  height: number,
  maxLongEdge: number = MERCHANT_COMPRESS_MAX_LONG_EDGE,
): { width: number; height: number } {
  const w = Math.max(1, Math.floor(Number.isFinite(width) ? width : 1));
  const h = Math.max(1, Math.floor(Number.isFinite(height) ? height : 1));
  const longEdge = Math.max(w, h);
  if (maxLongEdge <= 0 || longEdge <= maxLongEdge) return { width: w, height: h };
  const scale = maxLongEdge / longEdge;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * 压缩决策：原图已在预算内（体积 ≤3MB 且长边 ≤1600）⇒ 保留原文件（不重编码，免二次画质损失）；否则需要压缩。
 * 体积未知（0/缺失）时**保守按「需要压缩」**（fail-closed：不能因拿不到体积就放过一张可能 30MB 的图）。
 */
export function needsCompress(input: { size: number; width: number; height: number }): boolean {
  const sizeKnown = Number.isFinite(input.size) && input.size > 0;
  if (!sizeKnown) return true;
  const within = input.size <= MERCHANT_COMPRESS_MAX_BYTES && Math.max(input.width, input.height) <= MERCHANT_COMPRESS_MAX_LONG_EDGE;
  return !within;
}

/**
 * 解析 /photo-albums/albums/upload 的响应文本，返回**真实入库的图片条数**。
 * 成功条件（全部满足）：HTTP 2xx；响应是 JSON 信封 `{code,message,data}`；code ∈ {0,200}；data 是数组。
 * 返回 `{ok:true,count}`（count 可为 0——0 条即被后端静默丢弃，由调用方判失败）或 `{ok:false,message}`。
 */
export function parseUploadResponse(statusCode: number, body: string): { ok: true; count: number; ids: number[] } | { ok: false; message: string } {
  if (!(statusCode >= 200 && statusCode < 300)) {
    if (statusCode === 401) return { ok: false, message: "登录已失效，请重新登录" };
    if (statusCode === 403) return { ok: false, message: "无权限上传到该相册" };
    if (statusCode === 413) return { ok: false, message: "图片过大，上传被服务器拒绝" };
    if (statusCode === 429) return { ok: false, message: "操作过于频繁，请稍后再试" };
    return { ok: false, message: "上传失败（HTTP " + statusCode + "）" };
  }
  let env: { code?: unknown; message?: unknown; data?: unknown } | null = null;
  try {
    const parsed: unknown = JSON.parse(body);
    env = parsed != null && typeof parsed === "object" ? (parsed as { code?: unknown; message?: unknown; data?: unknown }) : null;
  } catch {
    env = null;
  }
  if (env == null) return { ok: false, message: "上传失败：服务器响应异常" };
  const code = env.code;
  if (code === 401) return { ok: false, message: "登录已失效，请重新登录" };
  if (code === 403) return { ok: false, message: "无权限上传到该相册" };
  if (code !== 0 && code !== 200) {
    const m = typeof env.message === "string" ? env.message.trim() : "";
    return { ok: false, message: m !== "" ? m : "上传失败，请重试" };
  }
  if (!Array.isArray(env.data)) return { ok: false, message: "上传失败：服务器响应异常" };
  const ids = env.data.map((x) => (x != null && typeof x === "object" && typeof (x as { id?: unknown }).id === "number" ? (x as { id: number }).id : 0)).filter((n) => n > 0);
  return { ok: true, count: env.data.length, ids };
}

/** 单张上传的最终文案（失败原因，面向商家） */
export const UPLOAD_SILENT_DROP_TEXT = "服务器未接收该图片（可能格式不支持或体积超限），请换一张或重试";
export const UPLOAD_NETWORK_TEXT = "网络不稳定，上传失败，可点击重试";
export const UPLOAD_TIMEOUT_TEXT = "上传超时，可点击重试";
export const UPLOAD_DOMAIN_HINT = "上传域名未配置：请联系管理员在小程序后台「服务器域名 → uploadFile 合法域名」中添加";
export const COMPRESS_FAIL_TEXT = "图片处理失败（格式不支持或过大），请换一张";
export const PICK_FAIL_TEXT = "选择图片失败，请检查相册权限后重试";

export type UploadItemStatus = "queued" | "compressing" | "uploading" | "done" | "failed";

export interface UploadQueueItem {
  /** 队列内稳定 id（不依赖路径） */
  key: number;
  /** 原图本地路径 */
  path: string;
  /** 原图字节数（选图 API 给；未知为 0） */
  size: number;
  status: UploadItemStatus;
  /** 该张上传进度 0-100 */
  percent: number;
  /** 失败原因（status=failed 时） */
  error: string;
  /** 失败发生阶段（重试时决定从哪一步重来：压缩失败也能重试） */
  failedAt: "" | "compress" | "upload";
  /** 已压缩产物路径（重试上传时复用，避免重复压缩） */
  compressedPath: string;
}

export function newQueueItem(key: number, path: string, size: number): UploadQueueItem {
  return { key, path, size: Number.isFinite(size) && size > 0 ? Math.trunc(size) : 0, status: "queued", percent: 0, error: "", failedAt: "", compressedPath: "" };
}

/** 总体进度（0-100）：完成的张数 + 当前张的进度，按张等权；空队列 0 */
export function overallPercent(items: readonly Pick<UploadQueueItem, "status" | "percent">[]): number {
  if (items.length === 0) return 0;
  let sum = 0;
  for (const it of items) {
    if (it.status === "done") sum += 100;
    else if (it.status === "uploading") sum += Math.min(99, Math.max(0, it.percent));
    else if (it.status === "failed") sum += 100; // 失败的也「处理完毕」，进度条不卡在中间；失败数另行展示
  }
  return Math.round(sum / items.length);
}

export function summarizeQueue(items: readonly Pick<UploadQueueItem, "status">[]): { total: number; done: number; failed: number; pending: number } {
  let done = 0;
  let failed = 0;
  for (const it of items) {
    if (it.status === "done") done++;
    else if (it.status === "failed") failed++;
  }
  return { total: items.length, done, failed, pending: items.length - done - failed };
}

/** 进度文案：「上传中 3/9」/「已完成 9/9」/「完成 7/9，2 张失败」 */
export function describeQueue(items: readonly Pick<UploadQueueItem, "status">[]): string {
  const s = summarizeQueue(items);
  if (s.total === 0) return "";
  if (s.pending > 0) return `上传中 ${s.done + s.failed}/${s.total}` + (s.failed > 0 ? `（${s.failed} 张失败）` : "");
  if (s.failed > 0) return `完成 ${s.done}/${s.total}，${s.failed} 张失败`;
  return `已完成 ${s.done}/${s.total}`;
}

/** 选择结果追加到队列：超过队列上限时截断并返回被丢弃数（页面提示「分次上传」） */
export function appendToQueue(
  queue: readonly UploadQueueItem[],
  picked: ReadonlyArray<{ path: string; size: number }>,
  nextKey: number,
): { queue: UploadQueueItem[]; nextKey: number; dropped: number } {
  const room = Math.max(0, MERCHANT_UPLOAD_MAX_QUEUE - queue.length);
  const take = picked.slice(0, room);
  const added = take.map((p, i) => newQueueItem(nextKey + i, p.path, p.size));
  return { queue: [...queue, ...added], nextKey: nextKey + take.length, dropped: picked.length - take.length };
}
