// P1-24 门面测试：按钮禁用/忙态不重复提交；弹层取消；picker 选中/取消/清空；反馈受控显示。
// P1-26 方案 A（migration §8.12）新增：抖音运行时分支测试——popup 自绘蒙层开合/cancel 单一出口、
// picker 自绘面板确认/取消/清空、toast uni.showToast 兜底、dialog useDialog 函数式驱动。
// 桩 emit 名与真实 Wot 源码 grep 事实一致（tests/stubs/wot/*），测的是本项目门面合同。
// 门面模板经 easycom 使用 wd-*；vitest 无 easycom，故以 global.components 注册桩。
// 平台分支纪律：vitest 用纯 @vitejs/plugin-vue、不处理 #ifdef ⇒ 分支做成运行时判定
// （src/ui/ui-platform.ts 的 setUiPlatformOverride 显式覆盖两条分支）。
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import BaseButton from "../../src/ui/BaseButton.vue";
import BaseField from "../../src/ui/BaseField.vue";
import BasePopup from "../../src/ui/BasePopup.vue";
import BasePicker from "../../src/ui/BasePicker.vue";
import BaseFeedback from "../../src/ui/BaseFeedback.vue";
import BaseDialog from "../../src/ui/BaseDialog.vue";
import { setUiPlatformOverride } from "../../src/ui/ui-platform";
import { useDialog } from "../../src/ui/wot-composables";
import type { WotDialogApi } from "../../src/ui/wot-composables";
import StubButton from "../stubs/wot/wd-button/wd-button.vue";
import StubInput from "../stubs/wot/wd-input/wd-input.vue";
import StubPopup from "../stubs/wot/wd-popup/wd-popup.vue";
import StubPicker from "../stubs/wot/wd-picker/wd-picker.vue";
import StubToast from "../stubs/wot/wd-toast/wd-toast.vue";
import StubDialog from "../stubs/wot/wd-dialog/wd-dialog.vue";
import StubLoading from "../stubs/wot/wd-loading/wd-loading.vue";
import BaseLoading from "../../src/ui/BaseLoading.vue";
import BaseLoadingPopup from "../../src/ui/BaseLoadingPopup.vue";

const globalWith = {
  components: {
    "wd-button": StubButton,
    "wd-input": StubInput,
    "wd-popup": StubPopup,
    "wd-picker": StubPicker,
    "wd-toast": StubToast,
    "wd-dialog": StubDialog,
    "wd-loading": StubLoading,
  },
};

afterEach(() => {
  setUiPlatformOverride(null);
  vi.unstubAllGlobals();
});

describe("BaseButton（P1-24 禁用/忙态不重复提交）", () => {
  it("正常态 click 放行一次", async () => {
    const w = mount(BaseButton, { props: { label: "提交" }, global: globalWith });
    await w.findComponent(StubButton).vm.$emit("click");
    expect(w.emitted("click")?.length).toBe(1);
  });
  it("disabled 时桩触发 click 也不放行（门面守卫）", async () => {
    const w = mount(BaseButton, { props: { label: "提交", disabled: true }, global: globalWith });
    await w.findComponent(StubButton).vm.$emit("click");
    expect(w.emitted("click")).toBeUndefined();
  });
  it("busy 时连续触发两次都不放行（防重复提交）", async () => {
    const w = mount(BaseButton, { props: { label: "提交", busy: true }, global: globalWith });
    const stub = w.findComponent(StubButton);
    await stub.vm.$emit("click");
    await stub.vm.$emit("click");
    expect(w.emitted("click")).toBeUndefined();
  });
  it("label 走默认插槽渲染", () => {
    const w = mount(BaseButton, { props: { label: "去生成" }, global: globalWith });
    expect(w.text()).toContain("去生成");
  });
});

