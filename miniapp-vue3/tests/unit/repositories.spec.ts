// P2-01 repositories 合同测试：method/path/参数位/认证与重放策略逐条对照 contracts.md 冻结值；
// 响应映射与错误透传（不吞错）。
import { describe, expect, it } from "vitest";
import {
  createCarouselRepository, createShopRepository, createAlbumRepository,
  createLikeRepository, createWxAuthRepository, createPackageRepository,
  createUserInfoRepository, createFavoriteRepository, createPageConfigRepository,
  createBrandRepository,
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
  it("likes：读**带登录态**（JWTOptional：无 token 则 liked 恒 false，2026-09-20 修正）idempotent／写需登录 never；wxLogin 换票入口不带 Bearer、never", async () => {
    const f1 = fakeClient([{ ok: true, value: [] }]);
    await createLikeRepository({ client: f1.client }).getLikeStatus(ctx, "1,2,3");
    expect(f1.seen[0]).toMatchObject({ url: "/api/like/status", query: { albumIds: "1,2,3" }, replayPolicy: "idempotent" });
    expect(f1.seen[0].authRequired).toBe(true); // 2026-09-20：微信端携带 token 才能拿到 liked
    // ⭐2026-10-13（CR ④ 真 bug）：点赞**读状态**在**所有端**都必须带登录态——原「抖音匿名」口径会让
    // liked 恒 false（爱心不亮）且 use-like.replayPending 回落盲 toggle（可能误取消已收藏）⇒ 已修为 authRequired: true
    const f1tt = fakeClient([{ ok: true, value: [] }]);
    await createLikeRepository({ client: f1tt.client }).getLikeStatus({ ...ctx, platform: "mp-toutiao" }, "1,2,3");
    expect(f1tt.seen[0].authRequired, "抖音端必须带 Bearer（有会话时后端才回真实 liked）").toBe(true);
    const f1xhs = fakeClient([{ ok: true, value: [] }]);
    await createLikeRepository({ client: f1xhs.client }).getLikeStatus({ ...ctx, platform: "mp-xhs" }, "1,2,3");
    expect(f1xhs.seen[0].authRequired).toBe(true); // 未登记平台同样要求登录态（无契约 ⇒ client 侧 fail-closed）
    const f2 = fakeClient([{ ok: true, value: { liked: true, likeCount: 9 } }]);
    await createLikeRepository({ client: f2.client }).toggleLike(ctx, 7);
    expect(f2.seen[0]).toMatchObject({ method: "POST", url: "/api/like", body: { albumId: 7 }, authRequired: true, replayPolicy: "never" });
    const f3 = fakeClient([{ ok: true, value: { token: "t", userInfo: {} } }]);
    // 2026-10-13 契约：单次提交 {loginCode, phoneCode}（原 {code} 旧链路已废弃）
    await createWxAuthRepository({ client: f3.client, platform: "mp-weixin" }).login(ctx, { loginCode: "wxcode", phoneCode: "wxphone" });
    expect(f3.seen[0]).toMatchObject({
      method: "POST",
      url: "/api/wx/login",
      body: { loginCode: "wxcode", phoneCode: "wxphone" },
      replayPolicy: "never",
    });
    expect(f3.seen[0].authRequired).toBe(false);
  });
  it("wxAuth 平台分流（2026-10-13 契约已定案）：微信 /api/wx/login、抖音 /api/tt/login 单次提交；无契约平台不发请求 fail-closed", async () => {
    // 抖音：单次登录走 /api/tt/login，body 与微信完全一致（契约 §1：两端结构相同）
    const tt = fakeClient([{ ok: true, value: { token: "t", userInfo: {} } }]);
    const ttAuth = createWxAuthRepository({ client: tt.client, platform: "mp-toutiao" });
    await ttAuth.login(ctx, { loginCode: "ttcode", phoneCode: "ttphone" });
    expect(tt.seen[0]).toMatchObject({
      method: "POST",
      url: "/api/tt/login",
      body: { loginCode: "ttcode", phoneCode: "ttphone" },
      authRequired: false,
      replayPolicy: "never",
    });
    // ⭐旧「三步链路」第 3 步 bindPhone 与 /api/tt/phone 已废弃（服务端 404）⇒ 仓储面不得再暴露该方法
    expect("bindPhone" in ttAuth, "旧链路 bindPhone 必须已移除（新契约无该步骤）").toBe(false);
    // 无契约平台（mp-xhs）：不发请求，直接 fail-closed（UNKNOWN/不可重放）
    const xhs = fakeClient([{ ok: true, value: {} }]);
    const xhsAuth = createWxAuthRepository({ client: xhs.client, platform: "mp-xhs" });
    const r1 = await xhsAuth.login(ctx, { loginCode: "c", phoneCode: "p" });
    expect(xhs.seen.length).toBe(0);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toMatchObject({ kind: "UNKNOWN", retryable: false });
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
  it("page-config／brands：公开读 idempotent（品牌馆开关两侧同源＋品牌列表）", async () => {
    const f1 = fakeClient([{ ok: true, value: [] }]);
    await createPageConfigRepository({ client: f1.client }).getPageConfig(ctx);
    expect(f1.seen[0]).toMatchObject({ method: "GET", url: "/api/page-config", replayPolicy: "idempotent" });
    expect(f1.seen[0].authRequired).toBeFalsy(); // page-config 为公开读（勿与 likes 的需登录混淆）
    const f2 = fakeClient([{ ok: true, value: [] }]);
    await createBrandRepository({ client: f2.client }).getBrands(ctx);
    expect(f2.seen[0]).toMatchObject({ method: "GET", url: "/api/brands", replayPolicy: "idempotent" });
    expect(f2.seen[0].authRequired).toBeFalsy();
  });
});

describe("repositories 响应映射与错误透传", () => {
  it("值透传（like 两接口／wxLogin token+userInfo）", async () => {
    const f1 = fakeClient([{ ok: true, value: [{ albumId: 1, liked: true, likeCount: 3 }] }]);
    const r1 = await createLikeRepository({ client: f1.client }).getLikeStatus(ctx, "1");
    expect(r1).toEqual({ ok: true, value: [{ albumId: 1, liked: true, likeCount: 3 }] });
    const f2 = fakeClient([{ ok: true, value: { token: "tok", userInfo: { userId: "u" } } }]);
    // 2026-10-13 契约：单次提交 {loginCode, phoneCode}（旧 {code} 已废弃）
    const r2 = await createWxAuthRepository({ client: f2.client, platform: "mp-weixin" }).login(ctx, { loginCode: "c", phoneCode: "p" });
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
