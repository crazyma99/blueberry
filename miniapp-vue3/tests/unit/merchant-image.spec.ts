// 商家端相册图片单测（issue #14 · M2 第五批）：仓储契约 / 换位连号 / 顺序核对 / 静默成功以刷新为准 / 批量删除 / 试衣开关 / 选择态 /
// 上传页面接线（卸载与离开中止、登录失效中止）。上传编排本体的单测在 merchant-upload.spec.ts。
// 变异靶点：①排序体不重连号（只交换两个）②不核对顺序 ③删除不刷新就信 code=200 ④批量删除遇 401 不停 ⑤试衣开关取反错误
//          ⑥排序 body 不是数组 ⑦删除路径/参数名错 ⑧试衣 PATCH 路径/body 错 ⑨缺 album 权限仍发请求 ⑩页面离开不中止上传。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createMerchantImageRepository } from "../../src/pkg-merchant/infrastructure/merchant-images";
import { createImageUseCases } from "../../src/pkg-merchant/application/merchant-image-flow";
import {
  canMove,
  describeImageDelete,
  describeTryon,
  imageThumb,
  nextTryonStatus,
  normalizeImage,
  orderMatches,
  planMove,
  pruneSelected,
  sortImages,
  toggleSelected,
  type MerchantImage,
} from "../../src/pkg-merchant/domain/merchant-image";
import type { ClientRequestInput, ClientResult } from "../../src/infrastructure/http/client";
import type { AppError } from "../../src/infrastructure/http/errors";
import type { RequestContext } from "../../src/ports/context";

const root = resolve(__dirname, "../..");
const ctx = { requestId: "r" } as RequestContext;
const perms = { permissions: ["album"] };
const err = (kind: AppError["kind"], message = "", businessCode: number | null = null): AppError => ({ kind, businessCode, message, requestId: null, retryable: false });
const okv = (value: unknown): ClientResult<unknown> => ({ ok: true, value });
function fakeClient(responder: (i: ClientRequestInput, n: number) => ClientResult<unknown> | Promise<ClientResult<unknown>>) {
  const seen: ClientRequestInput[] = [];
  return { seen, client: { request: async <T,>(i: ClientRequestInput) => { seen.push(i); return (await responder(i, seen.length)) as ClientResult<T>; } } };
}
const img = (id: number, sortOrder: number, over: Partial<MerchantImage> = {}): MerchantImage => ({ id, albumId: 7, imageUrl: "https://c/" + id + ".jpg", sortOrder, aiTryonStatus: 0, aiTryonReason: "", aiTryonManual: 0, ...over });
const raw = (id: number, sortOrder: number, extra: Record<string, unknown> = {}) => ({ id, albumId: 7, imageUrl: "https://c/" + id + ".jpg", sortOrder, aiTryonStatus: 0, ...extra });
const mk = (f: ReturnType<typeof fakeClient>) => createImageUseCases({ images: createMerchantImageRepository({ client: f.client }) });

describe("⭐图片仓储：参数位置与 shopId 参数名（本组统一 shopId）", () => {
  it("列表 GET albums/get?albumId&shopId（query）；幂等", async () => {
    const f = fakeClient(() => okv([raw(1, 0)]));
    const r = await createMerchantImageRepository({ client: f.client }).list(ctx, 3, 7);
    expect(f.seen[0]).toMatchObject({ method: "GET", url: "/photo-albums/albums/get", query: { albumId: "7", shopId: "3" }, authRequired: true, replayPolicy: "idempotent" });
    expect(r.ok && r.value[0]).toMatchObject({ id: 1, albumId: 7 });
    const bad = await createMerchantImageRepository({ client: fakeClient(() => okv({ not: "array" })).client }).list(ctx, 3, 7);
    expect(bad.ok && bad.value).toEqual([]);
  });
  it("⭐排序 PUT albums/sort?shopId=（拼进 url）；**body 是数组** [{id,sortOrder}]；never 重放（变异：body 改对象/query 不拼即红）", async () => {
    const f = fakeClient(() => okv("排序更新成功"));
    await createMerchantImageRepository({ client: f.client }).sort(ctx, 3, [{ id: 2, sortOrder: 0 }, { id: 1, sortOrder: 1 }]);
    expect(f.seen[0]).toMatchObject({ method: "PUT", url: "/photo-albums/albums/sort?shopId=3", replayPolicy: "never", authRequired: true });
    expect(Array.isArray(f.seen[0].body)).toBe(true);
    expect(f.seen[0].body).toEqual([{ id: 2, sortOrder: 0 }, { id: 1, sortOrder: 1 }]);
    expect(f.seen[0].query).toBeUndefined();
  });
  it("⭐删除 DELETE albums/delete/:id?shopId=；试衣 PUT albums/:id/tryon-status?shopId= body {status}（变异：路径/参数名错即红）", async () => {
    const f = fakeClient(() => okv(raw(5, 0, { aiTryonStatus: 1, aiTryonManual: 1 })));
    const repo = createMerchantImageRepository({ client: f.client });
    await repo.remove(ctx, 3, 5);
    const r = await repo.setTryon(ctx, 3, 5, 1);
    expect(f.seen[0]).toMatchObject({ method: "DELETE", url: "/photo-albums/albums/delete/5?shopId=3", replayPolicy: "never" });
    expect(f.seen[1]).toMatchObject({ method: "PUT", url: "/photo-albums/albums/5/tryon-status?shopId=3", body: { status: 1 }, replayPolicy: "never" });
    expect(r.ok && r.value).toMatchObject({ id: 5, aiTryonStatus: 1, aiTryonManual: 1 });
  });
  it("仓储只暴露 list / sort / remove / setTryon（上传走编排，不经此处）", () => {
    expect(Object.keys(createMerchantImageRepository({ client: fakeClient(() => okv([])).client })).sort()).toEqual(["list", "remove", "setTryon", "sort"]);
  });
});

