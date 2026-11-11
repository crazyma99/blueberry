// 主人真机 trial-ux1 四处小 bug 的回归（issue #14 · UX bugfix）：
// ① 工作台下拉刷新看不到 loading：刷新动作太快（同步读本地），指示器同一时间片 true→false 一帧都没渲染 ⇒ 最小可见时长 600ms + 拉取实时权限
// ② 二级页标题栏 transparent：内容滚动时从标题下穿过重叠 ⇒ 二级页改实底（不传 transparent），登录页保持透明（沉浸式，滚动区在导航栏占位之下）
// ③④ 新建相册表单间距：「所属分类」行贴着「价格」、「照片（选填）」标签贴着上传区 ⇒ 对齐 BaseField 间距，堆叠标签用 .field-label（并排行 .pick-label 不动）
// 变异靶点：去最小时长 / 刷新不更新权限 / 401 不走失效态 / 失败不保留旧快照 / 二级页又传 transparent / 去 margin-bottom / 堆叠标签改回 pick-label。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h as vh } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  onLoad: [] as Array<(o?: Record<string, unknown>) => void>,
  onShow: [] as Array<() => void>,
  pulls: [] as Array<() => void>,
  store: new Map<string, string>(),
  toasts: [] as string[],
  stops: 0,
  perm: (() => ({ status: 200, code: 200, data: { role: "merchant", permissions: ["album"] } })) as () => { status: number; code: number | null; data?: unknown; message?: string } | "throw",
  permCalls: 0,
}));
vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoad.push(fn),
  onShow: (fn: () => void) => h.onShow.push(fn),
  onHide: () => undefined,
  onReachBottom: () => undefined,
  onPullDownRefresh: (fn: () => void) => h.pulls.push(fn),
  onShareAppMessage: () => undefined,
  onShareTimeline: () => undefined,
}));
vi.mock("../../src/platform/uni/transport", () => ({
  createUniTransport: () => ({
    request: async (req: { url: string }) => {
      if (req.url === "/auth/me/permissions") {
        h.permCalls++;
        const r = h.perm();
        if (r === "throw") return { ok: false, reason: "network" }; // 真实传输层以 Result.reason 回报网络失败（不抛）
        return { ok: true, value: { status: r.status, businessCode: r.code, message: r.message, requestId: null, data: r.data } };
      }
      return { ok: true, value: { status: 200, businessCode: 200, message: undefined, requestId: null, data: [] } };
    },
    cancel: () => undefined,
  }),
}));

import HomePage from "../../src/pkg-merchant/home/index.vue";
import AlbumListPage from "../../src/pkg-merchant/album/list.vue";
import CustomNavBar from "../../src/components/CustomNavBar/CustomNavBar.vue";
import { __resetMerchantRuntime, getMerchantRuntime } from "../../src/pkg-merchant/application/merchant-runtime";
import { MERCHANT_PROFILE_KEY, MERCHANT_SESSION_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";
import { MIN_REFRESH_VISIBLE_MS, withMinDuration } from "../../src/pkg-merchant/composables/min-duration";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf-8");
const FeedbackStub = defineComponent({ setup(_p, { expose }) { expose({ show: (t: string) => void h.toasts.push(t) }); return () => null; } });
const IndicatorSpy = defineComponent({ name: "PullRefreshIndicator", props: ["show", "top"], setup: (p) => () => vh("div", { class: "indicator", "data-show": String(p.show) }) });
const PopupSpy = defineComponent({ name: "BasePopup", props: ["show", "position", "zIndex", "rootPortal"], emits: ["cancel", "update:show"], setup: (p, { slots }) => () => (p.show ? vh("div", { class: "popup-spy" }, slots.default?.()) : null) });
const GLOBAL = { stubs: { PullRefreshIndicator: IndicatorSpy, BaseFeedback: FeedbackStub, BaseDialog: true, PageFooter: true, MerchantNeedLogin: true, BasePopup: PopupSpy, BasePicker: true, BaseProgress: true, SkeletonBlock: true, BaseField: true } };
const PROFILE = { adminId: 7, merchantId: 1, username: "shopA", role: "merchant", displayName: "A店", roleName: "", permissions: ["booking", "album", "category", "booking_slot"], shopList: [{ id: 1, name: "A", merchantName: "", status: 1 }] };

beforeEach(() => {
  h.onLoad.length = 0;
  h.onShow.length = 0;
  h.pulls.length = 0;
  h.store.clear();
  h.toasts.length = 0;
  h.stops = 0;
  h.permCalls = 0;
  h.perm = () => ({ status: 200, code: 200, data: { role: "merchant", permissions: ["album"] } });
  __resetMerchantRuntime();
  h.store.set(MERCHANT_SESSION_KEY, JSON.stringify({ userId: "7", token: "m-token", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }));
  h.store.set(MERCHANT_PROFILE_KEY, JSON.stringify(PROFILE));
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => h.store.set(k, v),
    removeStorageSync: (k: string) => h.store.delete(k),
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    getMenuButtonBoundingClientRect: () => ({ left: 280, width: 87 }),
    stopPullDownRefresh: () => void (h.stops += 1),
    showToast: () => undefined,
    upx2px: (x: number) => x / 2,
  };
});
afterEach(() => vi.useRealTimers());

