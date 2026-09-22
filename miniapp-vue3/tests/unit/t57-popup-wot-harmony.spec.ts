// 2026-09-22 主人三项收口（AI 试衣详情旧 loading→wot loading；弹窗文案 HarmonyOS Sans；弹窗统一 wot Popup）——
// 本 spec 含**源码守卫**与**渲染级断言**（独立 CR 🟡10：纯字符串断言测不到白底/层级/cancel 语义，故补渲染层）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import ProfilePopup from "../../src/components/ProfilePopup/ProfilePopup.vue";

const read = (p: string): string => readFileSync(resolve(__dirname, "../..", p), "utf-8");

/** 镜像 wot `wd-popup` 的真实结构：**遮罩与内容是兄弟**（卡片内点击不会冒到遮罩） */
const StubWdPopup = defineComponent({
  name: "StubWdPopup",
  props: {
    modelValue: { type: Boolean, default: false },
    zIndex: { type: Number, default: 10 },
    customStyle: { type: String, default: "" },
    closeOnClickModal: { type: Boolean, default: true },
  },
  emits: ["close", "update:model-value"],
  template:
    '<view class="stub-popup"><view class="stub-popup__mask" @click="$emit(\'close\')" /><view class="stub-popup__content"><slot /></view></view>',
});

describe("弹窗统一 wot Popup 门面 ＋ HarmonyOS Sans 文案（源码守卫）", () => {
  it("门面 BasePopup/BaseLoading 内部确为 wot 组件，且保留抖音自绘分支", () => {
    const popup = read("src/ui/BasePopup.vue");
    expect(popup).toContain("wd-popup");
    expect(popup).toContain("base-popup-native"); // 抖音/无 wot 环境自绘分支
    expect(read("src/ui/BaseLoading.vue")).toContain("wd-loading");
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
      expect(s).toMatch(new RegExp(`class="${cardClass}[^"]*font-harmony`));
      expect(s).not.toContain(deadClass);
      expect(s).not.toContain(`.${deadClass} {`);
    });
  }

  it("ProfilePopup 标题仍为衬线（font-noto-serif 优先）；遮罩点击语义由门面 cancel 转发", () => {
    const prof = read("src/components/ProfilePopup/ProfilePopup.vue");
    expect(prof).toContain('class="card-title font-noto-serif"');
    expect(prof).toContain('@cancel="emit(\'skip\')"');
    expect(read("src/components/LoginPopup/LoginPopup.vue")).toContain('@cancel="emit(\'close\')"');
  });

  it("aiTryOnResult：经门面 BaseLoading 渲染（加载中/生成中），旧自绘 spinner 与规则不得回流", () => {
    const page = read("src/pages/aiTryOnResult/index.vue");
    expect(page).toContain('import BaseLoading from "../../ui/BaseLoading.vue";');
    expect(page).toContain('<BaseLoading text="加载中" direction="vertical" />');
    expect(page).toContain('<BaseLoading text="生成中" direction="vertical" />');
    expect(page).not.toContain('class="loading-spinner"');
    expect(/\n[ \t]*[^\n{}]*\.loading-spinner[^\n{}]*\{/.test(page), "死样式规则不得回流").toBe(false);
  });

  it("门面层级家法：默认 zIndex 1001 ＋ wot 分支透传 ＋ 抖音自绘分支同层级", () => {
    const popup = read("src/ui/BasePopup.vue");
    expect(popup).toContain("zIndex: 1001");
    expect(popup).toContain(':z-index="zIndex"');
    expect(popup).toContain(':style="{ zIndex }"');
  });

  it("门面合同与死代码：closeOnClickModal 显式化、透明面常量、抖音分支防穿透、孤儿 keyframes 不得回流", () => {
    const popup = read("src/ui/BasePopup.vue");
    expect(popup).toContain("closeOnClickModal: true");
    expect(popup).toContain(':close-on-click-modal="closeOnClickModal"');
    expect(popup).toContain("POPUP_TRANSPARENT_STYLE");
    expect(popup).toContain("@touchmove.stop.prevent");
    for (const f of ["src/pages/aiTryOnResult/index.vue", "src/components/ProfilePopup/ProfilePopup.vue", "src/components/LoginPopup/LoginPopup.vue"]) {
      expect(read(f), f).not.toMatch(/@keyframes (spin|overlayFadeIn)\b/);
    }
  });

  it("输入框字体（🔴CR1）：`.app-input-field` 显式 HarmonyOS ＋ 内联 placeholder-style（scoped 的 placeholder-class 不命中）", () => {
    const s = read("src/components/ProfilePopup/ProfilePopup.vue");
    const block = s.slice(s.indexOf(".app-input-field {"), s.indexOf(".app-input-field {") + 400);
    expect(block).toContain("font-family: 'HarmonyOS-Sans-SC'");
    expect(s).toContain("PLACEHOLDER_STYLE");
    expect(s).not.toContain("placeholder-class=");
  });
});

describe("渲染级：弹窗经门面确实拿到透明面/层级，遮罩与卡片点击语义正确", () => {
  it("ProfilePopup：zIndex=1001、custom-style 置透明（🔴CR2）、遮罩点击 cancel→skip 恰好一次、卡片内点击不关闭", async () => {
    const w = mount(ProfilePopup, { global: { components: { "wd-popup": StubWdPopup } } });
    expect(w.find(".profile-card").exists()).toBe(true);
    const stub = w.findComponent(StubWdPopup);
    expect(stub.props("zIndex")).toBe(1001);
    expect(stub.props("customStyle")).toContain("--wot-popup-bg: transparent");
    expect(stub.props("closeOnClickModal")).toBe(true);
    await w.find(".stub-popup__mask").trigger("click");
    expect(w.emitted("skip")?.length).toBe(1);
    await w.find(".profile-card").trigger("click"); // 遮罩为兄弟节点 ⇒ 卡片内点击不得关闭
    expect(w.emitted("skip")?.length).toBe(1);
  });
});
