// 新建相册页面级验收（issue #14 · m2b 真机批次 3）：真实相册页 + 真实 BaseField/BasePicker/wd-picker-view，
// 仅替换平台端口（选图/压缩/上传，经 merchant-upload-deps 注入）与传输层。覆盖：不再要求「先传封面才能建」、选多张→默认第一张封面→设封面→移除、
// 一次保存按后台顺序执行、压缩失败零副作用、部分失败提示且不重复创建、编辑模式不含照片区。
// 变异靶点：①新建仍强制先传封面 ②默认封面不是第一张 ③点图不能改封面 ④压缩失败仍建相册 ⑤部分失败后「创建相册」按钮仍可再次创建 ⑥编辑模式出现照片区。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

const hh = vi.hoisted(() => ({
  onLoad: [] as Array<(o?: Record<string, unknown>) => void>,
  onShow: [] as Array<() => void>,
  store: new Map<string, string>(),
  reqs: [] as Array<{ method: string; url: string; body?: unknown }>,
  picks: [] as Array<Array<{ path: string; size: number }>>,
  compressFailAt: -1 as number,
  compressN: 0,
  uploads: [] as Array<{ url: string; name: string; filePath: string }>,
  withAlbum: false,
  hold: null as null | Promise<void>,
  uploadResult: ((_req: { filePath: string; url: string }) => ({ ok: true, value: { statusCode: 200, data: JSON.stringify({ code: 200, data: [{ id: 1 }] }) } })) as (req: { filePath: string; url: string }) => unknown,
}));
vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => hh.onLoad.push(fn),
  onShow: (fn: () => void) => hh.onShow.push(fn),
  onHide: () => undefined,
  onReachBottom: () => undefined,
  onPullDownRefresh: () => undefined,
}));
const cat = (id: number, name: string, parentId = 0) => ({ id, name, sortOrder: 0, shopId: 1, parentId, depth: parentId === 0 ? 1 : 2 });
vi.mock("../../src/platform/uni/transport", () => ({
  createUniTransport: () => ({
    request: async (req: { method: string; url: string; body?: unknown; query?: Record<string, string> }) => {
      hh.reqs.push({ method: req.method, url: req.url, body: req.body });
      const ok = (data: unknown) => ({ ok: true, value: { status: 200, businessCode: 200, message: undefined, requestId: null, data } });
      if (req.url === "/shop/parent/list") return ok([cat(5, "外景")]);
      if (req.url === "/shop/sub/get-by-parent") return ok([cat(9, "海边", 5)]);
      if (req.url.startsWith("/photo-albums/add-photo")) return ok({ id: 88, title: "x" });
      if (req.url === "/photo-albums/photo" && hh.withAlbum) return ok([{ id: 1, shopId: 1, childId: 9, parentId: 5, childName: "海边", title: "旧相册", coverImageUrl: "https://c/x.jpg", price: 10, packageDesc: "", aiDesc: "", sortOrder: 0, tryonCount: 0 }]);
      return ok([]);
    },
    cancel: () => undefined,
  }),
}));
vi.mock("../../src/pkg-merchant/application/merchant-upload-deps", () => ({
  createMerchantUploadDeps: () => ({
    picker: { pick: async () => (hh.picks.length > 0 ? { ok: true, files: hh.picks.shift() } : { ok: false, reason: "cancel", errMsg: "cancel" }) },
    compress: {
      compress: async (p: string, s: number) => {
        const i = hh.compressN++;
        if (hh.compressFailAt === i) return null;
        return { path: "c-" + p, size: s, width: 1, height: 1, reused: false };
      },
    },
    newUpload: () => ({
      upload: async (req: { url: string; name: string; filePath: string }) => {
        hh.uploads.push({ url: req.url, name: req.name, filePath: req.filePath });
        if (hh.hold != null && !req.url.endsWith("/upload-cover")) await hh.hold;
        if (req.url.endsWith("/upload-cover")) return { ok: true, value: { statusCode: 200, data: JSON.stringify({ code: 200, data: { image_url: "https://cdn/c.jpg" } }) } };
        return hh.uploadResult(req);
      },
      cancel: () => undefined,
    }),
    albumUploadUrl: () => "https://api/photo-albums/albums/upload",
    coverUploadUrl: () => "https://api/photo-albums/upload-cover",
  }),
}));