describe("⭐① 最小可见时长（withMinDuration，假定时器，不真实等待）", () => {
  it("动作瞬间完成：至少持续 600ms 才 resolve（变异：去掉补足即红）", async () => {
    vi.useFakeTimers();
    let done = false;
    const p = withMinDuration(async () => "v").then((v) => { done = true; return v; });
    await vi.advanceTimersByTimeAsync(MIN_REFRESH_VISIBLE_MS - 10);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(await p).toBe("v");
    expect(done).toBe(true);
    expect(MIN_REFRESH_VISIBLE_MS).toBeGreaterThanOrEqual(500);
    expect(MIN_REFRESH_VISIBLE_MS).toBeLessThanOrEqual(700);
  });
  it("动作本身已超过最小时长：不额外等待", async () => {
    vi.useFakeTimers();
    let done = false;
    const p = withMinDuration(async () => { await new Promise((r) => setTimeout(r, 1000)); return 1; }).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(done).toBe(true);
  });
  it("动作抛错：补足时长后再抛（finally 语义不变，不吞错）", async () => {
    vi.useFakeTimers();
    let state = "pending";
    const p = withMinDuration(async () => { throw new Error("x"); }).then(() => (state = "ok"), () => (state = "rejected"));
    await vi.advanceTimersByTimeAsync(MIN_REFRESH_VISIBLE_MS - 10);
    expect(state).toBe("pending");
    await vi.advanceTimersByTimeAsync(20);
    await p;
    expect(state).toBe("rejected");
  });
});