describe("⭐试衣开关用 PUT（wx.request 官方 method 不含 PATCH）+ 共用端口零残留", () => {
  it("请求 method 是 PUT、body 不变；不存在任何 PATCH 请求（变异：改回 PATCH 即红）", async () => {
    const f = fakeClient(() => okv(raw(5, 0, { aiTryonStatus: 1 })));
    await createMerchantImageRepository({ client: f.client }).setTryon(ctx, 3, 5, 0);
    expect(f.seen[0]).toMatchObject({ method: "PUT", body: { status: 0 } });
    expect(f.seen.some((s) => (s.method as string) === "PATCH")).toBe(false);
  });
  it("⭐共用代码零残留：ports/http.ts 的 HttpMethod 仍只有四种（无 PATCH）；transport.ts 无类型强转说明；商家端源码不再出现 method: \"PATCH\"（变异：加回 PATCH 即红）", () => {
    const port = readFileSync(resolve(root, "src/ports/http.ts"), "utf-8");
    expect(port).toMatch(/export type HttpMethod = "GET" \| "POST" \| "PUT" \| "DELETE";/);
    expect(port).not.toContain("PATCH");
    const tr = readFileSync(resolve(root, "src/platform/uni/transport.ts"), "utf-8");
    expect(tr).not.toContain("PATCH");
    expect(tr).not.toContain("UniRequestMethod");
    expect(tr).toMatch(/method: req\.method,/);
    const repo = readFileSync(resolve(root, "src/pkg-merchant/infrastructure/merchant-images.ts"), "utf-8");
    expect(repo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")).not.toMatch(/method:\s*"PATCH"/);
  });
});

describe("⭐换位：对整个相册重新连号（不只交换两个值）", () => {
  const list = [img(1, 5), img(2, 5), img(3, 5)]; // 历史脏数据：sortOrder 全相同
  it("上移 2 ⇒ 顺序 [2,1,3]，sortOrder 连号 0,1,2（变异：只交换两个值即红——重复值下顺序不确定）", () => {
    expect(planMove(list, 2, "up")).toEqual([{ id: 2, sortOrder: 0 }, { id: 1, sortOrder: 1 }, { id: 3, sortOrder: 2 }]);
    expect(planMove(list, 2, "down")).toEqual([{ id: 1, sortOrder: 0 }, { id: 3, sortOrder: 1 }, { id: 2, sortOrder: 2 }]);
  });
  it("边界：首张不能上移、末张不能下移、不存在的 id；单张相册不能移动", () => {
    expect(canMove(list, 1, "up")).toBe(false);
    expect(canMove(list, 3, "down")).toBe(false);
    expect(canMove(list, 99, "up")).toBe(false);
    expect(planMove(list, 1, "up")).toBeNull();
    expect(planMove([img(1, 0)], 1, "down")).toBeNull();
  });
  it("⭐orderMatches：刷新结果顺序与预期一致才算生效（无效项静默跳过 ⇒ 不一致；变异：恒 true 即红）", () => {
    const plan = planMove([img(1, 0), img(2, 1), img(3, 2)], 3, "up")!;
    expect(orderMatches([img(1, 0), img(3, 1), img(2, 2)], plan)).toBe(true);
    expect(orderMatches([img(1, 0), img(2, 1), img(3, 2)], plan)).toBe(false); // 后端静默没生效
    expect(orderMatches([img(1, 0), img(3, 1)], plan)).toBe(false); // 条数不符
  });
  it("sortImages 稳定排序不改入参；归一化只认 0/1 的试衣状态", () => {
    const l = [img(3, 2), img(1, 2), img(2, 1)];
    expect(sortImages(l).map((x) => x.id)).toEqual([2, 1, 3]);
    expect(l.map((x) => x.id)).toEqual([3, 1, 2]);
    expect(normalizeImage({ id: 1, aiTryonStatus: 7, aiTryonManual: 2 })).toMatchObject({ aiTryonStatus: 0, aiTryonManual: 0 });
    expect(normalizeImage(null)).toMatchObject({ id: 0, imageUrl: "" });
  });
});

describe("⭐用例：移动 —— 提交后以刷新结果为准", () => {
  it("正常：PUT sort 后再 GET 列表；applied=true 返回刷新后的顺序", async () => {
    const f = fakeClient((i) => (i.method === "PUT" ? okv("ok") : okv([raw(1, 0), raw(3, 1), raw(2, 2)])));
    const r = await mk(f).move(ctx, perms, 3, 7, [img(1, 0), img(2, 1), img(3, 2)], 3, "up");
    expect(r).toMatchObject({ ok: true, applied: true });
    expect(f.seen.map((s) => s.method)).toEqual(["PUT", "GET"]);
    expect(r.ok && r.images.map((x) => x.id)).toEqual([1, 3, 2]);
  });
  it("⭐后端静默没生效（code=200 但顺序没变）⇒ applied=false（页面提示并按服务器顺序展示）", async () => {
    const f = fakeClient((i) => (i.method === "PUT" ? okv("ok") : okv([raw(1, 0), raw(2, 1), raw(3, 2)])));
    const r = await mk(f).move(ctx, perms, 3, 7, [img(1, 0), img(2, 1), img(3, 2)], 3, "up");
    expect(r).toMatchObject({ ok: true, applied: false });
  });
  it("无法移动/缺权限/参数非法 ⇒ 不发请求；PUT 失败不再刷新前置判断；刷新失败给明确文案", async () => {
    const f = fakeClient(() => okv([]));
    const uc = mk(f);
    expect(await uc.move(ctx, perms, 3, 7, [img(1, 0)], 1, "up")).toMatchObject({ ok: false, kind: "validation" });
    expect(await uc.move(ctx, { permissions: ["category"] }, 3, 7, [img(1, 0), img(2, 1)], 2, "up")).toMatchObject({ ok: false });
    expect(await uc.move(ctx, perms, 0, 7, [img(1, 0), img(2, 1)], 2, "up")).toMatchObject({ ok: false, kind: "validation" });
    expect(f.seen).toEqual([]);
    const putFail = fakeClient(() => ({ ok: false, error: err("BUSINESS", "参数错误", 500) }));
    expect(await mk(putFail).move(ctx, perms, 3, 7, [img(1, 0), img(2, 1)], 2, "up")).toEqual({ ok: false, kind: "failed", message: "参数错误" });
    expect(putFail.seen.length).toBe(1);
    const getFail = fakeClient((i) => (i.method === "PUT" ? okv("ok") : { ok: false, error: err("NETWORK") }));
    const r = await mk(getFail).move(ctx, perms, 3, 7, [img(1, 0), img(2, 1)], 2, "up");
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.message).toContain("刷新");
  });
});

