// BaseDialog 双分支测试（2026-11 品牌化：微信分支不再走 wot 原生对话框，改 BasePopup + 品牌自绘卡片）。
// 平台分支经 setUiPlatformOverride 切换；wd-popup 用契约桩（其 .stub-close 模拟 popup 自身的关闭出口）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const haptic = vi.hoisted(() => vi.fn());
vi.mock("../../src/application/haptics", () => ({ hapticTap: haptic }));

import BaseDialog from "../../src/ui/BaseDialog.vue";
import { setUiPlatformOverride } from "../../src/ui/ui-platform";
import StubPopup from "../stubs/wot/wd-popup/wd-popup.vue";

const globalWith = { components: { "wd-popup": StubPopup } };
type DialogVm = { confirm: (o?: unknown) => Promise<string> };
const src = readFileSync(resolve(__dirname, "../../src/ui/BaseDialog.vue"), "utf-8");

beforeEach(() => haptic.mockClear());
afterEach(() => setUiPlatformOverride(null));

describe("BaseDialog 微信分支（品牌卡片）", () => {
  it("confirm() 前不渲染卡片；调用后渲染标题/正文", async () => {
    setUiPlatformOverride("mp-weixin");
    const w = mount(BaseDialog, { global: globalWith });
    expect(w.find(".base-dialog-card").exists()).toBe(false);
    const p = (w.vm as unknown as DialogVm).confirm({ title: "取消预约", msg: "确定取消吗？" });
    await w.vm.$nextTick();
    expect(w.find(".base-dialog-title").text()).toBe("取消预约");
    expect(w.find(".base-dialog-msg").text()).toBe("确定取消吗？");
    await w.find(".base-dialog-btn-confirm").trigger("click");
    await expect(p).resolves.toBe("confirm");
  });
  it("确认 → 'confirm'，取消 → 'cancel'；关闭后卡片卸载、可再弹；每次点击触感一次", async () => {
    setUiPlatformOverride("mp-weixin");
    const w = mount(BaseDialog, { global: globalWith });
    const vm = w.vm as unknown as DialogVm;
    const p1 = vm.confirm({ msg: "a" });
    await w.vm.$nextTick();
    await w.find(".base-dialog-btn-confirm").trigger("click");
    await expect(p1).resolves.toBe("confirm");
    expect(haptic).toHaveBeenCalledTimes(1);
    await w.vm.$nextTick();
    expect(w.find(".base-dialog-card").exists()).toBe(false);
    const p2 = vm.confirm({ msg: "b" });
    await w.vm.$nextTick();
    await w.find(".base-dialog-btn-cancel").trigger("click");
    await expect(p2).resolves.toBe("cancel");
    expect(haptic).toHaveBeenCalledTimes(2);
  });
  it("蒙层/popup 自身关闭出口不关闭对话框（门面 closeOnClickModal=false 且 cancel 不接线）", async () => {
    setUiPlatformOverride("mp-weixin");
    const w = mount(BaseDialog, { global: globalWith });
    const p = (w.vm as unknown as DialogVm).confirm({ msg: "x" });
    await w.vm.$nextTick();
    expect(w.findComponent(StubPopup).props("closeOnClickModal")).toBe(false);
    await w.find(".stub-close").trigger("click"); // 模拟 popup 的 close 出口
    await w.vm.$nextTick();
    expect(w.find(".base-dialog-card").exists()).toBe(true);
    await w.find(".base-dialog-btn-cancel").trigger("click");
    await expect(p).resolves.toBe("cancel");
  });
  it("showCancel=false 只渲染确认钮", async () => {
    setUiPlatformOverride("mp-weixin");
    const w = mount(BaseDialog, { global: globalWith });
    const p = (w.vm as unknown as DialogVm).confirm({ msg: "x", showCancel: false });
    await w.vm.$nextTick();
    expect(w.find(".base-dialog-btn-cancel").exists()).toBe(false);
    await w.find(".base-dialog-btn-confirm").trigger("click");
    await expect(p).resolves.toBe("confirm");
  });
  it("防回流：源码不得再出现 wot 原生对话框组件与 useDialog；按钮带 press-dim", () => {
    expect(src).not.toContain("wd-dialog");
    expect(src).not.toContain("useDialog");
    expect(src).toContain('hover-class="press-dim"');
  });
});

describe("BaseDialog 抖音分支（自绘，行为不变）", () => {
  it("渲染 .base-dialog-native；确认/取消 resolve 正确且触感", async () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(BaseDialog, { global: globalWith });
    const vm = w.vm as unknown as DialogVm;
    const p1 = vm.confirm({ title: "t", msg: "m" });
    await w.vm.$nextTick();
    expect(w.find(".base-dialog-native").exists()).toBe(true);
    expect(w.find(".base-dialog-card").exists()).toBe(false);
    await w.find(".base-dialog-native__btn--confirm").trigger("click");
    await expect(p1).resolves.toBe("confirm");
    const p2 = vm.confirm({ msg: "m" });
    await w.vm.$nextTick();
    await w.find(".base-dialog-native__btn--cancel").trigger("click");
    await expect(p2).resolves.toBe("cancel");
    expect(haptic).toHaveBeenCalledTimes(2);
  });
});
