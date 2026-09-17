// T8 S3a 测试：选图适配（容器安全/成功/取消）＋上传解析（字符串|对象/成功码 0·200/失败文案/401）＋上传头构造＋用例编排。
import { beforeEach, describe, expect, it } from "vitest";
import { createUniPhotoChooser } from "../../src/platform/uni/chooser";
import { DEFAULT_UPLOAD_TIMEOUT_MS, createUniUpload } from "../../src/platform/uni/upload";
import {
  buildUploadHeaders,
  createAiPhotoUploader,
  parseUploadResult,
  PHOTO_SIZE_LIMIT_BYTES,
} from "../../src/application/ai-photo-upload";
import type { UploadPort } from "../../src/ports/upload";

beforeEach(() => {
  delete (globalThis as { uni?: unknown }).uni;
});

describe("platform/uni/chooser（T8 S3 选图适配）", () => {
  it("容器无 uni.chooseImage → null（不抛）", async () => {
    await expect(createUniPhotoChooser().choose()).resolves.toBeNull();
  });

  it("成功：参数为 count1／compressed／album+camera；返回 path 与 size", async () => {
    const seen: Array<Record<string, unknown>> = [];
    (globalThis as { uni?: unknown }).uni = {
      chooseImage: (o: Record<string, unknown>) => {
        seen.push(o);
        (o.success as (r: unknown) => void)({ tempFilePaths: ["/tmp/a.jpg"], tempFiles: [{ size: 1234 }] });
      },
    };
    const r = await createUniPhotoChooser().choose();
    expect(r).toEqual({ path: "/tmp/a.jpg", size: 1234 });
    expect(seen[0]).toMatchObject({ count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"] });
  });

  it("用户取消（fail）／缺少路径 → null；size 缺失回 0", async () => {
    (globalThis as { uni?: unknown }).uni = {
      chooseImage: (o: Record<string, unknown>) => (o.fail as () => void)(),
    };
    await expect(createUniPhotoChooser().choose()).resolves.toBeNull();
    (globalThis as { uni?: unknown }).uni = {
      chooseImage: (o: Record<string, unknown>) => (o.success as (r: unknown) => void)({ tempFilePaths: [] }),
    };
    await expect(createUniPhotoChooser().choose()).resolves.toBeNull();
    (globalThis as { uni?: unknown }).uni = {
      chooseImage: (o: Record<string, unknown>) => (o.success as (r: unknown) => void)({ tempFilePaths: ["/p.jpg"] }),
    };
    await expect(createUniPhotoChooser().choose()).resolves.toEqual({ path: "/p.jpg", size: 0 });
  });
});

describe("application/ai-photo-upload（T8 S3 上传用例）", () => {
  it("parseUploadResult：对象/字符串两种形态；成功码 0 与 200 等价；filename 空视为失败", () => {
    expect(parseUploadResult({ code: 200, data: { filename: "f1", file_url: "u1" } })).toEqual({
      ok: true,
      filename: "f1",
      fileUrl: "u1",
    });
    expect(parseUploadResult(JSON.stringify({ code: 0, data: { filename: "f2" } }))).toMatchObject({ ok: true, filename: "f2" });
    // 失败：优先服务端 message
    expect(parseUploadResult({ code: 500, message: "图片过大", data: {} })).toMatchObject({ ok: false, message: "图片过大" });
    // filename 空串 → 失败（旧端判定 filename !== ''）
    expect(parseUploadResult({ code: 200, data: { filename: "" } })).toMatchObject({ ok: false, message: "照片上传失败，请重新选择" });
    // HTTP 401（上传端口把 401 归为响应体/业务码）→ authExpired 标记
    expect(parseUploadResult({ code: 401, message: "unauthorized" })).toMatchObject({ ok: false, authExpired: true });
    // 非法 JSON / 非对象 → 稳定失败文案
    expect(parseUploadResult("{broken")).toMatchObject({ ok: false, message: "照片上传失败，请重新选择" });
    expect(parseUploadResult(null)).toMatchObject({ ok: false });
  });

  it("上传头：恒带 X-App-Code；有 token 才带 Bearer；有品牌才带 X-Brand-Id", () => {
    expect(buildUploadHeaders({ token: null, brandId: null, appCode: "blueBerry" })).toEqual({ "X-App-Code": "blueBerry" });
    expect(buildUploadHeaders({ token: "t", brandId: "lanmei", appCode: "blueBerry" })).toEqual({
      "X-App-Code": "blueBerry",
      Authorization: "Bearer t",
      "X-Brand-Id": "lanmei",
    });
  });

  it("编排：URL 去尾斜杠＋/api/aiface/upload、字段名 photo；端口失败→统一失败文案；成功→filename", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const okPort: UploadPort = {
      upload: async (req) => {
        calls.push(req as unknown as Record<string, unknown>);
        return { ok: true, value: { statusCode: 200, data: JSON.stringify({ code: 0, data: { filename: "up.png" }, }) } };
      },
      cancel: () => undefined,
    };
    const uploader = createAiPhotoUploader({
      upload: okPort,
      baseUrl: "https://crazyma99.xyz/",
      headers: () => buildUploadHeaders({ token: "t", brandId: null, appCode: "blueBerry" }),
    });
    await expect(uploader.upload("/tmp/a.jpg")).resolves.toMatchObject({ ok: true, filename: "up.png" });
    expect(calls[0]).toMatchObject({ url: "https://crazyma99.xyz/api/aiface/upload", name: "photo", filePath: "/tmp/a.jpg" });

    const failPort: UploadPort = { upload: async () => ({ ok: false, reason: "network" }), cancel: () => undefined };
    const uploader2 = createAiPhotoUploader({ upload: failPort, baseUrl: "https://x/", headers: () => ({}) });
    await expect(uploader2.upload("/tmp/a.jpg")).resolves.toMatchObject({ ok: false, message: "照片上传失败，请重新选择" });
  });

  it("常量：单张上限 10MB（旧端 :445）", () => {
    expect(PHOTO_SIZE_LIMIT_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("上传超时兜底（2026-09-17：防「上传中…」永久卡住）", () => {
  it("适配层：未显式传 timeout 时套用默认 60s；fail(errMsg含 timeout) → reason=timeout", async () => {
    const seen: Array<Record<string, unknown>> = [];
    (globalThis as { uni?: unknown }).uni = {
      uploadFile: (o: Record<string, unknown>) => {
        seen.push(o);
        (o.fail as (e: unknown) => void)({ errMsg: "uploadFile:fail timeout" });
        return { abort: () => undefined };
      },
    };
    const r = await createUniUpload().upload({ url: "https://x/u", filePath: "/tmp/a.png", name: "photo" });
    expect(seen[0].timeout).toBe(DEFAULT_UPLOAD_TIMEOUT_MS);
    expect(r).toEqual({ ok: false, reason: "timeout" });
    // 显式传入优先
    const seen2: Array<Record<string, unknown>> = [];
    (globalThis as { uni?: unknown }).uni = {
      uploadFile: (o: Record<string, unknown>) => {
        seen2.push(o);
        (o.success as (r: unknown) => void)({ statusCode: 200, data: "{}" });
        return { abort: () => undefined };
      },
    };
    await createUniUpload().upload({ url: "https://x/u", filePath: "/tmp/a.png", name: "photo", timeoutMs: 1234 });
    expect(seen2[0].timeout).toBe(1234);
  });

  it("用例层：端口 timeout → 文案「上传超时，请重试」", async () => {
    const uploader = createAiPhotoUploader({
      upload: { upload: async () => ({ ok: false, reason: "timeout" }), cancel: () => undefined },
      baseUrl: "https://x/",
      headers: () => ({}),
    });
    await expect(uploader.upload("/tmp/a.jpg")).resolves.toEqual({ ok: false, message: "上传超时，请重试" });
  });
});
