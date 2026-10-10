// 端标识（channel）合同测试（2026-10-10）。
//
// 背景：后端把照片质量门前移到 `POST /api/aiface/upload`（后端提交 `fecf5d4`）；旧端（`main` 已封版）
// 在上传阶段不认 `4002`，故后端将改为「**仅当请求带 `X-Channel` 时才启门**」——本模块就是新端
// 主动声明身份的那一半（新端带、后端认），同时为「按端独立订阅」的端维度打底（P0-1）。
//
// 纪律（多端 SPEC §C3）：**逻辑层零 `#ifdef`** ⇒ 平台一律由参数传入，本用例无需 uni 环境。
import { describe, expect, it } from "vitest";
import { CHANNELS, CHANNEL_BY_PLATFORM, channelOf } from "../../src/domain/channel";
import { PLATFORMS } from "../../src/ports/context";

describe("domain/channel（端标识）", () => {
  it("三个构建平台一一映射：mp-weixin→wx、mp-toutiao→tt、mp-xhs→xhs", () => {
    expect(channelOf("mp-weixin")).toBe("wx");
    expect(channelOf("mp-toutiao")).toBe("tt");
    expect(channelOf("mp-xhs")).toBe("xhs");
  });

  it("⭐PLATFORMS 闭集在**显式映射表**中全部登记（新增端忘登记 ⇒ `vue-tsc` 报错；此用例兜底）", () => {
    // ①表键与闭集**完全一致**（多一个、少一个都算失败）②每个平台的值都是合法端标识 ③函数与表同源
    expect(Object.keys(CHANNEL_BY_PLATFORM).sort()).toEqual([...PLATFORMS].sort());
    for (const p of PLATFORMS) {
      expect(CHANNELS, `平台 ${p} 的端标识应在闭集内`).toContain(CHANNEL_BY_PLATFORM[p]);
      expect(channelOf(p)).toBe(CHANNEL_BY_PLATFORM[p]);
    }
  });

  it("未知/缺失平台 → 兜底 wx（取向：宁可让服务端质量门生效，也不因认不出平台而漏掉保护）", () => {
    expect(channelOf("mp-alipay")).toBe("wx");
    expect(channelOf("")).toBe("wx");
    expect(channelOf(null)).toBe("wx");
    expect(channelOf(undefined)).toBe("wx");
  });

  it("闭集常量 wx/tt/xhs（xhs 为小红书端预留）", () => {
    expect([...CHANNELS]).toEqual(["wx", "tt", "xhs"]);
  });
});
