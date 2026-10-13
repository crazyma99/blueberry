// T76（2026-10-13 · task-59）：**头像「可落库」判定必须是我方域名白名单**——只看 http 前缀会漏。
// 漏洞实证（Ume 查 staging users）：id=6 的 avatar_url ＝ http://tmp/40Rmw….jpeg —— 这是**微信本机临时路径的
// http 形态**，旧 isHttpUrl() 只看前缀 ⇒ 判为「已上传」直通、跳过上传 ⇒ 脏值落库（12 个有头像用户里 2 个如此）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_AVATAR_HOST_SUFFIXES,
  avatarUrlHost,
  isForeignRemoteUrl,
  isLocalFilePath,
  isStorableAvatarUrl,
  sanitizeAvatarUrl,
} from "../../src/domain/avatar-url";
import { AVATAR_UPLOAD_BAD_URL_HINT, resolveAvatarUrl } from "../../src/application/avatar";

const TMP_HTTP = "http://tmp/40RmwKVUPTmq6b4fa7b3186161f101e093239a264d77.jpeg"; // 真机落库实证值
const WX_LOCAL = "wxfile://tmp_0123456789abcdef.jpg";
const CDN = "https://www.lanmei66.cloud/avatars/u6.jpg";
const COS = "https://bucket-1.cos.ap-shanghai.myqcloud.com/avatars/u6.jpg";

function fakeUploader(outcome: { ok: true; fileUrl: string; filename: string } | { ok: false; message: string }) {
  const calls: string[] = [];
  return {
    calls,
    uploader: { upload: async (path: string) => (calls.push(path), outcome) },
  };
}

describe("t76 · ①判定：像 http 的本地路径与非白名单域一律归「本地路径 ⇒ 必须上传」", () => {
  it("⭐http://tmp/… （真机落库那条）⇒ 不是可落库 URL，且被判为本地路径", () => {
    expect(isStorableAvatarUrl(TMP_HTTP)).toBe(false);
    expect(isLocalFilePath(TMP_HTTP)).toBe(true);
    expect(avatarUrlHost(TMP_HTTP)).toBe("tmp"); // 宿主机无点
  });

  it("⭐拒绝清单：宿主机无点／内网与环回 IP／非白名单域／后缀伪装 全部判为本地路径", () => {
    const bad = [
      TMP_HTTP,
      WX_LOCAL,
      "http://usr/a.jpg",
      "http://localhost/a.jpg",
      "http://127.0.0.1/a.jpg",
      "https://192.168.1.5/a.jpg",
      "http://10.0.0.7/a.jpg",
      "https://172.16.0.9/a.jpg",
      "https://evil.example.com/a.jpg",
      "https://lanmei66.cloud.evil.com/a.jpg", // 后缀伪装
      "https://notlanmei66.cloud/a.jpg",
      "/static/iconpark/mine.svg",
      "file:///tmp/a.jpg",
      "",
    ];
    for (const v of bad) {
      expect(isStorableAvatarUrl(v), v).toBe(false); // ⒝ 白名单：这些一律**不得直接落库**（不变）
    }
    // 2026-10-13 task-63 三类细分（`isLocalFilePath` 只表示**真本地/像 http 的本地路径**）：
    //   · 宿主无点（tmp/usr/localhost）、IP 字面量、非 http scheme、站内路径 ⇒ **本地路径 ⇒ 上传**
    const local = [TMP_HTTP, WX_LOCAL, "http://usr/a.jpg", "http://localhost/a.jpg", "http://127.0.0.1/a.jpg", "https://192.168.1.5/a.jpg", "http://10.0.0.7/a.jpg", "https://172.16.0.9/a.jpg", "/static/iconpark/mine.svg", "file:///tmp/a.jpg"];
    for (const v of local) expect(isLocalFilePath(v), v).toBe(true);
    expect(isLocalFilePath("")).toBe(false); // 空串：零请求语义
    //   · ⭐**非白名单的公网域名** ⇒ **第三方远程 URL**（先 downloadFile 落地再上传；**绝不当本地文件直传**）
    for (const v of ["https://evil.example.com/a.jpg", "https://lanmei66.cloud.evil.com/a.jpg", "https://notlanmei66.cloud/a.jpg"]) {
      expect(isForeignRemoteUrl(v), v).toBe(true);
      expect(isLocalFilePath(v), v).toBe(false);
    }
  });

  it("白名单域（我方 CDN／COS 桶域／测试环境域）⇒ 可落库、可直通", () => {
    for (const ok of [CDN, COS, "https://lanmei66.cloud/a.jpg", "http://crazyma99.xyz/a.jpg"]) {
      expect(isStorableAvatarUrl(ok), ok).toBe(true);
      expect(isLocalFilePath(ok), ok).toBe(false);
    }
    expect(ALLOWED_AVATAR_HOST_SUFFIXES).toContain("lanmei66.cloud");
    expect(ALLOWED_AVATAR_HOST_SUFFIXES).toContain("myqcloud.com");
  });
});

