// T8 S5-2：GenerationProgress 测试——步骤文案/百分比渲染、完成/进行中/未达 三态、白勾仅出现在已完成节点、空数组不崩。
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import GenerationProgress from "../../src/components/GenerationProgress/GenerationProgress.vue";

const STEPS = ["上传照片", "AI 生成中", "优化细节", "完成"];
const ICONS = ["/static/iconpark/picture.svg", "/static/iconpark/face-scan.svg", "/static/iconpark/eyes.svg", "/static/iconpark/check-white.svg"];

describe("GenerationProgress（T8 生成等待步骤条）", () => {
  it("渲染全部步骤文案与百分比数字", () => {
    const w = mount(GenerationProgress, { props: { steps: STEPS, iconPaths: ICONS, activeIndex: 2, percent: 66 } });
    expect(w.findAll(".gp-step").length).toBe(4);
    expect(w.text()).toContain("AI 生成中");
    expect(w.find(".gp-percent").text()).toBe("66%");
  });

  it("⭐三态：已完成（下标<active）／进行中（==active）／未达（>active）", () => {
    const w = mount(GenerationProgress, { props: { steps: STEPS, iconPaths: ICONS, activeIndex: 2, percent: 99 } });
    const nodes = w.findAll(".gp-node");
    expect(nodes[0].classes()).toContain("gp-node-done");
    expect(nodes[1].classes()).toContain("gp-node-done");
    expect(nodes[2].classes()).toContain("gp-node-active");
    expect(nodes[3].classes()).toContain("gp-node-pending");
    const labels = w.findAll(".gp-label");
    expect(labels[2].classes()).toContain("gp-label-active");
  });

  it("⭐白勾仅出现在已完成节点（旧端 :19 `v-if=\"i < activeIndex\"`）", () => {
    const w = mount(GenerationProgress, { props: { steps: STEPS, iconPaths: ICONS, activeIndex: 2, percent: 40 } });
    const checks = w.findAll(".gp-check");
    expect(checks.length).toBe(2); // 下标 0、1 已完成
    expect(checks[0].attributes("src")).toBe("/static/iconpark/check-white.svg");
  });

  it("空步骤数组：不崩、仍渲染百分比", () => {
    const w = mount(GenerationProgress, { props: { steps: [], iconPaths: [], activeIndex: 0, percent: 0 } });
    expect(w.findAll(".gp-step").length).toBe(0);
    expect(w.find(".gp-percent").text()).toBe("0%");
  });
});
