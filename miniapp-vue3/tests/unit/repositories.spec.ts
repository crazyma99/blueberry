// P2-01 repositories 合同测试：method/path/参数位/认证与重放策略逐条对照 contracts.md 冻结值；
// 响应映射与错误透传（不吞错）。
import { describe, expect, it } from "vitest";
import {
  createCarouselRepository, createShopRepository, createAlbumRepository,
  createLikeRepository, createWxAuthRepository, createPackageRepository,
  createUserInfoRepository, createFavoriteRepository,
} from "../../src/infrastructure/repositories";
import type { ClientRequestInput, ClientResult } from "../../src/infrastructure/http/client";
import type { RequestContext } from "../../src/ports/context";

const ctx: RequestContext = {
  platform: "mp-weixin", environment: "trial", brandId: null, requestId: "r",
  profileKey: "blueberry", appCode: "blueBerry", scopeRevision: 1, authRevision: 1,
};
const bizErr = { kind: "BUSINESS" as const, businessCode: 5001, message: "x", requestId: "r", retryable: false };

function fakeClient<T>(responses: Array<ClientResult<T>>) {
  const seen: ClientRequestInput[] = [];
  let i = 0;
  return {
    seen,
    client: {
      request: async <R,>(input: ClientRequestInput) => {
        seen.push(input);
        return responses[Math.min(i++, responses.length - 1)] as unknown as ClientResult<R>;
      },
    },
  };
}

