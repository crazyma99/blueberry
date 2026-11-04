// t94：微信端轻提示统一为 wot 金色 Toast（toast-host 栈 ＋ BaseFeedback 宿主 ＋ feedback.toast 路由）；抖音保持原生。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import BaseFeedback from "../../src/ui/BaseFeedback.vue";
import StubToast from "../stubs/wot/wd-toast/wd-toast.vue";
import { registerToastHost, resetToastHostsForTest, showToastViaHost } from "../../src/ui/toast-host";
import { setUiPlatformOverride } from "../../src/ui/ui-platform";
import { toast } from "../../src/platform/uni/feedback";
import { TOAST_THEME_STYLE, TOAST_Z_INDEX, TOAST_BG, TOAST_COLOR } from "../../src/ui/toast-theme";
import { tokens } from "../../src/generated/tokens";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/<!--[\s\S]*?-->/g, "");
const global = { components: { "wd-toast": StubToast } };

beforeEach(() => resetToastHostsForTest());
afterEach(() => {
  setUiPlatformOverride(null);
  delete (globalThis as { uni?: unknown }).uni;
  delete (globalThis as { getCurrentPages?: unknown }).getCurrentPages;
});

describe("t94 · toast-host 栈", () => {
  it("无宿主 → false；注册后投递给栈顶；注销后不再投递", () => {
    expect(showToastViaHost("a")).toBe(false);
    const h1 = { show: vi.fn() };
    const off = registerToastHost(h1);
    expect(showToastViaHost("a", "success")).toBe(true);
    expect(h1.show).toHaveBeenCalledWith("a", "success");
    off();
    off(); // 幂等
    expect(showToastViaHost("b")).toBe(false);
    expect(h1.show).toHaveBeenCalledTimes(1);
  });

  it("多宿主嵌套：后挂载者优先，卸载后回到前者；乱序注销只移除自己", () => {
    const a = { show: vi.fn() };
    const b = { show: vi.fn() };
    const c = { show: vi.fn() };
    const offA = registerToastHost(a);
    const offB = registerToastHost(b);
    showToastViaHost("1");
    expect(b.show).toHaveBeenCalledTimes(1);
    expect(a.show).not.toHaveBeenCalled();
    offB();
    showToastViaHost("2");
    expect(a.show).toHaveBeenCalledTimes(1);
    const offC = registerToastHost(c);
    offA(); // 乱序：移除栈底不影响 c
    showToastViaHost("3");
    expect(c.show).toHaveBeenCalledTimes(1);
    offC();
    expect(showToastViaHost("4")).toBe(false);
  });

  it("页归属：只认当前页的宿主（tab/压栈页未卸载时，不把提示投给隐藏页）", () => {
    const pageA = { route: "a" };
    const pageB = { route: "b" };
    const a = { show: vi.fn() };
    const b = { show: vi.fn() };
    registerToastHost(a, pageA);
    registerToastHost(b, pageB);
    (globalThis as { getCurrentPages?: () => unknown[] }).getCurrentPages = () => [pageA];
    expect(showToastViaHost("x")).toBe(true);
    expect(a.show).toHaveBeenCalledTimes(1);
    expect(b.show).not.toHaveBeenCalled();
    (globalThis as { getCurrentPages?: () => unknown[] }).getCurrentPages = () => [pageA, { route: "c" }];
    expect(showToastViaHost("y")).toBe(false); // 当前页无宿主 → 调用方回落原生
  });
});

