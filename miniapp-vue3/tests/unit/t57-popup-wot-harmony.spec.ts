// 2026-09-22 主人两项收口：
//  ①「我的 → 个人信息卡片 → 完善个人资料弹窗里有文字用的是默认字体，不是 HarmonyOS Sans」——
//    本仓 HarmonyOS Sans 是 `uni.loadFontFace` 注册的自定义字体 ＋ **全局类 `.font-harmony`**（默认字体仍是系统字体）
//    ⇒ 弹窗**容器**挂 `.font-harmony`，所有文案继承（标题 `font-noto-serif` 仍优先）。
//  ②「检查新项目里 Popup 弹窗，使用 Wot UI 组件中的 Popup」——统一走门面 `ui/BasePopup`（内部＝wot `wd-popup`），
//    业务组件零 `wd-*` 直用。本 spec 为**结构守卫**：防回退到自绘遮罩、防字体类被摘掉。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string): string => readFileSync(resolve(__dirname, "../..", p), "utf-8");

describe("弹窗统一 wot Popup 门面 ＋ HarmonyOS Sans 文案", () => {
  it("门面 `ui/BasePopup` 内部确为 wot `wd-popup`，且保留抖音/无 wot 环境的自绘分支", () => {
    const facade = read("src/ui/BasePopup.vue");
    expect(facade).toContain("wd-popup");
    expect(facade).toContain("base-popup-native");
  });

  const cases: Array<[string, string, string]> = [
    ["src/components/ProfilePopup/ProfilePopup.vue", "profile-card", "profile-overlay"],
    ["src/components/LoginPopup/LoginPopup.vue", "login-card", "login-overlay"],
  ];
  for (const [file, cardClass, deadClass] of cases) {
    it(`${file.split("/").pop()}：经 BasePopup 渲染 ＋ 容器挂 font-harmony ＋ 无自绘遮罩残留`, () => {
      const s = read(file);
      expect(s).toContain('import BasePopup from "../../ui/BasePopup.vue";');
      expect(s).toContain("<BasePopup");
      expect(s).toContain("</BasePopup>");
      expect(s).toContain("position=\"center\"");
      // 容器挂字体类 ⇒ 全部文案继承 HarmonyOS Sans（标题另挂 font-noto-serif 优先）
      expect(s).toMatch(new RegExp(`class="${cardClass}[^"]*font-harmony`));
      // 自绘遮罩（类名与样式）不得回流
      expect(s).not.toContain(deadClass);
      expect(s).not.toContain(`.${deadClass} {`);
    });
  }

  it("ProfilePopup 标题仍为衬线（font-noto-serif 优先于容器 font-harmony）", () => {
    const s = read("src/components/ProfilePopup/ProfilePopup.vue");
    expect(s).toContain('class="card-title font-noto-serif"');
  });

  it("遮罩点击关闭语义由门面 cancel 转发（原 `.profile-overlay @click` 行为不丢）", () => {
    expect(read("src/components/ProfilePopup/ProfilePopup.vue")).toContain('@cancel="emit(\'skip\')"');
    expect(read("src/components/LoginPopup/LoginPopup.vue")).toContain('@cancel="emit(\'close\')"');
  });
});
