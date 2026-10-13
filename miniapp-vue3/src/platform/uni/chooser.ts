import { ttApiOf } from "./runtime-env";
// T8 S3 选图适配（旧端 aiTryOn:437-453 `uni.chooseImage`）。
// 参数逐字：count 1／sizeType ['compressed']／sourceType ['album','camera']。
// 容器安全：无 uni.chooseImage（测试/异常容器）或用户取消 → 返回 null，不抛。
export interface PickedPhoto {
  path: string;
  /** 文件字节数；容器未提供时为 0（大小上限判定由调用方处理） */
  size: number;
}

export interface PhotoChooserPort {
  choose(): Promise<PickedPhoto | null>;
}

interface UniChooseRes {
  tempFilePaths?: string[];
  tempFiles?: Array<{ size?: number }>;
}

/** 取容器 API：**优先 `globalThis.uni`（测试桩/H5），再回落裸 `uni`**（mp 产物由编译器改写）。
 *  2026-09-23 统一口径（同 `album-save.uniApi()`）：此前 chooser/upload/feedback 只认裸 `uni`，
 *  在「先有桩、后无裸标识符」或编译器改写差异的环境下会静默降级（选图/上传直接判为容器不支持）。 */
function uniApi<T>(): T | undefined {
  const injected = (typeof globalThis === "undefined" ? undefined : (globalThis as { uni?: T }).uni);
  if (injected != null) return injected;
  return typeof uni !== "undefined" ? (uni as unknown as T) : undefined;
}


// ─────────────────────────── 头像取图（2026-10-13 · task-62 真机反馈修复） ───────────────────────────
// 事实（主人真机，抖音端）：自建「从相册选择」**点了不弹**——旧实现只认 `uni.chooseImage`，抖音容器下取不到该 API 时
// **静默返回 null**（与「用户取消」不可区分）⇒ 用户与我方都看不到任何反馈。
// ⇒ 新口径：
//   · **择优探测（按端）**：**抖音端 `tt.chooseImage` → `tt.chooseMedia`**（官方依据见 `resolvePicker()` 注释：基础库 1.0.0，
//     `tt.getUserInfo` 之外官方明确支持取图；uni 对抖音的 shim 覆盖不全）→ 兜底 `uni.chooseImage` → `uni.chooseMedia`；
//     非抖音端：`uni.chooseImage` → `uni.chooseMedia`；
//   · **三态返回**：`{ok:true,path}` / `{ok:false,reason:"cancel"}` / `{ok:false,reason:"unsupported"|"failed"}`；
//   · **取消可静默，但 unsupported／failed 必须可读提示**（由 `toastAvatarPickFailure` 统一给文案，禁止静默）。
type ChooseLikeOptions = Record<string, unknown>;

/** 候选取图 API 及其**量身参数**（2026-10-13 task-64⒜：chooseImage 家族不接受 mediaType，严格校验会直接失败） */
interface PickCandidate {
  name: "tt.chooseImage" | "tt.chooseMedia" | "uni.chooseImage" | "uni.chooseMedia";
  fn: (o: ChooseLikeOptions) => void;
  /** 是否支持 mediaType（仅 chooseMedia 家族） */
  supportsMediaType: boolean;
}

/** 四类失败原因（2026-10-13 task-64⒞：按原始 errMsg 分级） */
export type AvatarPickFailReason = "cancel" | "unsupported" | "authorize" | "failed";

export type AvatarPickResult =
  | { ok: true; path: string }
  | { ok: false; reason: AvatarPickFailReason; lastErrMsg: string };

/** 可用候选（**顺序回退**：抖音原生 → 抖音 media → uni image → uni media；全败才提示） */
function pickCandidates(): PickCandidate[] {
  const list: PickCandidate[] = [];
  const tt = ttApiOf<{
    chooseImage?: (o: ChooseLikeOptions) => void;
    chooseMedia?: (o: ChooseLikeOptions) => void;
  }>();
  const u = uniApi<{
    chooseImage?: (o: ChooseLikeOptions) => void;
    chooseMedia?: (o: ChooseLikeOptions) => void;
  }>();
  if (typeof tt?.chooseImage === "function") list.push({ name: "tt.chooseImage", fn: tt.chooseImage.bind(tt), supportsMediaType: false });
  if (typeof tt?.chooseMedia === "function") list.push({ name: "tt.chooseMedia", fn: tt.chooseMedia.bind(tt), supportsMediaType: true });
  if (typeof u?.chooseImage === "function") list.push({ name: "uni.chooseImage", fn: u.chooseImage.bind(u), supportsMediaType: false });
  if (typeof u?.chooseMedia === "function") list.push({ name: "uni.chooseMedia", fn: u.chooseMedia.bind(u), supportsMediaType: true });
  return list;
}

/** 原始 errMsg 分级：权限类 ⇒ authorize；不支持 ⇒ unsupported；取消 ⇒ cancel；其它 ⇒ failed */
export function gradeAvatarPickError(errMsg: string): AvatarPickFailReason {
  const m = (errMsg ?? "").toLowerCase();
  if (/cancel|取消/.test(m)) return "cancel";
  if (/scope|privacy|authorize|permission|deny|auth deny/.test(m)) return "authorize";
  if (/not support|unsupported|not implemented|is not a function|undefined/.test(m)) return "unsupported";
  return "failed";
}

