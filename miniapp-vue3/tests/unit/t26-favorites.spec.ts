// T7 P2-19：收藏页冒烟＋红线回归（mock uni 生命周期＋favorites 仓储 stub；驱动方式同 t18/t19/t22/t23/t24）。
// ⭐ 红线回归（phases P2-19）：默认列表一次性全部获取（loadData 进入即 noMore=true，无分页 UI）；
// 分页仅存在于搜索模式（load-more 仅搜索态渲染）。别在迁移里偷偷引入默认分页。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  onShowCalls: [] as Array<() => void>,
  listMode: "ok" as "ok" | "fail",
  searchMode: "array" as "array" | "page" | "empty",
  listCalls: 0,
  searchCalls: [] as Array<{ keyword: string; page: number; size: number }>,
  navigateToCalls: [] as Array<{ url: string }>,
  navigateBackCalls: 0,
  favList: [
    { id: 11, title: "红河民族风写真特辑长标题样例", coverImageUrl: "https://cos.example/f1.png", shopId: 1, likeCount: 128 },
    { id: 12, title: "短标题", coverImageUrl: "https://cos.example/f2.png", shopId: 2, likeCount: 6 },
  ] as Array<Record<string, unknown>>,
  searchArray: Array.from({ length: 10 }, (_, i) => ({
    id: 100 + i,
    title: `搜索结果${i}`,
    coverImageUrl: `https://cos.example/s${i}.png`,
    shopId: 1,
    likeCount: i,
  })) as Array<Record<string, unknown>>,
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => {
    h.onLoadCalls.push(fn);
  },
  onShow: (fn: () => void) => {
    h.onShowCalls.push(fn);
  },
}));

vi.mock("../../src/infrastructure/repositories/favorites", () => ({
  createFavoriteRepository: () => ({
    getFavoriteList: async () => {
      h.listCalls += 1;
      return h.listMode === "fail" ? { ok: false, error: { kind: "network", message: "" } } : { ok: true, value: h.favList };
    },
    searchAlbums: async (_ctx: unknown, params: { keyword: string; page?: number; size?: number }) => {
      h.searchCalls.push({ keyword: params.keyword, page: params.page ?? 1, size: params.size ?? 10 });
      if (h.searchMode === "array") return { ok: true, value: h.searchArray };
      if (h.searchMode === "page")
        return { ok: true, value: { list: h.searchArray, total: 25 } };
      return { ok: true, value: { list: [], total: 0 } };
    },
  }),
}));

import FavoritesPage from "../../src/pages/favorites/index.vue";

const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  h.listMode = "ok";
  h.searchMode = "array";
  h.listCalls = 0;
  h.searchCalls.length = 0;
  h.navigateToCalls.length = 0;
  h.navigateBackCalls = 0;
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: () => "",
    setStorageSync: () => {},
    removeStorageSync: () => {},
    navigateTo: (o: { url: string }) => {
      h.navigateToCalls.push(o);
    },
    navigateBack: () => {
      h.navigateBackCalls += 1;
    },
  };
});

describe("pages/favorites（T7 P2-19 收藏页）", () => {
  it("⭐默认模式：一次性全部获取（红线：不分页）——无 load-more UI、列表渲染两卡、标题截断", async () => {
    const w = mount(FavoritesPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(h.listCalls).toBe(1);
    // 红线：默认模式不渲染任何分页 UI
    expect(w.find(".load-more").exists()).toBe(false);
    const cards = w.findAll(".photoItem-wrap");
    expect(cards.length).toBe(2);
    // 标题截断策略（旧端 formatAlbumTitle：≥7 字符截 6＋"..." 三个 ASCII 点）
    expect(w.findAll(".photoName")[0].text()).toContain("...");
  });

  it("搜索模式：双形态响应（{list,total} 25 条→分页启用，load-more 渲染；loadMore 携 page=2）", async () => {
    h.searchMode = "page";
    const w = mount(FavoritesPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    // 搜索确认（setValue 驱动 v-model，再 confirm 触发 handleSearch）
    await w.find("input").setValue("写真");
    await w.find("input").trigger("confirm");
    await flush();
    await w.vm.$nextTick();
    expect(h.searchCalls.length).toBe(1);
    expect(h.searchCalls[0].keyword).toBe("写真");
    expect(h.searchCalls[0].page).toBe(1);
    // 首页满页(10) 且 total 25 → totalPages 3 ⇒ noMore=false，可点「加载更多」渲染
    expect(w.text()).toContain("加载更多");
    expect(w.text()).not.toContain("已经到底了");
    // 点「加载更多」→ loadMore 携 page=2（唯一允许分页的路径）
    const moreBlocks = w.findAll(".load-more");
    await moreBlocks[moreBlocks.length - 1].trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(h.searchCalls.length).toBe(2);
    expect(h.searchCalls[1].page).toBe(2);
    expect(h.searchCalls[1].keyword).toBe("写真");
  });

  it("空态双文案：搜索关键词有/无切换文案；列表失败→空态", async () => {
    h.listMode = "fail";
    const w = mount(FavoritesPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".empty-state").exists()).toBe(true);
    expect(w.text()).toContain("还没有收藏任何内容哦");
    // 带关键词搜索空结果 → 换文案
    h.searchMode = "empty";
    await w.find("input").setValue("不存在的关键词");
    await w.find("input").trigger("confirm");
    await flush();
    await w.vm.$nextTick();
    expect(w.text()).toContain("换个搜索关键词试试吧");
  });

  it("onShow：首次跳过／二次刷新（firstShow 语义）；goBack：搜索有值先清空重载、无值 navigateBack", async () => {
    const w = mount(FavoritesPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(h.listCalls).toBe(1);
    // 首次 onShow：onLoad 已加载 ⇒ 跳过一次（旧端 :108-113）
    h.onShowCalls[h.onShowCalls.length - 1]();
    await flush();
    expect(h.listCalls).toBe(1);
    // 二次 onShow：非搜索态 ⇒ 重拉列表（详情页返回刷新，旧端 :114-119）
    h.onShowCalls[h.onShowCalls.length - 1]();
    await flush();
    expect(h.listCalls).toBe(2);

    // goBack：搜索框有值 ⇒ 清空搜索并重载（不 navigateBack，旧端 :126-134）
    await w.find("input").setValue("写真");
    w.findComponent({ name: "CustomNavBar" }).vm.$emit("back");
    await flush();
    await w.vm.$nextTick();
    expect(h.listCalls).toBe(3);
    expect(h.navigateBackCalls).toBe(0);
    // goBack：搜索框已空 ⇒ navigateBack
    w.findComponent({ name: "CustomNavBar" }).vm.$emit("back");
    expect(h.navigateBackCalls).toBe(1);
  });

  it("点击卡片导航 targetPhotoDetail 携 idx/liked/type(shopId)（缺一会 400，旧端 :240-247）", async () => {
    const w = mount(FavoritesPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    await w.findAll(".photoItem-wrap")[0].trigger("click");
    expect(h.navigateToCalls.length).toBe(1);
    expect(h.navigateToCalls[0].url).toBe("/pages/targetPhotoDetail/index?idx=11&liked=true&type=1");
  });
});