describe("⭐① 工作台下拉刷新：指示器可见 ≥600ms + 拉取实时权限", () => {
  async function mountHome() {
    const w = mount(HomePage, { global: { ...GLOBAL, stubs: { ...GLOBAL.stubs, CustomNavBar: true } } });
    await flushPromises();
    return w;
  }
  it("⭐触发下拉后指示器 show=true 持续到 ≥600ms 才收起；stopPullDownRefresh 在其后调用（变异：去最小时长即红）", async () => {
    const w = await mountHome();
    vi.useFakeTimers();
    h.pulls[0]();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.find(".indicator").attributes("data-show")).toBe("true");
    await vi.advanceTimersByTimeAsync(MIN_REFRESH_VISIBLE_MS - 50);
    expect(w.find(".indicator").attributes("data-show")).toBe("true");
    expect(h.stops).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(0);
    expect(w.find(".indicator").attributes("data-show")).toBe("false");
    expect(h.stops).toBeGreaterThan(0);
  });
  it("⭐成功：请求 GET /auth/me/permissions，权限快照更新、入口随之变化、提示「已刷新」（变异：不更新权限即红）", async () => {
    const w = await mountHome();
    expect(w.findAll(".entry").length).toBe(4);
    vi.useFakeTimers();
    h.pulls[0]();
    await vi.advanceTimersByTimeAsync(MIN_REFRESH_VISIBLE_MS + 50);
    vi.useRealTimers();
    await flushPromises();
    expect(h.permCalls).toBe(1);
    expect(w.findAll(".entry").length).toBe(1);
    expect(JSON.parse(h.store.get(MERCHANT_PROFILE_KEY)!).permissions).toEqual(["album"]);
    expect(h.toasts).toContain("已刷新");
    // 只改权限：展示名/角色/系列列表保持登录快照
    const p = JSON.parse(h.store.get(MERCHANT_PROFILE_KEY)!);
    expect(p.displayName).toBe("A店");
    expect(p.shopList.length).toBe(1);
  });
  it("⭐401：走既有失效态（会话被作废、露出登录占位、提示登录已失效）（变异：401 不处理即红）", async () => {
    h.perm = () => ({ status: 401, code: 401, message: "expired" });
    const w = await mountHome();
    vi.useFakeTimers();
    h.pulls[0]();
    await vi.advanceTimersByTimeAsync(MIN_REFRESH_VISIBLE_MS + 50);
    vi.useRealTimers();
    await flushPromises();
    expect(h.toasts).toContain("登录已失效，请重新登录");
    expect(getMerchantRuntime().getState().loggedIn).toBe(false);
    expect(w.find(".hello").exists()).toBe(false);
  });
  it("⭐网络失败：保留旧权限快照并提示原因，不卡住（指示器收起、stop 照常）（变异：失败清空权限即红）", async () => {
    h.perm = () => "throw";
    const w = await mountHome();
    vi.useFakeTimers();
    h.pulls[0]();
    await vi.advanceTimersByTimeAsync(MIN_REFRESH_VISIBLE_MS + 50);
    vi.useRealTimers();
    await flushPromises();
    expect(JSON.parse(h.store.get(MERCHANT_PROFILE_KEY)!).permissions).toEqual(PROFILE.permissions);
    expect(w.findAll(".entry").length).toBe(4);
    expect(h.toasts.some((t) => t.includes("网络"))).toBe(true);
    expect(w.find(".indicator").attributes("data-show")).toBe("false");
    expect(h.stops).toBeGreaterThan(0);
    expect(getMerchantRuntime().getState().loggedIn).toBe(true);
  });
  it("⭐会话层：401 ⇒ refreshPermissions 返回 kind=auth-expired（不是泛化 failed），且会话已被作废（变异：401 走 failed 即红）", async () => {
    h.perm = () => ({ status: 401, code: 401, message: "expired" });
    const r = await getMerchantRuntime().refreshPermissions();
    expect(r).toMatchObject({ ok: false, kind: "auth-expired" });
    expect(getMerchantRuntime().getState().loggedIn).toBe(false);
  });
  it("会话层：网络失败 ⇒ kind=failed 且保留旧快照与会话", async () => {
    h.perm = () => "throw";
    const r = await getMerchantRuntime().refreshPermissions();
    expect(r).toMatchObject({ ok: false, kind: "failed" });
    expect(getMerchantRuntime().getState().loggedIn).toBe(true);
  });
  it("响应异常（permissions 非数组）：不覆盖本地快照", async () => {
    h.perm = () => ({ status: 200, code: 200, data: { role: "merchant" } });
    const w = await mountHome();
    vi.useFakeTimers();
    h.pulls[0]();
    await vi.advanceTimersByTimeAsync(MIN_REFRESH_VISIBLE_MS + 50);
    vi.useRealTimers();
    await flushPromises();
    expect(JSON.parse(h.store.get(MERCHANT_PROFILE_KEY)!).permissions).toEqual(PROFILE.permissions);
    expect(w.findAll(".entry").length).toBe(4);
  });
  it("刷新期间会话被换新（重新登录）：迟到响应不覆盖新会话的资料", async () => {
    const rt = getMerchantRuntime();
    h.perm = () => {
      // 请求在途时本地会话被替换为新 token
      h.store.set(MERCHANT_SESSION_KEY, JSON.stringify({ userId: "7", token: "NEW-TOKEN", platform: "mp-weixin", profileKey: "blueberry", authRevision: 2, kind: "full" }));
      return { status: 200, code: 200, data: { role: "merchant", permissions: ["album"] } };
    };
    const r = await rt.refreshPermissions();
    expect(r).toMatchObject({ ok: false, kind: "auth-expired" });
    expect(JSON.parse(h.store.get(MERCHANT_PROFILE_KEY)!).permissions).toEqual(PROFILE.permissions);
  });
  it("请求是受保护 GET：商家 client、带 authRequired（源码守卫）、不新增后端依赖（用既有 /auth/me/permissions）", () => {
    const s = read("src/pkg-merchant/infrastructure/merchant-auth.ts");
    expect(s).toMatch(/url: "\/auth\/me\/permissions",\s*authRequired: true,\s*replayPolicy: "idempotent"/);
  });
  it("⭐C 端 5 页共用的 use-pull-refresh 与共用 CustomNavBar 未被改动（工作区无差异由门禁 git diff 证明；这里守住关键签名）", () => {
    const s = read("src/composables/use-pull-refresh.ts");
    expect(s).toContain("export function createPullRefresh");
    expect(s).not.toMatch(/MIN_REFRESH|withMinDuration|setTimeout/);
  });
});