import AlbumListPage from "../../src/pkg-merchant/album/list.vue";
import BasePicker from "../../src/ui/BasePicker.vue";
import WdPickerView from "../../node_modules/@wot-ui/ui/components/wd-picker-view/wd-picker-view.vue";
import { __resetMerchantRuntime } from "../../src/pkg-merchant/application/merchant-runtime";
import { MERCHANT_PROFILE_KEY, MERCHANT_SESSION_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";

const PopupSpy = defineComponent({ name: "BasePopup", props: ["show", "position", "zIndex", "rootPortal"], emits: ["cancel", "update:show"], setup: (p, { slots }) => () => (p.show ? h("div", { class: "popup-spy" }, slots.default?.()) : null) });
const PV = defineComponent({ name: "picker-view", emits: ["change", "pickstart", "pickend"], setup: (_p, { slots }) => () => h("div", { class: "native-picker-view" }, slots.default?.()) });
const PVC = defineComponent({ name: "picker-view-column", setup: (_p, { slots }) => () => h("div", { class: "native-picker-view-column" }, slots.default?.()) });
const Block = defineComponent({ name: "block", setup: (_p, { slots }) => () => slots.default?.() });
const FeedbackStub = defineComponent({ setup(_p, { expose }) { expose({ show: () => undefined }); return () => null; } });
const GLOBAL = {
  components: { "wd-picker-view": WdPickerView, "picker-view": PV, "picker-view-column": PVC, block: Block },
  stubs: { PullRefreshIndicator: true, BaseFeedback: FeedbackStub, BaseDialog: true, PageFooter: true, CustomNavBar: true, MerchantNeedLogin: true, BasePopup: PopupSpy, BaseProgress: true, SkeletonBlock: true },
};

beforeEach(() => {
  hh.onLoad.length = 0;
  hh.onShow.length = 0;
  hh.store.clear();
  hh.reqs.length = 0;
  hh.picks.length = 0;
  hh.uploads.length = 0;
  hh.compressFailAt = -1;
  hh.compressN = 0;
  hh.withAlbum = false;
  hh.hold = null;
  hh.uploadResult = () => ({ ok: true, value: { statusCode: 200, data: JSON.stringify({ code: 200, data: [{ id: 1 }] }) } });
  __resetMerchantRuntime();
  hh.store.set(MERCHANT_SESSION_KEY, JSON.stringify({ userId: "7", token: "m-token", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }));
  hh.store.set(MERCHANT_PROFILE_KEY, JSON.stringify({ adminId: 7, merchantId: 1, username: "a", role: "merchant", displayName: "A", roleName: "", permissions: ["album", "category"], shopList: [{ id: 1, name: "A店", merchantName: "", status: 1 }] }));
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => hh.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => hh.store.set(k, v),
    removeStorageSync: (k: string) => hh.store.delete(k),
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    getMenuButtonBoundingClientRect: () => ({ left: 280, width: 87 }),
    stopPullDownRefresh: () => undefined,
    showToast: () => undefined,
    upx2px: (n: number) => n / 2,
    navigateTo: () => undefined,
  };
});

async function mountPage() {
  const w = mount(AlbumListPage, { global: GLOBAL });
  hh.onLoad[hh.onLoad.length - 1]?.();
  await flushPromises();
  await flushPromises();
  return w;
}
const pickN = (n: number, base = 0) => Array.from({ length: n }, (_, i) => ({ path: `p${base + i}.jpg`, size: 2000 + i }));
async function openCreateAndFill(w: ReturnType<typeof mount>) {
  await w.find(".add").trigger("click");
  await flushPromises();
  const inputs = w.findAll(".base-field__input");
  await inputs[0].trigger("input", { detail: { value: "海边写真" } });
  // 选分类（级联）：直接确认默认路径 外景/海边
  await w.find(".pick-row").trigger("click");
  await flushPromises();
  const picker = w.findAllComponents(BasePicker).find((p) => p.props("title") === "所属分类")!;
  await picker.find(".base-picker-sheet__bar > view:last-of-type").trigger("click");
  await flushPromises();
  expect(w.find(".pick-value").text()).toBe("外景 / 海边");
}
const writes = () => hh.reqs.filter((r) => r.method !== "GET");

