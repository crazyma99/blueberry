// 2026-09-23 主人目标：「AI 推荐与 AI 试衣的 Loading 页进度文案没有动画 ⇒ 加 wot 动画与 Circle 组件（circle.html）并绑定 Tokens」；
// 追加口径：「原有的三段式进度要保留，给进度文案加上圆环进度动画（做增量）」。
// 本 spec = 增量守卫：①三段式步骤条仍在 ②百分比文案外包门面 `BaseCircle`（wot `wd-circle`）③文案有动效（`:key` 重播 + 当前步骤脉动）
// ④颜色/尺寸/描边全部取自 tokens（单一事实源）⑤两处 Loading（AI 推荐页 / AI 试衣结果页）共用同一组件 ⇒ 双端生效。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { tokens } from "../../src/generated/tokens";
import StubWdCircle from "../stubs/wot/wd-circle/wd-circle.vue";
import GenerationProgress from "../../src/components/GenerationProgress/GenerationProgress.vue";
import BaseCircle from "../../src/ui/BaseCircle.vue";

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
    expect(s).toMatch(/<BaseCircle :model-value="percent">/); // 不再传 speed（避免与门面补间双跑，CR 🟡2）
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
    expect(circle.props("speed")).toBe(0); // 门面默认 0 ⇒ wot 不自带动画，由门面补间驱动
    expect(w.find(".gp-percent").text()).toBe("42%");
    expect(w.find(".gp-steps").exists()).toBe(true); // 三段式仍在
  });
});

// ===== 2026-09-23 主人报 BUG：「等待过程中圆环的进度不会自己推进」 =====
// 根因（读 wot 源码实证）：`wd-circle` 自带动画依赖**它内部定时器 + canvas 节点查询**（`getContext()` 在 MP-WEIXIN 分支
// 只有查到节点才 resolve，查不到就永远 pending）⇒ 真机易「环停在初始值」。修法：门面自补间 + `speed=0`（wot 收到 0 直接绘制）。
describe("圆环自行推进（自补间，不依赖 wot 内部定时器）", () => {
  it("⭐目标值变大后：环按 step/tickMs 逐步推进（中途值介于起点与终点之间），最终到达目标", async () => {
    vi.useFakeTimers();
    try {
      const w = mount(BaseCircle, { props: { modelValue: 0 }, global: { components: { "wd-circle": StubWdCircle } } });
      const stub = () => w.findComponent(StubWdCircle);
      expect(stub().props("modelValue")).toBe(0);
      expect(stub().props("speed")).toBe(0); // 默认关闭 wot 自带动画（改由门面补间）
      await w.setProps({ modelValue: 50 });
      await vi.advanceTimersByTimeAsync(500); // 5 个 tick × step2 ⇒ ≈10
      const mid = stub().props("modelValue") as number;
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(50);
      await vi.advanceTimersByTimeAsync(5000);
      expect(stub().props("modelValue")).toBe(50); // 最终到达目标并停止
    } finally {
      vi.useRealTimers();
    }
  });

  it("目标值回退（如重算/重置）⇒ 立即落位，不再逐步倒退", async () => {
    vi.useFakeTimers();
    try {
      const w = mount(BaseCircle, { props: { modelValue: 80 }, global: { components: { "wd-circle": StubWdCircle } } });
      await vi.advanceTimersByTimeAsync(5000);
      await w.setProps({ modelValue: 10 });
      await vi.advanceTimersByTimeAsync(1);
      expect(w.findComponent(StubWdCircle).props("modelValue")).toBe(10);
    } finally {
      vi.useRealTimers();
    }
  });

  // ===== CR 🟡1/🟡4（M7/M8/M9）：补掉三处假绿点 =====
  it("⭐rpx→px 走真实 upx2px（CR 🟡1/变异 M7）：注入假 uni.upx2px ⇒ 环尺寸随 token 正确折算", async () => {
    const injected = { upx2px: (n: number) => n * 0.55 }; // 模拟 414pt 机（750→414pt → 0.55）
    const g = globalThis as { uni?: unknown };
    g.uni = injected;
    try {
      const w = mount(BaseCircle, { props: { modelValue: 30 }, global: { components: { "wd-circle": StubWdCircle } } });
      const c = w.findComponent(StubWdCircle);
      expect(c.props("size")).toBeCloseTo(200 * 0.55, 6); // 110（token 200rpx）
      expect(c.props("strokeWidth")).toBeCloseTo(12 * 0.55, 6); // 6.6（token 12rpx）
    } finally {
      delete g.uni;
    }
  });

  it("布局守卫（变异 M8）：`.gp-progress` 保留 margin-top 间距，且门面不向 wd-circle 传 `text`（M9：传了中心 slot 会被 wot 隐藏）", () => {
    const gp = read("src/components/GenerationProgress/GenerationProgress.vue");
    expect(gp).toMatch(/\.gp-progress \{[^}]*margin-top: 20rpx/s);
    const bc = read("src/ui/BaseCircle.vue");
    expect(bc).not.toMatch(/<wd-circle[^>]*\s:text=/); // 未传 text ⇒ 中心 slot 可见
  });
});
