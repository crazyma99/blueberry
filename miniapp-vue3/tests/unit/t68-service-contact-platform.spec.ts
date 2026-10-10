// 2026-10-10 新增：ServiceContact 的**端差异守卫**。
//
// 背景：抖音端「长按二维码加微信客服」被判**站外引流**，体验版提审被打回 ⇒ 抖音端改用官方
// 「抖音来客 IM 客服」能力（`platform/ui-bridge/LifeImButton.vue`，`open-type="lifeIm"`），
// **抖音端不得再渲染任何二维码**；微信端保持现状。
//
// 本用例是**防回退守卫**：一旦有人把二维码在抖音端加回来（或把 lifeIm 按钮删掉），立即变红。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ServiceContact from "../../src/components/ServiceContact/ServiceContact.vue";
import { setUiPlatformOverride } from "../../src/ui/ui-platform";

const toasts: string[] = [];

beforeEach(() => {
  toasts.length = 0;
  (globalThis as { uni?: unknown }).uni = {
    showToast: (o: { title: string }) => {
      toasts.push(o.title);
    },
    getSystemInfoSync: () => ({ platform: "devtools", uniPlatform: "mp-weixin" }),
    getDeviceInfo: () => ({ platform: "devtools" }),
  };
});

afterEach(() => {
  setUiPlatformOverride(null); // 复原真实判定，避免污染其它用例
});

/** 装配（与首页/价格页实际传参一致） */
function mountContact() {
  return mount(ServiceContact, {
    props: {
      list: ["服务保障一", "服务保障二"],
      slogan: "蓝梅旅拍 · 服务保障",
      qrSrc: "https://lanmei66.cloud/admin/contact-qr.png",
      phone: "18068842642",
      coopPhone: "18068842642",
    },
  });
}

describe("ServiceContact 端差异（2026-10-10 抖音审核打回修正）", () => {
  it("⭐抖音端：渲染官方 IM 客服按钮（open-type=lifeIm），且**不渲染任何二维码**、不出现「长按…二维码」文案", () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mountContact();

    const btn = w.find('button[open-type="lifeIm"]');
    expect(btn.exists(), "抖音端应有 open-type=lifeIm 的官方客服按钮").toBe(true);
    expect(btn.text()).toContain("在线客服");

    // 二维码与"长按"文案**都不得出现**（站外引流判定点）
    expect(w.find(".code").exists(), "抖音端不得渲染二维码").toBe(false);
    expect(w.text()).not.toContain("长按");
    // 电话保留（主人 2026-10-10：暂且保留）
    expect(w.text()).toContain("联系电话");
    expect(w.text()).toContain("18068842642");
  });

  it("⭐抖音端（带客服抖音号）：走官方「IM 客服」能力 open-type=im ＋ data-im-id，且仍不出现二维码", () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mount(ServiceContact, {
      props: {
        list: ["服务保障一"],
        slogan: "s",
        qrSrc: "https://lanmei66.cloud/admin/contact-qr.png",
        phone: "18068842642",
        coopPhone: "18068842642",
        imId: "lanmei_kf", // 客服的抖音号
      },
    });
    const imBtn = w.find('button[open-type="im"]');
    expect(imBtn.exists(), "有抖音号时应走 open-type=im（门槛更低，基础库 2.68.0）").toBe(true);
    expect(imBtn.attributes("data-im-id")).toBe("lanmei_kf");
    expect(w.find('button[open-type="lifeIm"]').exists()).toBe(false); // 不再回落 lifeIm
    expect(w.find(".code").exists()).toBe(false); // 仍不得出现二维码
    expect(w.text()).not.toContain("长按");
  });

  it("微信端：保持现状（二维码在、文案在）且**不含** lifeIm 按钮", () => {
    setUiPlatformOverride("mp-weixin");
    const w = mountContact();

    expect(w.find(".code").exists(), "微信端应保留二维码").toBe(true);
    expect(w.text()).toContain("长按下面二维码添加客服");
    expect(w.find('button[open-type="lifeIm"]').exists(), "微信端不应有 lifeIm 按钮").toBe(false);
  });

  it("抖音端拉起客服失败（binderror，如未开通/基础库<3.61.0/179791）⇒ 明确提示，不静默失败", async () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mountContact();
    await w.find('button[open-type="lifeIm"]').trigger("error", { detail: { errMsg: "internal error", errorCode: 179791 } });
    expect(toasts).toContain("客服暂不可用，请稍后重试");
  });
});
