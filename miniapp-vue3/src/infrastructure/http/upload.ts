// P2-04 上传：保持 multipart 字段 photo（不改成普通 JSON 请求）；JSON 字符串响应解码；
// 401 → 挂起等待登录后重试一次，二次 401 即失败（旧端 api.uts:499-515 语义）。
import type { RequestContext } from "../../ports/context";
import type { AuthCoordinatorLike, ClientResult } from "./client";
import { isBusinessSuccess, mapBusinessFailure } from "./errors";

export interface UploadTransport {
  upload(req: {
    url: string;
    filePath: string;
    name: string;
    headers: Record<string, string>;
  }): Promise<{ statusCode: number; bodyText: string }>;
}

export interface UploadedPhoto {
  file_url: string;
  filename: string;
}

interface UploadEnvelope {
  code?: unknown;
  message?: string;
  data?: { file_url?: unknown; filename?: unknown };
}

export function createUploadClient(deps: {
  transport: UploadTransport;
  authCoordinator: AuthCoordinatorLike;
  baseUrl: string;
}): { uploadPhoto: (input: { filePath: string; context: RequestContext }) => Promise<ClientResult<UploadedPhoto>> } {
  function authError(ctx: RequestContext, reason: string): ClientResult<UploadedPhoto> {
    return {
      ok: false,
      error: {
        kind: "AUTH_EXPIRED",
        businessCode: null,
        message: "unauthorized: " + reason,
        requestId: ctx.requestId,
        retryable: false,
      },
    };
  }

  async function attempt(
    filePath: string,
    ctx: RequestContext,
    url: string,
    allowRetry: boolean,
  ): Promise<ClientResult<UploadedPhoto>> {
    // 每次尝试取会话：401 后重试时 waitForLogin 触发重登（P2-03 队列唤醒）
    const session = await deps.authCoordinator.waitForLogin(ctx);
    if (!session.ok) return authError(ctx, session.reason);
    const headers: Record<string, string> = {
      Authorization: "Bearer " + session.value.token,
      "X-App-Code": ctx.appCode,
    };
    let res: { statusCode: number; bodyText: string };
    try {
      res = await deps.transport.upload({ url, filePath, name: "photo", headers });
    } catch {
      return { ok: false, error: mapBusinessFailure(null, "upload transport failure", ctx.requestId) };
    }
    if (res.statusCode === 401) {
      // 挂起重登重试一次；二次 401 即失败，不无限重试
      if (!allowRetry) return authError(ctx, "retry failed");
      return attempt(filePath, ctx, url, false);
    }
    let envelope: UploadEnvelope;
    try {
      envelope = JSON.parse(res.bodyText) as UploadEnvelope;
    } catch {
      // 非法 JSON：安全失败不抛
      return {
        ok: false,
        error: {
          kind: "UNKNOWN",
          businessCode: null,
          message: "invalid upload response (non-JSON), http " + res.statusCode,
          requestId: ctx.requestId,
          retryable: false,
        },
      };
    }
    if (isBusinessSuccess(envelope.code)) {
      return {
        ok: true,
        value: {
          file_url: typeof envelope.data?.file_url === "string" ? envelope.data.file_url : "",
          filename: typeof envelope.data?.filename === "string" ? envelope.data.filename : "",
        },
      };
    }
    return {
      ok: false,
      error: mapBusinessFailure(envelope.code, envelope.message ?? "", ctx.requestId),
    };
  }

  function uploadPhoto(input: { filePath: string; context: RequestContext }): Promise<ClientResult<UploadedPhoto>> {
    const ctx = Object.freeze({ ...input.context });
    // 与旧端一致：baseURL + /api/aiface/upload（旧端亦为模板直拼）
    const url = deps.baseUrl + "/api/aiface/upload";
    return attempt(input.filePath, ctx, url, true);
  }

  return { uploadPhoto };
}
