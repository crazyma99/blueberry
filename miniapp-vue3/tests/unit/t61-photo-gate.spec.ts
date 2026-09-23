// 2026-09-23 主人目标：在 `feat/backend-tryon-photo-gate` 分支对接后端 staging 的「照片质量拦截（4002+check_code）」。
// 本 spec 覆盖第一/二层：①业务码 → 领域错误（4002 → QUALITY_REJECTED）②失败路径保留信封 `data`（check_code 可达）
// ③契约单一事实源（4 码 + unknown 文案「换一张照片试试吧」）④示例图资产守护（体积预算）⑤弹层渲染级（正反例对比＋按钮语义）。
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { mapBusinessCode } from "../../src/domain/payment-state";
import { mapBusinessFailure } from "../../src/infrastructure/http/errors";
import {
  PHOTO_GATE_ACCEPT_ASSET,
  PHOTO_GATE_COPY,
  readCheckCodeFromBusinessData,
  resolvePhotoGateCode,
  resolvePhotoGateCopy,
} from "../../src/application/photo-gate";
import QualityRejectSheet from "../../src/components/QualityRejectSheet/QualityRejectSheet.vue";

const root = resolve(__dirname, "../..");
const read = (p: string): string => readFileSync(resolve(root, p), "utf-8");

/** BasePopup 内部的 wot `wd-popup` 桩（渲染 slot，暴露 props；与弹窗族既有桩同口径） */
const StubWdPopup = {
  name: "StubWdPopup",
  props: {
    modelValue: { type: Boolean, default: false },
    position: { type: String, default: "center" },
    zIndex: { type: Number, default: 10 },
    customStyle: { type: String, default: "" },
    closeOnClickModal: { type: Boolean, default: true },
  },
  emits: ["close", "click-modal", "update:modelValue"],
  template: '<view class="stub-popup"><view class="stub-popup__mask" @click="$emit(\'close\')"></view><slot /></view>',
};

describe("4002 照片质量拦截：业务码 → 领域错误（单一事实源）", () => {
  it("4002 ⇒ QUALITY_REJECTED（且 4001 行为不变）", () => {
    const e4002 = mapBusinessCode(4002, "未检测到人脸", "rid");
    expect(e4002.kind).toBe("QUALITY_REJECTED");
    expect(e4002.businessCode).toBe(4002);
    expect(mapBusinessCode(4001).kind).toBe("INSUFFICIENT_CREDITS"); // 既有口径不变
    expect(mapBusinessCode(500).kind).toBe("BUSINESS");
  });

  it("⭐失败路径保留信封 data（否则 check_code 到不了页面）", () => {
    const err = mapBusinessFailure(4002, "msg", "rid", { check_code: "side_face" });
    expect(err.kind).toBe("QUALITY_REJECTED");
    expect(err.businessData).toEqual({ check_code: "side_face" });
    // 既有调用不变：不传 data ⇒ 字段为 undefined，其它行为不受影响
    expect(mapBusinessFailure(4001).businessData).toBeUndefined();
    expect(mapBusinessFailure(4001).retryable).toBe(false);
  });
});