describe("t94 · BaseFeedback 宿主", () => {
  it("挂载即登记、卸载即注销", async () => {
    expect(showToastViaHost("x")).toBe(false);
    const w = mount(BaseFeedback, { global });
    await nextTick();
    expect(showToastViaHost("你好")).toBe(true);
    await nextTick();
    expect(w.find(".stub-wd-toast").text()).toContain("你好");
    w.unmount();
    expect(showToastViaHost("x")).toBe(false);
  });

  it("⭐zIndex＝3000（高于 BasePopup 2000／顶栏 998），经 show 选项下发", async () => {
    expect(TOAST_Z_INDEX).toBe(3000);
    const w = mount(BaseFeedback, { global });
    (w.vm as unknown as { show: (t: string) => void }).show("层级");
    await nextTick();
    expect(w.find(".stub-wd-toast").attributes("data-z-index")).toBe("3000");
  });

  it("金色变量来自 token：底＝ink 0.92、字＝colorAction，经包裹层 style 注入", () => {
    expect(TOAST_COLOR).toBe(tokens.semantic.colorAction);
    expect(TOAST_BG).toBe("rgba(22, 15, 4, 0.92)");
    for (const v of ["--wot-toast-bg", "--wot-toast-color", "--wot-toast-border-radius: 999rpx"]) expect(TOAST_THEME_STYLE).toContain(v);
    const w = mount(BaseFeedback, { global });
    expect(w.find(".base-feedback-host").attributes("style")).toContain("--wot-toast-bg");
  });

  it("抖音：BaseFeedback.show 走原生 uni.showToast（不走 wot）", async () => {
    setUiPlatformOverride("mp-toutiao");
    const showToast = vi.fn();
    (globalThis as { uni?: unknown }).uni = { showToast };
    const w = mount(BaseFeedback, { global });
    (w.vm as unknown as { show: (t: string) => void }).show("tt");
    await nextTick();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(w.find(".stub-wd-toast").exists()).toBe(false);
  });
});

describe("t94 · feedback.toast 路由", () => {
  it("非抖音有宿主：投递宿主（icon none→无图标；success→success），不调 uni.showToast", () => {
    const host = { show: vi.fn() };
    registerToastHost(host);
    const showToast = vi.fn();
    (globalThis as { uni?: unknown }).uni = { showToast };
    toast("普通");
    toast("成功", "success");
    expect(host.show.mock.calls).toEqual([["普通", undefined], ["成功", "success"]]);
    expect(showToast).not.toHaveBeenCalled();
  });

  it("无宿主 → 回落原生 uni.showToast（icon 原样）", () => {
    const showToast = vi.fn();
    (globalThis as { uni?: unknown }).uni = { showToast };
    toast("回落");
    toast("回落2", "success");
    expect(showToast.mock.calls).toEqual([[{ title: "回落", icon: "none" }], [{ title: "回落2", icon: "success" }]]);
  });

  it("⭐抖音：即使有宿主也走原生 uni.showToast，不走宿主", () => {
    setUiPlatformOverride("mp-toutiao");
    const host = { show: vi.fn() };
    registerToastHost(host);
    const showToast = vi.fn();
    (globalThis as { uni?: unknown }).uni = { showToast };
    toast("抖音");
    expect(showToast).toHaveBeenCalledWith({ title: "抖音", icon: "none" });
    expect(host.show).not.toHaveBeenCalled();
  });
});

describe("t94 · 源码守卫", () => {
  it("BaseFeedback.vue：uni.showToast 仅出现在 isToutiaoPlatform() 分支内（不得重新引入微信原生分支）", () => {
    const src = stripComments(read("src/ui/BaseFeedback.vue"));
    expect(src.match(/uni\.showToast/g)?.length).toBe(1);
    expect(src).toMatch(/if \(isToutiaoPlatform\(\)\) \{\s*uni\.showToast/);
  });

  it("feedback.ts：toast() 本体不直接调 uni.showToast；先判 tt、再投宿主", () => {
    const src = stripComments(read("src/platform/uni/feedback.ts"));
    const body = src.slice(src.indexOf("export function toast"), src.indexOf("function nativeToast"));
    expect(body).not.toContain("uni.showToast");
    expect(body).toMatch(/!isToutiaoPlatform\(\) && showToastViaHost\(/);
  });

  it("全仓业务代码不再直接 uni.showToast（仅 BaseFeedback tt 分支、feedback 回落、chooser/AvatarPicker 既有容器兜底）", () => {
    const ALLOW = new Set(["src/ui/BaseFeedback.vue", "src/platform/uni/feedback.ts", "src/platform/uni/chooser.ts", "src/platform/ui-bridge/AvatarPickerButton.vue"]);
    const files = execSync("grep -rl 'showToast' src --include=*.vue --include=*.ts", { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
    const offenders = files.filter((f) => !ALLOW.has(f) && /uni\.showToast\(/.test(stripComments(read(f))));
    expect(offenders).toEqual([]);
  });
});