describe("BaseField（value 流与标准事件）", () => {
  it("输入透传 update:modelValue（字符串化）", async () => {
    const w = mount(BaseField, { props: { modelValue: "", placeholder: "请输入手机号" }, global: globalWith });
    const input = w.findComponent(StubInput).find("input");
    await input.setValue("13800000000");
    expect(w.emitted("update:modelValue")?.[0]).toEqual(["13800000000"]);
  });
  it("blur/clear 事件转发", async () => {
    const w = mount(BaseField, { props: { modelValue: "x" }, global: globalWith });
    const stub = w.findComponent(StubInput);
    await stub.find("input").trigger("blur");
    expect(w.emitted("blur")?.length).toBe(1);
    await stub.vm.$emit("clear");
    expect(w.emitted("clear")?.length).toBe(1);
  });
});

describe("BasePopup（取消语义单一出口）", () => {
  it("关闭动作 → cancel ＋ update:show false，且只发一次", async () => {
    const w = mount(BasePopup, { props: { show: true, title: "标题" }, global: globalWith });
    await w.findComponent(StubPopup).find(".stub-close").trigger("click");
    expect(w.emitted("cancel")?.length).toBe(1);
    expect(w.emitted("update:show")?.[0]).toEqual([false]);
  });
  it("非抖音端走 wot 链且 rootPortal 默认 true 透传（对抖音无害 no-op、微信/支付宝/H5 生效）", () => {
    const w = mount(BasePopup, { props: { show: true }, global: globalWith });
    expect(w.findComponent(StubPopup).props("rootPortal")).toBe(true);
    expect(w.find(".base-popup-native").exists()).toBe(false);
  });
});

describe("BasePicker（选中/取消/清空）", () => {
  const options = [
    { label: "红河水乡店", value: 1 },
    { label: "昆明店", value: 2 },
  ];
  it("confirm 回传纯值数组并收起（不透传 Wot 内部对象）", async () => {
    const w = mount(BasePicker, { props: { show: true, options, modelValue: [] }, global: globalWith });
    await w.findComponent(StubPicker).find(".stub-confirm").trigger("click");
    expect(w.emitted("confirm")?.[0]).toEqual([["stub-value"]]);
    expect(w.emitted("update:show")?.[0]).toEqual([false]);
  });
  it("cancel 回传并收起", async () => {
    const w = mount(BasePicker, { props: { show: true, options, modelValue: [1] }, global: globalWith });
    await w.findComponent(StubPicker).find(".stub-cancel").trigger("click");
    expect(w.emitted("cancel")?.length).toBe(1);
    expect(w.emitted("update:show")?.[0]).toEqual([false]);
  });
  it("clearable 且有值时出现清空；点击 → clear ＋ update:modelValue []", async () => {
    const w = mount(BasePicker, { props: { show: true, options, modelValue: [1], clearable: true }, global: globalWith });
    const clearBtn = w.find(".base-picker__clear");
    expect(clearBtn.exists()).toBe(true);
    await clearBtn.trigger("click");
    expect(w.emitted("clear")?.length).toBe(1);
    expect(w.emitted("update:modelValue")?.[0]).toEqual([[]]);
  });
  it("无值时清空入口不出现", () => {
    const w = mount(BasePicker, { props: { show: true, options, modelValue: [], clearable: true }, global: globalWith });
    expect(w.find(".base-picker__clear").exists()).toBe(false);
  });
});

