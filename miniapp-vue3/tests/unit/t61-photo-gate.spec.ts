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
import { createTryOnSubmitter, type SubmitInput } from "../../src/application/ai-tryon-submit";
import { resolveEndSideRejection } from "../../src/application/photo-gate";
import { createUniAnalytics } from "../../src/platform/uni/analytics";

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
      expect(c.rejectAsset, code).toMatch(/reject_.*\.jpg$/); // 打包器引用（不再写 /static 绝对路径）
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
    ].map((n) => `src/assets/quality-gate/${n}.jpg`);
    let total = 0;
    for (const f of files) {
      const size = statSync(resolve(root, f)).size;
      expect(size, f).toBeGreaterThan(1024);
      expect(size, f).toBeLessThanOrEqual(60 * 1024);
      total += size;
    }
    expect(total).toBeLessThanOrEqual(200 * 1024);
    expect(PHOTO_GATE_ACCEPT_ASSET).toMatch(/accept_normal\.jpg$/);
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
    expect(imgs.length).toBe(2);
    expect(imgs[0]).toMatch(/accept_normal\.jpg$/);
    expect(imgs[1]).toMatch(/reject_side_face\.jpg$/);
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

describe("submit 归一（createTryOnSubmitter）：4002 → quality-rejected，绝不走充值", () => {
  const input = (over: Partial<SubmitInput> = {}): SubmitInput =>
    ({
      uploadedFilename: "f.jpg",
      photoPath: "/tmp/a.jpg",
      isUploading: false,
      isSubmitting: false,
      isLoggedIn: true,
      shopId: "7",
      templates: [{ id: 11 }],
      currentTemplateIndex: 0,
      isPaidMode: false,
      creditBalance: 0,
      ...over,
    }) as unknown as SubmitInput;

  const submitterWith = (error: unknown) =>
    createTryOnSubmitter({
      ai: { submitTryOnTask: async () => ({ ok: false, error }) as never },
      nextContext: () => ({}) as never,
    });

  it("⭐4002（带 check_code）⇒ {kind:'quality-rejected', checkCode}（不是 toast、不触发充值）", async () => {
    const out = await submitterWith({
      kind: "QUALITY_REJECTED",
      businessCode: 4002,
      message: "未检测到人脸，请上传单人正面照",
      requestId: null,
      retryable: false,
      businessData: { check_code: "multi_face" },
    }).submit(input());
    expect(out).toEqual({ kind: "quality-rejected", checkCode: "multi_face" });
  });

  it("4002 但 check_code 缺失/脏值 ⇒ checkCode 兜底 unknown（文案「换一张照片试试吧」）", async () => {
    const out = await submitterWith({
      kind: "QUALITY_REJECTED", businessCode: 4002, message: "", requestId: null, retryable: false, businessData: {},
    }).submit(input());
    expect(out).toEqual({ kind: "quality-rejected", checkCode: "unknown" });
  });

  it("4001 行为不变（仍走充值）", async () => {
    const out = await submitterWith({
      kind: "INSUFFICIENT_CREDITS", businessCode: 4001, message: "", requestId: null, retryable: false,
    }).submit(input());
    expect(out).toEqual({ kind: "need-recharge", reason: "insufficient" });
  });
});

