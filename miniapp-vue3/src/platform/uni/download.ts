// download 适配（2026-10-13 · task-62 追加③）：把**第三方远程图片 URL 落地为本地临时文件**，供既有上传口上传。
// 为什么需要：抖音 `getUserInfo` 返回的是**远程头像 URL**（抖音 CDN），必须「先落地再上传」；直接把它当本地文件传会零请求失败。
// 平台差异与 API 调用**全部收口在本文件**（platform/**），逻辑层零 #ifdef；抖音端优先原生 `tt.downloadFile`
// （与 `tt.chooseImage`／`tt.uploadFile` 同族；uni 对抖音的 shim 覆盖不全），非抖音端走 `uni.downloadFile`，
// 两者都不可用 ⇒ `unsupported`（调用方给可读提示，禁止静默）。
import { ttApiOf } from "./runtime-env";

export type DownloadResult =
  | { ok: true; path: string }
  | { ok: false; reason: "unsupported" | "failed" };

interface DownloadRes {
  tempFilePath?: string;
  filePath?: string;
}

/** 取容器 API：优先 `globalThis.uni`（测试桩），再回落裸 `uni`（与 chooser/upload 同口径） */
function uniApi<T>(): T | undefined {
  const injected = typeof globalThis === "undefined" ? undefined : (globalThis as { uni?: T }).uni;
  if (injected != null) return injected;
  return typeof uni !== "undefined" ? (uni as unknown as T) : undefined;
}

type DownloadFn = (options: Record<string, unknown>) => void;

/** 择优：抖音端优先 `tt.downloadFile`，否则 `uni.downloadFile`；都没有 ⇒ null */
function resolveDownloader(): DownloadFn | null {
  const tt = ttApiOf<{ downloadFile?: DownloadFn }>(); // ⭐task-65：不得直取 globalThis 上的 tt
  if (tt != null && typeof tt.downloadFile === "function") return tt.downloadFile.bind(tt);
  const u = uniApi<{ downloadFile?: DownloadFn }>();
  if (typeof u?.downloadFile === "function") return u.downloadFile.bind(u);
  return null;
}

/** 平台 API 可用性快照（**安全探测、不抛**；供结构化诊断日志使用） */
export function platformApiAvailability(): Record<string, string> {
  try {
    const u = uniApi<Record<string, unknown>>();
    const tt = ttApiOf<Record<string, unknown>>();
    return {
      uniUploadFile: typeof u?.uploadFile,
      ttUploadFile: typeof tt?.uploadFile,
      uniChooseImage: typeof u?.chooseImage,
      ttChooseImage: typeof tt?.chooseImage,
      uniDownloadFile: typeof u?.downloadFile,
      ttDownloadFile: typeof tt?.downloadFile,
    };
  } catch {
    return { probe: "failed" };
  }
}

/** 供 `application/avatar.ts` 注入的下载器工厂（**平台 API 收口在此**） */
export function createUniAvatarDownloader(): { download(url: string): Promise<DownloadResult> } {
  return { download: downloadRemoteFile };
}

/** 第三方远程图片 ⇒ 本地临时文件路径（三态：ok／unsupported／failed） */
export function downloadRemoteFile(url: string): Promise<DownloadResult> {
  return new Promise((resolve) => {
    const dl = resolveDownloader();
    if (dl == null) {
      resolve({ ok: false, reason: "unsupported" });
      return;
    }
    try {
      dl({
        url,
        success: (res: DownloadRes) => {
          const path = typeof res?.tempFilePath === "string" && res.tempFilePath !== "" ? res.tempFilePath : res?.filePath;
          if (typeof path !== "string" || path === "") {
            resolve({ ok: false, reason: "failed" });
            return;
          }
          resolve({ ok: true, path });
        },
        fail: () => resolve({ ok: false, reason: "failed" }),
      });
    } catch (err) {
      console.error("[download] downloadRemoteFile 异常:", err);
      resolve({ ok: false, reason: "failed" });
    }
  });
}
