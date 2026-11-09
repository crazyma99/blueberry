// 商家端分类单测（issue #14 · M2 第三批）：参数位置契约 / 校验 / 关联统计 fail-closed / 强确认编排 / 系列选择 / 页面接线。
// 变异靶点：①删除一级少带 shopId ②改二级不带 parentId ③创建不拦 shopId<=0 ④统计失败仍放行删除 ⑤第二次确认被跳过
//          ⑥取消后仍发删除 ⑦改用 /shop/sub/list ⑧非 GET 的 query 不拼进 url ⑨缺权限仍发请求 ⑩记住的系列不在列表时不回退。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createMerchantCategoryRepository } from "../../src/pkg-merchant/infrastructure/merchant-categories";
import { createMerchantAlbumRepository } from "../../src/pkg-merchant/infrastructure/merchant-albums";
import { createCategoryUseCases } from "../../src/pkg-merchant/application/merchant-category-flow";
import { runStrongDelete } from "../../src/pkg-merchant/application/merchant-strong-delete";
import {
  CATEGORY_NAME_MAX,
  describeDeleteImpact,
  describeFinalConfirm,
  normalizeCategory,
  parseSortOrder,
  sortCategories,
  summarizeParentImpact,
  validateEditCategory,
  validateNewParent,
  validateNewSub,
  type MerchantCategory,
} from "../../src/pkg-merchant/domain/merchant-category";
import { isPositiveId, withQuery } from "../../src/pkg-merchant/domain/merchant-http";
import { createLastShopStore, resolveCurrentShop, selectableShops, shopPickerOptions } from "../../src/pkg-merchant/domain/merchant-shop";
import { MERCHANT_ENTRIES, visibleEntries } from "../../src/pkg-merchant/domain/merchant-auth";
import { MERCHANT_LAST_SHOP_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";
import type { ClientRequestInput, ClientResult } from "../../src/infrastructure/http/client";
import type { AppError } from "../../src/infrastructure/http/errors";
import type { RequestContext } from "../../src/ports/context";
import type { StoragePort } from "../../src/ports/storage";

const root = resolve(__dirname, "../..");
const ctx = { requestId: "r" } as RequestContext;
const err = (kind: AppError["kind"], message = "", businessCode: number | null = null): AppError => ({ kind, businessCode, message, requestId: null, retryable: false });
function fakeClient(responder: (i: ClientRequestInput) => ClientResult<unknown> | Promise<ClientResult<unknown>>) {
  const seen: ClientRequestInput[] = [];
  return { seen, client: { request: async <T,>(i: ClientRequestInput) => { seen.push(i); return (await responder(i)) as ClientResult<T>; } } };
}
const okv = (value: unknown): ClientResult<unknown> => ({ ok: true, value });
const parentCat: MerchantCategory = { id: 5, name: "婚纱", sortOrder: 1, shopId: 3, parentId: 0, depth: 1 };
const subCat: MerchantCategory = { id: 9, name: "外景", sortOrder: 2, shopId: 3, parentId: 5, depth: 2 };
const perms = { permissions: ["category", "album"] };

describe("withQuery / isPositiveId", () => {
  it("拼接、编码、跳过空值；已有 ? 用 &", () => {
    expect(withQuery("/a", { id: 5, shopId: 3 })).toBe("/a?id=5&shopId=3");
    expect(withQuery("/a", { q: "你 好&=", x: undefined, y: null, z: "" })).toBe("/a?q=" + encodeURIComponent("你 好&="));
    expect(withQuery("/a", {})).toBe("/a");
    expect(withQuery("/a?x=1", { id: 2 })).toBe("/a?x=1&id=2");
  });
  it("isPositiveId：只认 >0 安全整数", () => {
    for (const v of [1, 99]) expect(isPositiveId(v)).toBe(true);
    for (const v of [0, -1, 1.5, Number.NaN, "3", null, undefined, Number.MAX_SAFE_INTEGER + 10]) expect(isPositiveId(v), String(v)).toBe(false);
  });
});

describe("⭐分类仓储：参数位置以后端 handler 读取处为准", () => {
  it("读：一级 GET /shop/parent/list?shopId（query）；二级 GET /shop/sub/get-by-parent?parentId；幂等；**绝不使用 /shop/sub/list**（变异：改用即红）", async () => {
    const f = fakeClient(() => okv([{ id: 1, name: "a", sortOrder: 0, shopId: 3 }]));
    const repo = createMerchantCategoryRepository({ client: f.client });
    await repo.listParents(ctx, 3);
    await repo.listSubs(ctx, 5);
    expect(f.seen[0]).toMatchObject({ method: "GET", url: "/shop/parent/list", query: { shopId: "3" }, authRequired: true, replayPolicy: "idempotent" });
    expect(f.seen[1]).toMatchObject({ method: "GET", url: "/shop/sub/get-by-parent", query: { parentId: "5" }, replayPolicy: "idempotent" });
    expect(f.seen.some((s) => s.url.includes("/shop/sub/list"))).toBe(false);
  });
  it("⭐写的 query 参数必须拼进 url（共用传输层对非 GET 不发 query）：改一级 ?id；删一级 ?id&shopId；改二级 ?id；删二级 ?id（变异：不拼即红）", async () => {
    const f = fakeClient(() => okv({ id: 1 }));
    const repo = createMerchantCategoryRepository({ client: f.client });
    await repo.updateParent(ctx, 5, { name: "n", sortOrder: 3 });
    await repo.deleteParent(ctx, 5, 3);
    await repo.updateSub(ctx, 9, { parentId: 5, name: "n", sortOrder: 3 });
    await repo.deleteSub(ctx, 9);
    expect(f.seen.map((s) => [s.method, s.url])).toEqual([
      ["PUT", "/shop/parent/update?id=5"],
      ["DELETE", "/shop/parent/delete?id=5&shopId=3"],
      ["PUT", "/shop/sub/update?id=9"],
      ["DELETE", "/shop/sub/delete?id=9"],
    ]);
    for (const s of f.seen) {
      expect(s.query).toBeUndefined(); // 不依赖被丢弃的 query
      expect(s.replayPolicy).toBe("never");
      expect(s.authRequired).toBe(true);
    }
  });
  it("⭐body：新增一级含 shopId；新增二级含 parentId（不传 shopId）；改二级**必带 parentId**；改一级不带 parentId/shopId（变异：漏带即红）", async () => {
    const f = fakeClient(() => okv({ id: 1 }));
    const repo = createMerchantCategoryRepository({ client: f.client });
    await repo.createParent(ctx, { shopId: 3, name: "a", sortOrder: 1 });
    await repo.createSub(ctx, { parentId: 5, name: "b", sortOrder: 2 });
    await repo.updateSub(ctx, 9, { parentId: 5, name: "c", sortOrder: 3 });
    await repo.updateParent(ctx, 5, { name: "d", sortOrder: 4 });
    expect(f.seen[0]).toMatchObject({ method: "POST", url: "/shop/parent/create", body: { shopId: 3, name: "a", sortOrder: 1 } });
    expect(f.seen[1]).toMatchObject({ method: "POST", url: "/shop/sub/create", body: { parentId: 5, name: "b", sortOrder: 2 } });
    expect((f.seen[1].body as object) && "shopId" in (f.seen[1].body as object)).toBe(false);
    expect(f.seen[2].body).toEqual({ parentId: 5, name: "c", sortOrder: 3 });
    expect(f.seen[3].body).toEqual({ name: "d", sortOrder: 4 });
  });
  it("规整：缺字段安全默认；depth 以返回值为准、缺失按所在接口", () => {
    expect(normalizeCategory({ id: 1, name: "a", sortOrder: 2, shopId: 3, parentId: 4, depth: 2 }, 1)).toEqual({ id: 1, name: "a", sortOrder: 2, shopId: 3, parentId: 4, depth: 2 });
    expect(normalizeCategory(null, 2)).toEqual({ id: 0, name: "", sortOrder: 0, shopId: 0, parentId: 0, depth: 2 });
  });
  it("仓储不含 listAllSubs / 移动分类（本期不做）", () => {
    expect(Object.keys(createMerchantCategoryRepository({ client: fakeClient(() => okv([])).client })).sort()).toEqual(
      ["createParent", "createSub", "deleteParent", "deleteSub", "listParents", "listSubs", "updateParent", "updateSub"],
    );
  });
});

describe("分类校验", () => {
  it("⭐创建一级：shopId<=0 不发请求（防无归属脏分类；变异：不拦即红）", async () => {
    for (const shopId of [0, -1, Number.NaN]) expect(validateNewParent({ shopId, name: "a", sortOrder: "0" })).toMatchObject({ ok: false, error: { field: "shopId" } });
    const f = fakeClient(() => okv({}));
    const uc = createCategoryUseCases({ categories: createMerchantCategoryRepository({ client: f.client }), albums: createMerchantAlbumRepository({ client: f.client }) });
    expect(await uc.createParent(ctx, { shopId: 0, name: "a", sortOrder: "0" })).toMatchObject({ ok: false, kind: "validation" });
    expect(await uc.loadParents(ctx, 0)).toMatchObject({ ok: false, kind: "validation" });
    expect(f.seen).toEqual([]);
  });
  it("名称：去空白、非空、≤50 码点（emoji 不被拆）；排序号 0..9999 纯数字，空串=0", () => {
    expect(validateNewParent({ shopId: 3, name: "  婚纱  ", sortOrder: "" })).toEqual({ ok: true, body: { shopId: 3, name: "婚纱", sortOrder: 0 } });
    expect(validateNewParent({ shopId: 3, name: "   ", sortOrder: "0" })).toMatchObject({ ok: false, error: { field: "name" } });
    expect(validateNewParent({ shopId: 3, name: "x".repeat(CATEGORY_NAME_MAX), sortOrder: "0" }).ok).toBe(true);
    expect(validateNewParent({ shopId: 3, name: "x".repeat(CATEGORY_NAME_MAX + 1), sortOrder: "0" }).ok).toBe(false);
    expect(validateNewParent({ shopId: 3, name: "😀".repeat(CATEGORY_NAME_MAX), sortOrder: "0" }).ok).toBe(true);
    for (const bad of ["-1", "1.5", "abc", "10000", "1e2"]) expect(parseSortOrder(bad), bad).toBeNull();
    expect(parseSortOrder("9999")).toBe(9999);
    expect(parseSortOrder(0)).toBe(0);
  });
  it("新增二级：parentId>0；改名/改排序：校验字段", () => {
    expect(validateNewSub({ parentId: 0, name: "a", sortOrder: "0" })).toMatchObject({ ok: false, error: { field: "parentId" } });
    expect(validateNewSub({ parentId: 5, name: "a", sortOrder: "2" })).toEqual({ ok: true, body: { parentId: 5, name: "a", sortOrder: 2 } });
    expect(validateEditCategory({ name: "", sortOrder: "0" }).ok).toBe(false);
    expect(validateEditCategory({ name: "x", sortOrder: "5" })).toEqual({ ok: true, name: "x", sortOrder: 5 });
  });
  it("排序：sortOrder 升序、同序按 id；不改入参", () => {
    const l = [{ id: 3, sortOrder: 1 }, { id: 1, sortOrder: 2 }, { id: 2, sortOrder: 1 }];
    expect(sortCategories(l).map((x) => x.id)).toEqual([2, 3, 1]);
    expect(l.map((x) => x.id)).toEqual([3, 1, 2]);
  });
  it("用例：编辑无变化 ⇒ 拒绝不发请求；二级缺 parentId ⇒ 拒绝；同名冲突后端文案原样；401 ⇒ auth-expired", async () => {
    const f = fakeClient(() => okv({}));
    const mk = (client: typeof f.client) => createCategoryUseCases({ categories: createMerchantCategoryRepository({ client }), albums: createMerchantAlbumRepository({ client }) });
    expect(await mk(f.client).edit(ctx, parentCat, { name: "婚纱", sortOrder: "1" })).toMatchObject({ ok: false, kind: "validation" });
    expect(await mk(f.client).edit(ctx, { ...subCat, parentId: 0 }, { name: "x", sortOrder: "1" })).toMatchObject({ ok: false, kind: "validation" });
    expect(f.seen).toEqual([]);
    const dup = fakeClient(() => ({ ok: false, error: err("BUSINESS", "该系列下已存在同名一级分类: 婚纱", 500) }));
    expect(await mk(dup.client).createParent(ctx, { shopId: 3, name: "婚纱", sortOrder: "0" })).toEqual({ ok: false, kind: "failed", message: "该系列下已存在同名一级分类: 婚纱" });
    const exp = fakeClient(() => ({ ok: false, error: err("AUTH_EXPIRED") }));
    expect(await mk(exp.client).loadParents(ctx, 3)).toMatchObject({ ok: false, kind: "auth-expired" });
  });
  it("写操作串行：进行中再发 ⇒ busy，只有一次请求", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const f = fakeClient(async () => { await gate; return okv({ id: 1 }); });
    const uc = createCategoryUseCases({ categories: createMerchantCategoryRepository({ client: f.client }), albums: createMerchantAlbumRepository({ client: f.client }) });
    const p1 = uc.createParent(ctx, { shopId: 3, name: "a", sortOrder: "0" });
    expect(await uc.createSub(ctx, { parentId: 5, name: "b", sortOrder: "0" })).toMatchObject({ ok: false, kind: "busy" });
    release();
    expect((await p1).ok).toBe(true);
    expect(f.seen.length).toBe(1);
  });
});

