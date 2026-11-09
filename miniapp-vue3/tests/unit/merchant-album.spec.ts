// 商家端相册单测（issue #14 · M2 第四批）：参数名逐接口 / 全量 Save 合成 / 校验 / 封面上传 / 删除统计与强确认 / 分类树 / 页面接线。
// 变异靶点：①修改相册用 shop_id（应为 shopId）②列表/新建/删除用 shopId（应为 shop_id）③修改不合成全量字段（aiDesc/sortOrder 被清零）
//          ④封面字段名不是 file ⑤封面响应无 image_url 仍判成功 ⑥封面压缩失败回退原图 ⑦删除统计失败放行 ⑧无 album 权限仍发请求
//          ⑨价格校验放宽 ⑩childId<=0 不拦 ⑪分段渲染不限条数 ⑫/shop sub 筛选 child_id 与 parent_id 优先级。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createMerchantAlbumRepository } from "../../src/pkg-merchant/infrastructure/merchant-albums";
import { createMerchantImageRepository } from "../../src/pkg-merchant/infrastructure/merchant-images";
import { createAlbumUseCases } from "../../src/pkg-merchant/application/merchant-album-flow";
import { createCoverUploader, parseCoverResponse } from "../../src/pkg-merchant/application/merchant-cover-uploader";
import { createCategoryUseCases } from "../../src/pkg-merchant/application/merchant-category-flow";
import { createMerchantCategoryRepository } from "../../src/pkg-merchant/infrastructure/merchant-categories";
import {
  ALBUM_PAGE_STEP,
  ALBUM_TITLE_MAX,
  albumCoverThumb,
  describeAlbumDelete,
  describeAlbumFinalConfirm,
  mergeAlbumUpdate,
  nextVisibleCount,
  normalizeAlbum,
  parsePriceYuan,
  sliceVisible,
  validateAlbumForm,
  type MerchantAlbum,
} from "../../src/pkg-merchant/domain/merchant-album";
import { buildCategoryTree, filterOptions, labelOfSub, subCategoryOptions } from "../../src/pkg-merchant/domain/merchant-category-tree";
import { MERCHANT_ENTRIES, visibleEntries } from "../../src/pkg-merchant/domain/merchant-auth";
import { COMPRESS_FAIL_TEXT } from "../../src/pkg-merchant/domain/merchant-upload";
import type { ClientRequestInput, ClientResult } from "../../src/infrastructure/http/client";
import type { AppError } from "../../src/infrastructure/http/errors";
import type { RequestContext } from "../../src/ports/context";
import type { UploadPort, UploadRequest } from "../../src/ports/upload";

const root = resolve(__dirname, "../..");
const ctx = { requestId: "r" } as RequestContext;
const err = (kind: AppError["kind"], message = "", businessCode: number | null = null): AppError => ({ kind, businessCode, message, requestId: null, retryable: false });
function fakeClient(responder: (i: ClientRequestInput) => ClientResult<unknown> | Promise<ClientResult<unknown>>) {
  const seen: ClientRequestInput[] = [];
  return { seen, client: { request: async <T,>(i: ClientRequestInput) => { seen.push(i); return (await responder(i)) as ClientResult<T>; } } };
}
const okv = (value: unknown): ClientResult<unknown> => ({ ok: true, value });
const perms = { permissions: ["album", "category"] };
const album: MerchantAlbum = { id: 7, shopId: 3, childId: 9, parentId: 5, childName: "外景", title: "海边", coverImageUrl: "https://c/x.jpg", price: "199.5", packageDesc: "含 3 套", aiDesc: "AI 描述", sortOrder: 4, tryonCount: 2 };
const form = { title: "海边", childId: 9, coverImageUrl: "https://c/x.jpg", price: "199.5", packageDesc: "含 3 套", aiDesc: "AI 描述", sortOrder: 4 };

