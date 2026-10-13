// T85（2026-10-13 · task-67）：第三方远程头像 URL ⇒ **服务端代下载优先**（后端 staging 43161d3 按 JSON+sourceUrl 分流），
// 不可用 ⇒ **降级本地 downloadFile**（可读提示、绝不静默）；白名单 URL ⇒ 直通（不调任何一端）。
// 背景：真机 downloadFile 受「downloadFile 合法域名」限制，而第三方头像域不该加白名单 ⇒ 客户端下载被拦（真机日志 [avatar] 远程头像下载失败: failed）。
import { describe, expect, it } from "vitest";
import {
  AVATAR_DOWNLOAD_FAILED_HINT,
  AVATAR_DOWNLOAD_UNSUPPORTED_HINT,
  createServerAvatarProxy,
  resolveAvatarUrl,
} from "../../src/application/avatar";

const CDN = "https://www.lanmei66.cloud/aiface/staging/6/uploads/proxied.jpg";
const DOUYIN = "https://p3-sign.douyinpic.com/tos-cn-i-0813/abc~tplv.webp";
const LOCAL = "wxfile://tmp_0123456789abcdef.jpg";

function harness(opts?: { proxy?: "ok" | "status" | "network" | "badurl" | "missing"; local?: "ok" | "failed" | "unsupported" }) {
  const events: string[] = [];
  const uploader = { upload: async (path: string) => (events.push("upload:" + path), { ok: true as const, fileUrl: CDN, filename: "x.jpg" }) };
  const downloader = {
    download: async (url: string) => {
      events.push("download:" + url);
      const mode = opts?.local ?? "ok";
      if (mode === "ok") return { ok: true as const, path: "wxfile://tmp_dl.jpg" };
      return { ok: false as const, reason: mode === "unsupported" ? ("unsupported" as const) : ("failed" as const) };
    },
  };
  const serverProxy = async (url: string) => {
    events.push("proxy:" + url);
    const mode = opts?.proxy ?? "ok";
    if (mode === "ok") return { ok: true as const, url: CDN };
    if (mode === "badurl") return { ok: true as const, url: "https://evil.example.com/a.jpg" };
    if (mode === "network") return { ok: false as const, reason: "network" as const, message: "fetch timeout" };
    return { ok: false as const, reason: "status" as const, status: 500, message: '{"code":500,"message":"抓取失败"}' };
  };
  return opts?.proxy === "missing" ? { events, uploader, downloader, serverProxy: undefined } : { events, uploader, downloader, serverProxy };
}

describe("t85 · ① 第三方远程 URL ⇒ 服务端代下载优先（不再先本地下载）", () => {
  it("⭐走服务端代下载、落库为我方 CDN；**不调用本地 downloadFile**", async () => {
    const h = harness();
    const out = await resolveAvatarUrl(DOUYIN, { uploader: h.uploader, downloader: h.downloader, serverProxy: h.serverProxy });
    expect(out).toEqual({ ok: true, url: CDN });
    expect(h.events).toEqual(["proxy:" + DOUYIN]); // 仅服务端代下载；无 download/upload
  });

  it("⭐② 服务端不可用（HTTP 500）⇒ **降级本地 downloadFile → 上传**（不静默）", async () => {
    const h = harness({ proxy: "status" });
    const out = await resolveAvatarUrl(DOUYIN, { uploader: h.uploader, downloader: h.downloader, serverProxy: h.serverProxy });
    expect(out).toEqual({ ok: true, url: CDN });
    expect(h.events).toEqual(["proxy:" + DOUYIN, "download:" + DOUYIN, "upload:wxfile://tmp_dl.jpg"]);
  });

  it("⭐两端都失败 ⇒ 可读提示且**不落库**（零上传）", async () => {
    const h = harness({ proxy: "network", local: "failed" });
    const out = await resolveAvatarUrl(DOUYIN, { uploader: h.uploader, downloader: h.downloader, serverProxy: h.serverProxy });
    expect(out).toEqual({ ok: false, message: AVATAR_DOWNLOAD_FAILED_HINT });
    expect(h.events.filter((e) => e.startsWith("upload"))).toEqual([]);
  });

  it("⭐服务端返回非白名单地址 ⇒ 不落库该地址（继续走降级，最终仍为我方 CDN）", async () => {
    const h = harness({ proxy: "badurl" });
    const out = await resolveAvatarUrl(DOUYIN, { uploader: h.uploader, downloader: h.downloader, serverProxy: h.serverProxy });
    expect(out).toEqual({ ok: true, url: CDN }); // 降级本地下载+上传后拿到我方 CDN
    expect(h.events).toContain("download:" + DOUYIN);
  });

  it("⭐未注入服务端代下载（旧装配/测试）⇒ 退回本地下载；本地也不可用 ⇒ 不支持提示", async () => {
    const a = harness({ proxy: "missing" });
    expect(await resolveAvatarUrl(DOUYIN, { uploader: a.uploader, downloader: a.downloader })).toEqual({ ok: true, url: CDN });
    const b = harness({ proxy: "missing", local: "unsupported" });
    expect(await resolveAvatarUrl(DOUYIN, { uploader: b.uploader, downloader: b.downloader })).toEqual({
      ok: false,
      message: AVATAR_DOWNLOAD_UNSUPPORTED_HINT,
    });
  });
});

describe("t85 · ④ 白名单与本地路径不受影响", () => {
  it("⭐白名单 URL ⇒ 直通（不调服务端、不调本地、不上传）", async () => {
    const h = harness();
    expect(await resolveAvatarUrl(CDN, { uploader: h.uploader, downloader: h.downloader, serverProxy: h.serverProxy })).toEqual({ ok: true, url: CDN });
    expect(h.events).toEqual([]);
  });

  it("⭐真本地路径 ⇒ 只上传（不调服务端、不下载）", async () => {
    const h = harness();
    expect(await resolveAvatarUrl(LOCAL, { uploader: h.uploader, downloader: h.downloader, serverProxy: h.serverProxy })).toEqual({ ok: true, url: CDN });
    expect(h.events).toEqual(["upload:" + LOCAL]);
  });

  it("装配器：仓储成功 ⇒ {ok,url}；业务失败 ⇒ 带 status 与 message（供诊断截断记录）", async () => {
    const okProxy = createServerAvatarProxy({
      proxyAvatarUpload: async () => ({ ok: true, value: { file_url: CDN } }),
      context: () => ({}),
    });
    expect(await okProxy(DOUYIN)).toEqual({ ok: true, url: CDN });
    const badProxy = createServerAvatarProxy({
      proxyAvatarUpload: async () => ({ ok: false, error: { kind: "BUSINESS", message: "抓取失败", statusCode: 500 } }),
      context: () => ({}),
    });
    const bad = await badProxy(DOUYIN);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.status).toBe(500);
      expect(bad.message).toContain("抓取失败");
    }
  });
});