describe("⭐用例：删除（单张/批量）—— 静默成功陷阱以刷新为准", () => {
  it("串行逐张 DELETE，结束后刷新；deleted = 目标数 − 仍在列表里的数", async () => {
    const f = fakeClient((i) => (i.method === "DELETE" ? okv("图片删除成功") : okv([raw(2, 1)])));
    const r = await mk(f).remove(ctx, perms, 3, 7, [1, 3]);
    expect(r).toMatchObject({ ok: true, deleted: 2, remaining: [] });
    expect(f.seen.map((s) => s.method + " " + s.url)).toEqual([
      "DELETE /photo-albums/albums/delete/1?shopId=3",
      "DELETE /photo-albums/albums/delete/3?shopId=3",
      "GET /photo-albums/albums/get",
    ]);
  });
  it("⭐后端静默没删（返回 code=200 但图仍在）⇒ remaining 带出该 id，deleted 不虚报（变异：直接信 code=200 即红）", async () => {
    const f = fakeClient((i) => (i.method === "DELETE" ? okv("图片删除成功") : okv([raw(1, 0), raw(2, 1)])));
    const r = await mk(f).remove(ctx, perms, 3, 7, [1, 2]);
    expect(r).toMatchObject({ ok: true, deleted: 0, remaining: [1, 2] });
  });
  it("某张失败不影响其余；业务错误文案带出；ID 去重/过滤非法 ID；空选择 ⇒ 校验失败", async () => {
    const f = fakeClient((i) => {
      if (i.method === "DELETE") return i.url.includes("/2?") ? { ok: false, error: err("BUSINESS", "图片不存在", 500) } : okv("ok");
      return okv([raw(2, 1)]);
    });
    const r = await mk(f).remove(ctx, perms, 3, 7, [1, 2, 2, 0, -5]);
    expect(f.seen.filter((s) => s.method === "DELETE").length).toBe(2);
    expect(r).toMatchObject({ ok: true, deleted: 1, remaining: [2], failedMessage: "图片不存在" });
    expect(await mk(fakeClient(() => okv([]))).remove(ctx, perms, 3, 7, [])).toMatchObject({ ok: false, kind: "validation" });
  });
  it("⭐批量删除遇 401 立即停止，不再继续发后续删除（变异：不停即红）", async () => {
    const f = fakeClient((i) => (i.method === "DELETE" ? { ok: false, error: err("AUTH_EXPIRED") } : okv([])));
    const r = await mk(f).remove(ctx, perms, 3, 7, [1, 2, 3]);
    expect(r).toMatchObject({ ok: false, kind: "auth-expired" });
    expect(f.seen.length).toBe(1);
  });
  it("缺 album 权限/shopId 非法 ⇒ 不发请求；写串行（进行中再发 ⇒ busy）", async () => {
    const f = fakeClient(() => okv([]));
    expect(await mk(f).remove(ctx, { permissions: [] }, 3, 7, [1])).toMatchObject({ ok: false });
    expect(await mk(f).remove(ctx, perms, 0, 7, [1])).toMatchObject({ ok: false, kind: "validation" });
    expect(f.seen).toEqual([]);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const slow = fakeClient(async (i) => { if (i.method === "DELETE") await gate; return okv([]); });
    const uc = mk(slow);
    const p1 = uc.remove(ctx, perms, 3, 7, [1]);
    expect(await uc.setTryon(ctx, perms, 3, img(2, 0))).toMatchObject({ ok: false, kind: "busy" });
    release();
    await p1;
  });
  it("文案：单张/多张", () => {
    // 删除图片保持「单次确认」（不改交互）；文案必须明示「删除后不可恢复」，批量必须写明张数
    expect(describeImageDelete(1).msg).toBe("确认删除这张图片吗？删除后不可恢复。");
    expect(describeImageDelete(5).msg).toBe("确认删除选中的 5 张图片吗？删除后不可恢复。");
    expect(describeImageDelete(12).msg).toContain("12 张");
    for (const n of [1, 2, 5, 12]) expect(describeImageDelete(n).msg, "n=" + n).toContain("删除后不可恢复");
    expect(describeImageDelete(1).title).toBe("删除图片");
    expect(describeImageDelete(2).title).toBe("批量删除图片");
  });
});