describe("⭐新建相册：不再要求先传封面；可直接选整个相册的图片", () => {
  it("新建表单有「照片」区（编辑表单没有）；初始无照片，只有「＋」添加入口（变异：编辑模式出现照片区即红）", async () => {
    const w = await mountPage();
    await w.find(".add").trigger("click");
    await flushPromises();
    expect(w.find(".photos").exists()).toBe(true);
    expect(w.find(".cover-row").exists()).toBe(false);
    expect(w.findAll(".photo").length).toBe(1);
    expect(w.find(".photo-add").exists()).toBe(true);
  });
  it("选 5 张 → 网格 5 张 + 添加格；第一张默认带「封面」角标；点第 3 张 ⇒ 封面移到第 3 张（变异：默认非第一张/点图不改封面即红）", async () => {
    const w = await mountPage();
    await w.find(".add").trigger("click");
    await flushPromises();
    hh.picks.push(pickN(5));
    await w.find(".photo-add").trigger("click");
    await flushPromises();
    const cells = () => w.findAll(".photo:not(.photo-add)");
    expect(cells().length).toBe(5);
    expect(cells()[0].classes()).toContain("is-cover");
    expect(cells()[0].find(".photo-badge").exists()).toBe(true);
    await cells()[2].trigger("click");
    expect(cells()[2].classes()).toContain("is-cover");
    expect(cells()[0].classes()).not.toContain("is-cover");
    expect(w.findAll(".photo-badge").length).toBe(1);
  });
  it("多次追加（总数累计）；移除封面 ⇒ 封面回退剩余第一张；每行第 3 个带 is-end（三列网格右边距清零）", async () => {
    const w = await mountPage();
    await w.find(".add").trigger("click");
    await flushPromises();
    hh.picks.push(pickN(4));
    await w.find(".photo-add").trigger("click");
    await flushPromises();
    hh.picks.push(pickN(2, 100));
    await w.find(".photo-add").trigger("click");
    await flushPromises();
    const cells = () => w.findAll(".photo:not(.photo-add)");
    expect(cells().length).toBe(6);
    const all = w.findAll(".photo");
    expect(all[2].classes()).toContain("is-end");
    expect(all[5].classes()).toContain("is-end");
    expect(all[0].classes()).not.toContain("is-end");
    await cells()[0].find(".photo-remove").trigger("click");
    expect(cells().length).toBe(5);
    expect(cells()[0].classes()).toContain("is-cover");
  });
});

describe("⭐编辑模式：保持原样（改名/分类/价格/说明/换封面），不出现批量照片区", () => {
  it("点「编辑」⇒ 有封面行、没有照片区；保存走 update（PUT），不触发任何上传/创建（变异：编辑也出照片区即红）", async () => {
    hh.withAlbum = true;
    const w = await mountPage();
    await w.find(".op").trigger("click"); // 第一张卡片的「编辑」
    await flushPromises();
    expect(w.find(".popup-spy").exists()).toBe(true);
    expect(w.find(".cover-row").exists()).toBe(true);
    expect(w.find(".photos").exists()).toBe(false);
    expect(w.find(".sheet-title").text()).toBe("编辑相册");
    hh.reqs.length = 0;
    await w.find(".sheet-btn").trigger("click");
    for (let i = 0; i < 4; i++) await flushPromises();
    expect(hh.reqs.some((r) => r.method === "PUT" && r.url.startsWith("/photo-albums/update/1"))).toBe(true);
    expect(hh.uploads.length).toBe(0);
    expect(hh.reqs.some((r) => r.url.startsWith("/photo-albums/add-photo"))).toBe(false);
  });
});

describe("⭐创建进行中：按钮变「取消上传」，不能再次点「创建相册」（防重复建）", () => {
  it("上传阶段挂起时：只有「取消上传」；点它 ⇒ 安全中止，相册已建只 1 次，出现补传面板（变异：仍显示创建按钮即红）", async () => {
    const w = await mountPage();
    await openCreateAndFill(w);
    hh.picks.push(pickN(3));
    await w.find(".photo-add").trigger("click");
    await flushPromises();
    let release: () => void = () => undefined;
    hh.hold = new Promise<void>((r) => { release = r; });
    hh.reqs.length = 0;
    await w.find(".sheet-btn").trigger("click");
    for (let i = 0; i < 4; i++) await flushPromises();
    const labels = () => w.findAll(".sheet-btn-text").map((t) => t.text());
    expect(labels()).toContain("取消上传");
    expect(labels()).not.toContain("创建相册");
    await w.findAll(".sheet-btn").find((b) => b.text() === "取消上传")!.trigger("click");
    release();
    for (let i = 0; i < 6; i++) await flushPromises();
    expect(hh.reqs.filter((r) => r.url.startsWith("/photo-albums/add-photo")).length).toBe(1);
    expect(w.find(".partial").exists()).toBe(true);
    expect(labels()).not.toContain("创建相册");
  });
});