describe("⭐相册仓储：shopId 参数名逐接口（列表/新建/删除=shop_id，修改=shopId）", () => {
  it("列表：GET /photo-albums/photo，query shop_id；child_id 优先于 parent_id；keyword 去空白；幂等", async () => {
    const f = fakeClient(() => okv([{ id: 1, title: "a", price: "10.00" }]));
    const repo = createMerchantAlbumRepository({ client: f.client });
    await repo.list(ctx, { shopId: 3 });
    await repo.list(ctx, { shopId: 3, childId: 9, parentId: 5, keyword: "  海  " });
    await repo.list(ctx, { shopId: 3, parentId: 5 });
    expect(f.seen[0]).toMatchObject({ method: "GET", url: "/photo-albums/photo", query: { shop_id: "3" }, authRequired: true, replayPolicy: "idempotent" });
    expect(f.seen[1].query).toEqual({ shop_id: "3", child_id: "9", keyword: "海" });
    expect(f.seen[2].query).toEqual({ shop_id: "3", parent_id: "5" });
  });
  it("⭐新建 POST add-photo?shop_id=（拼进 url）；body 全字段；never 重放（变异：用 shopId 即红）", async () => {
    const f = fakeClient(() => okv({ id: 1 }));
    await createMerchantAlbumRepository({ client: f.client }).create(ctx, 3, form);
    expect(f.seen[0]).toMatchObject({ method: "POST", url: "/photo-albums/add-photo?shop_id=3", replayPolicy: "never", authRequired: true });
    expect(f.seen[0].query).toBeUndefined();
    expect(f.seen[0].body).toEqual({ title: "海边", childId: 9, coverImageUrl: "https://c/x.jpg", price: "199.5", packageDesc: "含 3 套", aiDesc: "AI 描述", sortOrder: 4 });
  });
  it("⭐修改 PUT update/:id?**shopId**=（不是 shop_id；变异：改成 shop_id 即红）", async () => {
    const f = fakeClient(() => okv({ id: 7 }));
    await createMerchantAlbumRepository({ client: f.client }).update(ctx, 3, 7, form);
    expect(f.seen[0]).toMatchObject({ method: "PUT", url: "/photo-albums/update/7?shopId=3", replayPolicy: "never" });
    expect(f.seen[0].url.includes("shop_id")).toBe(false);
  });
  it("⭐删除 DELETE delete/:albumId?shop_id=（变异：改成 shopId 即红）", async () => {
    const f = fakeClient(() => okv(null));
    await createMerchantAlbumRepository({ client: f.client }).remove(ctx, 3, 7);
    expect(f.seen[0]).toMatchObject({ method: "DELETE", url: "/photo-albums/delete/7?shop_id=3", replayPolicy: "never" });
  });
  it("仓储不含「相册详情」（后端 GET /photo-albums/:id 恒返回 null）", () => {
    expect(Object.keys(createMerchantAlbumRepository({ client: fakeClient(() => okv([])).client })).sort()).toEqual(["create", "list", "remove", "update"]);
  });
  it("规整：价格 decimal 字符串/数字/非法；缺字段安全默认", () => {
    expect(normalizeAlbum({ id: 1, shopId: 3, childId: 9, title: "t", coverImageUrl: "u", price: "12.50", tryonCount: 2 })).toMatchObject({ id: 1, price: "12.50", tryonCount: 2 });
    expect(normalizeAlbum({ price: 8 }).price).toBe("8");
    expect(normalizeAlbum({ price: "abc" }).price).toBe("0");
    expect(normalizeAlbum(null)).toMatchObject({ id: 0, title: "", price: "0" });
  });
});

describe("⭐修改相册：整条 Save ⇒ 原值 + 变更合成全量 body", () => {
  it("只改标题：其余字段（含本期不编辑的 aiDesc、sortOrder、childId、封面、价格）原样带回（变异：不合成即红）", () => {
    expect(mergeAlbumUpdate(album, { title: "新名" })).toEqual({ ...form, title: "新名" });
  });
  it("改封面/价格/分类/说明：只覆盖对应字段", () => {
    expect(mergeAlbumUpdate(album, { coverImageUrl: "https://c/y.jpg", price: "88" })).toEqual({ ...form, coverImageUrl: "https://c/y.jpg", price: "88" });
    expect(mergeAlbumUpdate(album, { childId: 12, packageDesc: "" })).toEqual({ ...form, childId: 12, packageDesc: "" });
  });
  it("用例：发出的 PUT body 含 aiDesc 与 sortOrder 原值", async () => {
    const f = fakeClient(() => okv({ id: 7 }));
    const uc = createAlbumUseCases({ albums: createMerchantAlbumRepository({ client: f.client }), images: createMerchantImageRepository({ client: f.client }) });
    const r = await uc.update(ctx, perms, 3, album, { title: "新名" });
    expect(r.ok).toBe(true);
    expect(f.seen[0].body).toMatchObject({ title: "新名", aiDesc: "AI 描述", sortOrder: 4, childId: 9, price: "199.5", coverImageUrl: "https://c/x.jpg" });
  });
});

