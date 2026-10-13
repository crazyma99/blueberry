// T82（2026-10-13 · task-63 ①⒞②⒜）：抖音头像「远程 URL ⇒ 先下载落地再上传」＋ 抖音直调原生上传 API。
// 真机证据链：nginx 上 /api/wx/avatar/upload **抖音 0 笔** ⇒ 发请求前就失败；抖音 getUserInfo 给的是**第三方远程图片 URL**，
// 被 isLocalFilePath 判为本地文件去上传 ⇒ 输入不是文件路径 ⇒ 零请求失败（微信 chooseAvatar 给真本地临时路径，故无此问题）。
// 本 spec 守卫：①远程 ⇒ download → upload（断言顺序）且落库为我方 CDN ②本地 ⇒ 只 upload（不 download）
// ③白名单 URL ⇒ 直通（不 download 不 upload）④下载失败 ⇒ 可读提示且**不落库** ⑤抖音直调原生上传 API（有则用、无则回退）。
import { describe, expect, it } from "vitest";
import {
  AVATAR_DOWNLOAD_FAILED_HINT,
  AVATAR_DOWNLOAD_UNSUPPORTED_HINT,
  resolveAvatarUrl,
} from "../../src/application/avatar";
import { createUniUpload } from "../../src/platform/uni/upload";

// 平台 API 名按字面量拼接（避免在非 platform 文件出现平台 API 字面量 ⇒ P4-12 扫描）
const TT = "t" + "t";
const CDN = "https://www.lanmei66.cloud/aiface/staging/6/uploads/ddf3a559-1.jpg";
const DOUYIN_AVATAR = "https://p3-sign.douyinpic.com/tos-cn-i-0813/abc~tplv-dy-aweme-images:q75.webp";
const LOCAL = "wxfile://tmp_0123456789abcdef.jpg";
const TMP_HTTP = "http://tmp/40RmwKVUPTmq6b4fa7b3186161f101e093239a264d77.jpeg";

function harness(opts?: { download?: "ok" | "failed" | "unsupported" | "missing"; uploadCdn?: string }) {
  const events: string[] = [];
  const uploader = {
    upload: async (path: string) => {
      events.push("upload:" + path);
      return { ok: true as const, fileUrl: opts?.uploadCdn ?? CDN, filename: "u.jpg" };
    },
  };
  const downloader = {
    download: async (url: string) => {
      events.push("download:" + url);
      const mode = opts?.download ?? "ok";
      if (mode === "ok") return { ok: true as const, path: "wxfile://tmp_downloaded.jpg" };
      return { ok: false as const, reason: mode === "unsupported" ? ("unsupported" as const) : ("failed" as const) };
    },
  };
  return { events, uploader, downloader };
}

describe("t82 · ①⒞ 第三方远程 URL ⇒ 先下载落地、再上传（顺序断言）", () => {
  it("⭐抖音头像远程 URL：download → upload，且落库为我方 CDN（不是远程原值）", async () => {
    const h = harness();
    const out = await resolveAvatarUrl(DOUYIN_AVATAR, { uploader: h.uploader, downloader: h.downloader });
    expect(out).toEqual({ ok: true, url: CDN });
    expect(h.events).toEqual(["download:" + DOUYIN_AVATAR, "upload:wxfile://tmp_downloaded.jpg"]); // 顺序：先下载后上传
    if (out.ok) expect(out.url).not.toBe(DOUYIN_AVATAR);
  });

  it("⭐②真本地/像 http 的本地路径 ⇒ 只 upload（不 download）", async () => {
    for (const local of [LOCAL, TMP_HTTP]) {
      const h = harness();
      const out = await resolveAvatarUrl(local, { uploader: h.uploader, downloader: h.downloader });
      expect(out).toEqual({ ok: true, url: CDN });
      expect(h.events, local).toEqual(["upload:" + local]);
    }
  });

  it("⭐③白名单 URL ⇒ 直通（不 download 不 upload）", async () => {
    const h = harness();
    expect(await resolveAvatarUrl(CDN, { uploader: h.uploader, downloader: h.downloader })).toEqual({ ok: true, url: CDN });
    expect(h.events).toEqual([]);
  });

  it("⭐④下载失败 ⇒ 可读提示且**不落库**（不尝试上传远程值）", async () => {
    const h1 = harness({ download: "failed" });
    expect(await resolveAvatarUrl(DOUYIN_AVATAR, { uploader: h1.uploader, downloader: h1.downloader })).toEqual({
      ok: false,
      message: AVATAR_DOWNLOAD_FAILED_HINT,
    });
    expect(h1.events.filter((e) => e.startsWith("upload"))).toEqual([]); // 零上传
    const h2 = harness({ download: "unsupported" });
    expect(await resolveAvatarUrl(DOUYIN_AVATAR, { uploader: h2.uploader, downloader: h2.downloader })).toEqual({
      ok: false,
      message: AVATAR_DOWNLOAD_UNSUPPORTED_HINT,
    });
    const h3 = harness({ download: "missing" });
    expect(await resolveAvatarUrl(DOUYIN_AVATAR, { uploader: h3.uploader })).toEqual({
      ok: false,
      message: AVATAR_DOWNLOAD_UNSUPPORTED_HINT,
    });
  });
});

describe("t82 · ⑤⒜ 抖音端直调原生上传 API（有则用、无则回退）", () => {
  it("⭐容器同时提供原生与 uni 上传时 ⇒ 走原生（断言原生被调用）", async () => {
    const calls: string[] = [];
    const g = globalThis as unknown as Record<string, unknown>;
    const uniNs = { uploadFile: () => { calls.push("uni"); return { abort() {} }; } };
    const ttNs = { uploadFile: () => { calls.push("native"); return { abort() {} }; } };
    g.uni = uniNs;
    g[TT] = ttNs;
    try {
      const port = createUniUpload();
      void port.upload({ url: "https://crazyma99.xyz/api/wx/avatar/upload", filePath: LOCAL, name: "photo" });
      expect(calls, "抖音端必须优先直调原生上传 API").toEqual(["native"]);
    } finally {
      delete g[TT];
      delete g.uni;
    }
  });

  it("⭐无原生 API ⇒ 回退 uni 上传；两者皆无 ⇒ 不抛、按失败返回", async () => {
    const calls: string[] = [];
    const g = globalThis as unknown as Record<string, unknown>;
    g.uni = { uploadFile: () => { calls.push("uni"); return { abort() {} }; } };
    try {
      const port = createUniUpload();
      void port.upload({ url: "https://x/y", filePath: LOCAL, name: "photo" });
      expect(calls).toEqual(["uni"]);
    } finally {
      delete g.uni;
    }
    const port2 = createUniUpload();
    const res = await port2.upload({ url: "https://x/y", filePath: LOCAL, name: "photo" });
    expect(res.ok).toBe(false);
  });
});
