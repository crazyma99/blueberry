// 2026-09-28 流量成本 PRD（R1/R5）：COS 源站域（*.cos.<region>.myqcloud.com，外网直连 ¥0.50/GB）
// → CDN 域改写收口。凡经 cosThumb/cosThumbJpg/progressivePhotoSrc 的 URL 都不再可能直连源站。
import { describe, expect, it } from "vitest";
import { CDN_IMAGE_HOST, cosThumb, normalizeImageUrl, progressivePhotoSrc } from "../../src/application/image";
import { cosThumbJpg } from "../../src/application/image-share";

const SRC = "https://lanmeiimgstore-1311468332.cos.ap-shanghai.myqcloud.com/a/b.jpg";

describe("normalizeImageUrl（PRD R1：源站→CDN 改写）", () => {
  it("自家桶源站域改写为 CDN 域，path/query 保留", () => {
    expect(normalizeImageUrl(SRC)).toBe(`https://${CDN_IMAGE_HOST}/a/b.jpg`);
    expect(normalizeImageUrl(SRC + "?x-oss=1&v=2")).toBe(`https://${CDN_IMAGE_HOST}/a/b.jpg?x-oss=1&v=2`);
  });

  it("任意桶/地域的 COS 源站形态同样改写（泛化匹配，防换桶漏网）", () => {
    expect(normalizeImageUrl("https://other-1250000000.cos.ap-guangzhou.myqcloud.com/x.png")).toBe(
      `https://${CDN_IMAGE_HOST}/x.png`,
    );
  });

  it("CDN 域/第三方域/本地路径/空值原样返回", () => {
    expect(normalizeImageUrl("https://www.lanmei66.cloud/a.jpg")).toBe("https://www.lanmei66.cloud/a.jpg");
    expect(normalizeImageUrl("https://evil.example.com/a.jpg")).toBe("https://evil.example.com/a.jpg");
    expect(normalizeImageUrl("/static/a.png")).toBe("/static/a.png");
    expect(normalizeImageUrl("")).toBe("");
    expect(normalizeImageUrl(null)).toBe("");
    expect(normalizeImageUrl(undefined)).toBe("");
  });
});

describe("缩略入口全链 CDN 化（R1/R20）", () => {
  it("cosThumb：源站 URL → CDN 域 + WebP 缩略参数（不再直连源站）", () => {
    expect(cosThumb(SRC, 750)).toBe(`https://${CDN_IMAGE_HOST}/a/b.jpg?imageMogr2/format/webp/thumbnail/750x`);
  });

  it("cosThumbJpg：源站 URL → CDN 域 + JPG 缩略参数（分享卡片链同口径）", () => {
    expect(cosThumbJpg(SRC, 400)).toBe(`https://${CDN_IMAGE_HOST}/a/b.jpg?imageMogr2/thumbnail/400x/format/jpg`);
  });

  it("progressivePhotoSrc：源站首图 → CDN 1080 预览（不原图直出）", () => {
    expect(progressivePhotoSrc(SRC, 0)).toBe(`https://${CDN_IMAGE_HOST}/a/b.jpg?imageMogr2/format/webp/thumbnail/1080x`);
    expect(progressivePhotoSrc(SRC, 2)).toBe(`https://${CDN_IMAGE_HOST}/a/b.jpg?imageMogr2/format/webp/thumbnail/750x`);
  });
});
