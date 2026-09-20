// T7 P2-20：品牌馆页冒烟＋红线回归（mock uni 生命周期＋page-config/brands 仓储 stub；驱动方式同 t18/t23/t26）。
// ⭐ 红线：①自守卫与首页入口共用同一 page-config 仓储（本测试断言守卫确实经仓储查询，非自写端点）
//        ②PLATFORM 占位品牌必须过滤 ③品牌持久化（写入 storage）＋切品牌作用域代次递增（缓存隔离）。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  // page-config 仓储调用计数（红线①：守卫必须经共享仓储）
  pageConfigCalls: 0,
  enabledMode: "on" as "on" | "off" | "fail",
  brandCalls: 0,
  brands: [
    { brandId: "lanmei", brandName: "蓝梅云", logoUrl: "https://cos.example/l.png", coverImageUrl: "", description: "汉服体验", sortOrder: 1 },
    { brandId: "PLATFORM", brandName: "平台管理", logoUrl: "", coverImageUrl: "", description: "", sortOrder: 2 },
    { brandId: "honghe", brandName: "红河分店", logoUrl: "", coverImageUrl: "", description: "", sortOrder: 3 },
  ] as Array<Record<string, unknown>>,
  store: new Map<string, string>(),
  switchTabCalls: [] as Array<{ url: string }>,
  navigateBackCalls: 0,
  toasts: [] as string[],
  // ⭐ 红线③：切品牌代次递增（缓存隔离）——经 request-context mock 观测
  bumpScopeCalls: 0,
  brandsFail: false,
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => {
    h.onLoadCalls.push(fn);
  },
}));

vi.mock("../../src/infrastructure/repositories/page-config", () => ({
  createPageConfigRepository: () => ({
    getPageConfig: async () => {
      h.pageConfigCalls += 1;
      if (h.enabledMode === "fail") return { ok: false, error: { kind: "network" } };
      // 旧端口径：数组内 type==='brand_hub' 的 config 为 JSON 字符串
      const config = h.enabledMode === "on" ? JSON.stringify({ enabled: true }) : JSON.stringify({ enabled: false });
      return { ok: true, value: [{ type: "brand_hub", config }] };
    },
  }),
}));

vi.mock("../../src/infrastructure/repositories/brands", () => ({
  createBrandRepository: () => ({
    getBrands: async () => {
      h.brandCalls += 1;
      if (h.brandsFail) return { ok: false, error: { kind: "network" } };
      return { ok: true, value: h.brands };
    },
  }),
}));

// ⭐ 红线③断言口：页面切品牌须经 request-context 工厂 bumpScope（旧品牌在飞响应按代次作废）
vi.mock("../../src/application/request-context", () => ({
  createContextFactory: () => ({
    next: () => ({
      platform: "mp-weixin",
      environment: "trial",
      brandId: null,
      requestId: "req-test",
      profileKey: "blueberry",
      appCode: "blueBerry",
      scopeRevision: 0,
      authRevision: 0,
    }),
    bumpScope: () => {
      h.bumpScopeCalls += 1;
    },
    bumpAuth: () => {},
  }),
}));

import BrandHubPage from "../../src/pages/brandHub/index.vue";

const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  h.pageConfigCalls = 0;
  h.enabledMode = "on";
  h.brandCalls = 0;
  h.store.clear();
  h.switchTabCalls.length = 0;
  h.navigateBackCalls = 0;
  h.toasts.length = 0;
  h.bumpScopeCalls = 0;
  h.brandsFail = false;
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => {
      h.store.set(k, v);
    },
    removeStorageSync: (k: string) => {
      h.store.delete(k);
    },
    showToast: (o: { title: string }) => {
      h.toasts.push(o.title);
    },
    switchTab: (o: { url: string }) => {
      h.switchTabCalls.push(o);
    },
    navigateBack: () => {
      h.navigateBackCalls += 1;
    },
  };
});

describe("pages/brandHub（T7 P2-20 品牌馆）", () => {
  it("开关开：经共享 page-config 仓储守卫 → 加载品牌；⭐PLATFORM 占位品牌被过滤", async () => {
    const w = mount(BrandHubPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    // 红线①：守卫经仓储查询（而非页面自写 /api/page-config）
    expect(h.pageConfigCalls).toBe(1);
    expect(h.brandCalls).toBe(1);
    const names = w.findAll(".brand-name").map((n) => n.text());
    expect(names).toEqual(["蓝梅云", "红河分店"]); // PLATFORM 已过滤
    expect(w.find(".hub-empty").exists()).toBe(false);
  });

  it("⭐自守卫：开关关 → toast「该功能未开放」＋不加载品牌＋800ms 后 navigateBack", async () => {
    h.enabledMode = "off";
    const w = mount(BrandHubPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(h.pageConfigCalls).toBe(1);
    expect(h.brandCalls).toBe(0); // 不加载品牌列表（旧 :78-83）
    expect(h.toasts).toContain("该功能未开放");
    expect(h.navigateBackCalls).toBe(0);
    await new Promise((r) => setTimeout(r, 900));
    expect(h.navigateBackCalls).toBe(1);
  });

  it("安全默认：开关查询失败也视为关闭（与首页入口同口径）", async () => {
    h.enabledMode = "fail";
    const w = mount(BrandHubPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    expect(h.brandCalls).toBe(0);
    expect(h.toasts).toContain("该功能未开放");
    await new Promise((r) => setTimeout(r, 900));
    expect(h.navigateBackCalls).toBe(1);
  });

  it("⭐进入品牌：持久化 brandId ＋ bumpScope（切品牌代次递增＝缓存隔离）＋ switchTab 回首页", async () => {
    const w = mount(BrandHubPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(h.bumpScopeCalls).toBe(0);
    await w.findAll(".brand-card")[1].trigger("click"); // 第二张 = 红河分店
    expect(h.store.get("lm.brand.v1")).toBe("honghe"); // 品牌持久化
    expect(h.bumpScopeCalls).toBe(1); // ⭐ 红线③：代次递增（在飞旧品牌响应作废）
    expect(h.switchTabCalls[0]?.url).toBe("/pages/index/index");
  });

  it("品牌列表加载失败：toast「品牌加载失败，请重试」＋空态（CR 🔴2 回归：失败走 else 分支而非死 catch）", async () => {
    h.brandsFail = true;
    const w = mount(BrandHubPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(h.brandCalls).toBe(1);
    expect(h.toasts).toContain("品牌加载失败，请重试");
    expect(w.find(".hub-empty").exists()).toBe(true);
  });

  it("空列表（开关开但无品牌）：渲染空态「暂无入驻品牌」", async () => {
    const saved = h.brands;
    h.brands = [];
    const w = mount(BrandHubPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".hub-empty").exists()).toBe(true);
    expect(w.find(".brand-card").exists()).toBe(false);
    h.brands = saved;
  });
});
