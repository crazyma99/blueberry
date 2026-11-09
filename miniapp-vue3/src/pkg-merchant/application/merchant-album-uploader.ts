// 商家端相册图片上传编排（issue #14 · M2）：**串行**「选图 → 逐张压缩 → 逐张上传 → 逐张核对 → 统一刷新」。
//
// 为什么串行（并发=1）：后端 UploadImagesHandler 每个请求都**先读该相册现有图片取 maxSort 再连号**；
// 并发请求读到同一个 maxSort ⇒ sortOrder 重复、排序错乱（已读 photoalbum.go 复核）。
// 为什么 1 请求 1 张：wx.uploadFile 一次只能传 1 个文件，单张压缩后 ≤3MB，远低于 nginx 20MB 整体限制，无需装箱分批。
//
// 判定规则（**不得把 code=200 当成功**）：
//   · 响应必须是 2xx + JSON 信封 + code∈{0,200} + data 为数组；
//   · data 条数 === 1 才算这张成功；**0 条＝被后端静默丢弃**（非图片/超 20MB/COS 失败都会这样）⇒ 判失败；
//   · 失败的张可单张重试：压缩阶段失败从头来，上传阶段失败复用已压缩产物；
//   · 全部结束（含失败）后调用 onFinished 让页面统一刷新网格——以刷新结果为准。
// 认证：Authorization 用**商家会话 token**（由调用方传入 getToken，本模块不读存储、不碰 C 端会话）。
import type { Result } from "../../ports/context";
import type { UploadPort, UploadRequest, UploadResponse } from "../../ports/upload";
import type { ImageCompressPort } from "../../platform/weixin/image-compress";
import {
  COMPRESS_FAIL_TEXT,
  appendToQueue,
  MERCHANT_UPLOAD_TIMEOUT_MS,
  UPLOAD_NETWORK_TEXT,
  UPLOAD_SILENT_DROP_TEXT,
  UPLOAD_TIMEOUT_TEXT,
  parseUploadResponse,
  type UploadQueueItem,
} from "../domain/merchant-upload";

export interface AlbumUploaderDeps {
  upload: UploadPort;
  compress: ImageCompressPort;
  /** 取当前商家会话 token；无 ⇒ 返回 ""（上传前即判失败并提示重新登录） */
  getToken: () => string;
  /** 绝对上传地址（调用方拼 baseUrl，同 transport 口径） */
  uploadUrl: string;
  /** 上传表单：shopId/albumId（字符串化） */
  shopId: number;
  albumId: number;
  /** 队列状态变化回调（页面据此刷新进度 UI）；回调异常不影响上传 */
  onChange?: (items: readonly UploadQueueItem[]) => void;
  /** 全部项处理完毕（含失败）；页面据此统一刷新网格 */
  onFinished?: () => void;
  /** 登录失效（HTTP401 / code=401）：停止后续上传，页面回登录页 */
  onAuthExpired?: () => void;
  /**
   * 收到 401（HTTP 或 code）时，用**本次请求所用 token** 精确作废商家会话（multipart 不经 http client，其 401 自愈覆盖不到）。
   * 缺省不作废（兼容旧调用方）；页面应传 `(t) => rt.expireSessionByToken(t)`。
   */
  expireSession?: (usedToken: string) => void;
}

export interface AlbumUploader {
  /** 当前队列快照（不可变副本） */
  items(): UploadQueueItem[];
  /** 追加队列并（若空闲）开始处理；返回追加后的队列 */
  enqueue(files: ReadonlyArray<{ path: string; size: number }>): { dropped: number };
  /** 重试单张失败项（空闲或进行中都可；排到队尾串行处理） */
  retry(key: number): void;
  /** 重试全部失败项 */
  retryAllFailed(): void;
  /** 清掉已成功/失败的历史项（仅在空闲时有效） */
  clearFinished(): void;
  /** 中止当前上传并把剩余排队项标为失败（页面离开/取消） */
  cancel(): void;
  isRunning(): boolean;
}

