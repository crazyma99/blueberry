// 到店预约（底部 Tab）平台作用域守卫：预约两页仅微信注册；逻辑层零 #ifdef；首页保持零条件编译且零预约痕迹；
// 首页店铺卡片上的「到店预约」入口（BookingEntry）已于 2026-11-06 整体移除。
// （原 booking-entry-and-scope.spec.ts：入口组件/接线/样式用例随组件删除；作用域与合规用例保留于此。）
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COMPAT_DECLARATIONS } from "../../scripts/scan-platform-usage.mjs";
import { expectedRoutesForPlatform } from "../../scripts/build-target.mjs";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf-8");
const flush = () => new Promise((r) => setTimeout(r, 30));

describe("入口移除：首页无任何预约痕迹", () => {
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/.*$/gm, "");

  it("⭐components/BookingEntry 目录已删除", () => {
    expect(existsSync(resolve(root, "src/components/BookingEntry"))).toBe(false);
  });

  it("⭐首页（去注释后）不含 BookingEntry／预约路径／「到店预约」文案，且保持零条件编译（t86 同口径）", () => {
    const raw = read("src/pages/index/index.vue");
    const code = stripComments(raw);
    expect(code).not.toMatch(/BookingEntry|booking-entry|pages\/booking|到店预约|shopName=/);
    expect(raw).not.toContain("#ifdef");
    expect(raw).not.toContain("#ifndef");
  });

  it("全仓 src 无 BookingEntry 引用；COMPAT_DECLARATIONS 不再登记该组件", () => {
    expect(COMPAT_DECLARATIONS.some((d: { file: string }) => d.file.includes("BookingEntry"))).toBe(false);
    for (const f of ["src/pages/index/index.vue", "src/pages/booking/index.vue", "src/pages/mine/index.vue", "src/pages/myBookings/index.vue"]) {
      expect(read(f), f).not.toContain("BookingEntry");
    }
  });

  it("预约页（Tab）仅有一个入口：pages.json tabBar；其余源码里没有任何 `pages/booking` 跳转字面量", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(vue|ts|js|uts)$/.test(name)) continue;
        const rel = p.slice(root.length + 1);
        if (rel === "src/custom-tab-bar/index.js" || rel.startsWith("src/generated/")) continue;
        if (stripComments(readFileSync(p, "utf-8")).includes("pages/booking")) hits.push(rel);
      }
    };
    walk(resolve(root, "src"));
    expect(hits).toEqual([]);
  });
});

describe("平台作用域守卫（仅微信端）", () => {
  const pagesJson = read("src/pages.json");

  it("预约两页只在微信端路由集内；抖音/小红书端路由集不含", () => {
    const wx = expectedRoutesForPlatform(pagesJson, "mp-weixin");
    expect(wx).toContain("pages/booking/index");
    expect(wx).toContain("pages/myBookings/index");
    for (const p of ["mp-toutiao", "mp-xhs"] as const) {
      const routes = expectedRoutesForPlatform(pagesJson, p);
      expect(routes, p).not.toContain("pages/booking/index");
      expect(routes, p).not.toContain("pages/myBookings/index");
    }
  });

  it("预约页注册块位于 `#ifdef MP-WEIXIN` 内（紧邻 AI 六页同块）", () => {
    const at = pagesJson.indexOf('"path": "pages/booking/index"');
    const before = pagesJson.slice(0, at);
    const lastIfdef = before.lastIndexOf("// #ifdef MP-WEIXIN");
    const lastEndif = before.lastIndexOf("// #endif");
    expect(lastIfdef).toBeGreaterThan(-1);
    expect(lastIfdef).toBeGreaterThan(lastEndif); // 最近一个条件块仍未关闭 ⇒ 处于微信宏内
  });

  it("mine 页 /pages/myBookings 路径字面量只在 `#ifdef MP-WEIXIN` 脚本块内（抖音/小红书产物零残留）", () => {
    const src = read("src/pages/mine/index.vue");
    const code = src.replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/(?!\s*#(?:ifdef|endif)).*$/gm, "");
    const at = code.indexOf("/pages/myBookings/index");
    expect(at).toBeGreaterThan(-1);
    const before = code.slice(0, at);
    const lastIfdef = before.lastIndexOf("// #ifdef MP-WEIXIN");
    expect(lastIfdef).toBeGreaterThan(-1);
    expect(lastIfdef).toBeGreaterThan(before.lastIndexOf("// #endif")); // 最近的条件块仍未关闭 ⇒ 在微信宏内
    expect(code.split("/pages/myBookings/index").length - 1).toBe(1); // 且全文件仅此一处
  });

  it("逻辑层零 #ifdef：domain/application/composables/repositories 新文件无条件编译", () => {
    for (const f of [
      "src/domain/booking.ts",
      "src/domain/booking-deposit.ts",
      "src/application/booking-flow.ts",
      "src/application/booking-deposit-pay.ts",
      "src/application/booking-deposit-submit.ts",
      "src/composables/use-my-bookings.ts",
      "src/infrastructure/repositories/bookings.ts",
    ]) {
      expect(read(f), f).not.toMatch(/#ifn?def/);
    }
  });

  it("对外文案合规：预约两页与相关源码（去注释后）不出现「定金」「押金」字样，保证金一律称「预约保证金」（主人 2026-11-05 决议 4）", () => {
    for (const f of [
      "src/pages/booking/index.vue",
      "src/pages/myBookings/index.vue",
      "src/domain/booking-deposit.ts",
      "src/domain/booking.ts",
      "src/application/booking-deposit-submit.ts",
    ]) {
      const code = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/\s\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/定金|押金/);
    }
  });

  it("无保证金场景不出现支付字样：myBookings 模板里的支付字样仅限「继续支付」按钮（其余只能经运行时数据出现），且保证金专属筛选标签受 depositSeen 门控", () => {
    const strip = (s: string) =>
      s
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/\s\/\/.*$/gm, "");
    // 我的预约页：<template> 内字面量的支付类词汇白名单（新增无条件的支付字样会让此处变红）
    const code = strip(read("src/pages/myBookings/index.vue"));
    const tpl = /<template>([\s\S]*?)<\/template>\s*<style/.exec(code)?.[1] ?? "";
    expect(tpl.length).toBeGreaterThan(100);
    const hits = new Set(tpl.match(/[^\s"'<>{}]*(?:定金|押金|保证金|支付|金额|付款|¥|￥)[^\s"'<>{}]*/g) ?? []);
    expect([...hits].sort()).toEqual(["支付中...", "继续支付"]);
    // 保证金专属标签：模板遍历的是经 depositSeen 门控的 visibleTabs，而不是全量 FILTER_TABS
    expect(tpl).toContain('v-for="tab in visibleTabs"');
    expect(tpl).not.toContain("in FILTER_TABS");
    expect(code).toMatch(/depositSeen\.value/);
  });

  it("预约页源码不含 emoji / 文字图标（项目规范：图标用 IconPark 方案）", () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const f of ["src/pages/booking/index.vue", "src/pages/myBookings/index.vue"]) {
      expect(read(f), f).not.toMatch(emoji);
    }
  });
});