/** 可读文案（**全败才提示**；cancel ⇒ 静默空串；其余均带下一步） */
export function avatarPickFailureHint(reason: AvatarPickFailReason, lastErrMsg = ""): string {
  if (reason === "cancel") return "";
  if (reason === "authorize") return "未获得相册权限，请在端内设置/后台声明相册（scope.album）后重试";
  if (reason === "unsupported") return "当前端不支持从相册选择，请改用「用抖音头像」（或真机测试）";
  return lastErrMsg.includes("fail") ? "打开相册失败，请重试（已记录日志）" : "打开相册失败，请重试";
}

/** release 运行时判定（trial/develop 打完整诊断、release 精简） */
function isReleaseRuntime(): boolean {
  try {
    const u = uniApi<{ getAccountInfoSync?: () => { miniProgram?: { envVersion?: string } } }>();
    return u?.getAccountInfoSync?.().miniProgram?.envVersion === "release";
  } catch {
    return false;
  }
}

/** ⭐结构化诊断日志（task-64⒞）：candidate 名 ＋ 原始 errMsg ＋ 分级 ＋ 平台 API 可用性（release 精简、无敏感信息） */
export function logAvatarPickFailure(input: { candidate: string; errMsg: string; reason: AvatarPickFailReason }): void {
  const base = { candidate: input.candidate, errMsg: input.errMsg, reason: input.reason };
  if (isReleaseRuntime()) {
    console.warn("[avatar-pick] failed", { candidate: base.candidate, reason: base.reason });
    return;
  }
  console.warn("[avatar-pick] failed", base);
}

/** 统一提示入口（reason 为空＝取消 ⇒ 静默） */
export function toastAvatarPickFailure(reason: AvatarPickFailReason, lastErrMsg = ""): void {
  const text = avatarPickFailureHint(reason, lastErrMsg);
  if (text === "") return;
  try {
    (uniApi<{ showToast?: (o: { title: string; icon: string }) => void }>() ?? {}).showToast?.({ title: text, icon: "none" });
  } catch {
    /* 容器差异：提示失败不影响主流程 */
  }
}

/**
 * 头像取图：**顺序回退四候选**，每个候选**只传它支持的参数**；全败才返回失败并带**最后一个 errMsg**（绝不静默）。
 */
export function pickAvatarImage(): Promise<AvatarPickResult> {
  return new Promise((resolve) => {
    const list = pickCandidates();
    if (list.length === 0) {
      resolve({ ok: false, reason: "unsupported", lastErrMsg: "no picker api" });
      return;
    }
    let idx = 0;
    let lastErrMsg = "";
    let lastCandidate = list[0].name;
    const tryNext = (): void => {
      if (idx >= list.length) {
        const reason = gradeAvatarPickError(lastErrMsg);
        logAvatarPickFailure({ candidate: lastCandidate, errMsg: lastErrMsg, reason });
        resolve({ ok: false, reason, lastErrMsg });
        return;
      }
      const candidate = list[idx++];
      lastCandidate = candidate.name;
      const options: ChooseLikeOptions = {
        count: 1,
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
      };
      if (candidate.supportsMediaType) options.mediaType = ["image"]; // ⭐task-64⒜：只给 chooseMedia 家族
      options.success = (res: UniChooseRes & { tempFiles?: Array<{ tempFilePath?: string }> }) => {
        const direct = Array.isArray(res?.tempFilePaths) ? res.tempFilePaths[0] : undefined;
        const fromFiles = Array.isArray(res?.tempFiles) ? res.tempFiles[0]?.tempFilePath : undefined;
        const path = typeof direct === "string" && direct !== "" ? direct : fromFiles;
        if (typeof path !== "string" || path === "") {
          lastErrMsg = candidate.name + ":fail empty path";
          tryNext();
          return;
        }
        resolve({ ok: true, path });
      };
      options.fail = (err?: { errMsg?: string }) => {
        lastErrMsg = typeof err?.errMsg === "string" && err.errMsg !== "" ? err.errMsg : candidate.name + ":fail unknown";
        if (gradeAvatarPickError(lastErrMsg) === "cancel") {
          resolve({ ok: false, reason: "cancel", lastErrMsg }); // 取消 ⇒ 静默，不再试下一个
          return;
        }
        tryNext(); // 其它失败 ⇒ 回退下一个候选
      };
      try {
        candidate.fn(options);
      } catch (err) {
        lastErrMsg = candidate.name + " threw: " + String(err);
        tryNext();
      }
    };
    tryNext();
  });
}
export function createUniPhotoChooser(): PhotoChooserPort {
  return {
    choose(): Promise<PickedPhoto | null> {
      return new Promise((resolve) => {
        const u = uniApi<{ chooseImage?: (o: Record<string, unknown>) => void }>();
        if (typeof u?.chooseImage !== "function") {
          resolve(null);
          return;
        }
        try {
          // 窄化调用：@dcloudio/types 对 chooseImage 的 options/回调签名更严（与容器实参不一致），
          // 且各端 res 形态不完全相同 ⇒ 与 transport/upload 适配同口径，按 Record 收窄后自行解析。
          const api = u as unknown as {
            chooseImage: (options: Record<string, unknown>) => void;
          };
          api.chooseImage({
            count: 1,
            sizeType: ["compressed"],
            sourceType: ["album", "camera"],
            success: (res: UniChooseRes) => {
              const path = Array.isArray(res?.tempFilePaths) ? res.tempFilePaths[0] : undefined;
              if (typeof path !== "string" || path === "") {
                resolve(null);
                return;
              }
              const rawSize = Array.isArray(res?.tempFiles) ? res.tempFiles[0]?.size : undefined;
              resolve({ path, size: typeof rawSize === "number" ? rawSize : 0 });
            },
            fail: () => resolve(null), // 用户取消/容器失败一律 null（调用方静默）
          });
        } catch {
          resolve(null);
        }
      });
    },
  };
}
