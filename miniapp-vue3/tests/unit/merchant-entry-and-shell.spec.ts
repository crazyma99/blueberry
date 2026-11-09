// 商家端入口分流 / 分包注册 / 列表壳单测（issue #14 · M1）。
// 变异靶点：①enter-brand-sync 去掉 isMerchantEntry 分流 ②pages.json 去掉 #ifdef MP-WEIXIN ③build-target 去掉 pkg-merchant 禁用项
//          ④use-merchant-list 去掉 seq 迟到丢弃。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isMerchantLandingPath, normalizeEnterPath } from "../../src/domain/merchant-entry";
import { __resetEnterBrandConsumption, syncBrandFromEnterOptions, syncBrandFromEnterOptionsAsync } from "../../src/application/enter-brand-sync";
import { readEnterPath } from "../../src/platform/uni/enter-options";
import { evaluateIfdefs, expectedRoutesForPlatform, forbiddenRoutesForPlatform, stripJsonc } from "../../scripts/build-target.mjs";
import { verifyTarget } from "../../scripts/verify-target.mjs";
import { createPagedListViewModel, type PagedFetchResult } from "../../src/pkg-merchant/composables/use-merchant-list";
import type { RequestContext } from "../../src/ports/context";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = resolve(__dirname, "../..");
const pagesJson = readFileSync(resolve(root, "src/pages.json"), "utf-8");

describe("落地页判定（纯函数）", () => {
  it("pkg-merchant/ 目录前缀才算；前导斜杠/查询串容错；相似前缀不算", () => {
    expect(isMerchantLandingPath("pkg-merchant/login/index")).toBe(true);
    expect(isMerchantLandingPath("/pkg-merchant/home/index?x=1")).toBe(true);
    expect(isMerchantLandingPath("pkg-merchantx/login/index")).toBe(false);
    expect(isMerchantLandingPath("pages/index/index")).toBe(false);
    expect(isMerchantLandingPath("")).toBe(false);
    expect(isMerchantLandingPath(undefined)).toBe(false);
    expect(isMerchantLandingPath(123)).toBe(false);
    expect(normalizeEnterPath("//a/b?c=d")).toBe("a/b");
  });
});

function harness(opts: { stored: string; enter: { scene: string; queryBrandId: string }; path?: string; pathThrows?: boolean }) {
  let stored = opts.stored;
  const calls: string[] = [];
  const deps = {
    readEnterOptions: () => { calls.push("readEnterOptions"); return opts.enter; },
    readEnterPath: opts.path === undefined && !opts.pathThrows ? undefined : () => { if (opts.pathThrows) throw new Error("boom"); return opts.path!; },
    loadBrandId: () => (stored === "" ? null : stored),
    saveBrandId: (id: string) => { calls.push("save:" + id); stored = id; },
    bumpScope: () => calls.push("bump"),
    onChanged: (b: string) => calls.push("changed:" + b),
  };
  return { deps, calls, current: () => stored };
}

