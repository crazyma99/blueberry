// 批次2 其余 P0（issue #14 · UX）：②工作台下拉刷新 + 商家名/角色 ③空态引导按钮 ④图片大图预览。
// 变异靶点：①工作台不注册下拉刷新/页面未开启 enablePullDownRefresh ②刷新不重读登录态 ③不显示角色 ④空态按钮不打开表单 ⑤空态文案被改
//          ⑥点图不预览（选择模式除外）⑦预览 URL 未经 cosThumbJpg（原图直出）⑧预览下标错 ⑨预览失败不提示 ⑩选择模式点图仍预览。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h as h2 } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  onLoad: [] as Array<(o?: Record<string, unknown>) => void>,
  onShow: [] as Array<() => void>,
  pulls: [] as Array<() => void>,
  store: new Map<string, string>(),
  n: 0,
  previews: [] as Array<{ urls: string[]; current: string }>,
  previewFail: false,
  toasts: [] as string[],
  stops: 0,
}));
vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoad.push(fn),
  onShow: (fn: () => void) => h.onShow.push(fn),
  onHide: () => undefined,
  onReachBottom: () => undefined,
  onPullDownRefresh: (fn: () => void) => h.pulls.push(fn),
}));
vi.mock("../../src/platform/uni/transport", () => ({
  createUniTransport: () => ({
    request: async (req: { url: string }) => {
      const ok = (data: unknown) => ({ ok: true, value: { status: 200, businessCode: 200, message: undefined, requestId: null, data } });
      if (req.url === "/photo-albums/albums/get") return ok(Array.from({ length: h.n }, (_, i) => ({ id: i + 1, albumId: 7, imageUrl: i === 1 ? "https://bkt.cos.ap-guangzhou.myqcloud.com/a/" + i + ".jpg" : "https://www.lanmei66.cloud/a/" + i + ".jpg", sortOrder: i, aiTryonStatus: 1, aiTryonReason: "", aiTryonManual: 0 })));
      if (req.url === "/photo-albums/photo") return ok([]);
      if (req.url === "/shop/parent/list") return ok([]);
      if (req.url === "/booking/slots") return ok([]);
      return ok([]);
    },
    cancel: () => undefined,
  }),
}));

import HomePage from "../../src/pkg-merchant/home/index.vue";
import AlbumListPage from "../../src/pkg-merchant/album/list.vue";
import CategoryPage from "../../src/pkg-merchant/category/list.vue";
import SlotPage from "../../src/pkg-merchant/slot/list.vue";
import AlbumDetailPage from "../../src/pkg-merchant/album/detail.vue";
import { __resetMerchantRuntime, getMerchantRuntime } from "../../src/pkg-merchant/application/merchant-runtime";
import { MERCHANT_PROFILE_KEY, MERCHANT_SESSION_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";
import { roleLabel } from "../../src/pkg-merchant/domain/merchant-auth";
import { buildPreview, PREVIEW_WIDTH } from "../../src/pkg-merchant/domain/merchant-image";
import { createUniImagePreview } from "../../src/platform/uni/image-preview";

const root = resolve(__dirname, "../..");
const FeedbackStub = defineComponent({ setup(_p, { expose }) { expose({ show: (t: string) => void h.toasts.push(t) }); return () => null; } });
const PopupSpy = defineComponent({ name: "BasePopup", props: ["show", "position", "zIndex", "rootPortal"], emits: ["cancel", "update:show"], setup: (p, { slots }) => () => (p.show ? h2("div", { class: "popup-spy" }, slots.default?.()) : null) });
const GLOBAL = { stubs: { PullRefreshIndicator: true, BaseFeedback: FeedbackStub, BaseDialog: true, PageFooter: true, CustomNavBar: true, MerchantNeedLogin: true, BasePopup: PopupSpy, BasePicker: true, BaseProgress: true, SkeletonBlock: true, BaseField: true } };
const PROFILE_OK = { adminId: 7, merchantId: 1, username: "shopA", role: "merchant", displayName: "A店", roleName: "", permissions: ["booking", "album", "category", "booking_slot"], shopList: [{ id: 1, name: "A", merchantName: "", status: 1 }] };

function seed(profile: Record<string, unknown> | null = PROFILE_OK) {
  h.store.set(MERCHANT_SESSION_KEY, JSON.stringify({ userId: "7", token: "m-token", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }));
  if (profile != null) h.store.set(MERCHANT_PROFILE_KEY, JSON.stringify(profile));
}
beforeEach(() => {
  h.onLoad.length = 0;
  h.onShow.length = 0;
  h.pulls.length = 0;
  h.store.clear();
  h.previews.length = 0;
  h.previewFail = false;
  h.toasts.length = 0;
  h.stops = 0;
  __resetMerchantRuntime();
  seed();
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => h.store.set(k, v),
    removeStorageSync: (k: string) => h.store.delete(k),
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    getMenuButtonBoundingClientRect: () => ({ left: 280, width: 87 }),
    stopPullDownRefresh: () => void (h.stops += 1),
    showToast: () => undefined,
    upx2px: (x: number) => x / 2,
    previewImage: (o: { urls: string[]; current: string; success?: () => void; fail?: () => void }) => {
      h.previews.push({ urls: o.urls, current: o.current });
      if (h.previewFail) o.fail?.();
      else o.success?.();
    },
  };
});