describe("⭐删除：关联统计 fail-closed + 两次确认", () => {
  const router = (over: { subsFail?: boolean; albumFail?: boolean } = {}) => fakeClient((i) => {
    if (i.url === "/shop/sub/get-by-parent") return over.subsFail ? { ok: false, error: err("NETWORK") } : okv([{ id: 9, name: "外景", depth: 2 }, { id: 10, name: "内景", depth: 2 }]);
    if (i.url === "/photo-albums/photo") {
      if (over.albumFail) return { ok: false, error: err("TIMEOUT") };
      return okv(i.query?.child_id === "9" ? [{ id: 1 }, { id: 2 }, { id: 3 }] : [{ id: 4 }]);
    }
    return okv({});
  });
  const mk = (f: ReturnType<typeof router>) => createCategoryUseCases({ categories: createMerchantCategoryRepository({ client: f.client }), albums: createMerchantAlbumRepository({ client: f.client }) });

  it("一级：子分类数 + 各子分类下相册数之和（用 get-by-parent 与相册列表 child_id，shop_id 参数名）", async () => {
    const f = router();
    const r = await mk(f).measureImpact(ctx, parentCat, 3);
    expect(r).toEqual({ ok: true, impact: { subCount: 2, albumCount: 4 } });
    const albumCalls = f.seen.filter((s) => s.url === "/photo-albums/photo");
    expect(albumCalls.map((s) => s.query)).toEqual([{ shop_id: "3", child_id: "9" }, { shop_id: "3", child_id: "10" }]);
  });
  it("二级：该二级下相册数", async () => {
    expect(await mk(router()).measureImpact(ctx, subCat, 3)).toEqual({ ok: true, impact: { subCount: 0, albumCount: 3 } });
  });
  it("⭐任何统计失败 ⇒ 整体失败（fail-closed，不得当成 0 个）（变异：失败当 0 即红）", async () => {
    expect(await mk(router({ subsFail: true })).measureImpact(ctx, parentCat, 3)).toMatchObject({ ok: false });
    expect(await mk(router({ albumFail: true })).measureImpact(ctx, parentCat, 3)).toMatchObject({ ok: false });
    expect(await mk(router({ albumFail: true })).measureImpact(ctx, subCat, 3)).toMatchObject({ ok: false });
    expect(await mk(router()).measureImpact(ctx, parentCat, 0)).toMatchObject({ ok: false, kind: "validation" });
  });
  it("文案：明示子分类数/相册数及全部图片、不可恢复；二级不提子分类；第二次确认点名对象", () => {
    expect(describeDeleteImpact("parent", "婚纱", { subCount: 2, albumCount: 4 }).msg).toBe("删除「婚纱」将同时删除 2 个子分类 / 4 个相册及其全部图片，不可恢复。");
    const sub = describeDeleteImpact("sub", "外景", { subCount: 0, albumCount: 3 }).msg;
    expect(sub).toContain("3 个相册");
    expect(sub).not.toContain("子分类");
    expect(describeFinalConfirm("婚纱", { subCount: 2, albumCount: 4 }).msg).toContain("永久删除");
    expect(describeFinalConfirm("空", { subCount: 0, albumCount: 0 }).msg).toBe("确认删除「空」吗？");
    expect(summarizeParentImpact([2, 0, -1, Number.NaN])).toEqual({ subCount: 4, albumCount: 2 });
  });
  const strong = (opts: { measureOk?: boolean; answers: Array<"confirm" | "cancel"> }) => {
    let executed = 0;
    const asked: string[] = [];
    const p = runStrongDelete({
      measure: async () => (opts.measureOk === false ? { ok: false, message: "无法统计" } : { ok: true }),
      firstCopy: () => ({ title: "一", msg: "first" }),
      finalCopy: () => ({ title: "二", msg: "final" }),
      confirm: async (c) => { asked.push(c.msg); return opts.answers.shift() ?? "cancel"; },
      execute: async () => { executed++; return { ok: true }; },
    });
    return { p, executed: () => executed, asked };
  };
  it("⭐两次都确认才执行；第一次取消 ⇒ 不发删除；第二次取消 ⇒ 不发删除（变异：跳过第二次/取消仍删即红）", async () => {
    const a = strong({ answers: ["confirm", "confirm"] });
    expect(await a.p).toEqual({ status: "deleted" });
    expect(a.executed()).toBe(1);
    expect(a.asked).toEqual(["first", "final"]);
    const b = strong({ answers: ["cancel"] });
    expect(await b.p).toEqual({ status: "cancelled" });
    expect(b.executed()).toBe(0);
    expect(b.asked).toEqual(["first"]);
    const c = strong({ answers: ["confirm", "cancel"] });
    expect(await c.p).toEqual({ status: "cancelled" });
    expect(c.executed()).toBe(0);
  });
  it("⭐统计失败 ⇒ blocked：不弹任何确认框、不执行", async () => {
    const d = strong({ measureOk: false, answers: ["confirm", "confirm"] });
    expect(await d.p).toEqual({ status: "blocked", message: "无法统计" });
    expect(d.asked).toEqual([]);
    expect(d.executed()).toBe(0);
  });
  it("执行失败 ⇒ failed 带文案与 authExpired", async () => {
    const r = await runStrongDelete({
      measure: async () => ({ ok: true }), firstCopy: () => ({ title: "", msg: "" }), finalCopy: () => ({ title: "", msg: "" }),
      confirm: async () => "confirm", execute: async () => ({ ok: false, message: "分类不存在或不属于当前系列", authExpired: false }),
    });
    expect(r).toEqual({ status: "failed", message: "分类不存在或不属于当前系列", authExpired: false });
  });
  it("⭐执行删除：缺 category 权限/参数非法不发请求；一级带 shopId，二级不带", async () => {
    const f = router();
    const uc = mk(f);
    expect(await uc.remove(ctx, { permissions: ["album"] }, parentCat, 3)).toMatchObject({ ok: false });
    expect(await uc.remove(ctx, null, parentCat, 3)).toMatchObject({ ok: false });
    expect(await uc.remove(ctx, perms, parentCat, 0)).toMatchObject({ ok: false, kind: "validation" });
    expect(f.seen).toEqual([]);
    await uc.remove(ctx, perms, parentCat, 3);
    await uc.remove(ctx, perms, subCat, 3);
    expect(f.seen.map((s) => s.url)).toEqual(["/shop/parent/delete?id=5&shopId=3", "/shop/sub/delete?id=9"]);
  });
});

