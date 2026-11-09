// 商家端相册封面上传（issue #14 · M2）：`POST /photo-albums/upload-cover`。
// 后端（只读核对 UploadCoverHandler）：multipart 表单字段 `shopId`、文件字段 **`file`**（单个，不是 files）；
// 体积上限由服务端配置（enforceUploadSizeLimit，超限返回业务错误）；成功返回 `data.image_url`（已是 CDN/源站可用地址）。
// 流程：压缩（商家口径 1600/3MB，**fail-closed 不回退原图**）→ 上传 → **必须拿到非空 image_url 才算成功**（不把 code=200 当成功）。
// 认证用商家会话 token（由调用方注入）。纯编排，依赖全部注入，便于单测。
import type { UploadPort } from "../../ports/upload";
import type { ImageCompressPort } from "../../platform/weixin/image-compress";
import { COMPRESS_FAIL_TEXT, MERCHANT_UPLOAD_TIMEOUT_MS, UPLOAD_NETWORK_TEXT, UPLOAD_TIMEOUT_TEXT } from "../domain/merchant-upload";
import { isPositiveId } from "../domain/merchant-http";

export type CoverUploadResult =
  | { ok: true; url: string }
  | { ok: false; kind: "validation" | "compress" | "network" | "auth-expired" | "server"; message: string };

/** 解析封面上传响应：返回 image_url；任何偏差一律失败 */
export function parseCoverResponse(statusCode: number, body: string): { ok: true; url: string } | { ok: false; authExpired: boolean; message: string } {
  if (statusCode === 401) return { ok: false, authExpired: true, message: "登录已失效，请重新登录" };
  if (!(statusCode >= 200 && statusCode < 300)) return { ok: false, authExpired: false, message: statusCode === 413 ? "图片过大，上传被服务器拒绝" : "封面上传失败（HTTP " + statusCode + "）" };
  type Env = { code?: unknown; message?: unknown; data?: unknown };
  let env: Env | null = null;
  try {
    const parsed: unknown = JSON.parse(body);
    env = parsed != null && typeof parsed === "object" ? (parsed as Env) : null;
  } catch {
    env = null;
  }
  if (env == null) return { ok: false, authExpired: false, message: "封面上传失败：服务器响应异常" };
  if (env.code === 401) return { ok: false, authExpired: true, message: "登录已失效，请重新登录" };
  if (env.code !== 0 && env.code !== 200) {
    const m = typeof env.message === "string" ? env.message.trim() : "";
    return { ok: false, authExpired: false, message: m !== "" ? m : "封面上传失败，请重试" };
  }
  const url = (env.data as { image_url?: unknown } | null)?.image_url;
  if (typeof url !== "string" || url.trim() === "") return { ok: false, authExpired: false, message: "封面上传失败：服务器未返回图片地址" };
  return { ok: true, url: url.trim() };
}

export function createCoverUploader(deps: {
  upload: UploadPort;
  compress: ImageCompressPort;
  getToken: () => string;
  /** 绝对地址：`<apiBase>/photo-albums/upload-cover` */
  uploadUrl: string;
  /** 收到 401 时用本次请求所用 token 精确作废商家会话（multipart 不经 http client）；缺省不作废 */
  expireSession?: (usedToken: string) => void;
}) {
  return {
    async upload(input: { shopId: number; path: string; size: number }, onProgress?: (percent: number) => void): Promise<CoverUploadResult> {
      if (!isPositiveId(input.shopId)) return { ok: false, kind: "validation", message: "请先选择系列" };
      const token = deps.getToken();
      if (token === "") return { ok: false, kind: "auth-expired", message: "登录已失效，请重新登录" };
      const c = await deps.compress.compress(input.path, input.size);
      if (c == null) return { ok: false, kind: "compress", message: COMPRESS_FAIL_TEXT }; // 绝不回退上传原图
      const res = await deps.upload.upload({
        url: deps.uploadUrl,
        filePath: c.path,
        name: "file", // 后端读 c.FormFile("file")
        headers: { Authorization: "Bearer " + token },
        formData: { shopId: String(input.shopId) },
        timeoutMs: MERCHANT_UPLOAD_TIMEOUT_MS,
        onProgress,
      });
      if (!res.ok) return { ok: false, kind: "network", message: res.reason === "timeout" ? UPLOAD_TIMEOUT_TEXT : UPLOAD_NETWORK_TEXT };
      const p = parseCoverResponse(res.value.statusCode, res.value.data);
      if (!p.ok) {
        if (p.authExpired) {
          try {
            deps.expireSession?.(token);
          } catch {
            /* 静默 */
          }
        }
        return { ok: false, kind: p.authExpired ? "auth-expired" : "server", message: p.message };
      }
      return { ok: true, url: p.url };
    },
    cancel(): void {
      try {
        deps.upload.cancel();
      } catch {
        /* 静默 */
      }
    },
  };
}