describe("试衣开关", () => {
  it("⭐目标值取反：可展示(1)→0，隐藏(0)→1；用返回的图更新（变异：取反写错即红）", async () => {
    expect(nextTryonStatus(img(1, 0, { aiTryonStatus: 1 }))).toBe(0);
    expect(nextTryonStatus(img(1, 0, { aiTryonStatus: 0 }))).toBe(1);
    const f = fakeClient(() => okv(raw(1, 0, { aiTryonStatus: 1, aiTryonManual: 1 })));
    const r = await mk(f).setTryon(ctx, perms, 3, img(1, 0, { aiTryonStatus: 0 }));
    expect(f.seen[0].body).toEqual({ status: 1 });
    expect(r).toMatchObject({ ok: true, image: { aiTryonStatus: 1, aiTryonManual: 1 } });
  });
  it("展示：1 ⇒ 试衣可用；0 且人工 ⇒ 已关闭；0 且非人工（新图待打标）⇒ 未启用；失败文案；缺权限不发请求", async () => {
    expect(describeTryon(img(1, 0, { aiTryonStatus: 1 }))).toEqual({ label: "试衣可用", on: true });
    expect(describeTryon(img(1, 0, { aiTryonStatus: 0, aiTryonManual: 1 }))).toEqual({ label: "试衣已关闭", on: false });
    expect(describeTryon(img(1, 0))).toEqual({ label: "试衣未启用", on: false });
    const bad = fakeClient(() => ({ ok: false, error: err("BUSINESS", "图片不存在或无权限", 500) }));
    expect(await mk(bad).setTryon(ctx, perms, 3, img(1, 0))).toEqual({ ok: false, kind: "failed", message: "图片不存在或无权限" });
    const none = fakeClient(() => okv({}));
    expect(await mk(none).setTryon(ctx, { permissions: [] }, 3, img(1, 0))).toMatchObject({ ok: false });
    expect(none.seen).toEqual([]);
  });
});