describe("相册表单校验", () => {
  const base = { title: "海边", childId: 9, coverImageUrl: "", price: "0", packageDesc: "", aiDesc: "", sortOrder: 0 };
  it("标题非空且 ≤100 码点；childId 必须 >0（相册必须挂二级分类；变异：不拦即红）", () => {
    expect(validateAlbumForm({ ...base, title: "  " })).toMatchObject({ ok: false, error: { field: "title" } });
    expect(validateAlbumForm({ ...base, title: "x".repeat(ALBUM_TITLE_MAX + 1) }).ok).toBe(false);
    expect(validateAlbumForm({ ...base, title: "😀".repeat(ALBUM_TITLE_MAX) }).ok).toBe(true);
    for (const childId of [0, -1, Number.NaN]) expect(validateAlbumForm({ ...base, childId }), String(childId)).toMatchObject({ ok: false, error: { field: "childId" } });
  });
  it("价格：非负、≤2 位小数、≤999999.99；空串=0（变异：放宽即红）", () => {
    for (const ok of ["", "0", "12", "12.5", "12.55", "999999.99"]) expect(parsePriceYuan(ok).ok, ok).toBe(true);
    for (const bad of ["-1", "1.234", "abc", "1e3", "1,000", "9999999", "1000000"]) expect(parsePriceYuan(bad).ok, bad).toBe(false);
    expect(parsePriceYuan("12.50")).toEqual({ ok: true, value: "12.5" });
    expect(parsePriceYuan("")).toEqual({ ok: true, value: "0" });
  });
  it("说明字数上限；通过时去标题空白", () => {
    expect(validateAlbumForm({ ...base, packageDesc: "x".repeat(501) })).toMatchObject({ ok: false, error: { field: "packageDesc" } });
    expect(validateAlbumForm({ ...base, title: "  海边  " })).toMatchObject({ ok: true, form: { title: "海边" } });
  });
  it("用例：缺 album 权限/shopId<=0/校验失败 ⇒ 不发请求", async () => {
    const f = fakeClient(() => okv({}));
    const uc = createAlbumUseCases({ albums: createMerchantAlbumRepository({ client: f.client }), images: createMerchantImageRepository({ client: f.client }) });
    expect(await uc.create(ctx, { permissions: ["category"] }, 3, base)).toMatchObject({ ok: false });
    expect(await uc.create(ctx, null, 3, base)).toMatchObject({ ok: false });
    expect(await uc.create(ctx, perms, 0, base)).toMatchObject({ ok: false, kind: "validation" });
    expect(await uc.create(ctx, perms, 3, { ...base, childId: 0 })).toMatchObject({ ok: false, kind: "validation" });
    expect(await uc.load(ctx, { shopId: 0 })).toMatchObject({ ok: false, kind: "validation" });
    expect(await uc.remove(ctx, { permissions: [] }, 3, 7)).toMatchObject({ ok: false });
    expect(f.seen).toEqual([]);
  });
  it("用例：后端业务错误原样展示；401 ⇒ auth-expired；写串行", async () => {
    const dup = fakeClient(() => ({ ok: false, error: err("BUSINESS", "参数错误", 500) }));
    const ucDup = createAlbumUseCases({ albums: createMerchantAlbumRepository({ client: dup.client }), images: createMerchantImageRepository({ client: dup.client }) });
    expect(await ucDup.create(ctx, perms, 3, base)).toEqual({ ok: false, kind: "failed", message: "参数错误" });
    const exp = fakeClient(() => ({ ok: false, error: err("AUTH_EXPIRED") }));
    const ucExp = createAlbumUseCases({ albums: createMerchantAlbumRepository({ client: exp.client }), images: createMerchantImageRepository({ client: exp.client }) });
    expect(await ucExp.load(ctx, { shopId: 3 })).toMatchObject({ ok: false, kind: "auth-expired" });
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const slow = fakeClient(async () => { await gate; return okv({ id: 1 }); });
    const uc = createAlbumUseCases({ albums: createMerchantAlbumRepository({ client: slow.client }), images: createMerchantImageRepository({ client: slow.client }) });
    const p1 = uc.create(ctx, perms, 3, base);
    expect(await uc.remove(ctx, perms, 3, 7)).toMatchObject({ ok: false, kind: "busy" });
    release();
    expect((await p1).ok).toBe(true);
    expect(slow.seen.length).toBe(1);
  });
});