describe("⭐工作台：下拉刷新 + 商家名/角色", () => {
  it("页面注册 onPullDownRefresh，pages.json 开启 enablePullDownRefresh（变异：任一缺失即红）", () => {
    const pj = readFileSync(resolve(root, "src/pages.json"), "utf-8");
    const at = pj.indexOf('"path": "home/index"');
    expect(at).toBeGreaterThan(pj.indexOf('"root": "pkg-merchant"'));
    expect(pj.slice(at, at + 260)).toContain('"enablePullDownRefresh": true');
    const w = mount(HomePage, { global: GLOBAL });
    expect(h.pulls.length).toBe(1);
    expect(w.exists()).toBe(true);
  });
  it("顶部显示商家名（displayName）与角色标签；roleName 自定义优先（变异：不显示角色即红）", async () => {
    const w = mount(HomePage, { global: GLOBAL });
    expect(w.find(".hello-name").text()).toBe("A店");
    expect(w.find(".hello-role").text()).toBe("商家");
    h.store.set(MERCHANT_PROFILE_KEY, JSON.stringify({ ...PROFILE_OK, roleName: "门店店长" }));
    h.onShow[0]?.();
    await flushPromises();
    expect(w.find(".hello-role").text()).toBe("门店店长");
  });
  it("roleLabel 纯函数：自定义 > merchant→商家 > operator*→商户运营 > 原样；null ⇒ ''", () => {
    expect(roleLabel(null)).toBe("");
    expect(roleLabel({ role: "merchant", roleName: "" })).toBe("商家");
    expect(roleLabel({ role: "operator_lead", roleName: "" })).toBe("商户运营");
    expect(roleLabel({ role: "other", roleName: "" })).toBe("other");
    expect(roleLabel({ role: "merchant", roleName: "  店长 " })).toBe("店长");
  });
  it("⭐下拉刷新：重读登录态/权限（资料在别处被更新后，刷新即反映）并反馈「已刷新」；收口 stopPullDownRefresh（变异：不重读/不反馈即红）", async () => {
    const w = mount(HomePage, { global: GLOBAL });
    expect(w.findAll(".entry").length).toBe(4 - 0); // 4 个权限 ⇒ 预约/档期/分类/相册 入口
    // 模拟权限被收窄（例如重新登录后）：本地资料变更，下拉刷新应反映
    h.store.set(MERCHANT_PROFILE_KEY, JSON.stringify({ ...PROFILE_OK, permissions: ["album"] }));
    h.pulls[0]();
    for (let i = 0; i < 4; i++) await flushPromises();
    expect(w.findAll(".entry").length).toBe(1);
    expect(h.toasts).toContain("已刷新");
    expect(h.stops).toBeGreaterThan(0);
  });
  it("会话已失效时下拉：提示「登录已失效」并露出前往登录占位", async () => {
    const w = mount(HomePage, { global: GLOBAL });
    getMerchantRuntime().logout();
    h.pulls[0]();
    for (let i = 0; i < 4; i++) await flushPromises();
    expect(h.toasts).toContain("登录已失效，请重新登录");
    expect(w.find(".hello").exists()).toBe(false);
  });
});

describe("⭐空态带引导（保持现有文案口径，只加操作入口）", () => {
  async function mountEmpty(comp: Parameters<typeof mount>[0], onload?: Record<string, unknown>) {
    const w = mount(comp, { global: GLOBAL });
    h.onLoad[h.onLoad.length - 1]?.(onload);
    for (let i = 0; i < 4; i++) await flushPromises();
    return w;
  }
  it("相册空：文案不变 + 「新建相册」按钮；点击打开新建弹层（分类树为空时给既有提示而非静默）", async () => {
    const w = await mountEmpty(AlbumListPage);
    expect(w.find(".empty-title").text()).toBe("还没有相册");
    expect(w.find(".empty-desc").text()).toBe("点右上角「新建」创建第一个相册");
    const cta = w.find(".empty-cta");
    expect(cta.exists()).toBe(true);
    expect(cta.text()).toBe("新建相册");
    await cta.trigger("click");
    await flushPromises();
    // 没有二级分类 ⇒ openCreate 的既有提示（不是静默无反应）
    expect(h.toasts).toContain("请先在「分类管理」里创建二级分类");
  });
  it("分类空：文案不变 + 「新建分类」；点击打开新增弹层（变异：不打开即红）", async () => {
    const w = await mountEmpty(CategoryPage);
    expect(w.find(".empty-title").text()).toBe("还没有一级分类");
    expect(w.find(".empty-desc").text()).toBe("点右上角「新增」创建");
    const cta = w.find(".empty-cta");
    expect(cta.text()).toBe("新建分类");
    expect(w.find(".sheet-title").exists()).toBe(false);
    await cta.trigger("click");
    await flushPromises();
    expect(w.find(".sheet-title").exists()).toBe(true);
    expect(w.find(".sheet-title").text()).toBe("新增一级分类");
  });
  it("档期空：文案不变 + 「新增档期」；点击打开新增弹层", async () => {
    const w = await mountEmpty(SlotPage);
    expect(w.find(".empty-title").text()).toBe("还没有档期");
    expect(w.find(".empty-desc").text()).toBe("新增一个时间段，或套用模板一键生成");
    const cta = w.find(".empty-cta");
    expect(cta.text()).toBe("新增档期");
    expect(w.find(".sheet-title").exists()).toBe(false);
    await cta.trigger("click");
    await flushPromises();
    expect(w.find(".sheet-title").text()).toBe("新增档期");
  });
});

