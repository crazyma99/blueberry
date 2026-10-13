// T75（2026-10-13 · ①-1 上传底座）：**头像只存 http(s) URL；本地临时路径不得落库**。
// 事实依据（Ume 直连只读查 staging users）：id=21/22/23 的 avatar_url ＝ wxfile://tmp_…（本地临时路径），
// 20 用户中 12 个如此 ⇒ 跨端/换设备必坏图。本 spec 守卫：①空路径零请求 ②上传失败 ⇒ fail-closed（不落库）
// ③上传成功 ⇒ 落库值＝上传 URL（**不等于本地路径**）④读侧非 http ⇒ 视为空（显示占位）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isLocalFilePath, isStorableAvatarUrl, sanitizeAvatarUrl } from "../../src/domain/avatar-url";
import {
  AVATAR_UPLOAD_BAD_URL_HINT,
  AVATAR_UPLOAD_FAILED_HINT,
  resolveAvatarUrl,
} from "../../src/application/avatar";

const LOCAL_WX = "wxfile://tmp_0123456789abcdef.jpg";
const LOCAL_TMP = "tmp_1234.jpg";
const COS = "https://www.lanmei66.cloud/avatars/u21.jpg";

function fakeUploader(outcome: { ok: true; fileUrl: string; filename: string } | { ok: false; message: string } | "throw") {
  const calls: string[] = [];
  return {
    calls,
    uploader: {
      upload: async (path: string) => {
        calls.push(path);
        if (outcome === "throw") throw new Error("boom");
        return outcome;
      },
    },
  };
}

describe("t75 · 形态判定（domain/avatar-url）", () => {
  it("⭐只认 http(s)：wxfile:// / tmp_ / file:// / 站内路径 一律判为本地路径（不得落库）", () => {
    expect(isStorableAvatarUrl(COS)).toBe(true);
    expect(isLocalFilePath(COS)).toBe(false);
    for (const local of [LOCAL_WX, LOCAL_TMP, "file:///tmp/a.png", "/static/iconpark/mine.svg", "blob:xx", "data:image/png;base64,AA"]) {
      expect(isLocalFilePath(local), local).toBe(true);
      expect(isStorableAvatarUrl(local), local).toBe(false);
    }
    expect(isLocalFilePath("")).toBe(false);
    expect(isLocalFilePath(null as unknown)).toBe(false);
  });

  it("⭐读侧兜底：非 http(s)（含历史脏值）⇒ 视为空（显示占位），http 原样保留", () => {
    expect(sanitizeAvatarUrl(LOCAL_WX)).toBe("");
    expect(sanitizeAvatarUrl(LOCAL_TMP)).toBe("");
    expect(sanitizeAvatarUrl("")).toBe("");
    expect(sanitizeAvatarUrl(null)).toBe("");
    expect(sanitizeAvatarUrl(COS)).toBe(COS);
  });
});

describe("t75 · uploadAvatar/resolveAvatarUrl（先上传、后落库）", () => {
  it("⭐空路径 ⇒ 零请求（不空转上传）", async () => {
    const f = fakeUploader({ ok: true, fileUrl: COS, filename: "x.jpg" });
    const out = await resolveAvatarUrl("", { uploader: f.uploader });
    expect(out).toEqual({ ok: true, url: "" });
    expect(f.calls.length).toBe(0);
  });

  it("已是 http(s) ⇒ 直通（不重复上传）", async () => {
    const f = fakeUploader({ ok: true, fileUrl: COS, filename: "x.jpg" });
    const out = await resolveAvatarUrl(COS, { uploader: f.uploader });
    expect(out).toEqual({ ok: true, url: COS });
    expect(f.calls.length).toBe(0);
  });

  it("⭐本地路径 ＋ 上传成功 ⇒ 返回**上传后的 URL**（且不等于本地路径）", async () => {
    const f = fakeUploader({ ok: true, fileUrl: COS, filename: "u21.jpg" });
    const out = await resolveAvatarUrl(LOCAL_WX, { uploader: f.uploader });
    expect(out).toEqual({ ok: true, url: COS });
    expect(f.calls).toEqual([LOCAL_WX]);
    if (out.ok) expect(out.url).not.toBe(LOCAL_WX);
  });

  it("⭐上传失败 ⇒ fail-closed（ok:false ＋ 可行动提示；调用方不得落库/提交）", async () => {
    const f = fakeUploader({ ok: false, message: "" });
    const out = await resolveAvatarUrl(LOCAL_WX, { uploader: f.uploader });
    expect(out).toEqual({ ok: false, message: AVATAR_UPLOAD_FAILED_HINT });
    const f2 = fakeUploader("throw");
    const out2 = await resolveAvatarUrl(LOCAL_WX, { uploader: f2.uploader });
    expect(out2).toEqual({ ok: false, message: AVATAR_UPLOAD_FAILED_HINT });
  });

  it("⭐上传成功但返回非 http(s)（如空 file_url）⇒ 同样 fail-closed（绝不落库坏地址）", async () => {
    const f = fakeUploader({ ok: true, fileUrl: "", filename: "u21.jpg" });
    const out = await resolveAvatarUrl(LOCAL_WX, { uploader: f.uploader });
    expect(out).toEqual({ ok: false, message: AVATAR_UPLOAD_BAD_URL_HINT });
  });
});

describe("t75 · 接线守卫（渲染兜底 ＋ 三处落库路径）", () => {
  it("⭐ProfilePopup 展示绑 displayAvatarUrl（经 sanitizeAvatarUrl）⇒ 脏值不渲染坏图", () => {
    const src = readFileSync(resolve(__dirname, "../../src/components/ProfilePopup/ProfilePopup.vue"), "utf-8");
    expect(src).toContain(":src=\"displayAvatarUrl\"");
    // task-61 后：展示优先级走 resolveAvatarDisplay（**其中落库值通道仍经 sanitizeAvatarUrl**；
    // 「脏值不渲染坏图」的行为级守卫见 t81 的组件用例）
    expect(src).toContain("resolveAvatarDisplay(");
    expect(src).toContain("displayAvatarUrl");
    expect(src).not.toContain(":src=\"avatarUrl ||");
  });

  it("⭐三处落库路径（mine/aiTryOn/aiRecommend）都必须先经 resolveAvatarUrl", () => {
    for (const p of ["pages/mine/index.vue", "pages/aiTryOn/index.vue", "pages/aiRecommend/index.vue"]) {
      const src = readFileSync(resolve(__dirname, "../../src/" + p), "utf-8");
      expect(src, p).toContain("resolveAvatarUrl(");
      expect(src, p).toContain("isLocalFilePath(");
      expect(src, p).not.toContain("avatarUrl: profileAvatarUrl.value");
    }
  });

  it("⭐登录回包落库前过滤脏值（login-flow.toLocalUser 经 sanitizeAvatarUrl）", () => {
    const src = readFileSync(resolve(__dirname, "../../src/application/login-flow.ts"), "utf-8");
    expect(src).toContain("sanitizeAvatarUrl(raw.avatarUrl)");
  });
});