describe("契约单一事实源（application/photo-gate）", () => {
  it("4 码各自有标题/文案/反例图；未知码＝主人指定兜底文案「换一张照片试试吧」且无反例图", () => {
    for (const code of ["no_face", "multi_face", "face_too_small", "side_face"] as const) {
      const c = PHOTO_GATE_COPY[code];
      expect(c.title.length, code).toBeGreaterThan(0);
      expect(c.text.length, code).toBeGreaterThan(0);
      expect(c.rejectAsset, code).toMatch(/^\/static\/quality-gate\/reject_.*\.jpg$/);
    }
    expect(PHOTO_GATE_COPY.unknown.title).toBe("照片未通过检测");
    expect(PHOTO_GATE_COPY.unknown.text).toBe("换一张照片试试吧"); // ← 主人 2026-09-23 指定
    expect(PHOTO_GATE_COPY.unknown.rejectAsset).toBeNull();
  });

  it("解析永不抛：任意脏值 ⇒ unknown", () => {
    expect(resolvePhotoGateCode("no_face")).toBe("no_face");
    expect(resolvePhotoGateCode("face_too_small")).toBe("face_too_small");
    for (const bad of [undefined, null, 0, 4002, "", "NO_FACE", {}, []]) {
      expect(resolvePhotoGateCode(bad)).toBe("unknown");
    }
    expect(resolvePhotoGateCopy(null).text).toBe("换一张照片试试吧");
  });

  it("从业务错误体读 check_code（结构异常一律 unknown）", () => {
    expect(readCheckCodeFromBusinessData({ check_code: "multi_face" })).toBe("multi_face");
    expect(readCheckCodeFromBusinessData({ check_code: "不存在的码" })).toBe("unknown");
    expect(readCheckCodeFromBusinessData({})).toBe("unknown");
    expect(readCheckCodeFromBusinessData(null)).toBe("unknown");
    expect(readCheckCodeFromBusinessData("check_code=no_face")).toBe("unknown");
  });
});

describe("示例图资产（主人 2026-09-23 提供；已压缩入包）", () => {
  it("5 张 JPG 均在位、单张 ≤60KB、合计 ≤200KB（微信主包预算守卫）", () => {
    const files = [
      "accept_normal",
      "reject_no_face",
      "reject_multi_face",
      "reject_face_too_small",
      "reject_side_face",
    ].map((n) => `src/static/quality-gate/${n}.jpg`);
    let total = 0;
    for (const f of files) {
      const size = statSync(resolve(root, f)).size;
      expect(size, f).toBeGreaterThan(1024);
      expect(size, f).toBeLessThanOrEqual(60 * 1024);
      total += size;
    }
    expect(total).toBeLessThanOrEqual(200 * 1024);
    expect(PHOTO_GATE_ACCEPT_ASSET).toBe("/static/quality-gate/accept_normal.jpg");
  });
});

describe("QualityRejectSheet 渲染级（底部弹层＋正反例对比）", () => {
  const mountSheet = (code: string) =>
    mount(QualityRejectSheet, {
      props: { show: true, code },
      global: { components: { "wd-popup": StubWdPopup } },
    });

  it("⭐已知码：底部弹层、原因/引导文案、✓正例＋✗反例两图、未扣次数安抚、两按钮语义", async () => {
    const w = mountSheet("side_face");
    expect(w.findComponent(StubWdPopup).props("position")).toBe("bottom");
    expect(w.findComponent(StubWdPopup).props("zIndex")).toBe(2000); // 高于自绘栏 998／Tab 栏 900
    expect(w.find(".qr-title").text()).toBe("请正对镜头");
    expect(w.find(".qr-text").text()).toContain("正对镜头");
    const imgs = w.findAll("image").map((i) => i.attributes("src"));
    expect(imgs).toEqual(["/static/quality-gate/accept_normal.jpg", "/static/quality-gate/reject_side_face.jpg"]);
    expect(w.find(".qr-note").text()).toBe("本次未消耗试衣次数");
    await w.find(".qr-btn--primary").trigger("click");
    expect(w.emitted("retry")?.length).toBe(1);
    await w.find(".qr-btn--ghost").trigger("click");
    expect(w.emitted("close")?.length).toBe(1);
  });

  it("未知码：兜底文案「换一张照片试试吧」＋只展示正例（无反例图）", () => {
    const w = mountSheet("no_such_code");
    expect(w.find(".qr-title").text()).toBe("照片未通过检测");
    expect(w.find(".qr-text").text()).toBe("换一张照片试试吧");
    expect(w.findAll("image").length).toBe(1);
    expect(w.find(".qr-badge--bad").exists()).toBe(false);
  });

  it("遮罩点击 ⇒ close（cancel 单一出口）", async () => {
    const w = mountSheet("no_face");
    await w.find(".stub-popup__mask").trigger("click");
    expect(w.emitted("close")?.length).toBe(1);
  });
});