describe("系列选择（shopList）", () => {
  const shops = [
    { id: 3, name: "A 系列", merchantName: "商家A", status: 1 },
    { id: 4, name: "B 系列", merchantName: "", status: 1 },
    { id: 5, name: "停用", merchantName: "", status: 0 },
  ];
  it("停用/非法 id 不可选；选项 label 带商户名", () => {
    expect(selectableShops(shops).map((s) => s.id)).toEqual([3, 4]);
    expect(shopPickerOptions(shops)).toEqual([{ label: "A 系列（商家A）", value: 3 }, { label: "B 系列", value: 4 }]);
  });
  it("⭐resolveCurrentShop：记住的在列表内用它；不在（被停用/移除）回退第一个；空列表 0（变异：不回退即红）", () => {
    expect(resolveCurrentShop(shops, 4)).toBe(4);
    expect(resolveCurrentShop(shops, 5)).toBe(3);
    expect(resolveCurrentShop(shops, 999)).toBe(3);
    expect(resolveCurrentShop(shops, 0)).toBe(3);
    expect(resolveCurrentShop([], 3)).toBe(0);
    expect(resolveCurrentShop([{ id: 5, name: "x", merchantName: "", status: 0 }], 5)).toBe(0);
  });
  it("⭐记住上次选择：落 lm.merchant.lastShop.v1（商家命名空间）；非法值忽略；损坏读 0", () => {
    const data = new Map<string, string>();
    const backend: StoragePort = { get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
    const s = createLastShopStore(backend);
    expect(s.load()).toBe(0);
    s.save(4);
    expect(data.get(MERCHANT_LAST_SHOP_KEY)).toBe("4");
    expect([...data.keys()].every((k) => k.startsWith("lm.merchant."))).toBe(true);
    s.save(0);
    s.save(-3);
    expect(s.load()).toBe(4);
    data.set(MERCHANT_LAST_SHOP_KEY, "abc");
    expect(s.load()).toBe(0);
    s.clear();
    expect(data.size).toBe(0);
  });
});

describe("工作台入口 / 页面接线（源码级）", () => {
  const page = readFileSync(resolve(root, "src/pkg-merchant/category/list.vue"), "utf-8");
  const code = page.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  it("分类入口按 category 权限显隐", () => {
    expect(MERCHANT_ENTRIES.map((e) => e.key)).toContain("category");
    expect(visibleEntries({ permissions: ["category"] }).map((e) => e.key)).toEqual(["category"]);
    expect(visibleEntries({ permissions: ["album"] }).map((e) => e.key)).not.toContain("category");
  });
  it("页面：走 guardedLoad/shouldShowSkeleton、PageFooter 主行空、强确认编排、不直调 wx/uni 平台 API、不用 /shop/sub/list、不写 v-if=\"!ready\"", () => {
    expect(code).toContain("guardedLoad(");
    expect(code).toContain('v-if="showSkeleton"');
    expect(code).not.toContain('v-if="!ready"');
    expect(code).toMatch(/<PageFooter\s+main-line=""\s+:support-line="footer\.supportLine\.value"/);
    expect(code).toContain("runStrongDelete(");
    expect(code).not.toMatch(/\bwx\./);
    expect(code).not.toContain("/shop/sub/list");
    expect(code).toContain("<BasePicker");
    expect(code).toContain("<BaseField");
  });
  it("页面注册：category/list 在商家分包内且启用下拉刷新", () => {
    const pj = readFileSync(resolve(root, "src/pages.json"), "utf-8");
    const at = pj.indexOf('"path": "category/list"');
    expect(at).toBeGreaterThan(pj.indexOf('"root": "pkg-merchant"'));
    expect(pj.slice(at, at + 240)).toContain('"enablePullDownRefresh": true');
  });
  it("模板里没有带参内联表达式以外的危险写法：事件只调用具名函数（不含 IIFE / 箭头函数 / 赋值表达式）", () => {
    const tpl = code.slice(code.indexOf("<template>"));
    expect(tpl).not.toMatch(/@(click|change|confirm)="[^"]*(=>|function\s*\()/);
  });
});
