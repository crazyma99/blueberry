// upload 端口 → uni.uploadFile 适配（T8 S1）。
// 容器安全：uni.uploadFile 不存在（测试/异常容器）按 network 失败返回，不抛。
import type { Result } from "../../ports/context";
import type { UploadPort, UploadRequest, UploadResponse } from "../../ports/upload";

interface UniUploadRes {
  statusCode: number;
  data: string;
}

export function createUniUpload(): UploadPort {
  let task: { abort?: () => void } | null = null;
  return {
    upload(req: UploadRequest): Promise<Result<UploadResponse>> {
      return new Promise((resolve) => {
        if (typeof uni === "undefined" || typeof uni.uploadFile !== "function") {
          resolve({ ok: false, reason: "network" });
          return;
        }
        try {
          // ⚠️ 回调可能在 uploadFile 内**同步**触发（测试/异常容器）：用 settled 标记避免「已终结却仍把任务挂上」
          // ——否则 cancel() 会误 abort 一个已完成的请求（S1 自查发现的真隐患）。
          let settled = false;
          const handle = uni.uploadFile({
            url: req.url,
            filePath: req.filePath,
            name: req.name,
            header: req.headers as Record<string, string> | undefined,
            formData: req.formData as Record<string, unknown> | undefined,
            timeout: req.timeoutMs,
            success: (res: UniUploadRes) => {
              settled = true;
              task = null;
              resolve({ ok: true, value: { statusCode: res.statusCode, data: res.data } });
            },
            fail: () => {
              settled = true;
              task = null;
              resolve({ ok: false, reason: "network" });
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