describe("t76 · ②上传链：http://tmp/… 必须**走上传**（不得直通），上传返回也要过白名单", () => {
  it("⭐http://tmp/… ⇒ 调用上传并落库为上传返回的 CDN URL（≠ 原值）", async () => {
    const f = fakeUploader({ ok: true, fileUrl: CDN, filename: "u6.jpg" });
    const out = await resolveAvatarUrl(TMP_HTTP, { uploader: f.uploader });
    expect(out).toEqual({ ok: true, url: CDN });
    expect(f.calls, "http://tmp/… 必须被上传（旧实现会直通 ⇒ 正是本次漏洞）").toEqual([TMP_HTTP]);
    if (out.ok) expect(out.url).not.toBe(TMP_HTTP);
  });

  it("⭐白名单域 ⇒ 直通（零上传）", async () => {
    const f = fakeUploader({ ok: true, fileUrl: CDN, filename: "x.jpg" });
    expect(await resolveAvatarUrl(CDN, { uploader: f.uploader })).toEqual({ ok: true, url: CDN });
    expect(f.calls.length).toBe(0);
  });

  it("⭐上传返回非白名单（含 http://tmp/…／内网 IP）⇒ fail-closed（不落库）", async () => {
    for (const badUrl of [TMP_HTTP, WX_LOCAL, "https://evil.example.com/a.jpg", "http://127.0.0.1/a.jpg"]) {
      const f = fakeUploader({ ok: true, fileUrl: badUrl, filename: "x.jpg" });
      const out = await resolveAvatarUrl(WX_LOCAL, { uploader: f.uploader });
      expect(out, badUrl).toEqual({ ok: false, message: AVATAR_UPLOAD_BAD_URL_HINT });
    }
  });
});

describe("t76 · ③读侧兜底：历史 http://tmp/… 值 ⇒ 视为空（显示占位图）", () => {
  it("⭐sanitizeAvatarUrl(http://tmp/…) === 空串；白名单域原样保留", () => {
    expect(sanitizeAvatarUrl(TMP_HTTP)).toBe("");
    expect(sanitizeAvatarUrl(WX_LOCAL)).toBe("");
    expect(sanitizeAvatarUrl(CDN)).toBe(CDN);
  });

  it("⭐接线：ProfilePopup 展示与 toLocalUser 都走 sanitizeAvatarUrl（同一闸门）", () => {
    const popup = readFileSync(resolve(__dirname, "../../src/components/ProfilePopup/ProfilePopup.vue"), "utf-8");
    expect(popup).toContain(':src="displayAvatarUrl"');
    expect(popup).toContain("resolveAvatarDisplay("); // 落库值通道内部仍 sanitize（t81 组件级守卫）
    const flow = readFileSync(resolve(__dirname, "../../src/application/login-flow.ts"), "utf-8");
    expect(flow).toContain("sanitizeAvatarUrl(raw.avatarUrl)");
  });

  it("⭐守卫：业务判定不得再依赖「只看前缀」的旧函数（domain 只导出白名单判定）", () => {
    const src = readFileSync(resolve(__dirname, "../../src/domain/avatar-url.ts"), "utf-8");
    expect(src).toContain("ALLOWED_AVATAR_HOST_SUFFIXES");
    expect(src).not.toContain("export function isHttpUrl");
  });
});
