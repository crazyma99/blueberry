// T80（2026-10-13 · task-57 ①-2/①-3 → task-62 改版）：抖音取头像与取图入口。
// 官方依据：①抖音《button 组件获取用户信息》（2024-07-24，**基础库 ≥2.87.0**）⇒ `button open-type="getUserInfo"`＋`bindgetuserinfo`；
//          ②抖音《tt.chooseImage》（**基础库 1.0.0 起**，需授权，**手动取消也会走 fail 回调、errMsg 含 `cancel`**）；
//          ③uni 对抖音的 shim 覆盖不全 ⇒ 抖音端**直调 tt.chooseImage**（平台 API 落 platform/**），非抖音仍走 uni.chooseImage。
// task-62 主人真机反馈：微信端**撤掉自建「从相册选择」**（原生 chooseAvatar 自带相册，不重复入口）；
// 抖音端**大头像按钮本身**必须能拉起选择器（此前是大头按钮用 chooseAvatar＝抖音不支持 ⇒ 点了没反应）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AvatarPickerButton from "../../src/platform/ui-bridge/AvatarPickerButton.vue";
import { setUiPlatformOverride } from "../../src/ui/ui-platform";

afterEach(() => setUiPlatformOverride(null));

const bridgeSrc = readFileSync(resolve(__dirname, "../../src/platform/ui-bridge/AvatarPickerButton.vue"), "utf-8");
const popupSrc = readFileSync(resolve(__dirname, "../../src/components/ProfilePopup/ProfilePopup.vue"), "utf-8");
const chooserSrc = readFileSync(resolve(__dirname, "../../src/platform/uni/chooser.ts"), "utf-8");

describe("t80 · ①-2 抖音头像：open-type=getUserInfo（基础库 ≥2.87.0）", () => {
  it("⭐抖音端渲染 getUserInfo 授权按钮（bindgetuserinfo）", () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(AvatarPickerButton);
    expect(w.find('button[open-type="getUserInfo"]').exists(), "抖音端必须有官方授权按钮").toBe(true);
    expect(bridgeSrc).toContain("@getuserinfo=");
    expect(bridgeSrc).toContain("2.87.0"); // 门槛留痕
  });

  it("⭐微信端：本桥**不渲染任何按钮**（自建相册入口已撤，task-62），且 chooseAvatar 未被削弱", () => {
    setUiPlatformOverride("mp-weixin");
    const w = mount(AvatarPickerButton);
    expect(w.find('button[open-type="getUserInfo"]').exists()).toBe(false);
    expect(w.findAll("button").length, "微信端本桥不应渲染按钮（相册交给原生 chooseAvatar）").toBe(0);
    expect(bridgeSrc).not.toContain("onPickLocal");
    expect(bridgeSrc).not.toContain("createUniPhotoChooser"); // 自建相册入口已撤
    expect(popupSrc).toContain('open-type="chooseAvatar"'); // 原生按钮保留
    expect(popupSrc).toContain("@chooseavatar=");
  });
});

describe("t80 · ①-3 抖音端头像按钮直接拉起选择器（tt.chooseImage）＋取消/失败分流", () => {
  it("⭐抖音端大头像按钮＝普通按钮、点击即拉选择器（不再用抖音不支持的 chooseAvatar）", () => {
    expect(popupSrc).toContain('@click="onPickToutiaoAvatar"'); // 抖音分支
    expect(popupSrc).toContain("pickAvatarImage()");
    expect(popupSrc).toContain("v-if=\"!isToutiao\""); // 微信分支仍是 chooseAvatar
  });

  it("⭐取图实现：抖音直调 tt.chooseImage（官方门槛 1.0.0）＋ chooseMedia 备选＋ uni 回退；三态分流", () => {
    expect(chooserSrc).toContain("tt.chooseImage");
    expect(chooserSrc).toContain("tt.chooseMedia");
    expect(chooserSrc).toContain("1.0.0"); // 官方门槛留痕
    expect(chooserSrc).toContain("unsupported");
    expect(chooserSrc).toContain("cancel"); // 取消识别（errMsg）
    expect(popupSrc).toContain('picked.reason === "cancel"'); // 取消 ⇒ 静默
    expect(popupSrc).toContain("toastAvatarPickFailure("); // 其它失败 ⇒ 必提示
    // 平台 API 只在 platform/**
    expect(bridgeSrc).not.toMatch(/uni\.chooseImage\s*\(/);
    expect(popupSrc).not.toMatch(/uni\.chooseImage\s*\(/);
  });

  it("契约：无 #ifdef（运行时可判定）＋事件口径与页面 onChooseAvatar 一致", () => {
    expect(bridgeSrc).not.toMatch(/\/\/\s*#(ifdef|ifndef)/);
    expect(chooserSrc).not.toMatch(/\/\/\s*#(ifdef|ifndef)/);
    expect(bridgeSrc).toContain("isToutiaoPlatform()");
    expect(bridgeSrc).toContain("detail: { avatarUrl: url }");
    expect(popupSrc).toContain("AvatarPickerButton");
  });
});
