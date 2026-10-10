// 人脸信息单独同意（2026-09-28 流量成本 PRD R27 前端部分）。
// 人脸照片属《个人信息保护法》「敏感个人信息」⇒ 首次上传前需**单独同意**；
// 同意状态按 profile 持久化（多品牌/多小程序包隔离），同意事件经 analytics 上报留痕。
// ⚠️ 文案按 PRD 原文，上线前需法务终审；服务端「同意事件＋时间戳落库备查」（R27 后半句）
//    属服务端仓库，见 docs/traffic-cost-scan.md 移交清单。
import type { StoragePort } from "../ports/storage";

const KEY_SUFFIX = "face_consent_v1";

export const FACE_CONSENT_TITLE = "人脸信息使用授权";
/** PRD R27 原文（待法务终审） */
export const FACE_CONSENT_CONTENT =
  "人脸信息仅用于试衣 / 推荐合成，并按最短期限保存。拒绝授权将无法使用 AI 试衣与 AI 推荐功能。";

export function faceConsentKey(profileKey: string): string {
  return `${profileKey}:${KEY_SUFFIX}`;
}

export function hasFaceConsent(storage: StoragePort, profileKey: string): boolean {
  try {
    return storage.get(faceConsentKey(profileKey)) === "granted";
  } catch {
    return false;
  }
}

export function grantFaceConsent(storage: StoragePort, profileKey: string): void {
  try {
    storage.set(faceConsentKey(profileKey), "granted");
  } catch {
    // 容器异常静默（下次进页再询问，不产生错误授权记录）
  }
}

interface UniModalLike {
  showModal?: (o: {
    title: string;
    content: string;
    showCancel: boolean;
    confirmText: string;
    cancelText: string;
    success: (res: { confirm?: boolean; cancel?: boolean }) => void;
    fail: () => void;
  }) => void;
}

/** 取容器 API：优先注入桩（`globalThis.uni`，测试/H5），再回落裸 `uni`（同 chooser/upload 口径） */
function uniApi(): UniModalLike | undefined {
  const injected = (typeof globalThis === "undefined" ? undefined : (globalThis as { uni?: UniModalLike }).uni);
  if (injected != null) return injected;
  return typeof uni !== "undefined" ? (uni as unknown as UniModalLike) : undefined;
}

/**
 * 弹「单独同意」确认框，resolve 用户选择。
 * 容器无 showModal（测试/异常容器）→ resolve true：真实微信端必有该 API，
 * 此处 fail-open 与全站容器安全纪律一致（不因此卡死上传链路）。
 */
export function confirmFaceConsent(): Promise<boolean> {
  return new Promise((resolve) => {
    const u = uniApi();
    if (typeof u?.showModal !== "function") {
      resolve(true);
      return;
    }
    try {
      u.showModal({
        title: FACE_CONSENT_TITLE,
        content: FACE_CONSENT_CONTENT,
        showCancel: true,
        confirmText: "同意",
        cancelText: "拒绝",
        success: (res) => resolve(res?.confirm === true),
        fail: () => resolve(false),
      });
    } catch {
      resolve(false);
    }
  });
}
