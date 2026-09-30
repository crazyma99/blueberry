// 2026-09-28 流量成本 PRD：R27 人脸信息单独同意 + R18 上传进度透传。
import { beforeEach, describe, expect, it } from "vitest";
import {
  FACE_CONSENT_CONTENT,
  confirmFaceConsent,
  faceConsentKey,
  grantFaceConsent,
  hasFaceConsent,
} from "../../src/application/face-consent";
import { createUniUpload } from "../../src/platform/uni/upload";
import { createAiPhotoUploader } from "../../src/application/ai-photo-upload";
import type { StoragePort } from "../../src/ports/storage";
import type { UploadPort } from "../../src/ports/upload";

function memStorage(): StoragePort {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => {
      m.set(k, v);
    },
    remove: (k) => {
      m.delete(k);
    },
  };
}

beforeEach(() => {
  delete (globalThis as { uni?: unknown }).uni;
});

describe("face-consent（PRD R27：敏感个人信息单独同意）", () => {
  it("未同意 → 询问；同意持久化（按 profile 隔离）；拒绝不持久化", async () => {
    const s = memStorage();
    expect(hasFaceConsent(s, "blueberry")).toBe(false);

    (globalThis as { uni?: unknown }).uni = {
      showModal: (o: { success: (r: { confirm: boolean }) => void }) => o.success({ confirm: false }),
    };
    await expect(confirmFaceConsent()).resolves.toBe(false); // 拒绝
    expect(hasFaceConsent(s, "blueberry")).toBe(false); // 拒绝不落盘

    (globalThis as { uni?: unknown }).uni = {
      showModal: (o: { success: (r: { confirm: boolean }) => void }) => o.success({ confirm: true }),
    };
    await expect(confirmFaceConsent()).resolves.toBe(true);
    grantFaceConsent(s, "blueberry");
    expect(hasFaceConsent(s, "blueberry")).toBe(true);
    expect(hasFaceConsent(s, "huahua")).toBe(false); // profile 隔离
    expect(faceConsentKey("blueberry")).not.toBe(faceConsentKey("huahua"));
  });

  it("容器无 showModal → fail-open 放行（真实微信端必有该 API）；文案含 PRD 原文", async () => {
    await expect(confirmFaceConsent()).resolves.toBe(true);
    expect(FACE_CONSENT_CONTENT).toContain("人脸信息仅用于试衣");
    expect(FACE_CONSENT_CONTENT).toContain("最短期限保存");
  });

  it("showModal fail/取消 → false（不进入选图）", async () => {
    (globalThis as { uni?: unknown }).uni = { showModal: (o: { fail: () => void }) => o.fail() };
    await expect(confirmFaceConsent()).resolves.toBe(false);
    (globalThis as { uni?: unknown }).uni = {
      showModal: (o: { success: (r: { confirm: boolean; cancel: boolean }) => void }) =>
        o.success({ confirm: false, cancel: true }),
    };
    await expect(confirmFaceConsent()).resolves.toBe(false);
  });
});

describe("上传进度透传（PRD R18）", () => {
  it("适配层：task.onProgressUpdate → req.onProgress（0-100）；无回调/无该 API 不影响上传", async () => {
    let progressCb: ((r: { progress: number }) => void) | null = null;
    (globalThis as { uni?: unknown }).uni = {
      uploadFile: (o: Record<string, unknown>) => {
        setTimeout(() => {
          progressCb?.({ progress: 42 });
          (o.success as (r: unknown) => void)({ statusCode: 200, data: "{}" });
        }, 0);
        return {
          onProgressUpdate: (cb: (r: { progress: number }) => void) => {
            progressCb = cb;
          },
          abort: () => undefined,
        };
      },
    };
    const seen: number[] = [];
    const r = await createUniUpload().upload({ url: "https://x/u", filePath: "/tmp/a.png", name: "photo", onProgress: (p) => seen.push(p) });
    expect(r).toMatchObject({ ok: true });
    expect(seen).toEqual([42]);

    // 不传 onProgress：正常完成
    (globalThis as { uni?: unknown }).uni = {
      uploadFile: (o: Record<string, unknown>) => {
        (o.success as (r: unknown) => void)({ statusCode: 200, data: "{}" });
        return { abort: () => undefined }; // 无 onProgressUpdate 能力
      },
    };
    await expect(
      createUniUpload().upload({ url: "https://x/u", filePath: "/tmp/a.png", name: "photo" }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("用例层：onProgress 透传到端口请求体", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const port: UploadPort = {
      upload: async (req) => {
        seen.push(req as unknown as Record<string, unknown>);
        return { ok: true, value: { statusCode: 200, data: JSON.stringify({ code: 0, data: { filename: "f" } }) } };
      },
      cancel: () => undefined,
    };
    const uploader = createAiPhotoUploader({ upload: port, baseUrl: "https://x/", headers: () => ({}) });
    const cb = () => undefined;
    await uploader.upload("/tmp/a.jpg", cb);
    expect(seen[0].onProgress).toBe(cb);
  });
});
