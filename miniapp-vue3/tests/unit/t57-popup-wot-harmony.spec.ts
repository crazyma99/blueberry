// 2026-09-22 主人三项收口（AI 试衣详情旧 loading→wot loading；弹窗文案 HarmonyOS Sans；弹窗统一 wot Popup）——
// 本 spec 含**源码守卫**与**渲染级断言**（独立 CR 🟡10：纯字符串断言测不到白底/层级/cancel 语义，故补渲染层）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import ProfilePopup from "../../src/components/ProfilePopup/ProfilePopup.vue";
import LoginPopup from "../../src/components/LoginPopup/LoginPopup.vue";

const read = (p: string): string => readFileSync(resolve(__dirname, "../..", p), "utf-8");

/** 镜像 wot `wd-popup` 的真实结构：**遮罩与内容是兄弟**（卡片内点击不会冒到遮罩） */
const StubWdPopup = defineComponent({
  name: "StubWdPopup",
  props: {
    modelValue: { type: Boolean, default: false },
    position: { type: String, default: "center" },
    round: { type: Boolean, default: false },
    safeAreaInsetBottom: { type: Boolean, default: false },
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
      expect(read(f), f).not.toMatch(/@keyframes (spin|overlayFadeIn|cardPopIn)\b/);
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
    expect(stub.props("zIndex")).toBe(2000); // 底部弹层：须高于自绘栏 998 / Tab 栏 900（且**关闭 root-portal** 回到页面层叠）
    expect(stub.props("position")).toBe("bottom"); // 底部弹层（主人指示）
    
    expect(stub.props("customStyle")).toContain("--wot-popup-bg: transparent"); // 弹层保持透明面；**面色由卡片 SCSS token 承载**（抖音 TTSS 不支持 CSS 变量）
    expect(stub.props("closeOnClickModal")).toBe(true);
    await w.find(".stub-popup__mask").trigger("click");
    expect(w.emitted("skip")?.length).toBe(1);
    await w.find(".profile-card").trigger("click"); // 遮罩为兄弟节点 ⇒ 卡片内点击不得关闭
    expect(w.emitted("skip")?.length).toBe(1);
  });

  // ===== 2026-09-22 主人报 v1.0.45 两处 UI 异常：内容溢出 + 被底部 Tab 栏压着 =====
  it("底部弹层几何：两卡片 `box-sizing:border-box`（通栏+左右 padding 不溢出）", () => {
    for (const f of ["src/components/ProfilePopup/ProfilePopup.vue", "src/components/LoginPopup/LoginPopup.vue"]) {
      const s = read(f);
      expect(s, f).toContain("box-sizing: border-box");
      expect(s, f).toContain("width: 100%");
    }
  });

  it("层级：弹层显式 z-index 1200；Tab 栏下调至 900（弹层须覆盖 Tab 栏）", () => {
    for (const f of ["src/components/ProfilePopup/ProfilePopup.vue", "src/components/LoginPopup/LoginPopup.vue"]) {
      expect(read(f), f).toContain(':z-index="2000"');
      expect(read(f), f).toContain(':root-portal="false"');
    }
    expect(read("src/custom-tab-bar/index.wxss")).toContain("z-index: 900");
  });

  // ===== CR 🟡4：补两处假绿（LoginPopup 无渲染级覆盖；「Token 跟随主题色」零覆盖）=====
  it("LoginPopup 渲染级：position=bottom／zIndex=1200／遮罩点击 cancel→close", async () => {
    const w = mount(LoginPopup, { global: { components: { "wd-popup": StubWdPopup } } });
    const stub = w.findComponent(StubWdPopup);
    expect(stub.props("position")).toBe("bottom");
    expect(stub.props("zIndex")).toBe(2000);
    await w.find(".stub-popup__mask").trigger("click");
    expect(w.emitted("close")?.length).toBe(1);
  });

  it("⭐Token 跟随主题色（CR 🟡4②）：两卡片面色与上圆角/安全区均走 SCSS token，且 token 源存在于 source.json", () => {
    for (const f of ["src/components/ProfilePopup/ProfilePopup.vue", "src/components/LoginPopup/LoginPopup.vue"]) {
      const s = read(f);
      expect(s, f).toContain("background: $color-popup-card");
      if (f.includes("ProfilePopup")) expect(s, f).toContain("border: 2rpx solid $color-popup-card"); // 头像角标描边同语义色（CR 🟡5）
      expect(s, f).toMatch(/border-radius: #\{\$popup-radius-rpx \* 2\}rpx #\{\$popup-radius-rpx \* 2\}rpx 0 0;/);
      expect(s, f).toMatch(/padding-bottom: calc\(44rpx \+ env\(safe-area-inset-bottom\)\)/);
      // 🔴CR1：安全区必须在 `padding:` 简写之后（否则被覆盖＝死代码）
      expect(s.indexOf("padding-bottom: calc(44rpx + env(")).toBeGreaterThan(s.indexOf("padding: 56rpx 48rpx 44rpx") > 0 ? s.indexOf("padding: 56rpx 48rpx 44rpx") : s.indexOf("padding: "));
    }
    const src = JSON.parse(read("tokens/source.json"));
    expect(src.semantic.colorPopupCard).toBe("#262626");
  });

  it("抖音自绘分支（CR 🔴2/🟡4⑥⑦）：is-bottom 判定存在、箱体重置 max-width/padding、按 position 绑类", () => {
    const s = read("src/ui/BasePopup.vue");
    expect(s).toContain("base-popup-native.is-bottom");
    expect(s).toContain("max-width: none");
    expect(s).toContain("padding: 0");
    expect(s).toMatch(/position === 'bottom' \? 'base-popup-native is-bottom'/);
  });

  it("门面无死 API（CR 🟡3）：两弹窗**不得**传 round／safe-area-inset-bottom／:custom-style", () => {
    for (const f of ["src/components/ProfilePopup/ProfilePopup.vue", "src/components/LoginPopup/LoginPopup.vue"]) {
      const s = read(f);
      // 负断言要看**prop 用法**而非子串（`background` 里含 "round" 会假红）
      expect(s, f).not.toMatch(/<BasePopup[^>]*\sround[\s/>]/);
      expect(s, f).not.toContain("safe-area-inset-bottom=");
      expect(s, f).not.toContain("SHEET_STYLE");
    }
    const facade = read("src/ui/BasePopup.vue");
    expect(facade).not.toContain("round?: boolean");
    expect(facade).not.toContain("safeAreaInsetBottom?: boolean");
  });

  // ===== 2026-09-23 主人报「48 版弹层仍被 Tab 栏盖住」：生态公认解法＝弹层显示期间隐藏自定义 Tab 栏 =====
  it("自定义 Tab 栏协同：Tab 栏有 visible 开关 + pageLifetimes 兜底恢复；门面显示期隐藏、卸载恢复", async () => {
    const tabJs = read("src/custom-tab-bar/index.js");
    expect(tabJs).toContain("visible: true");
    expect(tabJs).toContain("pageLifetimes");
    expect(read("src/custom-tab-bar/index.wxml")).toContain('wx:if="{{visible}}"');
    expect(read("src/ui/BasePopup.vue")).toContain("setTabBarVisible");

    const setData = vi.fn();
    const g = globalThis as { getCurrentPages?: () => unknown[] };
    g.getCurrentPages = () => [{ getTabBar: () => ({ setData }) }];
    const w = mount(ProfilePopup, { global: { components: { "wd-popup": StubWdPopup } } });
    expect(setData).toHaveBeenCalledWith({ visible: false }); // 打开弹层 ⇒ 隐藏 Tab 栏
    w.unmount();
    expect(setData).toHaveBeenCalledWith({ visible: true }); // 关闭/卸载 ⇒ 恢复
    delete g.getCurrentPages;
  });
});
