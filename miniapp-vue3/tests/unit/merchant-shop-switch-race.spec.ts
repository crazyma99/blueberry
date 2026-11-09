// 切换系列的竞态（issue #14 · CR）：旧系列的慢响应迟到，不得覆盖新系列的列表。
// 场景：系列 1 的请求被挂起 → 切到系列 2（立即返回）→ 放行系列 1 的迟到响应 ⇒ 页面仍只显示系列 2 的数据。
// 防线：页面 reload 的 reloadSeq 守卫（`if (mySeq !== reloadSeq) return`）。
// 变异靶点：①去掉 reloadSeq 守卫（分类页）②去掉 reloadSeq 守卫（相册页）③相册页切系列不 bump seq（沿用旧 seq）④迟到响应覆盖时失败态也被污染。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

type Reply = { status?: number; code?: number | null; message?: string; data?: unknown };
const h = vi.hoisted(() => ({
  onLoad: [] as Array<(o?: Record<string, unknown>) => void>,
  onShow: [] as Array<() => void>,
  store: new Map<string, string>(),
  responder: ((_u: string, _q: Record<string, string> | undefined) => ({ code: 200, data: [] })) as (u: string, q: Record<string, string> | undefined) => Reply | Promise<Reply>,
}));
vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoad.push(fn),
  onShow: (fn: () => void) => h.onShow.push(fn),
  onHide: () => undefined,
  onReachBottom: () => undefined,
  onPullDownRefresh: () => undefined,
}));
vi.mock("../../src/platform/uni/transport", () => ({
  createUniTransport: () => ({
    request: async (req: { url: string; query?: Record<string, string> }) => {
      const r = await h.responder(req.url, req.query);
      return { ok: true, value: { status: r.status ?? 200, businessCode: r.code === undefined ? 200 : r.code, message: r.message, requestId: null, data: r.data } };
    },
    cancel: () => undefined,
  }),
}));

import AlbumListPage from "../../src/pkg-merchant/album/list.vue";
import CategoryPage from "../../src/pkg-merchant/category/list.vue";
import { __resetMerchantRuntime } from "../../src/pkg-merchant/application/merchant-runtime";
import { MERCHANT_PROFILE_KEY, MERCHANT_SESSION_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";

const FeedbackStub = defineComponent({ setup(_p, { expose }) { expose({ show: () => undefined }); return () => null; } });
const PickerStub = defineComponent({ name: "BasePicker", props: ["show", "modelValue", "title", "options"], emits: ["confirm", "update:show"], setup: () => () => null });
const GLOBAL = { stubs: { PullRefreshIndicator: true, BaseFeedback: FeedbackStub, BaseDialog: true, PageFooter: true, BasePicker: PickerStub, BasePopup: true, CustomNavBar: true, MerchantNeedLogin: true } };

const cat = (id: number, name: string, shopId: number, parentId = 0) => ({ id, name, sortOrder: 0, shopId, parentId, depth: parentId === 0 ? 1 : 2 });
const album = (id: number, title: string, shopId: number) => ({ id, shopId, childId: 9, parentId: 5, childName: "分类", title, coverImageUrl: "", price: 10, packageDesc: "", aiDesc: "", sortOrder: 0, tryonCount: 0 });

/** 可手动放行的闸门：按 shop 键挂起 */
function gate() {
  let release: () => void = () => undefined;
  const p = new Promise<void>((r) => { release = r; });
  return { wait: p, release };
}

beforeEach(() => {
  h.onLoad.length = 0;
  h.onShow.length = 0;
  h.store.clear();
  __resetMerchantRuntime();
  h.store.set(MERCHANT_SESSION_KEY, JSON.stringify({ userId: "7", token: "m-token", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }));
  h.store.set(
    MERCHANT_PROFILE_KEY,
    JSON.stringify({
      adminId: 7, merchantId: 1, username: "a", role: "merchant", displayName: "A", roleName: "", permissions: ["album", "category"],
      shopList: [{ id: 1, name: "旧系列", merchantName: "", status: 1 }, { id: 2, name: "新系列", merchantName: "", status: 1 }],
    }),
  );
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => h.store.set(k, v),
    removeStorageSync: (k: string) => h.store.delete(k),
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    getMenuButtonBoundingClientRect: () => ({ left: 280, width: 87 }),
    stopPullDownRefresh: () => undefined,
    showToast: () => undefined,
    upx2px: (n: number) => n / 2,
  };
});

async function mountPage(comp: typeof AlbumListPage | typeof CategoryPage) {
  const w = mount(comp, { global: GLOBAL });
  h.onLoad[h.onLoad.length - 1]?.();
  await flushPromises();
  return w;
}
/** 第一个 BasePicker 是「系列」选择器：模拟用户确认选择 */
async function pickShop(w: ReturnType<typeof mount>, id: number) {
  const pickers = w.findAllComponents({ name: "BasePicker" });
  pickers[0].vm.$emit("confirm", [id]);
  await flushPromises();
}

