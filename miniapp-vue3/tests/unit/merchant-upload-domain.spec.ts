// 上传「域名未配置」专用提示（issue #14 · CR）：UPLOAD_DOMAIN_HINT 此前定义却未使用——
// 微信 uploadFile 报 "url not in domain list" 时商家只看到笼统「网络不稳定」，反复重试无意义。
// 链路：platform/uni/upload（errMsg → reason "domain"）→ 相册批量上传 / 封面上传（reason → 文案）。其余失败保持原文案。
// 变异靶点：①适配层不识别 domain ②相册上传不映射 domain ③封面上传不映射 domain ④timeout 被误判 domain ⑤识别过宽（普通 network 也判 domain）。
import { describe, expect, it } from "vitest";
import { createUniUpload, isUploadDomainNotConfigured } from "../../src/platform/uni/upload";
import { createAlbumUploader } from "../../src/pkg-merchant/application/merchant-album-uploader";
import { createCoverUploader } from "../../src/pkg-merchant/application/merchant-cover-uploader";
import { UPLOAD_DOMAIN_HINT, UPLOAD_NETWORK_TEXT, UPLOAD_TIMEOUT_TEXT, uploadFailText } from "../../src/pkg-merchant/domain/merchant-upload";
import type { UploadPort } from "../../src/ports/upload";

const EXPECT_TEXT = "上传域名未配置，请联系管理员在小程序后台添加 uploadFile 合法域名";
const goodCompress = { compress: async (p: string) => ({ path: "c-" + p, size: 1, width: 1, height: 1, reused: false }) };
const settle = async (u: ReturnType<typeof createAlbumUploader>) => { for (let i = 0; i < 200 && u.isRunning(); i++) await new Promise((r) => setTimeout(r, 0)); };

/** 以 errMsg 驱动真实适配器的 fail 回调，返回端口层结果 */
async function adapterResultFor(errMsg: string | undefined) {
  (globalThis as { uni?: unknown }).uni = { uploadFile: (o: { fail: (e?: unknown) => void }) => { o.fail(errMsg === undefined ? undefined : { errMsg }); return {}; } };
  try {
    return await createUniUpload().upload({ url: "https://x/u", filePath: "a", name: "files" });
  } finally {
    delete (globalThis as { uni?: unknown }).uni;
  }
}

describe("文案", () => {
  it("UPLOAD_DOMAIN_HINT 就是约定文案；uploadFailText 三分流", () => {
    expect(UPLOAD_DOMAIN_HINT).toBe(EXPECT_TEXT);
    expect(uploadFailText("domain")).toBe(EXPECT_TEXT);
    expect(uploadFailText("timeout")).toBe(UPLOAD_TIMEOUT_TEXT);
    expect(uploadFailText("network")).toBe(UPLOAD_NETWORK_TEXT);
    expect(uploadFailText("whatever")).toBe(UPLOAD_NETWORK_TEXT);
  });
});

describe("⭐平台适配：uploadFile 的 errMsg → reason", () => {
  it("「url not in domain list」及常见变体 ⇒ domain（变异：不识别即红）", async () => {
    for (const m of ["uploadFile:fail url not in domain list", "request:fail url not in domain list", "uploadFile:fail 请求域名不在合法域名列表中", "uploadFile:fail 域名不在合法域名白名单，请在小程序后台配置合法域名"]) {
      expect(await adapterResultFor(m), m).toEqual({ ok: false, reason: "domain" });
    }
    expect(isUploadDomainNotConfigured("uploadFile:fail url not in domain list")).toBe(true);
  });
  it("⭐其它失败不被误判：timeout ⇒ timeout；普通网络/无 errMsg ⇒ network（变异：识别过宽/timeout 误判即红）", async () => {
    expect(await adapterResultFor("uploadFile:fail timeout")).toEqual({ ok: false, reason: "timeout" });
    expect(await adapterResultFor("uploadFile:fail request:fail timeout")).toEqual({ ok: false, reason: "timeout" });
    expect(await adapterResultFor("uploadFile:fail net::ERR_CONNECTION_RESET")).toEqual({ ok: false, reason: "network" });
    expect(await adapterResultFor("uploadFile:fail abort")).toEqual({ ok: false, reason: "network" });
    expect(await adapterResultFor(undefined)).toEqual({ ok: false, reason: "network" });
  });
});

describe("⭐相册批量上传：reason → 文案", () => {
  const run = async (reason: string) => {
    const port: UploadPort = { upload: async () => ({ ok: false, reason }), cancel: () => {} };
    const u = createAlbumUploader({ upload: port, compress: goodCompress, getToken: () => "T", uploadUrl: "u", shopId: 3, albumId: 7 });
    u.enqueue([{ path: "a", size: 1 }]);
    await settle(u);
    return u.items()[0];
  };
  it("domain ⇒ 域名未配置文案（变异：不映射即红）；失败发生在 upload 阶段", async () => {
    const it0 = await run("domain");
    expect(it0.status).toBe("failed");
    expect(it0.error).toBe(EXPECT_TEXT);
    expect(it0.failedAt).toBe("upload");
  });
  it("timeout / network 保持原文案（通用失败不受影响）", async () => {
    expect((await run("timeout")).error).toBe(UPLOAD_TIMEOUT_TEXT);
    expect((await run("network")).error).toBe(UPLOAD_NETWORK_TEXT);
  });
});

describe("⭐封面上传：reason → 文案", () => {
  const run = async (reason: string) => {
    const c = createCoverUploader({ upload: { upload: async () => ({ ok: false, reason }), cancel: () => {} }, compress: goodCompress, getToken: () => "T", uploadUrl: "u" });
    return await c.upload({ shopId: 3, path: "a", size: 1 });
  };
  it("domain ⇒ 域名未配置文案（变异：不映射即红）；timeout / network 原样", async () => {
    expect(await run("domain")).toMatchObject({ ok: false, message: EXPECT_TEXT });
    expect(await run("timeout")).toMatchObject({ ok: false, message: UPLOAD_TIMEOUT_TEXT });
    expect(await run("network")).toMatchObject({ ok: false, message: UPLOAD_NETWORK_TEXT });
  });
});
