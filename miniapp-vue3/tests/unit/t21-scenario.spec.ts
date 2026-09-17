// P2-13/15 场景矩阵（工具侧）：渐进加载规则、长标题组合；其余场景引用既有测试覆盖（见 preflight §8.26 表）。
import { describe, expect, it } from "vitest";
import { progressivePhotoSrc, cosThumb } from "../../src/application/image";
import { formatAlbumTitle } from "../../src/domain/album-title";

describe("progressivePhotoSrc（P2-13 图片时序规则）", () => {
  it("首图原图（高清主视觉）；其余 750 WebP 缩略；非 COS 域原样；空/undefined → 空串", () => {
    const cos = "https://lanmei66.cloud/a.jpg";
    expect(progressivePhotoSrc(cos, 0)).toBe(cos);
    expect(progressivePhotoSrc(cos, 1)).toBe(cosThumb(cos, 750));
    expect(progressivePhotoSrc(cos, 3)).toBe(cos + "?imageMogr2/format/webp/thumbnail/750x");
    const ext = "https://evil.example.com/b.jpg";
    expect(progressivePhotoSrc(ext, 1)).toBe(ext); // 非 COS 不拼万象参数
    expect(progressivePhotoSrc("", 0)).toBe("");
    expect(progressivePhotoSrc(undefined, 0)).toBe("");
  });
});

describe("场景矩阵补充断言（P2-15）", () => {
  it("长标题（8 码点含 emoji）→ 6 码点+...（列表卡片与详情共用 domain）", () => {
    // 😀红河水乡旗袍汉服民族服＝12 码点 → 前 6 码点＝😀红河水乡旗＋...（emoji 计 1 码点）
    expect(formatAlbumTitle("😀红河水乡旗袍汉服民族服")).toBe("😀红河水乡旗...");
    expect(formatAlbumTitle("短标题")).toBe("短标题");
    expect(formatAlbumTitle("")).toBe("");
  });
});
