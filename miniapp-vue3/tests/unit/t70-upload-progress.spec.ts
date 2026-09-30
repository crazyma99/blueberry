// 2026-09-30 流量成本 PRD R18：上传进度文案（百分比＋剩余时间＋弱网提示）单一事实源。
import { describe, expect, it } from "vitest";
import {
  formatUploadProgressText,
  REMAINING_MIN_PERCENT,
  WEAK_NETWORK_ELAPSED_MS,
  WEAK_NETWORK_PERCENT,
} from "../../src/application/upload-progress";

describe("formatUploadProgressText（PRD R18）", () => {
  it("进度 ≤5% 不外推剩余时间（估算不稳）", () => {
    expect(formatUploadProgressText(0, 0, 1000)).toBe("上传中 0%");
    expect(formatUploadProgressText(REMAINING_MIN_PERCENT, 0, 1000)).toBe(`上传中 ${REMAINING_MIN_PERCENT}%`);
    // 低进度＋长耗时：仍不显示剩余时间，但应有弱网提示（两项口径独立）
    expect(formatUploadProgressText(REMAINING_MIN_PERCENT, 0, 9000)).toBe(
      `上传中 ${REMAINING_MIN_PERCENT}% · 网络较慢，请耐心等待`,
    );
  });

  it("剩余时间按已耗时线性外推（秒向上取整）", () => {
    // 50% 已耗 2000ms ⇒ 剩余 (2000/50)×50/1000 = 2s
    expect(formatUploadProgressText(50, 0, 2000)).toBe("上传中 50% · 约剩2秒");
    // 100% 完成态不显示剩余
    expect(formatUploadProgressText(100, 0, 9000)).toBe("上传中 100%");
  });

  it("进度越界按边界收（负→0、>100→100）", () => {
    expect(formatUploadProgressText(-3, 0, 1000)).toBe("上传中 0%");
    expect(formatUploadProgressText(120, 0, 1000)).toBe("上传中 100%");
  });

  it("弱网：已耗 >8s 且进度 <60% 追加明确提示", () => {
    const text = formatUploadProgressText(WEAK_NETWORK_PERCENT - 1, 0, WEAK_NETWORK_ELAPSED_MS + 1);
    expect(text).toContain("网络较慢，请耐心等待");
    // 进度达标（≥60%）则不提示（只是文件大，不是弱网）
    expect(formatUploadProgressText(WEAK_NETWORK_PERCENT, 0, WEAK_NETWORK_ELAPSED_MS + 1)).not.toContain("网络较慢");
    // 未超时不提示
    expect(formatUploadProgressText(30, 0, 2000)).not.toContain("网络较慢");
  });
});