describe("⭐② 二级页标题栏改实底（登录页例外）", () => {
  const SECONDARY = ["home/index", "booking/list", "slot/list", "category/list", "album/list", "album/detail"];
  for (const f of SECONDARY) {
    it(`${f}：CustomNavBar 不再带 transparent（变异：加回即红）`, () => {
      const tags = [...read(`src/pkg-merchant/${f}.vue`).matchAll(/<CustomNavBar\b[^>]*>/g)].map((m) => m[0]);
      expect(tags.length).toBe(1);
      expect(tags[0]).not.toMatch(/\btransparent\b/);
    });
  }
  it("登录页白名单：保持 transparent（沉浸式背景，无滚动内容穿过）", () => {
    expect(read("src/pkg-merchant/login/index.vue")).toMatch(/<CustomNavBar title="商家登录" transparent \/>/);
  });
  it("商家端其余页面（含 components）都不得新增 transparent 的 CustomNavBar（登录页除外）", () => {
    for (const f of ["album/detail", "album/list", "booking/list", "category/list", "home/index", "slot/list"]) {
      expect(read(`src/pkg-merchant/${f}.vue`), f).not.toMatch(/<CustomNavBar[^>]*transparent/);
    }
  });
  it("⭐真实渲染：二级页导航栏根节点 class 不含 custom-navbar-transparent（相册列表挂载真实 CustomNavBar）", async () => {
    h.store.set(MERCHANT_PROFILE_KEY, JSON.stringify({ ...PROFILE, permissions: ["album", "category"] }));
    const w = mount(AlbumListPage, { global: { stubs: { ...GLOBAL.stubs } } });
    h.onLoad[h.onLoad.length - 1]?.();
    await flushPromises();
    const nav = w.findComponent(CustomNavBar);
    expect(nav.exists()).toBe(true);
    const root_ = nav.find(".custom-navbar");
    expect(root_.exists()).toBe(true);
    expect(root_.classes()).not.toContain("custom-navbar-transparent");
    // 对照：登录页仍是透明版（组件行为未变）
    const t = mount(CustomNavBar, { props: { title: "x", transparent: true } });
    expect(t.find(".custom-navbar").classes()).toContain("custom-navbar-transparent");
  });
  it("登录页在小屏 + 键盘弹起、内容滚动时不重叠：导航栏是 scroll-view 的前置兄弟（固定 + 占位在流内），滚动区在其下方（结构守卫）", () => {
    const s = read("src/pkg-merchant/login/index.vue");
    const tpl = s.slice(s.indexOf("<template>"));
    const navAt = tpl.indexOf("<CustomNavBar");
    const scrollAt = tpl.indexOf("<scroll-view");
    expect(navAt).toBeGreaterThan(0);
    expect(scrollAt).toBeGreaterThan(navAt);
    // 导航栏不在 scroll-view 之内
    expect(tpl.slice(scrollAt, tpl.indexOf("</scroll-view>"))).not.toContain("<CustomNavBar");
    // 共用组件：固定定位 + 流内占位 ⇒ 滚动区从导航栏下沿开始
    const nb = read("src/components/CustomNavBar/CustomNavBar.vue");
    expect(nb).toMatch(/\.custom-navbar \{[^}]*position: fixed/);
    expect(nb).toContain("<!-- 占位：撑开被 fixed 导航栏遮住的高度 -->");
  });
});

