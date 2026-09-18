// platform/uni/feedback：容器缺 uni 静默降级不抛；存在时参数透传（mock 口径同 t48-album-save）。
import { beforeEach, describe, expect, it } from "vitest";
import { hideLoading, navigateTo, showLoading, showModal, toast } from "../../src/platform/uni/feedback";

beforeEach(() => {
  delete (globalThis as { uni?: unknown }).uni;
});

describe("platform/uni/feedback（9 页反馈 helper 收敛）", () => {
  it("uni 全局缺失 → 五个函数全部静默跳过，不抛", () => {
    expect(() => {
      toast("x");
      toast("x", "success");
      showLoading("x");
      hideLoading();
      showModal("t", "c");
      navigateTo("/pages/a/index");
    }).not.toThrow();
  });

  it("uni 存在但对应 API 非函数 → 静默跳过，不抛", () => {
    (globalThis as { uni?: unknown }).uni = {};
    expect(() => {
      toast("x");
      showLoading("x");
      hideLoading();
      showModal("t", "c");
      navigateTo("/p");
    }).not.toThrow();
  });

  it("uni 存在 → 参数透传：toast 默认 icon 'none'，显式 'success' 原样带", () => {
    const seen: Array<Record<string, unknown>> = [];
    (globalThis as { uni?: unknown }).uni = { showToast: (o: Record<string, unknown>) => seen.push(o) };
    toast("已保存");
    toast("登录成功", "success");
    expect(seen).toEqual([
      { title: "已保存", icon: "none" },
      { title: "登录成功", icon: "success" },
    ]);
  });

  it("showLoading 透传 title 且 mask:true；hideLoading 原样调用", () => {
    const seen: Array<Record<string, unknown>> = [];
    let hides = 0;
    (globalThis as { uni?: unknown }).uni = {
      showLoading: (o: Record<string, unknown>) => seen.push(o),
      hideLoading: () => hides++,
    };
    showLoading("登录中...");
    hideLoading();
    expect(seen).toEqual([{ title: "登录中...", mask: true }]);
    expect(hides).toBe(1);
  });

  it("showModal 透传 showCancel:false／confirmText:'知道了'；navigateTo 透传 url", () => {
    const modals: Array<Record<string, unknown>> = [];
    const navs: Array<Record<string, unknown>> = [];
    (globalThis as { uni?: unknown }).uni = {
      showModal: (o: Record<string, unknown>) => modals.push(o),
      navigateTo: (o: Record<string, unknown>) => navs.push(o),
    };
    showModal("照片未通过检测", "请重新上传");
    navigateTo("/pages/policies/user");
    expect(modals).toEqual([
      { title: "照片未通过检测", content: "请重新上传", showCancel: false, confirmText: "知道了" },
    ]);
    expect(navs).toEqual([{ url: "/pages/policies/user" }]);
  });
});