describe("⭐分类页：切换系列后，旧系列迟到的响应不得覆盖新列表", () => {
  it("系列 1 挂起 → 切系列 2（立即）→ 放行系列 1：只显示系列 2 的分类（变异：去掉 reloadSeq 守卫即红）", async () => {
    const g1 = gate();
    h.responder = async (url, q) => {
      if (url.startsWith("/api/page-config")) return { code: 200, data: {} };
      if (url === "/shop/parent/list") {
        if (q?.shopId === "1") {
          await g1.wait;
          return { code: 200, data: [cat(11, "旧系列的分类", 1)] };
        }
        return { code: 200, data: [cat(21, "新系列的分类", 2)] };
      }
      return { code: 200, data: [] };
    };
    const w = await mountPage(CategoryPage);
    expect(w.text()).not.toContain("旧系列的分类"); // 系列 1 仍挂起
    await pickShop(w, 2);
    expect(w.text()).toContain("新系列的分类");
    g1.release(); // 旧响应迟到
    await flushPromises();
    await flushPromises();
    expect(w.text()).toContain("新系列的分类");
    expect(w.text(), "旧系列的迟到响应污染了新列表").not.toContain("旧系列的分类");
  });
  it("迟到的旧响应是「失败」时，也不得把新列表盖成失败态", async () => {
    const g1 = gate();
    h.responder = async (url, q) => {
      if (url.startsWith("/api/page-config")) return { code: 200, data: {} };
      if (url === "/shop/parent/list") {
        if (q?.shopId === "1") {
          await g1.wait;
          return { code: 500, message: "旧系列失败" };
        }
        return { code: 200, data: [cat(21, "新系列的分类", 2)] };
      }
      return { code: 200, data: [] };
    };
    const w = await mountPage(CategoryPage);
    await pickShop(w, 2);
    g1.release();
    await flushPromises();
    await flushPromises();
    expect(w.text()).toContain("新系列的分类");
    expect(w.text()).not.toContain("旧系列失败");
    expect(w.text()).not.toContain("加载失败");
  });
});

describe("⭐相册列表页：切换系列后，旧系列迟到的响应（相册 + 分类树）不得覆盖新列表", () => {
  it("系列 1 挂起 → 切系列 2 → 放行系列 1：只显示系列 2 的相册（变异：去掉 reloadSeq 守卫即红）", async () => {
    const g1 = gate();
    h.responder = async (url, q) => {
      if (url.startsWith("/api/page-config")) return { code: 200, data: {} };
      if (url === "/shop/parent/list") {
        if (q?.shopId === "1") {
          await g1.wait;
          return { code: 200, data: [cat(5, "旧系列一级", 1)] };
        }
        return { code: 200, data: [cat(15, "新系列一级", 2)] };
      }
      if (url === "/shop/sub/get-by-parent") return { code: 200, data: [cat(q?.parentId === "5" ? 9 : 19, "二级", 2, Number(q?.parentId))] };
      if (url === "/photo-albums/photo") return { code: 200, data: [q?.shop_id === "1" ? album(1, "旧系列相册", 1) : album(2, "新系列相册", 2)] };
      return { code: 200, data: [] };
    };
    const w = await mountPage(AlbumListPage);
    expect(w.text()).not.toContain("旧系列相册"); // 系列 1 挂起（分类树先于相册加载）
    await pickShop(w, 2);
    expect(w.text()).toContain("新系列相册");
    g1.release();
    await flushPromises();
    await flushPromises();
    expect(w.text()).toContain("新系列相册");
    expect(w.text(), "旧系列的迟到响应污染了新列表").not.toContain("旧系列相册");
  });
  it("⭐相册请求本身挂起：系列 1 的相册响应迟到，也不得盖掉系列 2 的相册（变异：去掉 reloadSeq 守卫即红）", async () => {
    const g1 = gate();
    h.responder = async (url, q) => {
      if (url.startsWith("/api/page-config")) return { code: 200, data: {} };
      if (url === "/shop/parent/list") return { code: 200, data: [cat(q?.shopId === "1" ? 5 : 15, "一级", Number(q?.shopId))] };
      if (url === "/shop/sub/get-by-parent") return { code: 200, data: [cat(19, "二级", 2, Number(q?.parentId))] };
      if (url === "/photo-albums/photo") {
        if (q?.shop_id === "1") {
          await g1.wait;
          return { code: 200, data: [album(1, "旧系列相册", 1)] };
        }
        return { code: 200, data: [album(2, "新系列相册", 2)] };
      }
      return { code: 200, data: [] };
    };
    const w = await mountPage(AlbumListPage);
    await pickShop(w, 2);
    expect(w.text()).toContain("新系列相册");
    g1.release();
    await flushPromises();
    await flushPromises();
    expect(w.text()).toContain("新系列相册");
    expect(w.text(), "旧系列的迟到相册响应覆盖了新列表").not.toContain("旧系列相册");
  });
  it("迟到的旧响应不得污染新系列的分类树：切换后「新建」用的是新系列的分类（旧系列分类 id 不出现）", async () => {
    const g1 = gate();
    h.responder = async (url, q) => {
      if (url.startsWith("/api/page-config")) return { code: 200, data: {} };
      if (url === "/shop/parent/list") {
        if (q?.shopId === "1") {
          await g1.wait;
          return { code: 500, message: "旧系列分类失败" };
        }
        return { code: 200, data: [cat(15, "新系列一级", 2)] };
      }
      if (url === "/shop/sub/get-by-parent") return { code: 200, data: [cat(19, "新二级", 2, 15)] };
      if (url === "/photo-albums/photo") return { code: 200, data: [album(2, "新系列相册", 2)] };
      return { code: 200, data: [] };
    };
    const w = await mountPage(AlbumListPage);
    await pickShop(w, 2);
    g1.release();
    await flushPromises();
    await flushPromises();
    expect(w.text()).toContain("新系列相册");
    expect(w.find(".tree-error").exists(), "旧系列的迟到失败把新系列标成「分类加载失败」").toBe(false);
  });
});