describe("BaseFeedback（非抖音端：useToast 函数式驱动，wd-toast 无 show prop）", () => {
  it("show 后渲染文案（含图片失败态用法），hide 后消失", async () => {
    const w = mount(BaseFeedback, { global: globalWith });
    expect(w.findComponent(StubToast).find(".stub-wd-toast").exists()).toBe(false);
    (w.vm as unknown as { show: (t: string, i?: string) => void }).show("图片加载失败", "error");
    await w.vm.$nextTick();
    expect(w.findComponent(StubToast).text()).toContain("图片加载失败");
    (w.vm as unknown as { hide: () => void }).hide();
    await w.vm.$nextTick();
    expect(w.findComponent(StubToast).find(".stub-wd-toast").exists()).toBe(false);
  });
  it("非抖音分支不触碰 uni.showToast", async () => {
    const showToast = vi.fn();
    vi.stubGlobal("uni", { showToast, hideToast: vi.fn() });
    const w = mount(BaseFeedback, { global: globalWith });
    (w.vm as unknown as { show: (t: string) => void }).show("轻提示");
    await w.vm.$nextTick();
    expect(showToast).not.toHaveBeenCalled();
    expect(w.findComponent(StubToast).text()).toContain("轻提示");
  });
});

describe("抖音分支：BaseFeedback uni.showToast 原生兜底", () => {
  it("show → uni.showToast（icon 映射 success/loading/none），hide → uni.hideToast", async () => {
    setUiPlatformOverride("mp-toutiao");
    const showToast = vi.fn();
    const hideToast = vi.fn();
    vi.stubGlobal("uni", { showToast, hideToast });
    const w = mount(BaseFeedback, { global: globalWith });
    const api = w.vm as unknown as { show: (t: string, i?: string) => void; hide: () => void };

    api.show("提交成功", "success");
    expect(showToast).toHaveBeenLastCalledWith({ title: "提交成功", icon: "success", duration: 1500 });
    api.show("加载中", "loading");
    expect(showToast).toHaveBeenLastCalledWith({ title: "加载中", icon: "loading", duration: 1500 });
    api.show("图片加载失败", "error");
    expect(showToast).toHaveBeenLastCalledWith({ title: "图片加载失败", icon: "none", duration: 1500 });

    api.hide();
    expect(hideToast).toHaveBeenCalledTimes(1);
    // 抖音分支不经过 wd-toast 注入链
    expect(w.findComponent(StubToast).find(".stub-wd-toast").exists()).toBe(false);
  });
});

describe("抖音分支：BasePopup 门面自绘（蒙层开合 / cancel 单一出口）", () => {
  it("show=true 渲染自绘蒙层＋居中容器，点击蒙层 → cancel 只发一次 ＋ update:show false", async () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(BasePopup, { props: { show: true, title: "弹层标题" }, global: globalWith });
    expect(w.find(".base-popup-native").exists()).toBe(true);
    expect(w.find(".base-popup-native__mask").exists()).toBe(true);
    expect(w.text()).toContain("弹层标题");

    await w.find(".base-popup-native__mask").trigger("click");
    expect(w.emitted("cancel")?.length).toBe(1);
    expect(w.emitted("update:show")?.[0]).toEqual([false]);
  });
  it("closable 时右上角关闭按钮存在，点击同样收敛到唯一 cancel 出口", async () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(BasePopup, { props: { show: true, closable: true }, global: globalWith });
    const closeBtn = w.find(".base-popup-native__close");
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger("click");
    expect(w.emitted("cancel")?.length).toBe(1);
    expect(w.emitted("update:show")?.[0]).toEqual([false]);
  });
  it("show=false 时不渲染任何自绘节点（也不走 wot 链）", () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(BasePopup, { props: { show: false }, global: globalWith });
    expect(w.find(".base-popup-native").exists()).toBe(false);
    expect(w.findComponent(StubPopup).exists()).toBe(false);
  });
});