describe("⭐一次保存：后台同款顺序", () => {
  it("选 3 张（封面默认第一张）→ 创建相册：先传封面、再 add-photo（带封面 URL）、再串行传其余 2 张；成功后关闭并刷新列表", async () => {
    const w = await mountPage();
    await openCreateAndFill(w);
    hh.picks.push(pickN(3));
    await w.find(".photo-add").trigger("click");
    await flushPromises();
    hh.reqs.length = 0;
    await w.find(".sheet-btn").trigger("click");
    for (let i = 0; i < 6; i++) await flushPromises();
    expect(hh.uploads.map((u) => (u.url.endsWith("/upload-cover") ? "cover:" : "img:") + u.filePath)).toEqual(["cover:c-p0.jpg", "img:c-p1.jpg", "img:c-p2.jpg"]);
    const add = hh.reqs.find((r) => r.url.startsWith("/photo-albums/add-photo"));
    expect(add?.method).toBe("POST");
    expect((add?.body as { coverImageUrl: string; title: string; childId: number }).coverImageUrl).toBe("https://cdn/c.jpg");
    expect((add?.body as { title: string }).title).toBe("海边写真");
    expect((add?.body as { childId: number }).childId).toBe(9);
    expect(w.find(".popup-spy").exists()).toBe(false); // 成功后关闭
    expect(hh.reqs.filter((r) => r.url.startsWith("/photo-albums/add-photo")).length).toBe(1);
    expect(hh.reqs.some((r) => r.url === "/photo-albums/photo")).toBe(true); // 刷新列表
  });
  it("⭐不选任何照片也能创建（空相册）：不上传，直接 add-photo，封面为空（变异：仍强制先传封面即红）", async () => {
    const w = await mountPage();
    await openCreateAndFill(w);
    hh.reqs.length = 0;
    await w.find(".sheet-btn").trigger("click");
    for (let i = 0; i < 4; i++) await flushPromises();
    expect(hh.uploads.length).toBe(0);
    const add = hh.reqs.find((r) => r.url.startsWith("/photo-albums/add-photo"));
    expect(add).toBeDefined();
    expect((add?.body as { coverImageUrl: string }).coverImageUrl).toBe("");
  });
  it("⭐压缩失败：零副作用——没有上传、没有创建；表单仍在，显示未创建相册的错误（变异：失败仍建相册即红）", async () => {
    const w = await mountPage();
    await openCreateAndFill(w);
    hh.picks.push(pickN(3));
    await w.find(".photo-add").trigger("click");
    await flushPromises();
    hh.compressFailAt = 1; // 第 2 张压缩失败
    hh.reqs.length = 0;
    await w.find(".sheet-btn").trigger("click");
    for (let i = 0; i < 4; i++) await flushPromises();
    expect(hh.uploads.length).toBe(0);
    expect(hh.reqs.some((r) => r.url.startsWith("/photo-albums/add-photo"))).toBe(false);
    expect(w.find(".popup-spy").exists()).toBe(true);
    expect(w.find(".form-error").text()).toContain("未创建相册");
  });
  it("⭐部分失败：相册只创建 1 次；出现「重试失败项 / 去补传 / 完成」，不再出现「创建相册」按钮（变异：仍可再建即红）；重试成功后关闭", async () => {
    const w = await mountPage();
    await openCreateAndFill(w);
    hh.picks.push(pickN(3));
    await w.find(".photo-add").trigger("click");
    await flushPromises();
    let failOnce = true;
    hh.uploadResult = (req) => {
      if (req.filePath === "c-p2.jpg" && failOnce) {
        failOnce = false;
        return { ok: false, reason: "network" };
      }
      return { ok: true, value: { statusCode: 200, data: JSON.stringify({ code: 200, data: [{ id: 1 }] }) } };
    };
    hh.reqs.length = 0;
    await w.find(".sheet-btn").trigger("click");
    for (let i = 0; i < 6; i++) await flushPromises();
    expect(hh.reqs.filter((r) => r.url.startsWith("/photo-albums/add-photo")).length).toBe(1);
    expect(w.find(".partial").exists()).toBe(true);
    expect(w.find(".partial-text").text()).toContain("已创建");
    expect(w.find(".partial-text").text()).toContain("请勿重复新建");
    const labels = w.findAll(".sheet-btn-text").map((t) => t.text());
    expect(labels).toContain("重试失败项");
    expect(labels).toContain("去补传");
    expect(labels).not.toContain("创建相册");
    // 重试
    const retry = w.findAll(".sheet-btn").find((b) => b.text() === "重试失败项")!;
    await retry.trigger("click");
    for (let i = 0; i < 6; i++) await flushPromises();
    expect(hh.reqs.filter((r) => r.url.startsWith("/photo-albums/add-photo")).length).toBe(1);
    expect(w.find(".popup-spy").exists()).toBe(false);
  });
});