describe("⭐图片网格大图预览（uni.previewImage 经 platform/uni 适配器）", () => {
  async function mountGrid(n: number) {
    h.n = n;
    const w = mount(AlbumDetailPage, { global: GLOBAL });
    h.onLoad[h.onLoad.length - 1]?.({ albumId: "7", shopId: "1", title: "x" });
    for (let i = 0; i < 4; i++) await flushPromises();
    return w;
  }
  it("⭐点第 2 张 ⇒ previewImage：urls 为整本相册全部图（JPG 1080 缩略，COS 源站已改写 CDN），current 为第 2 张（变异：不预览/原图直出/下标错即红）", async () => {
    const w = await mountGrid(3);
    await w.findAll(".thumb-box")[1].trigger("click");
    await flushPromises();
    expect(h.previews.length).toBe(1);
    const p = h.previews[0];
    expect(p.urls.length).toBe(3);
    const suffix = `imageMogr2/thumbnail/${PREVIEW_WIDTH}x/format/jpg`;
    expect(p.urls[0]).toBe("https://www.lanmei66.cloud/a/0.jpg?" + suffix);
    expect(p.urls[1]).toBe("https://www.lanmei66.cloud/a/1.jpg?" + suffix); // 第 2 张库里是 COS 源站地址 ⇒ 改写 CDN
    expect(p.current).toBe(p.urls[1]);
    for (const u of p.urls) expect(u).not.toContain("myqcloud.com"); // 绝不触源站
  });
  it("选择模式下点图 ⇒ 只勾选，不预览（变异：仍预览即红）", async () => {
    const w = await mountGrid(3);
    const btns = w.findAll(".btn");
    await btns.find((b) => b.text() === "批量选择")!.trigger("click");
    await w.findAll(".thumb-box")[0].trigger("click");
    await flushPromises();
    expect(h.previews.length).toBe(0);
    expect(w.findAll(".check.is-on").length).toBe(1);
  });
  it("预览失败（容器拒绝/失败回调）⇒ 提示「图片预览失败，请稍后重试」，不抛（变异：吞掉失败即红）", async () => {
    h.previewFail = true;
    const w = await mountGrid(2);
    await w.findAll(".thumb-box")[0].trigger("click");
    await flushPromises();
    expect(h.toasts).toContain("图片预览失败，请稍后重试");
  });
  it("buildPreview 纯函数：下标对齐、空 URL 占位、未知 id ⇒ -1", () => {
    const imgs = [{ id: 5, imageUrl: "https://www.lanmei66.cloud/a.jpg" }, { id: 6, imageUrl: "" }, { id: 7, imageUrl: "https://www.lanmei66.cloud/c.jpg" }];
    expect(buildPreview(imgs, 7).index).toBe(2);
    expect(buildPreview(imgs, 6).urls[1]).toBe("");
    expect(buildPreview(imgs, 999).index).toBe(-1);
    expect(PREVIEW_WIDTH).toBe(1080);
  });
  it("适配器：空列表/无 previewImage ⇒ false 不抛；越界下标被收敛；空串项被过滤且 current 仍指向同一张", async () => {
    const p = createUniImagePreview();
    expect(await p.preview([], 0)).toBe(false);
    expect(await p.preview(["", " "], 0)).toBe(false);
    expect(await p.preview(["https://a/1.jpg", "https://a/2.jpg"], 99)).toBe(true);
    expect(h.previews.at(-1)?.current).toBe("https://a/2.jpg");
    expect(await p.preview(["", "https://a/2.jpg", "https://a/3.jpg"], 2)).toBe(true);
    expect(h.previews.at(-1)).toEqual({ urls: ["https://a/2.jpg", "https://a/3.jpg"], current: "https://a/3.jpg" });
    expect(await p.preview(["https://a/1.jpg"], -5)).toBe(true);
    (globalThis as { uni?: unknown }).uni = {};
    expect(await p.preview(["https://a/1.jpg"], 0)).toBe(false);
  });
  it("长按保存：靠 previewImage 自带菜单，不自造「保存到相册」权限流程（源码守卫：详情页不调用 saveImageToPhotosAlbum）", () => {
    const s = readFileSync(resolve(root, "src/pkg-merchant/album/detail.vue"), "utf-8");
    expect(s).not.toContain("saveImageToPhotosAlbum");
    expect(s).not.toMatch(/\buni\.previewImage\b/); // 业务页不直调平台 API，经适配器
    expect(s).toContain("createUniImagePreview");
  });
});