describe("抖音分支：BasePicker 门面自绘底部面板", () => {
  const options = [
    { label: "红河水乡店", value: 1 },
    { label: "昆明店", value: 2 },
  ];
  it("打开时按受控值预选，点选后确认 → confirm 纯值数组 ＋ update:show false", async () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(BasePicker, { props: { show: true, options, modelValue: [1], title: "选择门店" }, global: globalWith });
    const items = w.findAll(".base-picker-native__item");
    expect(items.length).toBe(2);
    expect(items[0].classes()).toContain("base-picker-native__item--active");

    await items[1].trigger("click");
    expect(w.findAll(".base-picker-native__item")[1].classes()).toContain("base-picker-native__item--active");
    await w.find(".base-picker-native__btn--ok").trigger("click");
    expect(w.emitted("confirm")?.[0]).toEqual([[2]]);
    expect(w.emitted("update:show")?.[0]).toEqual([false]);
  });
  it("点击取消 → cancel ＋ update:show false", async () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(BasePicker, { props: { show: true, options, modelValue: [] }, global: globalWith });
    await w.find(".base-picker-native__btn").trigger("click");
    expect(w.emitted("cancel")?.length).toBe(1);
    expect(w.emitted("update:show")?.[0]).toEqual([false]);
  });
  it("点击蒙层也走同一 cancel 出口（只发一次）", async () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(BasePicker, { props: { show: true, options, modelValue: [] }, global: globalWith });
    await w.find(".base-picker-native__mask").trigger("click");
    expect(w.emitted("cancel")?.length).toBe(1);
    expect(w.emitted("update:show")?.[0]).toEqual([false]);
  });
  it("clearable 且有值 → 清空入口仍在（自绘分支不改清空合同）", async () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(BasePicker, { props: { show: true, options, modelValue: [2], clearable: true }, global: globalWith });
    const clearBtn = w.find(".base-picker__clear");
    expect(clearBtn.exists()).toBe(true);
    await clearBtn.trigger("click");
    expect(w.emitted("clear")?.length).toBe(1);
    expect(w.emitted("update:modelValue")?.[0]).toEqual([[]]);
  });
});

describe("Dialog：useDialog 函数式驱动（2.3.2 唯一正确通道）", () => {
  function makeHost(): { host: ReturnType<typeof defineComponent>; api: () => WotDialogApi } {
    let dialog!: WotDialogApi;
    const host = defineComponent({
      setup() {
        dialog = useDialog();
        return () => h("div", [h(StubDialog)]);
      },
    });
    return { host, api: () => dialog };
  }
  it("confirm promise：点确定 resolve、点取消 reject", async () => {
    const { host, api } = makeHost();
    const w = mount(host, { global: globalWith });

    const ok = api().confirm({ title: "确认操作", msg: "内容" });
    await w.vm.$nextTick();
    await w.find(".stub-dialog-confirm").trigger("click");
    await expect(ok).resolves.toEqual({ action: "confirm" });

    const no = api().confirm({ title: "确认操作", msg: "内容" });
    await w.vm.$nextTick();
    await w.find(".stub-dialog-cancel").trigger("click");
    await expect(no).rejects.toEqual({ action: "cancel" });
  });
  it("关闭后 dialogState.show 复位（组件自闭环，无需外部 v-model）", async () => {
    const { host, api } = makeHost();
    const w = mount(host, { global: globalWith });
    const p = api().confirm({ title: "确认操作", msg: "内容" });
    await w.vm.$nextTick();
    expect(w.find(".stub-wd-dialog").exists()).toBe(true);
    await w.find(".stub-dialog-confirm").trigger("click");
    await w.vm.$nextTick();
    expect(w.find(".stub-wd-dialog").exists()).toBe(false);
    await expect(p).resolves.toBeTruthy();
  });
});


