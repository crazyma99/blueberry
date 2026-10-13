// T78（2026-10-13 · task-60）：上传成功后**必须回写展示值**——否则弹窗仍持本地路径 ⇒ 被判脏 ⇒ 占位。
// 真机实证：正脸照上传**成功**（库里已落真 CDN 地址 https://www.lanmei66.cloud/aiface/staging/6/uploads/….jpg），
// 但弹窗仍显示占位 —— 根因＝pages/mine 拿到 resolved.url 后只写 store 与 PUT，**从未回写 profileAvatarUrl**。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGES = ["pages/mine/index.vue", "pages/aiTryOn/index.vue", "pages/aiRecommend/index.vue"];

function submitBody(src: string): string {
  const i = src.indexOf("function submitProfile");
  return i < 0 ? "" : src.slice(i, src.indexOf("\n}", i));
}

describe("t78 · 上传成功后回写展示值（三页）", () => {
  it("⭐三页 submitProfile 里都必须把**上传后的 URL** 回写进 profileAvatarUrl（失败分支之前不落库）", () => {
    for (const p of PAGES) {
      const src = readFileSync(resolve(__dirname, "../../src/" + p), "utf-8");
      const body = submitBody(src);
      expect(body.length, p).toBeGreaterThan(0);
      // 有回写，且回写的是 resolved 出来的 URL（不是原始本地路径）
      expect(body, p).toMatch(/profileAvatarUrl\.value = (avatarUrl|sanitizeAvatarUrl\(resolvedAvatar\.url\))/);
      // 回写发生在「上传成功之后」（在 resolveAvatarUrl 之后）
      const iResolve = body.indexOf("await resolveAvatarUrl(");
      const iWrite = body.search(/profileAvatarUrl\.value = /);
      expect(iResolve, p).toBeGreaterThan(-1);
      expect(iWrite, p).toBeGreaterThan(iResolve);
    }
  });

  it("⭐mine：同时同步页面头部 userAvatarUrl（弹窗与头部一致）", () => {
    const src = readFileSync(resolve(__dirname, "../../src/pages/mine/index.vue"), "utf-8");
    const body = submitBody(src);
    expect(body).toContain("userAvatarUrl.value = avatarUrl");
  });

  it("⭐预览≠落库值：上传中持有的是本地路径（预览），回写/落库只发生在成功之后（源码顺序守卫）", () => {
    for (const p of PAGES) {
      const src = readFileSync(resolve(__dirname, "../../src/" + p), "utf-8");
      const body = submitBody(src);
      const iLocal = body.indexOf("isLocalFilePath(avatarRaw)");
      const iResolve = body.indexOf("await resolveAvatarUrl(");
      const iWrite = body.search(/profileAvatarUrl\.value = /);
      const iPersist = body.search(/userStore\.(merge|save)\(/);
      expect(iLocal, p).toBeGreaterThan(-1);
      expect(iResolve, p).toBeGreaterThan(iLocal);
      expect(iWrite, p).toBeGreaterThan(iResolve);
      expect(iPersist, p).toBeGreaterThan(iWrite); // 先回写展示、再落库
    }
  });

  it("⭐失败不留中间态：失败分支 return 在任何回写/落库之前", () => {
    for (const p of PAGES) {
      const src = readFileSync(resolve(__dirname, "../../src/" + p), "utf-8");
      const body = submitBody(src);
      const iFail = body.indexOf("if (!resolved");
      const iReturn = body.indexOf("return;", iFail);
      const iWrite = body.search(/profileAvatarUrl\.value = /);
      const iPersist = body.search(/userStore\.(merge|save)\(/);
      expect(iReturn, p).toBeGreaterThan(-1);
      expect(iReturn, p).toBeLessThan(iWrite);
      expect(iReturn, p).toBeLessThan(iPersist);
    }
  });
});
