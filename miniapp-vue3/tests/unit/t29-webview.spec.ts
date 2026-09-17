// T7 P2-22：webview 准入加固（⭐ 有意偏差：旧端零校验可开任意 URL；新端仅白名单 host）＋页面拒绝/返回路径。
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import {
  isAllowedWebviewUrl,
  webviewHost,
  hostAllowed,
  DEFAULT_WEBVIEW_HOSTS,
} from "../../src/domain/webview-url";

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  toasts: [] as string[],
  navigateBackCalls: 0,
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => {
    h.onLoadCalls.push(fn);
  },
}));

import WebviewPage from "../../src/pages/webview/index.vue";

const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  h.toasts.length = 0;
  h.navigateBackCalls = 0;
  (globalThis as { uni?: unknown }).uni = {
    showToast: (o: { title: string }) => {
      h.toasts.push(o.title);
    },
    navigateBack: () => {
      h.navigateBackCalls += 1;
    },
  };
});

describe("domain/webview-url（P2-22 准入白名单）", () => {
  it("合法：白名单主域与子域；协议限 http(s)；大小写不敏感；端口/userinfo 忽略", () => {
    expect(isAllowedWebviewUrl("https://lanmei66.cloud/x")).toBe(true);
    expect(isAllowedWebviewUrl("https://www.lanmei66.cloud/admin/a.png")).toBe(true);
    expect(isAllowedWebviewUrl("http://crazyma99.xyz/")).toBe(true);
    expect(isAllowedWebviewUrl("https://LANMEI66.CLOUD/X")).toBe(true);
    expect(isAllowedWebviewUrl("https://lanmei66.cloud:8443/x")).toBe(true);
    expect(isAllowedWebviewUrl("https://user:pass@lanmei66.cloud/x")).toBe(true);
  });

  it("⭐拒绝：外域／子串伪装域／非 http(s) scheme／空值／非字符串", () => {
    expect(isAllowedWebviewUrl("https://evil.com/x")).toBe(false);
    // 精确主域口径：`lanmei66.cloud.evil.com` 不得命中
    expect(isAllowedWebviewUrl("https://lanmei66.cloud.evil.com/x")).toBe(false);
    expect(isAllowedWebviewUrl("https://lanmei66.cloud@evil.com/x")).toBe(false);
    expect(isAllowedWebviewUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedWebviewUrl("data:text/html,<b>x</b>")).toBe(false);
    expect(isAllowedWebviewUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedWebviewUrl("/pages/index/index")).toBe(false);
    expect(isAllowedWebviewUrl("")).toBe(false);
    expect(isAllowedWebviewUrl("   ")).toBe(false);
    expect(isAllowedWebviewUrl(undefined)).toBe(false);
    expect(isAllowedWebviewUrl(123)).toBe(false);
  });

  it("⭐拒绝（CR 🔴1 旁路回归）：authority 内反斜杠——WHATWG 把 `\\` 当 `/`，校验器与容器必须同口径", () => {
    // 校验器若允许 `\`，会判为白名单子域而容器实际打开 evil.com（旁路）
    expect(isAllowedWebviewUrl("https://evil.com\\.lanmei66.cloud/x")).toBe(false);
    expect(isAllowedWebviewUrl("https://evil.com\\@lanmei66.cloud/x")).toBe(false);
    expect(webviewHost("https://evil.com\\.lanmei66.cloud/x")).toBeNull();
  });

  it("⭐拒绝（矩阵补全）：协议相对 //host／制表符与换行注入／userinfo 尾 @ 空 host／空 host", () => {
    expect(isAllowedWebviewUrl("//evil.com/x")).toBe(false);
    expect(isAllowedWebviewUrl("https://lanmei66.cloud\t.evil.com/x")).toBe(false);
    expect(isAllowedWebviewUrl("https://lanmei66.cloud\n.evil.com/x")).toBe(false);
    expect(isAllowedWebviewUrl("https://evil.com@/x")).toBe(false);
    expect(isAllowedWebviewUrl("https:///x")).toBe(false);
    expect(webviewHost("https://evil.com@")).toBeNull();
  });

  it("host 解析与白名单口径（去端口/去 userinfo/子域匹配）", () => {
    expect(webviewHost("https://www.lanmei66.cloud:443/a?b=1")).toBe("www.lanmei66.cloud");
    expect(webviewHost("https://u@lanmei66.cloud/x")).toBe("lanmei66.cloud");
    expect(webviewHost("javascript:x")).toBeNull();
    expect(hostAllowed("a.lanmei66.cloud", DEFAULT_WEBVIEW_HOSTS)).toBe(true);
    expect(hostAllowed("lanmei66.cloud.evil.com", DEFAULT_WEBVIEW_HOSTS)).toBe(false);
  });
});

describe("pages/webview（P2-22 拒绝与返回路径）", () => {
  it("合法 URL：渲染 web-view 且 src 为解码后地址；不提示不返回", async () => {
    const w = mount(WebviewPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]({ url: encodeURIComponent("https://lanmei66.cloud/doc?a=1") });
    await flush();
    await w.vm.$nextTick();
    expect(w.find("web-view").attributes("src")).toBe("https://lanmei66.cloud/doc?a=1");
    expect(h.toasts).toEqual([]);
    await new Promise((r) => setTimeout(r, 900));
    expect(h.navigateBackCalls).toBe(0);
  });

  it("⭐非法 URL：不渲染 web-view＋toast「链接不可打开」＋800ms 后返回", async () => {
    const w = mount(WebviewPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]({ url: encodeURIComponent("https://evil.com/x") });
    await flush();
    await w.vm.$nextTick();
    expect(w.find("web-view").exists()).toBe(false);
    expect(h.toasts).toContain("链接不可打开");
    expect(h.navigateBackCalls).toBe(0);
    await new Promise((r) => setTimeout(r, 900));
    expect(h.navigateBackCalls).toBe(1);
  });

  it("⭐缺失/畸形 url：同样拒绝（不放开任意 URL）；返回按钮可点且幂等（CR 🟡1 不多退一页）", async () => {
    const w = mount(WebviewPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]({});
    await flush();
    await w.vm.$nextTick();
    expect(w.find("web-view").exists()).toBe(false);
    expect(h.toasts).toContain("链接不可打开");
    // 返回栏仍在（拒绝后用户可立即手动返回）
    await w.find(".wv-nav-back").trigger("click");
    expect(h.navigateBackCalls).toBe(1);
    // 定时器到点不得再退一页（幂等）
    await new Promise((r) => setTimeout(r, 900));
    expect(h.navigateBackCalls).toBe(1);
  });
});