describe("选择态 / 缩略图", () => {
  it("toggleSelected 增删；pruneSelected 剔除刷新后不存在的项", () => {
    expect(toggleSelected([1], 2)).toEqual([1, 2]);
    expect(toggleSelected([1, 2], 1)).toEqual([2]);
    expect(pruneSelected([1, 2, 3], [img(2, 0), img(3, 1)])).toEqual([2, 3]);
  });
  it("缩略图经 cosThumb（源站域 ⇒ CDN）；空 ⇒ 空串", () => {
    expect(imageThumb("")).toBe("");
    const t = imageThumb("https://lanmeiimgstore-1311468332.cos.ap-shanghai.myqcloud.com/a.jpg", 300);
    expect(t).toContain("thumbnail/300x");
    expect(t).not.toContain("myqcloud.com");
  });
});

describe("页面接线（源码级）：图片网格", () => {
  const page = readFileSync(resolve(root, "src/pkg-merchant/album/detail.vue"), "utf-8");
  const code = page.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  it("⭐上传期间离开页面/卸载/登录失效 ⇒ 中止上传（onHide + onUnmounted + onAuthExpired；变异：去掉任一即红）", () => {
    expect(code).toContain("onHide(() => abortUpload())");
    expect(code).toContain("onUnmounted(() => abortUpload())");
    expect(code).toMatch(/onAuthExpired:\s*\(\)\s*=>\s*\{\s*authExpired\.value\s*=\s*true/);
    expect(code).toMatch(/function abortUpload\(\)[^}]*uploader\.cancel\(\)/);
  });
  it("⭐上传全部结束后统一刷新（onFinished → reload）；使用商家 token（rt.getToken）；串行上传编排复用 merchant-album-uploader", () => {
    expect(code).toMatch(/onFinished:\s*\(\)\s*=>\s*\{\s*void reload\(\)/);
    expect(code).toContain("getToken: () => rt.getToken()");
    expect(code).toContain("createAlbumUploader(");
  });
  it("排序/删除/上传互斥：上传中禁用排序与删除；删除前弹 BaseDialog 确认；排序走 uc.move，删除走 uc.remove", () => {
    expect(code).toMatch(/async function onMove[\s\S]{0,200}uploading\.value/);
    expect(code).toMatch(/async function deleteIds[\s\S]{0,260}uploading\.value/);
    expect(code).toContain("dialogRef.value?.confirm(describeImageDelete(");
    expect(code).toContain("uc.move(");
    expect(code).toContain("uc.remove(");
  });
  it("页面纪律：guardedLoad/shouldShowSkeleton、PageFooter 主行空、BaseProgress 门面、零 wd-*/wx.*、不写 !ready、模板无箭头/IIFE 事件", () => {
    expect(code).toContain("guardedLoad(");
    expect(code).toContain('v-if="showSkeleton"');
    expect(code).not.toContain('v-if="!ready"');
    expect(code).toMatch(/<PageFooter\s+main-line=""\s+:support-line="footer\.supportLine\.value"/);
    expect(code).toContain("<BaseProgress");
    expect(code).not.toMatch(/<wd-/);
    expect(code).not.toMatch(/\bwx\./);
    expect(code.slice(code.indexOf("<template>"))).not.toMatch(/@(click|change|confirm)="[^"]*(=>|function\s*\()/);
  });
  it("页面注册 & 入口：album/detail 在商家分包内且启用下拉刷新；相册列表指向它并带 albumId/shopId/title", () => {
    const pj = readFileSync(resolve(root, "src/pages.json"), "utf-8");
    const at = pj.indexOf('"path": "album/detail"');
    expect(at).toBeGreaterThan(pj.indexOf('"root": "pkg-merchant"'));
    expect(pj.slice(at, at + 240)).toContain('"enablePullDownRefresh": true');
    const list = readFileSync(resolve(root, "src/pkg-merchant/album/list.vue"), "utf-8");
    expect(list).toContain("/pkg-merchant/album/detail?");
    expect(list).toMatch(/albumId="\s*\+\s*a\.id/);
    expect(list).toContain("&shopId=");
  });
});