describe("repositories 请求形状（contracts.md 冻结值）", () => {
  it("getImage：GET 默认＋method 覆盖＋参数按方法落位", async () => {
    const f = fakeClient([{ ok: true, value: [{ id: 1 }] }]);
    const repo = createCarouselRepository({ client: f.client });
    await repo.getImage(ctx, { params: { shopId: "3" } });
    expect(f.seen[0]).toMatchObject({ method: "GET", url: "/wechat/carousels", query: { shopId: "3" }, replayPolicy: "idempotent" });
    expect(f.seen[0].body).toBeUndefined();
    await repo.getImage(ctx, { method: "POST", params: { a: "1" } });
    expect(f.seen[1]).toMatchObject({ method: "POST", body: { a: "1" } });
    expect(f.seen[1].query).toBeUndefined();
  });
  it("getShops／getCategories／getAlbumList：path 与参数位", async () => {
    const f1 = fakeClient([{ ok: true, value: [] }]);
    await createShopRepository({ client: f1.client }).getShops(ctx);
    expect(f1.seen[0]).toMatchObject({ method: "GET", url: "/api/shops", replayPolicy: "idempotent" });
    const f2 = fakeClient([{ ok: true, value: [] }]);
    await createAlbumRepository({ client: f2.client }).getCategories(ctx, 42);
    expect(f2.seen[0]).toMatchObject({ url: "/wechat/categories", query: { shopId: "42" } });
    const f3 = fakeClient([{ ok: true, value: {} }]);
    await createAlbumRepository({ client: f3.client }).getAlbumList(ctx, { shopId: "3", page: "1" });
    expect(f3.seen[0]).toMatchObject({ url: "/wechat/albums", query: { shopId: "3", page: "1" } });
  });
  it("getAlbumDetail：method 覆盖＋idx/type 入参透传", async () => {
    const f = fakeClient([{ ok: true, value: {} }]);
    await createAlbumRepository({ client: f.client }).getAlbumDetail(ctx, { params: { albumId: "5", type: "photo" } });
    expect(f.seen[0]).toMatchObject({ method: "GET", url: "/wechat/album/detail", query: { albumId: "5", type: "photo" } });
  });
  it("likes：读免登录 idempotent／写需登录 never；wxLogin 换票入口不带 Bearer、never", async () => {
    const f1 = fakeClient([{ ok: true, value: [] }]);
    await createLikeRepository({ client: f1.client }).getLikeStatus(ctx, "1,2,3");
    expect(f1.seen[0]).toMatchObject({ url: "/api/like/status", query: { albumIds: "1,2,3" }, replayPolicy: "idempotent" });
    expect(f1.seen[0].authRequired).toBeFalsy();
    const f2 = fakeClient([{ ok: true, value: { liked: true, likeCount: 9 } }]);
    await createLikeRepository({ client: f2.client }).toggleLike(ctx, 7);
    expect(f2.seen[0]).toMatchObject({ method: "POST", url: "/api/like", body: { albumId: 7 }, authRequired: true, replayPolicy: "never" });
    const f3 = fakeClient([{ ok: true, value: { token: "t", userInfo: {} } }]);
    await createWxAuthRepository({ client: f3.client }).login(ctx, { code: "wxcode" });
    expect(f3.seen[0]).toMatchObject({ method: "POST", url: "/api/wx/login", body: { code: "wxcode" }, replayPolicy: "never" });
    expect(f3.seen[0].authRequired).toBe(false);
  });
  it("⭐收藏红线：getFavoriteList 无 page/size（默认全量）；分页只在 searchAlbums", async () => {
    const f1 = fakeClient([{ ok: true, value: [] }]);
    await createFavoriteRepository({ client: f1.client }).getFavoriteList(ctx);
    expect(f1.seen[0]).toMatchObject({ method: "GET", url: "/api/favorite/list", authRequired: true, replayPolicy: "idempotent" });
    // ⭐ 红线（phases P2-19）：不得偷偷引入默认分页——query 里不得出现 page/size
    expect(Object.keys(f1.seen[0].query ?? {})).toEqual([]);
    expect(f1.seen[0].query?.page).toBeUndefined();
    expect(f1.seen[0].query?.size).toBeUndefined();
    // shopId 可选筛选（不改变全量语义）
    const f2 = fakeClient([{ ok: true, value: [] }]);
    await createFavoriteRepository({ client: f2.client }).getFavoriteList(ctx, { shopId: 9 });
    expect(f2.seen[0].query).toEqual({ shopId: "9" });
    // 唯一允许分页的路径
    const f3 = fakeClient([{ ok: true, value: { list: [], total: 0 } }]);
    await createFavoriteRepository({ client: f3.client }).searchAlbums(ctx, { keyword: "k", page: 2, size: 10 });
    expect(f3.seen[0]).toMatchObject({ url: "/api/search", query: { keyword: "k", page: "2", size: "10" }, replayPolicy: "idempotent" });
    expect(f3.seen[0].authRequired).toBeFalsy();
  });
  it("收藏 status/toggle 与 userinfo：需登录；toggle/PUT 非幂等 never", async () => {
    const f1 = fakeClient([{ ok: true, value: [] }]);
    await createFavoriteRepository({ client: f1.client }).getFavoriteStatus(ctx, "1,2");
    expect(f1.seen[0]).toMatchObject({ url: "/api/favorite/status", query: { albumIds: "1,2" }, authRequired: true });
    const f2 = fakeClient([{ ok: true, value: { favorited: true } }]);
    await createFavoriteRepository({ client: f2.client }).toggleFavorite(ctx, 7);
    expect(f2.seen[0]).toMatchObject({ method: "POST", url: "/api/favorite", body: { albumId: 7 }, authRequired: true, replayPolicy: "never" });
    // P2-18 CR 🔴1 回归锁：userinfo 读写都必须带 Bearer
    const f3 = fakeClient([{ ok: true, value: {} }]);
    await createUserInfoRepository({ client: f3.client }).getUserInfo(ctx);
    expect(f3.seen[0]).toMatchObject({ method: "GET", url: "/api/wx/userinfo", authRequired: true });
    const f4 = fakeClient([{ ok: true, value: {} }]);
    await createUserInfoRepository({ client: f4.client }).updateUserInfo(ctx, { nickname: "n", avatarUrl: "" });
    expect(f4.seen[0]).toMatchObject({ method: "PUT", url: "/api/wx/userinfo", authRequired: true, replayPolicy: "never" });
    // PUT 仅保留有值字段（空串不得覆盖后端）
    expect(f4.seen[0].body).toEqual({ nickname: "n" });
  });
  it("getPackages：GET /wechat/packages?shopId 公开读", async () => {
    const f = fakeClient([{ ok: true, value: [] }]);
    await createPackageRepository({ client: f.client }).getPackages(ctx, 3);
    expect(f.seen[0]).toMatchObject({ method: "GET", url: "/wechat/packages", query: { shopId: "3" }, replayPolicy: "idempotent" });
  });
});

describe("repositories 响应映射与错误透传", () => {
  it("值透传（like 两接口／wxLogin token+userInfo）", async () => {
    const f1 = fakeClient([{ ok: true, value: [{ albumId: 1, liked: true, likeCount: 3 }] }]);
    const r1 = await createLikeRepository({ client: f1.client }).getLikeStatus(ctx, "1");
    expect(r1).toEqual({ ok: true, value: [{ albumId: 1, liked: true, likeCount: 3 }] });
    const f2 = fakeClient([{ ok: true, value: { token: "tok", userInfo: { userId: "u" } } }]);
    const r2 = await createWxAuthRepository({ client: f2.client }).login(ctx, { code: "c" });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.token).toBe("tok");
  });
  it("client 错误原样透传（4001/网络错误已在 client 层测，仓储层不吞）", async () => {
    const f = fakeClient([{ ok: false, error: bizErr }]);
    const r = await createLikeRepository({ client: f.client }).toggleLike(ctx, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(bizErr);
  });
});