export function createAlbumUploader(deps: AlbumUploaderDeps): AlbumUploader {
  let queue: UploadQueueItem[] = [];
  let nextKey = 1;
  let running = false;
  let cancelled = false;
  let authExpired = false;

  function emit(): void {
    try {
      deps.onChange?.(queue.map((q) => ({ ...q })));
    } catch {
      /* 页面回调异常静默 */
    }
  }
  function patch(key: number, p: Partial<UploadQueueItem>): void {
    queue = queue.map((q) => (q.key === key ? { ...q, ...p } : q));
    emit();
  }

  async function processOne(item: UploadQueueItem): Promise<void> {
    // 1) 压缩（上传阶段失败重试时复用已压缩产物）
    let path = item.compressedPath;
    if (path === "") {
      patch(item.key, { status: "compressing", percent: 0, error: "", failedAt: "" });
      const c = await deps.compress.compress(item.path, item.size);
      if (cancelled) return;
      if (c == null) {
        patch(item.key, { status: "failed", error: COMPRESS_FAIL_TEXT, failedAt: "compress" });
        return;
      }
      path = c.path;
      patch(item.key, { compressedPath: path });
    }

    // 2) 上传
    const token = deps.getToken();
    if (token === "") {
      authExpired = true;
      patch(item.key, { status: "failed", error: "登录已失效，请重新登录", failedAt: "upload" });
      return;
    }
    patch(item.key, { status: "uploading", percent: 0, error: "", failedAt: "" });
    const req: UploadRequest = {
      url: deps.uploadUrl,
      filePath: path,
      name: "files", // 后端读 form.File["files"]
      headers: { Authorization: "Bearer " + token },
      formData: { shopId: String(deps.shopId), albumId: String(deps.albumId) },
      timeoutMs: MERCHANT_UPLOAD_TIMEOUT_MS,
      onProgress: (p) => patch(item.key, { percent: p }),
    };
    const res: Result<UploadResponse> = await deps.upload.upload(req);
    if (cancelled) return;
    if (!res.ok) {
      patch(item.key, { status: "failed", error: res.reason === "timeout" ? UPLOAD_TIMEOUT_TEXT : UPLOAD_NETWORK_TEXT, failedAt: "upload" });
      return;
    }
    const parsed = parseUploadResponse(res.value.statusCode, res.value.data);
    if (!parsed.ok) {
      if (parsed.message.includes("登录已失效")) {
        authExpired = true;
        try {
          deps.expireSession?.(token); // 精确作废：只作废「本次请求所用 token」对应的会话
        } catch {
          /* 静默 */
        }
      }
      patch(item.key, { status: "failed", error: parsed.message, failedAt: "upload" });
      return;
    }
    // 条数核对：1 请求 1 张 ⇒ 必须恰好 1 条；0 条＝被后端静默丢弃
    if (parsed.count !== 1) {
      patch(item.key, { status: "failed", error: parsed.count === 0 ? UPLOAD_SILENT_DROP_TEXT : "服务器返回数量异常（" + parsed.count + "），请刷新核对", failedAt: "upload" });
      return;
    }
    patch(item.key, { status: "done", percent: 100, error: "", failedAt: "" });
  }

  async function run(): Promise<void> {
    if (running) return;
    running = true;
    try {
      // 串行：每次取第一个 queued；处理期间新入队/重试的项会被后续循环取到
      for (;;) {
        if (cancelled || authExpired) break;
        const next = queue.find((q) => q.status === "queued");
        if (next == null) break;
        try {
          await processOne(next);
        } catch (e) {
          // 任何未预期异常都收口为该张失败，不让整个队列卡死
          patch(next.key, { status: "failed", error: UPLOAD_NETWORK_TEXT, failedAt: next.compressedPath === "" ? "compress" : "upload" });
          console.error("[albumUploader] 处理异常:", e);
        }
      }
      if (authExpired) {
        // 登录失效：剩余排队项标记失败（可重新登录后重试），并通知页面
        queue = queue.map((q) => (q.status === "queued" ? { ...q, status: "failed" as const, error: "登录已失效，请重新登录", failedAt: "upload" as const } : q));
        emit();
        try {
          deps.onAuthExpired?.();
        } catch {
          /* 静默 */
        }
      }
    } finally {
      running = false;
      try {
        deps.onFinished?.();
      } catch {
        /* 静默 */
      }
    }
  }

  return {
    items: () => queue.map((q) => ({ ...q })),
    enqueue(files) {
      cancelled = false;
      authExpired = false;
      const r = appendToQueue(queue, files, nextKey);
      queue = r.queue;
      nextKey = r.nextKey;
      emit();
      void run();
      return { dropped: r.dropped };
    },
    retry(key) {
      const it = queue.find((q) => q.key === key);
      if (it == null || it.status !== "failed") return;
      cancelled = false;
      authExpired = false;
      // 压缩阶段失败 ⇒ 清空 compressedPath 从头来；上传阶段失败 ⇒ 复用产物
      patch(key, { status: "queued", percent: 0, error: "", compressedPath: it.failedAt === "compress" ? "" : it.compressedPath });
      void run();
    },
    retryAllFailed() {
      cancelled = false;
      authExpired = false;
      queue = queue.map((q) => (q.status === "failed" ? { ...q, status: "queued" as const, percent: 0, error: "", compressedPath: q.failedAt === "compress" ? "" : q.compressedPath } : q));
      emit();
      void run();
    },
    clearFinished() {
      if (running) return;
      queue = queue.filter((q) => q.status !== "done" && q.status !== "failed");
      emit();
    },
    cancel() {
      cancelled = true;
      try {
        deps.upload.cancel();
      } catch {
        /* 静默 */
      }
      queue = queue.map((q) => (q.status === "queued" || q.status === "compressing" || q.status === "uploading" ? { ...q, status: "failed" as const, error: "已取消", failedAt: q.compressedPath === "" ? ("compress" as const) : ("upload" as const) } : q));
      emit();
    },
    isRunning: () => running,
  };
}
