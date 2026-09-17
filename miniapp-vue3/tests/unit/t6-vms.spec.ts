// P2-11 T6 VM 测试：路由入参不丢／首页VM并行容错／列表VM分页·noMore·搜索（先红后绿）。
import { describe, expect, it } from "vitest";
import { parseDetailParams } from "../../src/application/route-params";
import { createHomeViewModel } from "../../src/composables/use-home";
import { createAlbumListViewModel } from "../../src/composables/use-album-list";
import type { CarouselItem, RepoResult } from "../../src/infrastructure/repositories/carousels";
import type { ShopBrief } from "../../src/infrastructure/repositories/shops";
import type { AlbumBrief, AlbumListPage } from "../../src/infrastructure/repositories/albums";
import type { RequestContext } from "../../src/ports/context";

const ctx: RequestContext = {
  platform: "mp-weixin", environment: "trial", brandId: null, requestId: "t6",
  profileKey: "blueberry", appCode: "blueBerry", scopeRevision: 1, authRevision: 1,
};
function ok<T>(value: T): RepoResult<T> { return { ok: true, value }; }
const netErr: RepoResult<never> = { ok: false, error: { kind: "NETWORK", businessCode: null, message: "x", requestId: "t6", retryable: true } };

describe("parseDetailParams（P2-11 入参不丢）", () => {
  it("六参数完整解析；style percent-decode；多余参数忽略", () => {
    const p = parseDetailParams({
      idx: "42", liked: "1", type: "1", category: "cat1", subCategory: "sub1",
      style: encodeURIComponent("红河水乡😀旗袍"), utm_source: "x",
    });
    expect(p).not.toBeNull();
    expect(p!.albumId).toBe("42");
    expect(p!.liked).toBe(true);
    expect(p!.shopId).toBe("1");
    expect(p!.category).toBe("cat1");
    expect(p!.subCategory).toBe("sub1");
    expect(p!.style).toBe("红河水乡😀旗袍");
  });
  it("缺 idx → null；type/category/subCategory 可空、liked 默认 false", () => {
    expect(parseDetailParams({ liked: "1" })).toBeNull();
    const p = parseDetailParams({ idx: "7" });
    expect(p).not.toBeNull();
    expect(p!.shopId).toBe("");
    expect(p!.category).toBe("");
    expect(p!.liked).toBe(false);
  });
});

describe("createHomeViewModel（P2-11 并行容错）", () => {
  it("轮播与店铺并行填充；loading 收敛；品牌馆开关可读", async () => {
    const vm = createHomeViewModel({
      carousels: { getImage: async () => ok<CarouselItem[]>([{ id: 1 }]) },
      shops: { getShops: async () => ok<ShopBrief[]>([{ id: 1, shopName: "红河水乡店" }]) },
      brandHub: { refresh: async () => {}, enabled: false },
    });
    const p = vm.load(ctx);
    expect(vm.loading.value).toBe(true);
    await p;
    expect(vm.loading.value).toBe(false);
    expect(vm.carousels.value.length).toBe(1);
    expect(vm.shops.value.length).toBe(1);
    expect(vm.error.value).toBeNull();
  });
  it("单侧失败不拖垮另一侧；双侧失败才置 error（旧端 .catch(()=>null) 语义）", async () => {
    const vm1 = createHomeViewModel({
      carousels: { getImage: async () => { throw new Error("net"); } },
      shops: { getShops: async () => ok<ShopBrief[]>([{ id: 2 }]) },
      brandHub: { refresh: async () => {}, enabled: true },
    });
    await vm1.load(ctx);
    expect(vm1.shops.value.length).toBe(1);
    expect(vm1.carousels.value.length).toBe(0);
    expect(vm1.error.value).toBeNull();
    expect(vm1.brandHubEnabled()).toBe(true);
    const vm2 = createHomeViewModel({
      carousels: { getImage: async () => netErr },
      shops: { getShops: async () => { throw new Error("net"); } },
      brandHub: { refresh: async () => {}, enabled: false },
    });
    await vm2.load(ctx);
    expect(vm2.error.value).not.toBeNull();
  });
  it("refreshBrandHub 委托 controller", async () => {
    let calls = 0;
    const vm = createHomeViewModel({
      carousels: { getImage: async () => ok<CarouselItem[]>([]) },
      shops: { getShops: async () => ok<ShopBrief[]>([]) },
      brandHub: { refresh: async () => { calls++; }, enabled: false },
    });
    await vm.refreshBrandHub(ctx);
    expect(calls).toBe(1);
  });
});

function album(id: number): AlbumBrief {
  return { id, title: "t" + id, coverImageUrl: "u", likeCount: 0, packageDesc: "", price: 1 };
}
function makePage(count: number, pageNo: number, size: number, total = 25): AlbumListPage {
  const start = (pageNo - 1) * size;
  const n = Math.min(size, Math.max(0, count - start));
  return { albums: Array.from({ length: n }, (_, i) => album(start + i + 1)), page: pageNo, size, total };
}

describe("createAlbumListViewModel（P2-11 分页/搜索/重置）", () => {
  it("首页填充＋loadMore 追加＋shopId/分类 query 透传", async () => {
    const seen: Array<Record<string, string>> = [];
    const vm = createAlbumListViewModel({
      albums: {
        getAlbumList: async (_c, params) => {
          seen.push(params);
          return ok(makePage(25, Number(params.page), Number(params.size)));
        },
      },
    }, { pageSize: 10 });
    await vm.loadFirst(ctx, { shopId: "1", categoryQuery: { childId: "9" } });
    expect(vm.items.value.length).toBe(10);
    expect(vm.page.value).toBe(1);
    expect(seen[0]).toMatchObject({ shopId: "1", childId: "9", page: "1", size: "10" });
    await vm.loadMore(ctx, { shopId: "1", categoryQuery: { childId: "9" } });
    expect(vm.items.value.length).toBe(20);
    expect(seen[1].page).toBe("2");
  });
  it("noMore 双条件（旧端 :497）：末页不满 或 页码达 total 上限；noMore 后不再请求", async () => {
    const vm = createAlbumListViewModel({
      albums: { getAlbumList: async (_c, params) => ok(makePage(12, Number(params.page), Number(params.size))) },
    }, { pageSize: 10 });
    await vm.loadFirst(ctx, { shopId: "1" });
    expect(vm.noMore.value).toBe(false);
    await vm.loadMore(ctx, { shopId: "1" });
    expect(vm.noMore.value).toBe(true);
    expect(vm.items.value.length).toBe(12);
    await vm.loadMore(ctx, { shopId: "1" });
    expect(vm.items.value.length).toBe(12);
  });
  it("搜索 keyword 透传；loadFirst 重置；失败置 error", async () => {
    const seen: Array<Record<string, string>> = [];
    const vm = createAlbumListViewModel({
      albums: {
        getAlbumList: async (_c, params) => {
          seen.push(params);
          if (params.keyword === "旗袍") return ok(makePage(1, 1, 10));
          throw new Error("net");
        },
      },
    });
    await vm.loadFirst(ctx, { shopId: "1", keyword: "旗袍" });
    expect(seen[0].keyword).toBe("旗袍");
    expect(vm.items.value.length).toBe(1);
    await vm.loadFirst(ctx, { shopId: "2" });
    expect(vm.items.value.length).toBe(0);
    expect(vm.error.value).not.toBeNull();
  });
});