describe("⭐封面上传：字段 file / image_url 必须返回 / 压缩失败不回退原图", () => {
  const mkUpload = (resp: { statusCode: number; data: string } | { ok: false; reason: "network" | "timeout" }) => {
    const reqs: UploadRequest[] = [];
    const port: UploadPort = {
      upload: async (req) => { reqs.push(req); return "reason" in resp ? { ok: false, reason: resp.reason } : { ok: true, value: resp }; },
      cancel: () => {},
    };
    return { port, reqs };
  };
  const goodCompress = { compress: async (p: string) => ({ path: "c-" + p, size: 100, width: 1, height: 1, reused: false }) };
  const good = (u = "https://c/new.jpg") => ({ statusCode: 200, data: JSON.stringify({ code: 200, data: { image_url: u } }) });
  const mk = (u: ReturnType<typeof mkUpload>, over: Partial<Parameters<typeof createCoverUploader>[0]> = {}) =>
    createCoverUploader({ upload: u.port, compress: goodCompress, getToken: () => "M-TOKEN", uploadUrl: "https://x/photo-albums/upload-cover", ...over });

  it("请求形态：name=file、formData 只有 shopId、Authorization 用商家 token、上传的是压缩产物（变异：name 改 files 即红）", async () => {
    const u = mkUpload(good());
    const r = await mk(u).upload({ shopId: 3, path: "a.jpg", size: 100 });
    expect(r).toEqual({ ok: true, url: "https://c/new.jpg" });
    expect(u.reqs[0]).toMatchObject({ url: "https://x/photo-albums/upload-cover", filePath: "c-a.jpg", name: "file", headers: { Authorization: "Bearer M-TOKEN" }, formData: { shopId: "3" } });
  });
  it("⭐响应无 image_url / data 为空 / code≠200 / 非 JSON ⇒ 失败（不把 code=200 当成功；变异：去掉校验即红）", () => {
    expect(parseCoverResponse(200, JSON.stringify({ code: 200, data: {} }))).toMatchObject({ ok: false });
    expect(parseCoverResponse(200, JSON.stringify({ code: 200, data: { image_url: "  " } }))).toMatchObject({ ok: false });
    expect(parseCoverResponse(200, JSON.stringify({ code: 200, data: null }))).toMatchObject({ ok: false });
    expect(parseCoverResponse(200, JSON.stringify({ code: 500, message: "图片不能超过 20MB（当前 25.0MB）" }))).toEqual({ ok: false, authExpired: false, message: "图片不能超过 20MB（当前 25.0MB）" });
    expect(parseCoverResponse(200, "<html>")).toMatchObject({ ok: false });
    expect(parseCoverResponse(401, "x")).toMatchObject({ ok: false, authExpired: true });
    expect(parseCoverResponse(200, JSON.stringify({ code: 401 }))).toMatchObject({ ok: false, authExpired: true });
    expect(parseCoverResponse(413, "x")).toMatchObject({ ok: false });
  });
  it("⭐压缩失败 ⇒ 失败且 0 次上传请求（绝不上传原图）；shopId<=0/无 token 不发请求", async () => {
    const u = mkUpload(good());
    expect(await mk(u, { compress: { compress: async () => null } }).upload({ shopId: 3, path: "huge.jpg", size: 3e7 })).toEqual({ ok: false, kind: "compress", message: COMPRESS_FAIL_TEXT });
    expect(await mk(u).upload({ shopId: 0, path: "a", size: 1 })).toMatchObject({ ok: false, kind: "validation" });
    expect(await mk(u, { getToken: () => "" }).upload({ shopId: 3, path: "a", size: 1 })).toMatchObject({ ok: false, kind: "auth-expired" });
    expect(u.reqs).toEqual([]);
  });
  it("网络/超时/服务端业务失败文案；进度回调透传", async () => {
    expect(await mk(mkUpload({ ok: false, reason: "network" })).upload({ shopId: 3, path: "a", size: 1 })).toMatchObject({ ok: false, kind: "network" });
    expect(await mk(mkUpload({ ok: false, reason: "timeout" })).upload({ shopId: 3, path: "a", size: 1 })).toMatchObject({ ok: false, kind: "network", message: expect.stringContaining("超时") });
    const seen: number[] = [];
    const port: UploadPort = { upload: async (req) => { req.onProgress?.(55); return { ok: true, value: good() }; }, cancel: () => {} };
    await createCoverUploader({ upload: port, compress: goodCompress, getToken: () => "t", uploadUrl: "u" }).upload({ shopId: 3, path: "a", size: 1 }, (p) => seen.push(p));
    expect(seen).toEqual([55]);
  });
});