describe("⭐③④ 新建相册表单间距", () => {
  const src = read("src/pkg-merchant/album/list.vue");
  // 去掉注释再匹配：注释里会出现被断言的属性文字，否则「删掉真实属性」的变异会被注释蒙混过关
  const style = src.slice(src.indexOf("<style")).replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (sel: string) => {
    const i = style.indexOf(sel + " {");
    expect(i, "找不到样式 " + sel).toBeGreaterThanOrEqual(0);
    return style.slice(i, style.indexOf("}", i) + 1);
  };
  it("⭐④ 「所属分类」行 .pick-row 有 margin-bottom: $space-md（与 BaseField 字段间距同值），并排布局未被破坏（变异：去掉即红）", () => {
    const r = rule(".pick-row");
    expect(r).toContain("margin-bottom: $space-md");
    expect(r).toContain("display: flex");
    expect(r).toContain("flex-direction: row");
    expect(r).toContain("align-items: center");
    const bf = read("src/ui/BaseField.vue");
    expect(bf).toMatch(/\.base-field \{[^}]*margin-bottom: \$space-md/); // 同值口径
  });
  it("并排标签 .pick-label 保持原样（固定 180rpx 宽，供 .pick-row/.cover-row 行内对齐；不得被改成堆叠样式）", () => {
    const r = rule(".pick-label");
    expect(r).toContain("width: 180rpx");
    expect(r).toContain("flex-shrink: 0");
    expect(r).not.toContain("margin-bottom");
  });
  it("⭐③ 「照片（选填）」堆叠标签用新类 .field-label：margin-bottom: 12rpx（与 BaseField 标签同值）（变异：去掉/改回 pick-label 即红）", () => {
    expect(src).toContain('<text class="field-label">照片（选填）</text>');
    expect(src).not.toMatch(/<text class="pick-label">照片/);
    const r = rule(".field-label");
    expect(r).toContain("margin-bottom: 12rpx");
    expect(r).toContain("display: block");
    expect(r).toContain("font-size: $font-size-caption");
    expect(r).toContain("color: $color-text-secondary");
    expect(read("src/ui/BaseField.vue")).toMatch(/\.base-field__label \{[^}]*margin-bottom: 12rpx/);
  });
  it("真实渲染：新建表单里「所属分类」行与「价格」字段相邻，照片标签是 .field-label；封面行（编辑）仍是并排 pick-label", async () => {
    h.store.set(MERCHANT_PROFILE_KEY, JSON.stringify({ ...PROFILE, permissions: ["album", "category"] }));
    const w = mount(AlbumListPage, { global: { stubs: { ...GLOBAL.stubs } } });
    h.onLoad[h.onLoad.length - 1]?.();
    await flushPromises();
    // 分类树为空时「新建」只会提示；这里直接断言模板结构（源码级）即可
    const tpl = src.slice(src.indexOf("<template>"));
    expect(tpl.indexOf('class="pick-row"')).toBeLessThan(tpl.indexOf('label="价格(元)"'));
    expect(tpl).toMatch(/<view v-else class="cover-row">\s*<text class="pick-label">封面<\/text>/);
    expect(w.exists()).toBe(true);
  });
  it("同弹层其余堆叠标签排查：封面行是并排（pick-label 在 .cover-row 行内，无需 margin-bottom）；category 名称/排序走 BaseField；slot 弹层全是并排 form-row（含 picker 与输入混排，行间由 padding+分隔线承担）", () => {
    const cat = read("src/pkg-merchant/category/list.vue");
    expect(cat).toMatch(/<BaseField v-model="formName"/);
    expect(cat).toMatch(/<BaseField v-model="formSort"/);
    expect(cat).not.toMatch(/class="pick-label"/);
    const slot = read("src/pkg-merchant/slot/list.vue");
    const slotStyle = slot.slice(slot.indexOf("<style"));
    expect(slotStyle).toMatch(/\.form-row \{[^}]*flex-direction: row[^}]*padding: 24rpx 0[^}]*border-bottom/);
    expect(slotStyle).toMatch(/\.form-label \{[^}]*width: 180rpx/);
  });
});