describe("⭐入口分流：商家分包落地页不做品牌同步", () => {
  it("商家落地页 + scene=商家码 ⇒ 零动作：不读进参、不写品牌、不 bump（变异：去掉分流即红）", () => {
    __resetEnterBrandConsumption();
    const h = harness({ stored: "lanmei", enter: { scene: "MERCHANT-X", queryBrandId: "" }, path: "pkg-merchant/login/index" });
    const r = syncBrandFromEnterOptions(h.deps);
    expect(r).toEqual({ changed: false, brandId: "lanmei", source: "none" });
    expect(h.calls).toEqual([]);
    expect(h.current()).toBe("lanmei");
  });

  it("同一场景在 C 端落地页 ⇒ 仍照常切换品牌（分流不影响 C 端既有行为）", () => {
    __resetEnterBrandConsumption();
    const h = harness({ stored: "lanmei", enter: { scene: "brand-a", queryBrandId: "" }, path: "pages/index/index" });
    expect(syncBrandFromEnterOptions(h.deps).changed).toBe(true);
    expect(h.current()).toBe("brand-a");
  });

  it("未传 readEnterPath（页面级调用方）/ readEnterPath 抛错 ⇒ 不分流，行为同此前（fail-open）", () => {
    __resetEnterBrandConsumption();
    const a = harness({ stored: "lanmei", enter: { scene: "brand-a", queryBrandId: "" } });
    expect(syncBrandFromEnterOptions(a.deps).changed).toBe(true);
    __resetEnterBrandConsumption();
    const b = harness({ stored: "lanmei", enter: { scene: "brand-b", queryBrandId: "" }, pathThrows: true });
    expect(syncBrandFromEnterOptions(b.deps).changed).toBe(true);
  });

  it("异步编排同样分流：商家落地页不读进参、不补拉品牌列表", async () => {
    __resetEnterBrandConsumption();
    let refreshed = 0;
    const h = harness({ stored: "lanmei", enter: { scene: "MERCHANT-X", queryBrandId: "" }, path: "/pkg-merchant/login/index" });
    const r = await syncBrandFromEnterOptionsAsync({
      ...h.deps,
      refreshBrandCodes: { fetchBrandCodes: async () => { refreshed++; return []; }, rememberBrandCodes: () => {} },
    });
    expect(r.changed).toBe(false);
    expect(h.calls).toEqual([]);
    expect(refreshed).toBe(0);
  });

  it("App.vue 接线：App 级品牌同步注入了 readEnterPath", () => {
    const app = readFileSync(resolve(root, "src/App.vue"), "utf-8");
    expect(app).toContain("readEnterPath");
    expect(app.slice(app.indexOf("syncBrandFromEnterOptions({"))).toMatch(/readEnterPath,/);
  });
});

describe("platform readEnterPath（fail-soft）", () => {
  const g = globalThis as { uni?: unknown };
  it("读 enterOptions.path；缺失/异常/无 API ⇒ 空串", () => {
    const saved = g.uni;
    try {
      g.uni = { getEnterOptionsSync: () => ({ path: "pkg-merchant/login/index", query: { scene: "x" } }) };
      expect(readEnterPath()).toBe("pkg-merchant/login/index");
      g.uni = { getEnterOptionsSync: () => ({ query: {} }) };
      expect(readEnterPath()).toBe("");
      g.uni = { getEnterOptionsSync: () => null };
      expect(readEnterPath()).toBe("");
      g.uni = { getEnterOptionsSync: () => { throw new Error("boom"); } };
      expect(readEnterPath()).toBe("");
      g.uni = {};
      expect(readEnterPath()).toBe("");
    } finally {
      g.uni = saved;
    }
  });
});