describe("⭐删除相册：统计图片数 fail-closed + 文案", () => {
  it("measureImages：GET albums/get?albumId&shopId 取条数；失败整体失败；参数非法不发请求（变异：失败当 0 即红）", async () => {
    const f = fakeClient(() => okv([{ id: 1 }, { id: 2 }, { id: 3 }]));
    const mk = (client: typeof f.client) => createAlbumUseCases({ albums: createMerchantAlbumRepository({ client }), images: createMerchantImageRepository({ client }) });
    expect(await mk(f.client).measureImages(ctx, 3, 7)).toEqual({ ok: true, count: 3 });
    expect(f.seen[0]).toMatchObject({ method: "GET", url: "/photo-albums/albums/get", query: { albumId: "7", shopId: "3" } });
    const bad = fakeClient(() => ({ ok: false, error: err("TIMEOUT") }));
    expect(await mk(bad.client).measureImages(ctx, 3, 7)).toMatchObject({ ok: false });
    const none = fakeClient(() => okv([]));
    expect(await mk(none.client).measureImages(ctx, 0, 7)).toMatchObject({ ok: false, kind: "validation" });
    expect(none.seen).toEqual([]);
  });
  it("文案：明示图片张数/不可恢复/AI 模板；未知张数写「全部」；第二次点名", () => {
    expect(describeAlbumDelete("海边", 12).msg).toContain("12 张图片");
    expect(describeAlbumDelete("海边", 12).msg).toContain("不可恢复");
    expect(describeAlbumDelete("海边", null).msg).toContain("全部图片");
    expect(describeAlbumFinalConfirm("海边").msg).toContain("永久删除");
  });
});

