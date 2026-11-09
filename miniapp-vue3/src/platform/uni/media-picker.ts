// 多选选图适配（issue #14 · M2 商家端相册批量上传）：`chooseMedia`（mediaType: image，相册/相机，count ≤ 9）。
// 通用适配器（名称不含业务词）：平台 API 只许落在 src/platform/**（SPEC §二①）；上层经 `MediaPickerPort` 使用。
// 与头像单选 chooser 的差别：这里要**多选**且要每张的**字节数**（用于压缩决策/进度），所以单独成件、不改既有 chooser。
// 三态返回：{ok:true,files} / {ok:false,reason:"cancel"}（用户取消，静默）/ {ok:false,reason:"unsupported"|"failed"}（须可读提示）。
// 容器安全：API 缺失 ⇒ unsupported；任何异常 ⇒ failed；绝不抛。
export interface PickedMedia {
  path: string;
  /** 字节数；容器未提供为 0（上层按「未知 ⇒ 保守压缩」处理） */
  size: number;
}

export type MediaPickResult =
  | { ok: true; files: PickedMedia[] }
  | { ok: false; reason: "cancel" | "unsupported" | "failed"; errMsg: string };

export interface MediaPickerPort {
  /** 多选图片（count 会被收敛到 1..9）；原图（不让系统先压一遍，由上层按商家口径统一压缩） */
  pick(count: number): Promise<MediaPickResult>;
}

/** wx.chooseMedia 上限 */
export const CHOOSE_MEDIA_MAX = 9;

interface ChooseMediaLike {
  chooseMedia?: (o: Record<string, unknown>) => void;
}

function uniApi(): ChooseMediaLike | undefined {
  const injected = typeof globalThis === "undefined" ? undefined : (globalThis as { uni?: ChooseMediaLike }).uni;
  if (injected != null) return injected;
  return typeof uni !== "undefined" ? (uni as unknown as ChooseMediaLike) : undefined;
}

export function createUniMediaPicker(): MediaPickerPort {
  return {
    pick(count: number): Promise<MediaPickResult> {
      return new Promise((resolve) => {
        const api = uniApi();
        if (typeof api?.chooseMedia !== "function") {
          resolve({ ok: false, reason: "unsupported", errMsg: "chooseMedia unavailable" });
          return;
        }
        const n = Math.min(CHOOSE_MEDIA_MAX, Math.max(1, Math.trunc(Number.isFinite(count) ? count : 1)));
        try {
          api.chooseMedia({
            count: n,
            mediaType: ["image"],
            sourceType: ["album", "camera"],
            sizeType: ["original"],
            success: (res: { tempFiles?: Array<{ tempFilePath?: string; size?: number }> }) => {
              const files: PickedMedia[] = [];
              for (const f of res?.tempFiles ?? []) {
                const path = typeof f?.tempFilePath === "string" ? f.tempFilePath : "";
                if (path === "") continue;
                files.push({ path, size: typeof f.size === "number" && Number.isFinite(f.size) && f.size > 0 ? Math.trunc(f.size) : 0 });
              }
              resolve(files.length > 0 ? { ok: true, files } : { ok: false, reason: "failed", errMsg: "empty result" });
            },
            fail: (err?: { errMsg?: string }) => {
              const msg = typeof err?.errMsg === "string" ? err.errMsg : "";
              // 用户在选择器里点取消：errMsg 含 cancel（属正常，不提示）
              resolve({ ok: false, reason: msg.includes("cancel") ? "cancel" : "failed", errMsg: msg });
            },
          });
        } catch (e) {
          resolve({ ok: false, reason: "failed", errMsg: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}
