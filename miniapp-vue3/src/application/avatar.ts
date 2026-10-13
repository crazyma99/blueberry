// 头像上传底座（2026-10-13 · 任务 ①-1）：**先上传成 http(s) URL，再落库**。
//
// 为什么：微信 `open-type="chooseAvatar"` 回调返回的是 **`wxfile://tmp_…` 本地临时文件路径**，
// 抖音端同理拿到的是本地路径；直接落库/提交 ⇒ 跨端、跨设备、以及临时文件清理后**必然坏图**（DB 已证实）。
// 本模块是**纯逻辑**（不直连平台）：本地路径经既有 `ports/upload.ts` 端口（由页面注入 `createAiPhotoUploader`）上传，
// 拿回 `file_url`（http(s)）后才允许落库；失败一律 **fail-closed**（不写 store、不提交服务端、给可重试提示）。
import { avatarUrlHost, isForeignRemoteUrl, isStorableAvatarUrl } from "../domain/avatar-url";
import { parseUploadResult } from "./ai-photo-upload";

/** 上传端最小面（`createAiPhotoUploader(...).upload` 已满足） */
export interface AvatarUploaderLike {
  upload(
    path: string,
    onProgress?: (percent: number) => void,
  ): Promise<{ ok: true; fileUrl: string; filename: string } | { ok: false; message: string }>;
}

export type ResolveAvatarResult = { ok: true; url: string } | { ok: false; message: string };

/** 远程 URL 落地器（**平台层**实现：抖音优先 `tt.downloadFile`，否则 `uni.downloadFile`） */
export interface AvatarDownloaderLike {
  download(url: string): Promise<{ ok: true; path: string } | { ok: false; reason: "unsupported" | "failed" }>;
}


/**
 * ⭐**头像上传口（单一入口）**：**2026-10-13 21:21 起改用专用口** `POST /api/wx/avatar/upload`
 * （`task-58`，staging `e3e2257` 已部署；实测无 token ⇒ 401＝路由已注册 ✓）。
 * 契约：multipart **字段名 `photo`**（`file`／`avatar` 兼容）、头 `Authorization: Bearer <token>`（**JWT 必需**）、
 * 响应取 **`data.file_url`（http(s)）**；硬口径 **≤20MB、`image/*`、分辨率 ≤24MP**；**不走试衣照片质量门**
 * ⇒ 从此不会再出现 `side_face`／`no_face` 拦截（此前复用的 `/api/aiface/upload` 带 4002 门 × 新端恒带 `X-Channel` = 门生效）。
 * ⇒ 这是**唯一替换点**：其余调用点全部经 `createAvatarUploader`，勿在页面内散落 URL。
 */
export const AVATAR_UPLOAD_PATH = "/api/wx/avatar/upload";

/** 上传端（与 `ports/upload.ts` 对齐的最小面） */
export interface AvatarUploadPortLike {
  upload(req: {
    url: string;
    filePath: string;
    name: string;
    headers?: Readonly<Record<string, string>>;
    onProgress?: (percent: number) => void;
  }): Promise<{ ok: true; value: { data: string } } | { ok: false; reason?: string }>;
}

/** 头像上传器（返回结果与 `AvatarUploaderLike` 兼容，可直接喂给 `resolveAvatarUrl`） */
export function createAvatarUploader(deps: {
  upload: AvatarUploadPortLike;
  baseUrl: string;
  headers: () => Record<string, string>;
  /** 覆盖上传口（默认 AVATAR_UPLOAD_PATH；仅供 58 切换期/测试） */
  path?: string;
}): AvatarUploaderLike {
  const path = deps.path ?? AVATAR_UPLOAD_PATH;
  return {
    async upload(localPath: string, onProgress?: (percent: number) => void) {
      const res = await deps.upload.upload({
        url: deps.baseUrl.replace(/\/+$/, "") + path,
        filePath: localPath,
        name: "photo", // 契约字段名（task-58 新口：photo（file/avatar 兼容）；若改只动此处）
        headers: deps.headers(),
        onProgress,
      });
      if (!res.ok) {
        return { ok: false as const, message: res.reason === "timeout" ? "上传超时，请重试" : AVATAR_UPLOAD_FAILED_HINT };
      }
      // 信封解析：复用照片通道的归一（code 0/200 且 data.filename/file_url）
      const parsed = parseUploadResult(res.value.data);
      if (!parsed.ok) {
        // ⭐任何失败都必须有可读提示（含质量门 4002 的 check_code；未识别原因也给通用文案）
        const hint = mapAvatarUploadFailure({
          message: parsed.message,
          qualityCheckCode: parsed.qualityCheckCode as string | undefined,
        });
        console.warn("[avatar] 头像上传失败:", hint, "(check_code=", parsed.qualityCheckCode ?? "-", ")");
        return { ok: false as const, message: hint };
      }
      // 优先 file_url（http(s)）；旧口无 file_url 时用 filename 兜底（由调用方经 resolveAvatarUrl 校验）
      const url = parsed.fileUrl !== "" ? parsed.fileUrl : parsed.filename;
      return { ok: true as const, fileUrl: url, filename: parsed.filename };
    },
  };
}
/** 质量门（4002）通用文案：**任何未识别原因也必须给出可读提示**（杜绝「点了没反应」） */
export const AVATAR_GATE_GENERIC_HINT = "头像不符合要求，请换一张正脸清晰照片";