describe("分段渲染 / 封面缩略 / 分类树", () => {
  it("⭐sliceVisible：只渲染前 N 条并给 hasMore；nextVisibleCount 每次 +20 且不超总数（变异：不限条数即红）", () => {
    const all = Array.from({ length: 45 }, (_, i) => i);
    expect(sliceVisible(all, ALBUM_PAGE_STEP)).toMatchObject({ hasMore: true });
    expect(sliceVisible(all, 20).items.length).toBe(20);
    expect(sliceVisible(all, 45)).toMatchObject({ hasMore: false });
    expect(sliceVisible(all, -3).items).toEqual([]);
    expect(nextVisibleCount(20, 45)).toBe(40);
    expect(nextVisibleCount(40, 45)).toBe(45);
    expect(nextVisibleCount(45, 45)).toBe(45);
  });
  it("封面缩略图经 cosThumb（COS 源站域被改写到 CDN）；空封面 ⇒ 空串", () => {
    expect(albumCoverThumb("")).toBe("");
    const t = albumCoverThumb("https://lanmeiimgstore-1311468332.cos.ap-shanghai.myqcloud.com/a/b.jpg", 400);
    expect(t).toContain("imageMogr2/format/webp/thumbnail/400x");
    expect(t).not.toContain("myqcloud.com");
  });
  const parents = [{ id: 5, name: "婚纱", sortOrder: 2, shopId: 3, parentId: 0, depth: 1 as const }, { id: 6, name: "汉服", sortOrder: 1, shopId: 3, parentId: 0, depth: 1 as const }];
  const subs = { 5: [{ id: 9, name: "外景", sortOrder: 1, shopId: 3, parentId: 5, depth: 2 as const }], 6: [{ id: 10, name: "棚拍", sortOrder: 1, shopId: 3, parentId: 6, depth: 2 as const }] };
  it("分类树：一级按 sortOrder；选项＝「一级 / 二级」；筛选项含「全部」；label 反查", () => {
    const tree = buildCategoryTree(parents, subs);
    expect(tree.map((n) => n.parent.id)).toEqual([6, 5]);
    expect(subCategoryOptions(tree)).toEqual([{ label: "汉服 / 棚拍", value: 10 }, { label: "婚纱 / 外景", value: 9 }]);
    expect(filterOptions(tree)[0]).toEqual({ label: "全部分类", value: 0 });
    expect(labelOfSub(tree, 9)).toBe("婚纱 / 外景");
    expect(labelOfSub(tree, 999)).toBe("");
    expect(buildCategoryTree([], {})).toEqual([]);
  });
  it("loadTree：任何一次失败整体失败（不返回半棵树）", async () => {
    let n = 0;
    const f = fakeClient((i) => {
      if (i.url === "/shop/parent/list") return okv([{ id: 5, name: "a", depth: 1 }, { id: 6, name: "b", depth: 1 }]);
      return ++n === 2 ? { ok: false, error: err("NETWORK") } : okv([{ id: 9, name: "s", depth: 2 }]);
    });
    const uc = createCategoryUseCases({ categories: createMerchantCategoryRepository({ client: f.client }), albums: createMerchantAlbumRepository({ client: f.client }) });
    expect(await uc.loadTree(ctx, 3)).toMatchObject({ ok: false });
    expect(await uc.loadTree(ctx, 0)).toMatchObject({ ok: false, kind: "validation" });
  });
});

describe("工作台入口 / 页面接线（源码级）", () => {
  const page = readFileSync(resolve(root, "src/pkg-merchant/album/list.vue"), "utf-8");
  const code = page.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  it("相册入口按 album 权限显隐", () => {
    expect(MERCHANT_ENTRIES.map((e) => e.key)).toContain("album");
    expect(visibleEntries({ permissions: ["album"] }).map((e) => e.key)).toEqual(["album"]);
    expect(visibleEntries({ permissions: ["category"] }).map((e) => e.key)).not.toContain("album");
  });
  it("页面：guardedLoad/shouldShowSkeleton、PageFooter 主行空、强确认、BaseProgress 门面、BasePicker/BaseField、不直调 wx/uni 平台 API、卸载取消封面上传、不写 !ready", () => {
    expect(code).toContain("guardedLoad(");
    expect(code).toContain('v-if="showSkeleton"');
    expect(code).not.toContain('v-if="!ready"');
    expect(code).toMatch(/<PageFooter\s+main-line=""\s+:support-line="footer\.supportLine\.value"/);
    expect(code).toContain("runStrongDelete(");
    expect(code).toContain("<BaseProgress");
    expect(code).not.toMatch(/<wd-/);
    expect(code).toContain("<BasePicker");
    expect(code).toContain("<BaseField");
    expect(code).not.toMatch(/\bwx\./);
    expect(code).toContain("onUnmounted(() => cover.cancel())");
    expect(code).toContain("sliceVisible(");
  });
  it("页面注册：album/list 在商家分包内且启用下拉刷新；模板事件不含箭头/IIFE", () => {
    const pj = readFileSync(resolve(root, "src/pages.json"), "utf-8");
    const at = pj.indexOf('"path": "album/list"');
    expect(at).toBeGreaterThan(pj.indexOf('"root": "pkg-merchant"'));
    expect(pj.slice(at, at + 240)).toContain('"enablePullDownRefresh": true');
    expect(code.slice(code.indexOf("<template>"))).not.toMatch(/@(click|change|confirm)="[^"]*(=>|function\s*\()/);
  });
});
