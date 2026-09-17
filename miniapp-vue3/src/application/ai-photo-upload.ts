// T8 S3 照片上传用例（旧端 aiTryOn:506-530 `uploadSelectedPhoto` ＋ api.uts:499-546 `uploadPhoto`）。
// 口径：POST {baseUrl}/api/aiface/upload，表单字段名 `photo`；成功＝**code 0 或 200 且 data.filename 非空**；
// 否则以 message 提示（旧端 `uploadRes.message || '照片上传失败，请重新选择'`）。
// 头：旧端 buildUploadHeader＝Bearer + 品牌头（有品牌才带 X-Brand-Id）；新端补 `X-App-Code`（新端全站约定，
// 声明为有意偏差——多带一个头不影响服务端，缺它则可能无法按应用路由）。
// 401：旧端挂起等待登录（auth.uts/http.uts 队列）并 emit 'login-required'；新端由 client 统一返回 AUTH_EXPIRED，
// 上传端口不持有会话 ⇒ 本用例把 kind==="AUTH_EXPIRED" 如实上抛给页面（页面按登录流程处理），**不静默成功**。
import type { UploadPort } from "../ports/upload";

/** 旧端 aiTryOn:445 常量：单张照片上限 10MB */
export const PHOTO_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;

export interface UploadSuccess {
  ok: true;
  fileUrl: string;
  filename: string;
}
export interface UploadFailure {
  ok: false;
  /** 可直接展示的提示文案（旧端优先取服务端 message） */
  message: string;
  /** AUTH_EXPIRED 时页面应拉起登录流程；网络/业务失败可重试 */
  authExpired?: boolean;
}

/** 旧端响应归一：res.data 可能是字符串或对象；成功码 0/200 且 filename 非空 */
export function parseUploadResult(raw: unknown): UploadSuccess | UploadFailure {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, message: "照片上传失败，请重新选择" };
    }
  }
  if (data == null || typeof data !== "object") {
    return { ok: false, message: "照片上传失败，请重新选择" };
  }
  const envelope = data as { code?: unknown; message?: unknown; data?: { filename?: unknown; file_url?: unknown } };
  const code = envelope.code;
  const filename = envelope.data?.filename;
  const fileUrl = envelope.data?.file_url;
  if ((code === 0 || code === 200) && typeof filename === "string" && filename !== "") {
    return { ok: true, filename, fileUrl: typeof fileUrl === "string" ? fileUrl : "" };
  }
  const message = typeof envelope.message === "string" && envelope.message !== "" ? envelope.message : "照片上传失败，请重新选择";
  return { ok: false, message, authExpired: code === 401 };
}

/** 旧端 buildUploadHeader ＋ 新端 X-App-Code 约定（token/brand 为空则不带对应头） */
export function buildUploadHeaders(deps: {
  token: string | null;
  brandId: string | null;
  appCode: string;
}): Record<string, string> {
  const headers: Record<string, string> = { "X-App-Code": deps.appCode };
  if (deps.token != null && deps.token !== "") headers.Authorization = "Bearer " + deps.token;
  if (deps.brandId != null && deps.brandId !== "") headers["X-Brand-Id"] = deps.brandId;
  return headers;
}

export function createAiPhotoUploader(deps: {
  upload: UploadPort;
  baseUrl: string;
  /** 每次上传时求值（会话/品牌可能变化） */
  headers: () => Record<string, string>;
}) {
  async function upload(path: string): Promise<UploadSuccess | UploadFailure> {
    const res = await deps.upload.upload({
      url: deps.baseUrl.replace(/\/+$/, "") + "/api/aiface/upload",
      filePath: path,
      name: "photo",
      headers: deps.headers(),
    });
    if (!res.ok) {
      return { ok: false, message: "照片上传失败，请重新选择" };
    }
    return parseUploadResult(res.value.data);
  }
  return { upload };
}
