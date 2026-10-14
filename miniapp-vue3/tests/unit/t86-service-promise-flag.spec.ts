// T86（2026-10-14 · task-68）：抖音审核类目合规——首页「承诺块」按 profile 特征位隐藏（A 方案）。
// 背景：抖音小程序审核提示涉及「生活服务-摄影」类目（定向邀约未过审）⇒ 首页**不得出现服务承诺类模块**。
// 口径（A 方案，主人裁定）：只隐藏承诺块（分隔标题＋slogan＋编号列表）；**「联系我们」/IM 客服/电话保持现状**。
// 恢复＝profile-schema.mjs 一行改回 true ＋ 重新构建（不删代码/样式/资源）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { validateProfile } from "../../scripts/profile-schema.mjs";
import ServiceContact from "../../src/components/ServiceContact/ServiceContact.vue";

const root = resolve(__dirname, "../..");
const rawA = JSON.parse(readFileSync(resolve(root, "tests/fixtures/profiles/A.json"), "utf-8"));
// 承诺块的**端侧模板**不得再出现静态中文标题（标题经 profile 下发；产物级扫描连注释也算）
const TITLE = "服务" + "保障";

describe("t86 · ① profile 特征位：抖音 false／微信 true（标题同步为空串）", () => {
  it("⭐抖音：servicePromise=false 且 servicePromiseTitle=空串（产物内不出现该标题字面量）", () => {
    const r = validateProfile(rawA, { platform: "mp-toutiao", environment: "trial" });
    expect(r.ok).toBe(true);
    expect(r.profile.features.servicePromise).toBe(false);
    expect(r.profile.features.servicePromiseTitle).toBe("");
  });

  it("⭐微信：servicePromise=true 且标题＝原文案（保持现状）", () => {
    const r = validateProfile(rawA, { platform: "mp-weixin", environment: "release" });
    expect(r.ok).toBe(true);
    expect(r.profile.features.servicePromise).toBe(true);
    expect(r.profile.features.servicePromiseTitle).toBe(TITLE);
  });
});

describe("t86 · ② 组件级：showPromise=false 隐藏承诺块、**保留联系我们**", () => {
  const props = { list: ["承诺一", "承诺二"], slogan: "SLOGAN-TEXT", showPromise: false, promiseTitle: "" };
  it("⭐隐藏态：不渲染 slogan／编号列表；但仍渲染「联系我们」", () => {
    const w = mount(ServiceContact, { props });
    const text = w.text();
    expect(text).not.toContain("SLOGAN-TEXT");
    expect(text).not.toContain("承诺一");
    expect(text).toContain("联系我们"); // 边界：不误伤客服入口
  });

  it("⭐显示态（微信/其它端）：标题＋slogan＋列表都在", () => {
    const w = mount(ServiceContact, { props: { ...props, showPromise: true, promiseTitle: TITLE } });
    const text = w.text();
    expect(text).toContain(TITLE);
    expect(text).toContain("SLOGAN-TEXT");
    expect(text).toContain("承诺一");
    expect(text).toContain("联系我们");
  });
});

describe("t86 · ③ 静态守卫：端侧模板/注释不再含静态标题字面量（产物级扫描对注释也算）", () => {
  it("⭐ServiceContact.vue / index.vue 不得出现该中文标题字面量（除 profile 下发处）", () => {
    for (const rel of ["src/components/ServiceContact/ServiceContact.vue", "src/pages/index/index.vue"]) {
      const src = readFileSync(resolve(root, rel), "utf-8");
      expect(src, rel).not.toContain(TITLE);
    }
  });

  it("⭐首页把 profile 特征位传进组件（条件渲染，非 #ifdef）", () => {
    const src = readFileSync(resolve(root, "src/pages/index/index.vue"), "utf-8");
    expect(src).toContain(':show-promise="PROFILE.features.servicePromise"');
    expect(src).toContain(":promise-title=");
    expect(src).not.toContain("#ifdef"); // 逻辑层/模板均不走条件编译
  });
});
