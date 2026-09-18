// P2-08：原生授权按钮桥＋协议两页（B0 首批页面）。
// （原 createConsentGate 用例已删：同意门未接线，页面以 loginAgreementChecked 内联实现，见死代码清理）
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AuthNativeButton from "../../src/platform/ui-bridge/AuthNativeButton.vue";
import { setUiPlatformOverride } from "../../src/ui/ui-platform";
import PoliciesUser from "../../src/pages/policies/user.vue";
import PoliciesPrivacy from "../../src/pages/policies/privacy.vue";
import { afterEach } from "vitest";

afterEach(() => setUiPlatformOverride(null));

describe("AuthNativeButton（platform/ui-bridge 原生授权）", () => {
  it("微信 phone：open-type=getPhoneNumber；授权 detail.code → authorized；拒绝 → denied", async () => {
    setUiPlatformOverride("mp-weixin");
    const w = mount(AuthNativeButton, { props: { kind: "phone" }, slots: { default: "一键登录" } });
    const btn = w.find("button");
    expect(btn.attributes("open-type")).toBe("getPhoneNumber");
    await btn.trigger("getphonenumber", { detail: { code: "phone-code-1" } });
    expect(w.emitted("authorized")?.[0]).toEqual(["phone-code-1"]);
    await btn.trigger("getphonenumber", { detail: {} });
    expect(w.emitted("denied")?.length).toBe(1);
  });
  it("微信 avatar：chooseavatar → authorized(avatarUrl)", async () => {
    setUiPlatformOverride("mp-weixin");
    const w = mount(AuthNativeButton, { props: { kind: "avatar" } });
    await w.find("button").trigger("chooseavatar", { detail: { avatarUrl: "/tmp/a.png" } });
    expect(w.emitted("authorized")?.[0]).toEqual(["/tmp/a.png"]);
  });
  it("抖音：无 open-type，fallback 插槽，点击 → unsupported（不假装成功）", async () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(AuthNativeButton, { props: { kind: "phone" }, slots: { fallback: "暂不支持" } });
    const btn = w.find("button");
    expect(btn.attributes("open-type")).toBeUndefined();
    expect(w.text()).toContain("暂不支持");
    await btn.trigger("click");
    expect(w.emitted("unsupported")?.length).toBe(1);
    expect(w.emitted("authorized")).toBeUndefined();
  });
});

describe("协议两页（B0，内容忠实搬运＋miniAppName 注入）", () => {
  it("user.vue：标题/日期/miniAppName 来自 Profile", () => {
    const w = mount(PoliciesUser);
    const t = w.text();
    expect(t).toContain("蓝梅旅拍 SKILL 小程序用户服务协议");
    expect(t).toContain("更新日期：2026年5月7日");
    expect(t).toContain("生效日期：2026年5月7日");
    expect(t).toContain("弥勒蓝梅网络传媒有限公司");
  });
  it("privacy.vue：标题/引言/miniAppName 来自 Profile", () => {
    const w = mount(PoliciesPrivacy);
    const t = w.text();
    expect(t).toContain("蓝梅旅拍 SKILL 小程序隐私政策");
    expect(t).toContain("请在使用本小程序前，仔细阅读并了解本隐私政策");
  });
});