describe("页面接线守卫（pages/aiTryOn）", () => {
  it("switch 分支 + 弹层组件 + retry 接线 + import 均在位", () => {
    const s = read("src/pages/aiTryOn/index.vue");
    expect(s).toContain('case "quality-rejected":');
    expect(s).toContain("QualityRejectSheet");
    expect(s).toContain('@retry="onQualityRejectRetry"');
    expect(s).toContain("showQualityReject");
    expect(s).toContain('from "../../application/photo-gate"');
  });

describe("弹层样式守卫（解 CR m9 假绿：样式零覆盖）", () => {
  const sheet = (): string => read("src/components/QualityRejectSheet/QualityRejectSheet.vue");

  it("卡片面/上圆角/溢出裁剪在位（BasePopup 把 wot 面置透明 ⇒ 内容必须自带面）", () => {
    const s = sheet();
    expect(s).toContain("background: $color-popup-card");
    expect(s).toMatch(/border-radius: #\{\$popup-radius-rpx \* 2\}rpx #\{\$popup-radius-rpx \* 2\}rpx 0 0;/);
    expect(s).toContain("overflow: hidden");
  });

  it("安全区不得写进 `padding` 简写（不认 constant() 的运行时会导致整条简写失效）", () => {
    const s = sheet();
    expect(s).toMatch(/padding: \$space-lg;/);
    expect(s).toContain("padding-bottom: calc(#{$space-lg} + constant(safe-area-inset-bottom))");
    expect(s).toContain("padding-bottom: calc(#{$space-lg} + env(safe-area-inset-bottom))");
    expect(s).not.toMatch(/padding: [^;]*constant\(/);
  });

  it("按钮高度用 token；图片盒模型为 border-box（有描边）", () => {
    const s = sheet();
    expect(s).toContain("#{$button-height-rpx}rpx");
    expect(s).toMatch(/\.qr-img \{[^}]*box-sizing: border-box/s);
  });
});
});

describe("端侧拦截 → 弹层呈现（2026-09-23 主人拍板：与后端 4002 统一 UX）", () => {
  it("端侧 4 类 reason 各自映射到对应码与契约文案", () => {
    expect(resolveEndSideRejection("未检测到人脸，请上传清晰的正面照片").code).toBe("no_face");
    expect(resolveEndSideRejection("检测到多张人脸，请上传单人照片").code).toBe("multi_face");
    expect(resolveEndSideRejection("人脸在照片中占比太小，请靠近一些或裁剪后上传").code).toBe("face_too_small");
    expect(resolveEndSideRejection("人脸在照片中占比太小，请靠近一些或裁剪后上传").text).toBe(
      PHOTO_GATE_COPY.face_too_small.text,
    );
  });

  it("无对应 4 码（模糊/分辨率过低）⇒ unknown 码但**保留端侧原话**（避免指错方向），空值走兜底", () => {
    const blur = resolveEndSideRejection("照片有点模糊，请重新拍摄清晰的照片");
    expect(blur.code).toBe("unknown");
    expect(blur.text).toBe("照片有点模糊，请重新拍摄清晰的照片");
    expect(resolveEndSideRejection("").text).toBe("换一张照片试试吧");
  });

  it("弹层支持端侧文案覆盖；留空则回落该码契约文案", () => {
    const withOverride = mount(QualityRejectSheet, {
      props: { show: true, code: "no_face", titleOverride: "照片未通过检测", textOverride: "照片有点模糊，请重新拍摄清晰的照片" },
      global: { components: { "wd-popup": StubWdPopup } },
    });
    expect(withOverride.find(".qr-title").text()).toBe("照片未通过检测");
    expect(withOverride.find(".qr-text").text()).toBe("照片有点模糊，请重新拍摄清晰的照片");
    expect(withOverride.findAll("image").length).toBe(2); // no_face 有反例图 ⇒ ✓正例＋✗反例（unknown 只出正例的断言在另一用例）
    const noOverride = mount(QualityRejectSheet, {
      props: { show: true, code: "multi_face" },
      global: { components: { "wd-popup": StubWdPopup } },
    });
    expect(noOverride.find(".qr-title").text()).toBe(PHOTO_GATE_COPY.multi_face.title);
  });
});

describe("埋点端口（契约 §7 `ai_tryon_quality_reject`；fail-soft、无第三方 SDK）", () => {
  it("⭐有 reportEvent 时按其签名上报 name+params", () => {
    const calls: Array<[string, Record<string, string | number> | undefined]> = [];
    const g = globalThis as { uni?: unknown };
    g.uni = { reportEvent: (n: string, d?: Record<string, string | number>) => calls.push([n, d]) };
    try {
      createUniAnalytics().reportEvent("ai_tryon_quality_reject", { check_code: "side_face", source: "server" });
      expect(calls).toEqual([["ai_tryon_quality_reject", { check_code: "side_face", source: "server" }]]);
    } finally {
      delete g.uni;
    }
  });

  it("容器无该 API / API 抛错 ⇒ 静默（绝不抛、绝不阻断主流程）", () => {
    const g = globalThis as { uni?: unknown };
    createUniAnalytics().reportEvent("ai_tryon_quality_reject", { check_code: "no_face" }); // 无 uni
    g.uni = { reportEvent: () => { throw new Error("boom"); } };
    try {
      expect(() => createUniAnalytics().reportEvent("ai_tryon_quality_reject", { check_code: "no_face" })).not.toThrow();
    } finally {
      delete g.uni;
    }
  });
});