describe("BaseDialog（对话框双平台门面，方案A收尾 §8.13）", () => {
  type DialogVm = { confirm: (o?: unknown) => Promise<string> };
  it("抖音分支：确认按钮 resolve('confirm') 且状态复位", async () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(BaseDialog, { global: globalWith });
    const p = (w.vm as unknown as DialogVm).confirm({ title: "确认操作", msg: "内容", showCancel: true });
    await w.vm.$nextTick();
    expect(w.find(".base-dialog-native__box").exists()).toBe(true);
    expect(w.find(".base-dialog-native__title").text()).toContain("确认操作");
    await w.find(".base-dialog-native__btn--confirm").trigger("click");
    await expect(p).resolves.toBe("confirm");
    await w.vm.$nextTick();
    expect(w.find(".base-dialog-native__box").exists()).toBe(false);
  });
  it("抖音分支：取消按钮 resolve('cancel')；蒙层点击不关闭", async () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(BaseDialog, { global: globalWith });
    const p = (w.vm as unknown as DialogVm).confirm({ msg: "内容" });
    await w.vm.$nextTick();
    await w.find(".base-dialog-native__mask").trigger("click");
    await w.vm.$nextTick();
    expect(w.find(".base-dialog-native__box").exists()).toBe(true); // 蒙层不关闭
    await w.find(".base-dialog-native__btn--cancel").trigger("click");
    await expect(p).resolves.toBe("cancel");
  });
  it("抖音分支：showCancel=false 只渲染确认；连续两次调用状态复位", async () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(BaseDialog, { global: globalWith });
    const vm = w.vm as unknown as DialogVm;
    const p1 = vm.confirm({ msg: "a", showCancel: false });
    await w.vm.$nextTick();
    expect(w.find(".base-dialog-native__btn--cancel").exists()).toBe(false);
    await w.find(".base-dialog-native__btn--confirm").trigger("click");
    await expect(p1).resolves.toBe("confirm");
    const p2 = vm.confirm({ msg: "b", showCancel: true });
    await w.vm.$nextTick();
    expect(w.find(".base-dialog-native__box").exists()).toBe(true); // 第二次可再弹
    expect(w.find(".base-dialog-native__btn--cancel").exists()).toBe(true);
    await w.find(".base-dialog-native__btn--cancel").trigger("click");
    await expect(p2).resolves.toBe("cancel");
  });
  it("非抖音分支：走 useDialog 通道（桩注入链），confirm/cancel 正确映射", async () => {
    setUiPlatformOverride("mp-weixin");
    const w = mount(BaseDialog, { global: globalWith });
    const vm = w.vm as unknown as DialogVm;
    const p1 = vm.confirm({ title: "t", msg: "m" });
    await w.vm.$nextTick();
    const stub = w.findComponent(StubDialog);
    expect(stub.find(".stub-wd-dialog").exists()).toBe(true); // useDialog 驱动 show
    await stub.find(".stub-dialog-confirm").trigger("click");
    await expect(p1).resolves.toBe("confirm");
    const p2 = vm.confirm({ title: "t2" });
    await w.vm.$nextTick();
    await stub.find(".stub-dialog-cancel").trigger("click");
    await expect(p2).resolves.toBe("cancel");
  });
});

describe("BaseLoading（2026-09-21 首页下拉刷新门面）", () => {
  it("默认值走 design token：品牌金 colorAction + 组件级尺寸档 pullRefreshLoadingSizeRpx；无文案也可渲染", () => {
    const w = mount(BaseLoading, { global: globalWith });
    const stub = w.findComponent(StubLoading);
    expect(stub.props("type")).toBe("circular");
    expect(stub.props("direction")).toBe("horizontal");
    expect(stub.props("color")).toBe("#F1CD91"); // tokens.semantic.colorAction
    expect(stub.props("size")).toBe("48rpx"); // tokens.component.pullRefreshLoadingSizeRpx
    expect(stub.props("text")).toBe("");
  });
  it("调用侧可覆盖：text/size/color/type/direction/inheritColor 原样透传给 wd-loading", () => {
    const w = mount(BaseLoading, {
      props: { text: "刷新中…", size: "32rpx", color: "#FFFFFF", type: "dots", direction: "vertical", inheritColor: true },
      global: globalWith,
    });
    const stub = w.findComponent(StubLoading);
    expect(stub.props("text")).toBe("刷新中…");
    expect(stub.props("size")).toBe("32rpx");
    expect(stub.props("color")).toBe("#FFFFFF");
    expect(stub.props("type")).toBe("dots");
    expect(stub.props("direction")).toBe("vertical");
    expect(stub.props("inheritColor")).toBe(true);
  });
});

