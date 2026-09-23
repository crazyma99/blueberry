// upload 端口 → uni.uploadFile 适配（T8 S1）。
// 容器安全：uni.uploadFile 不存在（测试/异常容器）按 network 失败返回，不抛。
import type { Result } from "../../ports/context";
import type { UploadPort, UploadRequest, UploadResponse } from "../../ports/upload";

interface UniUploadRes {
  statusCode: number;
  data: string;
}

/** 上传默认超时（2026-09-17 补：uni.uploadFile 不传 timeout 时可无限挂起 ⇒ 页面永久停在「上传中…」） */
export const DEFAULT_UPLOAD_TIMEOUT_MS = 60000;

/** 取容器 API：**优先 `globalThis.uni`（测试桩/H5），再回落裸 `uni`**（mp 产物由编译器改写）。
 *  2026-09-23 统一口径（同 `album-save.uniApi()`）：此前 chooser/upload/feedback 只认裸 `uni`，
 *  在「先有桩、后无裸标识符」或编译器改写差异的环境下会静默降级（选图/上传直接判为容器不支持）。 */
function uniApi<T>(): T | undefined {
  const injected = (globalThis as { uni?: T }).uni;
  if (injected != null) return injected;
  return typeof uni !== "undefined" ? (uni as unknown as T) : undefined;
}

export function createUniUpload(deps?: { defaultTimeoutMs?: number }): UploadPort {
  const defaultTimeoutMs = deps?.defaultTimeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;
  let task: { abort?: () => void } | null = null;
  return {
    upload(req: UploadRequest): Promise<Result<UploadResponse>> {
      return new Promise((resolve) => {
        const u = uniApi<{ uploadFile?: (o: Record<string, unknown>) => unknown }>();
        if (typeof u?.uploadFile !== "function") {
          resolve({ ok: false, reason: "network" });
          return;
        }
        try {
          // ⚠️ 回调可能在 uploadFile 内**同步**触发（测试/异常容器）：用 settled 标记避免「已终结却仍把任务挂上」
          // ——否则 cancel() 会误 abort 一个已完成的请求（S1 自查发现的真隐患）。
          let settled = false;
          const handle = u.uploadFile({
            url: req.url,
            filePath: req.filePath,
            name: req.name,
            header: req.headers as Record<string, string> | undefined,
            formData: req.formData as Record<string, unknown> | undefined,
            timeout: req.timeoutMs ?? defaultTimeoutMs,
            success: (res: UniUploadRes) => {
              settled = true;
              task = null;
              resolve({ ok: true, value: { statusCode: res.statusCode, data: res.data } });
            },
            fail: (err?: unknown) => {
              settled = true;
              task = null;
              // 超时与普通网络失败区分（页面可给「上传超时，请重试」而非笼统失败）
              const msg = typeof (err as { errMsg?: unknown } | undefined)?.errMsg === "string" ? String((err as { errMsg: string }).errMsg) : "";
              resolve({ ok: false, reason: msg.includes("timeout") ? "timeout" : "network" });
            },
          }) as { abort?: () => void } | undefined;
          if (!settled) task = handle ?? null;
        } catch {
          task = null;
          resolve({ ok: false, reason: "network" });
        }
      });
    },
    cancel(): void {
      try {
        task?.abort?.();
      } catch {
        // 容器异常静默
      }
      task = null;
    },
  };
}
