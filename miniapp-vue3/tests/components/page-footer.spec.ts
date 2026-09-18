// PageFooter 纯去重收敛的结构合同：9 页原有变体（包裹/分隔线/文案类名）逐一保留，props 透传 AppFooter。
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PageFooter from "../../src/components/PageFooter/PageFooter.vue";
import AppFooter from "../../src/components/AppFooter/AppFooter.vue";

describe("PageFooter（页脚块共享组件）", () => {
  it("默认：page-footer 包裹 + divide + bottomdesc，文案透传 AppFooter", () => {
    const w = mount(PageFooter, { props: { mainLine: "版权行", supportLine: "支持行" } });
    const root = w.element as HTMLElement;
    expect(root.classList.contains("page-footer")).toBe(true);
    expect(w.find(".divide").exists()).toBe(true);
    expect(w.find(".bottomdesc").exists()).toBe(true);
    const footer = w.findComponent(AppFooter);
    expect(footer.props("mainLine")).toBe("版权行");
    expect(footer.props("supportLine")).toBe("支持行");
  });

  it("copyright 变体（favorites/aiTryOnHistory）", () => {
    const w = mount(PageFooter, { props: { variant: "copyright" } });
    expect(w.find(".copyright").exists()).toBe(true);
    expect(w.find(".divide").exists()).toBe(true);
  });

  it("bottomdesc-dark 变体（深色 AI 页），safe-area 叠加外层类", () => {
    const w = mount(PageFooter, { props: { variant: "bottomdesc-dark", safeArea: true } });
    const root = w.element as HTMLElement;
    expect(root.classList.contains("page-footer")).toBe(true);
    expect(root.classList.contains("page-footer-safe")).toBe(true);
    expect(w.find(".bottomdesc-dark").exists()).toBe(true);
  });

  it("beian 变体 + 无分隔线（index）", () => {
    const w = mount(PageFooter, { props: { variant: "beian", withDivide: false } });
    expect(w.find(".beian").exists()).toBe(true);
    expect(w.find(".divide").exists()).toBe(false);
  });

  it("wrapped=false：无 page-footer 包裹类（priceList/priceHomePage）", () => {
    const w = mount(PageFooter, { props: { wrapped: false } });
    expect((w.element as HTMLElement).classList.contains("page-footer")).toBe(false);
    expect(w.find(".divide").exists()).toBe(true);
    expect(w.find(".bottomdesc").exists()).toBe(true);
  });

  it("props 缺省走空串兜底（与 AppFooter 默认一致）", () => {
    const w = mount(PageFooter);
    const footer = w.findComponent(AppFooter);
    expect(footer.props("mainLine")).toBe("");
    expect(footer.props("supportLine")).toBe("");
  });
});