describe("BaseLoadingPopup（2026-09-21 新增公共组件：wot popup ＋ wot loading＋token）", () => {
  it("微信分支：走 wd-popup（居中/遮罩点击不关/透明面＋门面 token 卡片与指示器）", () => {
    setUiPlatformOverride("mp-weixin");
    const w = mount(BaseLoadingPopup, { props: { show: true, text: "正在准备分享…" }, global: globalWith });
    const popup = w.findComponent(StubPopup);
    expect(popup.props("modelValue")).toBe(true);
    expect(popup.props("position")).toBe("center");
    expect(popup.props("closable")).toBe(false);
    expect(popup.props("closeOnClickModal")).toBe(false); // 加载中不许点遮罩关
    expect(String(popup.props("customStyle"))).toContain("--wot-popup-bg: transparent");
    expect(popup.props("rootPortal")).toBe(true); // CR 🟡7：此前无覆盖
    expect(popup.props("zIndex")).toBe(1001); // CR 🔴1：wot 默认 10 < 自绘标题栏 998 ⇒ 必须显式抬层
    expect(popup.props("customClass")).toBe("base-loading-popup"); // CR 🟡7：此前无覆盖
    expect(w.find(".base-loading-popup__card").exists()).toBe(true);
    const loading = w.findComponent(StubLoading);
    expect(loading.props("text")).toBe("正在准备分享…");
    expect(loading.props("direction")).toBe("vertical"); // 默认竖排（旧端 LoadingBlock 口径）
    expect(loading.props("color")).toBe("#F1CD91"); // token semantic.colorAction
    expect(loading.props("size")).toBe("48rpx"); // token component.pullRefreshLoadingSizeRpx
  });

  it("show=false 时 wd-popup 不显示（受控：加载态由业务收口）", () => {
    setUiPlatformOverride("mp-weixin");
    const w = mount(BaseLoadingPopup, { props: { show: false }, global: globalWith });
    expect(w.findComponent(StubPopup).props("modelValue")).toBe(false);
  });

  it("抖音分支：自绘固定蒙层＋居中卡片（不走 wd-popup），文案/指示器同唯一样式源", () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(BaseLoadingPopup, { props: { show: true }, global: globalWith });
    expect(w.findComponent(StubPopup).exists()).toBe(false);
    expect(w.find(".base-loading-popup-native").exists()).toBe(true);
    expect(w.find(".base-loading-popup-native__mask").exists()).toBe(true);
    expect(w.find(".base-loading-popup__card").exists()).toBe(true);
    expect(w.findComponent(StubLoading).props("text")).toBe("加载中…"); // 默认文案
    const hidden = mount(BaseLoadingPopup, { props: { show: false }, global: globalWith });
    expect(hidden.find(".base-loading-popup-native").exists()).toBe(false);
  });
});

describe("BaseLoadingPopup 样式纪律（独立 CR 🟡7：零 var(--)/零通配；卡片面走 token）", () => {
  it("组件源码：样式块零运行时 CSS 变量与通配选择器，卡片面为 token 值，且未使用 :deep 打洞 wot 内部", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(__dirname, "../../src/ui/BaseLoadingPopup.vue"), "utf-8");
    const styleBlock = src.slice(src.indexOf("<style"), src.lastIndexOf("</style>")).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(styleBlock).not.toContain("var(--");
    expect(/[\s,{>]\*[\s,{]/.test(styleBlock)).toBe(false);
    expect(styleBlock).toContain("background: $color-page"); // 卡片面（此前变异「删底色」不变红）
    expect(styleBlock).toContain("border: 2rpx solid $color-border");
    expect(styleBlock).not.toContain(":deep("); // 透明面靠 custom-style，不打洞 wot 内部
  });
});
