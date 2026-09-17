// P1-10 相册标题码点截断测试（6/7 码点＋emoji 代理对）
// 来源口径：旧端 src/utils/text.uts formatAlbumTitle（2026-09-17 迁移移植核对）
import { describe, expect, it } from "vitest";
import { formatAlbumTitle } from "../../src/domain/album-title";

describe("formatAlbumTitle 码点截断（缺实现即红）", () => {
  it("非字符串/空值 → 空串（容错）", () => {
    expect(formatAlbumTitle(undefined)).toBe("");
    expect(formatAlbumTitle(null)).toBe("");
    expect(formatAlbumTitle(42)).toBe("");
    expect(formatAlbumTitle({})).toBe("");
    expect(formatAlbumTitle("")).toBe("");
  });
  it("≤6 码点原样返回（恰好 6 不加省略号）", () => {
    expect(formatAlbumTitle("一二三四五六")).toBe("一二三四五六");
    expect(formatAlbumTitle("abc")).toBe("abc");
  });
  it("7 码点 → 前 6 码点 + ...", () => {
    expect(formatAlbumTitle("一二三四五六七")).toBe("一二三四五六...");
  });
  it("emoji 代理对算一个码点（7 个 emoji → 6 个 + ...）", () => {
    expect(formatAlbumTitle("😀😀😀😀😀😀😀")).toBe("😀😀😀😀😀😀...");
  });
  it("6 个 emoji（12 码元）不截断——按码点而非码元", () => {
    expect(formatAlbumTitle("😀😀😀😀😀😀")).toBe("😀😀😀😀😀😀");
  });
  it("混排 8 码点 ab👍cdefg → ab👍cde...（不切半个代理对）", () => {
    expect(formatAlbumTitle("ab👍cdefg")).toBe("ab👍cde...");
  });
});
