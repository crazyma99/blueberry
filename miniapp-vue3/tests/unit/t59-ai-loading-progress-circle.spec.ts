// 2026-09-23 主人目标：「AI 推荐与 AI 试衣的 Loading 页进度文案没有动画 ⇒ 加 wot 动画与 Circle 组件（circle.html）并绑定 Tokens」；
// 追加口径：「原有的三段式进度要保留，给进度文案加上圆环进度动画（做增量）」。
// 本 spec = 增量守卫：①三段式步骤条仍在 ②百分比文案外包门面 `BaseCircle`（wot `wd-circle`）③文案有动效（`:key` 重播 + 当前步骤脉动）
// ④颜色/尺寸/描边全部取自 tokens（单一事实源）⑤两处 Loading（AI 推荐页 / AI 试衣结果页）共用同一组件 ⇒ 双端生效。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { tokens } from "../../src/generated/tokens";
import StubWdCircle from "../stubs/wot/wd-circle/wd-circle.vue";
import GenerationProgress from "../../src/components/GenerationProgress/GenerationProgress.vue";

const read = (p: string): string => readFileSync(resolve(__dirname, "../..", p), "utf-8");
const GP = "src/components/GenerationProgress/GenerationProgress.vue";

describe("Loading 进度：圆环动画（增量，三段式保留）", () => {
  it("门面 `ui/BaseCircle` 内部＝wot `wd-circle`，且颜色/尺寸/描边绑定 tokens", () => {
    const f = read("src/ui/BaseCircle.vue");
    expect(f).toContain("wd-circle");
    expect(f).toContain('import { tokens } from "../generated/tokens"');
    expect(f).toContain("tokens.semantic.colorAction"); // 进度色 = 品牌金 token
    expect(f).toContain("tokens.semantic.colorBorder"); // 轨道色 = 金 30% token
    expect(f).toContain("tokens.component.progressCircleSizeRpx"); // 直径 = token
    expect(f).toContain("tokens.component.progressCircleStrokeRpx"); // 描边 = token
  });

  it("token 单一事实源存在（生成器无白名单限制外的新类型）", () => {
    const src = JSON.parse(read("tokens/source.json"));
    expect(src.component.progressCircleSizeRpx).toBe(200);
    expect(src.component.progressCircleStrokeRpx).toBe(12);
  });

  it("增量：三段式步骤条保留（gp-steps/gp-node/gp-line 仍在）＋ 百分比是圆环内文案", () => {
    const s = read(GP);
    for (const keep of ["gp-steps", "gp-node", "gp-line", "gp-check"]) expect(s, keep).toContain(keep);
    expect(s).toMatch(/<BaseCircle :model-value="percent" :speed="60">/);
    expect(s).toMatch(/<text :key="percent" class="gp-percent">\{\{ percent \}\}%<\/text>/);
  });

  it("文案动效：百分比逐次重播入场动画 ＋ 当前步骤脉动（且只有一条 .gp-label-active 规则）", () => {
    const s = read(GP);
    expect(s).toContain("@keyframes gpPercentIn");
    expect(s).toContain("@keyframes gpLabelPulse");
    expect(s.match(/\.gp-label-active \{/g)?.length).toBe(1); // 去重（CR 易踩：同名两条）
    expect(s).toMatch(/\.gp-percent \{[^}]*animation: gpPercentIn/s);
    expect(s).toMatch(/\.gp-label-active \{[^}]*animation: gpLabelPulse/s);
  });

  it("两处 Loading 共用该组件（AI 推荐 / AI 试衣结果）⇒ 改一处双端生效", () => {
    for (const p of ["src/pages/aiRecommendLoading/index.vue", "src/pages/aiTryOnResult/index.vue"]) {
      expect(read(p), p).toContain("GenerationProgress");
    }
  });

  it("渲染级：圆环收到伪进度值，中心 slot 渲染 `NN%`；尺寸/颜色来自 tokens", () => {
    const w = mount(GenerationProgress, {
      props: { steps: ["A", "B", "C"], iconPaths: ["/a.svg", "/b.svg", "/c.svg"], activeIndex: 1, percent: 42 },
      global: { components: { "wd-circle": StubWdCircle } },
    });
    const circle = w.findComponent(StubWdCircle);
    expect(circle.exists()).toBe(true);
    expect(circle.props("modelValue")).toBe(42);
    expect(circle.props("color")).toBe(tokens.semantic.colorAction);
    expect(circle.props("layerColor")).toBe(tokens.semantic.colorBorder);
    expect(circle.props("speed")).toBe(60);
    expect(w.find(".gp-percent").text()).toBe("42%");
    expect(w.find(".gp-steps").exists()).toBe(true); // 三段式仍在
  });
});