describe("⭐分包注册：只在微信端（SPEC C4 登记 + 三端路由集）", () => {
  const evaluated = (p: string) => JSON.parse(stripJsonc(evaluateIfdefs(pagesJson, p)));

  it("微信求值后 subPackages 含 pkg-merchant（登录/工作台）；tt/xhs 求值后无 subPackages", () => {
    const wx = evaluated("mp-weixin");
    expect(wx.subPackages.map((s: { root: string }) => s.root)).toEqual(["pkg-merchant"]);
    const paths = wx.subPackages[0].pages.map((p: { path: string }) => p.path);
    expect(paths).toContain("login/index");
    expect(paths).toContain("home/index");
    for (const p of ["mp-toutiao", "mp-xhs"]) expect(evaluated(p).subPackages, p).toBeUndefined();
  });

  it("subPackages 块位于 `#ifdef MP-WEIXIN` 内；未配 preloadRule；商家页不进 tabBar", () => {
    const at = pagesJson.indexOf('"subPackages"');
    const before = pagesJson.slice(0, at);
    expect(before.lastIndexOf("// #ifdef MP-WEIXIN")).toBeGreaterThan(before.lastIndexOf("// #endif"));
    for (const p of ["mp-weixin", "mp-toutiao", "mp-xhs"]) {
      expect(evaluated(p).preloadRule, p).toBeUndefined(); // 不配 preloadRule（商家不逛 C 端，预下载无收益）
      for (const t of evaluated(p).tabBar.list) expect(t.pagePath).not.toContain("pkg-merchant");
    }
  });

  it("主包路由集（expectedRoutesForPlatform 只看 pages）不含商家页——与 verify 的 subPackages 计入互补", () => {
    for (const p of ["mp-weixin", "mp-toutiao", "mp-xhs"]) {
      expect(expectedRoutesForPlatform(pagesJson, p).some((r: string) => r.startsWith("pkg-merchant")), p).toBe(false);
    }
  });

  it("⭐build-target：tt/xhs 的 forbiddenRoutes 含 pkg-merchant，微信为空（变异：去掉即红）", () => {
    expect(forbiddenRoutesForPlatform("mp-weixin")).toEqual([]);
    for (const p of ["mp-toutiao", "mp-xhs"]) expect(forbiddenRoutesForPlatform(p)).toContain("pkg-merchant");
  });

  it("⭐verify：tt 产物若含 pkg-merchant 子包 ⇒ 失败（产物命中判定，含 subPackages）", () => {
    const dir = mkdtempSync(join(tmpdir(), "verify-merchant-"));
    mkdirSync(join(dir, "common"), { recursive: true });
    writeFileSync(join(dir, "app.js"), "// app");
    writeFileSync(
      join(dir, "app.json"),
      JSON.stringify({ pages: ["pages/index/index"], subPackages: [{ root: "pkg-merchant", pages: ["login/index"] }], window: { navigationBarTitleText: "t" } }),
    );
    writeFileSync(join(dir, "project.config.json"), JSON.stringify({ appid: "ttreal" }));
    writeFileSync(join(dir, "common", "vendor.js"), "/* createApp */");
    writeFileSync(join(dir, "app.ttss"), ".a{}");
    const r = verifyTarget({
      artifactDir: dir,
      manifest: { platform: "mp-toutiao", expectedRoutes: ["pages/index/index"], appid: "ttreal", navTitle: "t", forbiddenRoutes: forbiddenRoutesForPlatform("mp-toutiao") },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("pkg-merchant/login/index");
  });
});

// ——— 列表壳 ———
const ctx = {} as RequestContext;
const rows = (n: number, start = 0) => Array.from({ length: n }, (_, i) => ({ id: start + i }));
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

describe("列表壳 createPagedListViewModel", () => {
  it("分页：total 判定 noMore；loadMore 追加；筛选切换重置到第 1 页并携带 filter", async () => {
    const calls: Array<{ filter: string; page: number; pageSize: number }> = [];
    const vm = createPagedListViewModel<{ id: number }, string>(
      { fetch: async (_c, a) => { calls.push(a); return { ok: true, value: { list: rows(a.page === 1 ? 2 : 1, a.page * 10), total: 3 } }; } },
      { pageSize: 2, initialFilter: "" },
    );
    await vm.loadFirst(ctx);
    expect(vm.items.value.length).toBe(2);
    expect(vm.noMore.value).toBe(false);
    await vm.loadMore(ctx);
    expect(vm.items.value.length).toBe(3);
    expect(vm.noMore.value).toBe(true);
    await vm.loadMore(ctx); // noMore ⇒ 不再请求
    expect(calls.length).toBe(2);
    await vm.loadFirst(ctx, "pending");
    expect(calls[calls.length - 1]).toEqual({ filter: "pending", page: 1, pageSize: 2 });
    expect(vm.page.value).toBe(1);
  });

  it("⭐迟到响应丢弃：先切 A 再切 B，A 晚到不覆盖 B（变异：去掉 seq 即红）", async () => {
    const da = deferred<PagedFetchResult<{ id: number }>>();
    const vm = createPagedListViewModel<{ id: number }, string>(
      { fetch: (_c, a) => (a.filter === "A" ? da.promise : Promise.resolve({ ok: true, value: { list: rows(1, 100), total: 1 } })) },
      { initialFilter: "" },
    );
    const pA = vm.loadFirst(ctx, "A");
    await vm.loadFirst(ctx, "B");
    da.resolve({ ok: true, value: { list: rows(5), total: 5 } });
    await pA;
    expect(vm.items.value).toEqual([{ id: 100 }]);
    expect(vm.filter.value).toBe("B");
  });

  it("失败保留：刷新失败保留旧列表；切换筛选失败清空；loadMore 失败只记 loadMoreError 且可重试；401 置位 authExpired", async () => {
    let mode: "ok" | "fail" | "auth" = "ok";
    const vm = createPagedListViewModel<{ id: number }, string>(
      {
        fetch: async (_c, a) => {
          if (mode === "fail") return { ok: false, message: "网络异常" };
          if (mode === "auth") return { ok: false, message: "登录已失效", authExpired: true };
          return { ok: true, value: { list: rows(2, a.page * 10), total: 10 } };
        },
      },
      { pageSize: 2, initialFilter: "" },
    );
    await vm.loadFirst(ctx);
    mode = "fail";
    await vm.loadFirst(ctx); // 刷新失败
    expect(vm.items.value.length).toBe(2);
    expect(vm.error.value).toBe("网络异常");
    await vm.loadMore(ctx);
    expect(vm.loadMoreError.value).toBe("网络异常");
    expect(vm.noMore.value).toBe(false);
    mode = "ok";
    await vm.loadMore(ctx); // 重试成功
    expect(vm.items.value.length).toBe(4);
    expect(vm.loadMoreError.value).toBeNull();
    mode = "fail";
    await vm.loadFirst(ctx, "other"); // 切换筛选失败 ⇒ 清空
    expect(vm.items.value).toEqual([]);
    mode = "auth";
    await vm.loadFirst(ctx, "other2");
    expect(vm.authExpired.value).toBe(true);
    mode = "ok";
    await vm.loadFirst(ctx);
    expect(vm.authExpired.value).toBe(false);
  });
});

// ——— 体积归属守卫：商家专属代码必须住在 src/pkg-merchant/ 下，否则 uni 会把它打进**主包** ———
// 实测（2026-11-09）：把商家会话/存储/传输放在 src/application、src/infrastructure、src/domain 下，构建产物里
// 这些模块落在主包的同名目录（uni 的 manualChunks 按「项目内文件路径」落位，不会因「只被分包引用」而下沉）；
// 移入 src/pkg-merchant/ 后同批模块落入 pkg-merchant/（主包少 ~9KB，且「pkg-merchant ≤800KB」的口径才真实）。
function walkFiles(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}
const norm = (p: string) => p.split("\\").join("/");

describe("⭐体积归属：商家专属代码只能在 src/pkg-merchant/（变异：把任一 merchant-* 文件挪回共享目录即红）", () => {
  it("共享目录（domain/application/infrastructure/composables/components）下不得有以 merchant 命名的专属文件", () => {
    const shared = ["src/domain", "src/application", "src/infrastructure", "src/composables", "src/components"];
    const stray: string[] = [];
    for (const d of shared) {
      for (const f of walkFiles(resolve(root, d))) {
        const rel = norm(f).slice(norm(root).length + 1);
        // merchant-entry.ts 是**主包必需**的例外：App.vue 的品牌同步要用它判定落地页（见该文件头注释）
        if (/merchant/i.test(rel.split("/").pop() ?? "") && rel !== "src/domain/merchant-entry.ts") stray.push(rel);
      }
    }
    expect(stray, "这些文件会被打进主包：" + stray.join(", ")).toEqual([]);
  });

  it("主包代码（src 下 pkg-merchant 之外）不得 import pkg-merchant 内的模块（反向依赖会把分包代码拉回主包）", () => {
    const bad: string[] = [];
    for (const f of walkFiles(resolve(root, "src"))) {
      const rel = norm(f).slice(norm(root).length + 1);
      if (rel.startsWith("src/pkg-merchant/") || !/\.(ts|vue)$/.test(rel)) continue;
      if (/from\s+["'][^"']*pkg-merchant\//.test(readFileSync(f, "utf-8"))) bad.push(rel);
    }
    expect(bad).toEqual([]);
  });
});