/**
 * 头像上传失败 → **用户可读文案**（2026-10-13 主人真机实证：服务端已拒 `side_face`／`no_face`，
 * 但界面「没反应」＝失败原因没被提示 ⇒ 本函数保证**永远返回非空可读文案**）：
 *   · 质量门业务码 4002 的 `check_code`（no_face／side_face／multi_face／face_too_small／unknown）逐条给出
 *     头像场景措辞（不复用试衣「照片」话术，避免用户以为是试衣照片问题）；
 *   · 其它失败：优先用后端 message（非空即可读），空则回落通用可重试提示。
 */
export function mapAvatarUploadFailure(input: { message?: string; qualityCheckCode?: string }): string {
  switch (input.qualityCheckCode) {
    case "no_face":
      return "头像未检测到人脸，请换一张正脸清晰照片";
    case "side_face":
      return "头像看起来是侧脸，请换一张正脸清晰照片";
    case "multi_face":
      return "头像里有多个面孔，请只保留本人正脸";
    case "face_too_small":
      return "头像里的人脸太小，请靠近一点重拍";
    case "unknown":
      return AVATAR_GATE_GENERIC_HINT;
    default: {
      const msg = typeof input.message === "string" ? input.message.trim() : "";
      return msg !== "" ? msg : AVATAR_UPLOAD_FAILED_HINT;
    }
  }
}

/** 上传失败默认提示（可行动、可重试；不暴露内部细节） */
export const AVATAR_UPLOAD_FAILED_HINT = "头像上传失败，请重试";
/** 上传成功但返回的地址不是 http(s)（服务端/端口异常）⇒ 同样不得落库 */
export const AVATAR_UPLOAD_BAD_URL_HINT = "头像上传返回地址不可用，请重试";
/** ⒞ 第三方远程头像**下载失败** ⇒ 可读提示且不落库 */
export const AVATAR_DOWNLOAD_FAILED_HINT = "头像下载失败，请重试";
/** ⒞ 平台不支持下载 ⇒ 引导改走相册/授权入口 */
export const AVATAR_DOWNLOAD_UNSUPPORTED_HINT = "当前端不支持该头像来源，请改用「从相册选择」";

/**
 * 把「用户选到的头像值」解析成**可落库的 URL**：
 *   · 空串 ⇒ `{ok:true, url:""}`（未设头像，**零请求**）；
 *   · 已是 http(s) ⇒ 直通（不再上传）；
 *   · 本地路径（`wxfile://`／`tmp_`／`file://`…）⇒ **必须先上传**；
 *     上传失败 / 返回非 http(s) ⇒ `{ok:false}`（**fail-closed**：调用方不得写入 store、不得提交服务端）。
 */
export async function resolveAvatarUrl(
  input: string,
  deps: {
    uploader: AvatarUploaderLike;
    /** ⭐task-63⒞：第三方远程 URL 的落地器（平台层注入；抖音端优先原生 downloadFile） */
    downloader?: AvatarDownloaderLike;
    onProgress?: (percent: number) => void;
  },
): Promise<ResolveAvatarResult> {
  const v = typeof input === "string" ? input.trim() : "";
  if (v === "") return { ok: true, url: "" };
  if (isStorableAvatarUrl(v)) return { ok: true, url: v }; // ⒝ 白名单域：直通（`http://tmp/…` 会落到下面分支）

  /** 上传一个**本地文件路径**（上传返回必须过白名单） */
  async function uploadLocal(path: string): Promise<ResolveAvatarResult> {
    try {
      const res = await deps.uploader.upload(path, deps.onProgress);
      if (!res.ok) return { ok: false, message: res.message !== "" ? res.message : AVATAR_UPLOAD_FAILED_HINT };
      if (!isStorableAvatarUrl(res.fileUrl)) {
        console.error("[avatar] 上传返回地址不在白名单（fail-closed），host=" + avatarUrlHost(res.fileUrl));
        return { ok: false, message: AVATAR_UPLOAD_BAD_URL_HINT };
      }
      return { ok: true, url: res.fileUrl };
    } catch (err) {
      console.error("[avatar] 头像上传异常（fail-closed）:", err);
      return { ok: false, message: AVATAR_UPLOAD_FAILED_HINT };
    }
  }

  // ⭐⒞ 第三方远程 http(s) 图片 URL（如抖音 getPhoneNumber/getUserInfo 返回的抖音 CDN 头像）：
  // **必须先 downloadFile 落地为本地临时文件，再上传**——直接当本地文件传 ⇒ 输入不是文件路径 ⇒ **零请求失败**
  //（2026-10-13 主人真机「抖音头像授权正常但随后上传失败」的根因）。
  if (isForeignRemoteUrl(v)) {
    if (deps.downloader == null) {
      console.warn("[avatar] 远程头像需要下载器但未注入（fail-closed）");
      return { ok: false, message: AVATAR_DOWNLOAD_UNSUPPORTED_HINT };
    }
    const dl = await deps.downloader.download(v);
    if (!dl.ok) {
      console.warn("[avatar] 远程头像下载失败:", dl.reason);
      return {
        ok: false,
        message: dl.reason === "unsupported" ? AVATAR_DOWNLOAD_UNSUPPORTED_HINT : AVATAR_DOWNLOAD_FAILED_HINT,
      };
    }
    return uploadLocal(dl.path); // 落地成功 ⇒ 走与本地路径同样的上传链路
  }

  // ⒜ 真本地／像 http 的本地路径（`wxfile://…`／`http://tmp/…`）：直接上传
  return uploadLocal(v);
}
