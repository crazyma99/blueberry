// T6 详情页：cosThumb 缩略（旧端 imageLoader.uts:33-46）＋冒烟（mock uni 生命周期）。
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { cosThumb, isCosHost } from "../../src/application/image";

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o: Record<string, unknown>) => void>,
}));
vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o: Record<string, unknown>) => void) => {
    h.onLoadCalls.push(fn);
  },
}));

import DetailPage from "../../src/pages/targetPhotoDetail/index.vue";

const flush = () => new Promise((r) => setTimeout(r, 20));

describe("cosThumb／isCosHost（旧端忠实移植，含 CR 🟡 防误命中）", () => {
  it("COS 主域拼接 WebP 750 缩略；已有 query 用 & 连接", () => {
    expect(isCosHost("https://lanmei66.cloud/a.jpg")).toBe(true);
    expect(isCosHost("https://img.lanmei66.cloud/a.jpg")).toBe(true);
    expect(isCosHost("https://xx-lanmei66.cloud.yy/a.jpg")).toBe(false); // 子串防误命中
    expect(isCosHost("https://evil.example.com/a.jpg")).toBe(false);
    expect(cosThumb("https://lanmei66.cloud/a.jpg", 750)).toBe("https://lanmei66.cloud/a.jpg?imageMogr2/format/webp/thumbnail/750x");
    expect(cosThumb("https://lanmei66.cloud/a.jpg?v=1", 750)).toBe("https://lanmei66.cloud/a.jpg?v=1&imageMogr2/format/webp/thumbnail/750x");
  });
  it("非 COS 域与空串原样返回", () => {
    expect(cosThumb("https://evil.example.com/a.jpg", 750)).toBe("https://evil.example.com/a.jpg");
    expect(cosThumb("", 750)).toBe("");
  });
});

describe("pages/targetPhotoDetail 冒烟（mock 生命周期）", () => {
  it("缺入参安全停留加载态；有入参 → 详情请求失败收敛错误态＋可重试", async () => {
    const w = mount(DetailPage);
    await w.vm.$nextTick();
    expect(h.onLoadCalls.length).toBeGreaterThan(0);
    h.onLoadCalls[h.onLoadCalls.length - 1]({ liked: "true" }); // 缺 idx
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".sk-wrap").exists()).toBe(true);
    h.onLoadCalls[h.onLoadCalls.length - 1]({ idx: "42", type: "1" });
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".sk-wrap").exists()).toBe(false);
    expect(w.text()).toContain("加载失败");
    expect(w.find(".retry-btn").exists()).toBe(true);
  });
});
