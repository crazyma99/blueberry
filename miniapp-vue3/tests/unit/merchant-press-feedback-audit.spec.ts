// 商家端「按压反馈一致性」巡检守卫（issue #14 · UX P0 批次2-⑥；2026-11 CR 修订：补盲区）：
// 凡是带 @click（含 @click.stop 等修饰符）的可点元素，都必须有 hover-class="press-dim"（App.vue 全局按压类）；
// 提交类按钮必须有忙碌态。
//
// 修订记录（CR 🟡2）：旧版守卫有三处盲区，都会让「缺按压反馈」假绿：
//   ① 标签正则 `<(view|button)\b[^>]*>` 遇到属性值里的 `>`（如 v-if="partial.failed > 0"）会提前截断，其后的 @click 扫不到
//      ⇒ 改成「能跳过引号内 >」的标签解析（见 parseTags）；
//   ② `@click.stop` 被整体豁免 ⇒ 取消模糊豁免，.stop 也是可点元素，必须有 hover-class，确有理由的只能进下面的显式白名单；
//   ③ 只扫 view/button ⇒ 扩展到 text / image / scroll-view 与自定义组件（PascalCase）上的 @click。
//
// 能力边界（如实说明，不要把本守卫当成行为级保护）：这是**源码级静态扫描**——证明「模板里每个可点元素声明了按压类」，
// 不证明运行时按压效果；动态属性（:hover-class="…"）按「声明了」处理。「忙碌态」几条断言是对**渲染结果**做的（挂载真实页面、
// 把 busy 状态置位后看样式类/文案），不是字符串匹配。
// 变异靶点：删掉任一元素的 hover-class ⇒ 红；改回旧标签正则 ⇒ 专门用例红；恢复 .stop 豁免 ⇒ photo-remove 用例红；删掉忙碌态 ⇒ 红。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const root = resolve(__dirname, "../..");
function vueFiles(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...vueFiles(p));
    else if (n.endsWith(".vue")) out.push(p);
  }
  return out;
}
const files = vueFiles(resolve(root, "src/pkg-merchant"));
const rel = (f: string) => f.slice(root.length + 1).split("\\").join("/");

/**
 * 解析模板里的开始标签（含多行属性）。手写小状态机：在引号内遇到的 `>` 不算标签结束。
 * 只返回 tagName 满足 `want` 的标签的原文。
 */
export function parseTags(tpl: string, want: (name: string) => boolean): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tpl.length) {
    const lt = tpl.indexOf("<", i);
    if (lt < 0) break;
    const m = /^<([A-Za-z][\w-]*)/.exec(tpl.slice(lt, lt + 64));
    if (m == null) {
      i = lt + 1;
      continue;
    }
    let j = lt + m[0].length;
    let quote = "";
    while (j < tpl.length) {
      const c = tpl[j];
      if (quote !== "") {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
      j++;
    }
    if (want(m[1])) out.push(tpl.slice(lt, j + 1));
    i = j + 1;
  }
  return out;
}

/** 允许没有 hover-class 的点击元素：**显式白名单 + 理由**（匹配标签原文的特征片段）。新增 = 先过评审 */
export const EXEMPT: Array<{ file: string; match: RegExp; reason: string }> = [
  // 当前无：全部可点元素均已带 hover-class。自定义组件（PascalCase）的点击反馈若由组件内部负责，在此登记并写理由。
];

const isClickable = (name: string) => /^(view|button|text|image|scroll-view)$/.test(name) || /^[A-Z]/.test(name);
const hasClick = (t: string) => /@click(\.[a-z]+)*=/.test(t);
const hasPress = (t: string) => /hover-class="press-dim"/.test(t);

export function findMissingPress(tpl: string, file = ""): string[] {
  return parseTags(tpl, isClickable).filter((t) => hasClick(t) && !hasPress(t) && !EXEMPT.some((e) => (e.file === "" || e.file === file) && e.match.test(t)));
}
const templateOf = (src: string) => src.slice(src.indexOf("<template>"), src.lastIndexOf("</template>")).replace(/<!--[\s\S]*?-->/g, "");

describe("⭐可点元素都有 hover-class=press-dim（含 @click.stop；扫 view/button/text/image/scroll-view/自定义组件）", () => {
  for (const f of files) {
    it(rel(f), () => {
      const bad = findMissingPress(templateOf(readFileSync(f, "utf-8")), rel(f));
      expect(bad, rel(f) + " 有可点元素缺少 hover-class=\"press-dim\"：\n" + bad.join("\n")).toEqual([]);
    });
  }
  it("至少扫到 5 个以上页面（防空跑）", () => expect(files.length).toBeGreaterThan(5));
  it("白名单条目必须写明理由（防模糊豁免）", () => {
    for (const e of EXEMPT) expect(e.reason.trim().length).toBeGreaterThan(5);
  });
});

describe("⭐守卫自身的回归（防再出现盲区）", () => {
  it("引号内的 `>` 不截断标签：v-if=\"a > 0\" 后面的 @click 仍被扫到，缺 hover-class 必须报出（变异：改回旧正则 [^>]* 即红）", () => {
    const tpl = `<view v-if="partial.failed > 0" class="x" @click="go"><text>t</text></view>`;
    expect(findMissingPress(tpl)).toHaveLength(1);
    // 对照：带了 hover-class 则通过
    expect(findMissingPress(`<view v-if="a > 0" hover-class="press-dim" @click="go"></view>`)).toHaveLength(0);
    // 旧正则确实会漏（证明用例有区分力）
    const oldRe = /<(view|button)\b[^>]*>/g;
    const oldHit = [...tpl.matchAll(oldRe)].map((m) => m[0]).filter((t) => hasClick(t) && !hasPress(t));
    expect(oldHit).toHaveLength(0);
  });
  it("单引号、多行属性、引号内多个 > 都能正确解析", () => {
    const tpl = `<view\n  :class="a > 1 ? 'b' : 'c'"\n  :title='x > y'\n  @click="go"\n>t</view>`;
    expect(findMissingPress(tpl)).toHaveLength(1);
  });
  it("⭐@click.stop 不再被整体豁免：缺 hover-class 必须报出（变异：恢复 .stop 豁免即红）", () => {
    expect(findMissingPress(`<view class="photo-remove" @click.stop="onRemove"><text>x</text></view>`)).toHaveLength(1);
    expect(findMissingPress(`<view class="photo-remove" hover-class="press-dim" @click.stop="onRemove"></view>`)).toHaveLength(0);
  });
  it("扩展覆盖：text / image / scroll-view / 自定义组件上的 @click 也被扫描", () => {
    expect(findMissingPress(`<text @click="a">x</text>`)).toHaveLength(1);
    expect(findMissingPress(`<image src="a" @click="a" />`)).toHaveLength(1);
    expect(findMissingPress(`<scroll-view @click="a"></scroll-view>`)).toHaveLength(1);
    expect(findMissingPress(`<MyCard @click="a" />`)).toHaveLength(1);
    expect(findMissingPress(`<text hover-class="press-dim" @click="a">x</text>`)).toHaveLength(0);
  });
  it("白名单是显式的：命中 file+特征才放行，其余照报", () => {
    const tpl = `<view class="special" @click="a"></view>`;
    const saved = EXEMPT.length;
    EXEMPT.push({ file: "x.vue", match: /class="special"/, reason: "测试用：由父级承担按压反馈" });
    try {
      expect(findMissingPress(tpl, "x.vue")).toHaveLength(0);
      expect(findMissingPress(tpl, "y.vue")).toHaveLength(1);
    } finally {
      EXEMPT.length = saved;
    }
  });
  it("真实页面的 photo-remove（@click.stop）已补 hover-class（此前被 .stop 豁免漏掉）", () => {
    const tpl = templateOf(readFileSync(resolve(root, "src/pkg-merchant/album/list.vue"), "utf-8"));
    const t = parseTags(tpl, (n) => n === "view").find((x) => x.includes("photo-remove"));
    expect(t).toBeDefined();
    expect(t).toMatch(/hover-class="press-dim"/);
    expect(t).toMatch(/@click\.stop=/);
  });
});

// ───────── 忙碌态：对渲染结果断言（挂载真实页面） ─────────
const h = vi.hoisted(() => ({
  onLoad: [] as Array<(o?: Record<string, unknown>) => void>,
  onShow: [] as Array<() => void>,
  store: new Map<string, string>(),
  loginGate: null as null | Promise<void>,
  createGate: null as null | Promise<void>,
  loginCalls: 0,
  createCalls: 0,
}));
vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoad.push(fn),
  onShow: (fn: () => void) => h.onShow.push(fn),
  onHide: () => undefined,
  onReachBottom: () => undefined,
  onPullDownRefresh: () => undefined,
  onShareAppMessage: () => undefined,
  onShareTimeline: () => undefined,
}));
vi.mock("../../src/platform/uni/transport", () => ({
  createUniTransport: () => ({
    request: async (req: { url: string }) => {
      if (req.url === "/auth/login") h.loginCalls++;
      if (req.url === "/shop/parent/create") h.createCalls++;
      if (req.url === "/auth/login" && h.loginGate != null) await h.loginGate;
      if (req.url === "/shop/parent/create" && h.createGate != null) await h.createGate;
      const ok = (data: unknown) => ({ ok: true, value: { status: 200, businessCode: 200, message: undefined, requestId: null, data } });
      if (req.url === "/auth/login") return ok({ token: "T", adminId: 7, merchantId: 3, username: "a", role: "merchant", displayName: "A", shopList: [], permissions: ["album"] });
      if (req.url === "/shop/parent/create") return ok({ id: 6, name: "x", sortOrder: 0, shopId: 1, parentId: 0, depth: 1 });
      if (req.url === "/shop/parent/list") return ok([{ id: 5, name: "外景", sortOrder: 0, shopId: 1, parentId: 0, depth: 1 }]);
      if (req.url === "/shop/sub/get-by-parent") return ok([{ id: 9, name: "海边", sortOrder: 0, shopId: 1, parentId: 5, depth: 2 }]);
      return ok([]);
    },
    cancel: () => undefined,
  }),
}));

import { defineComponent, h as vh } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import LoginPage from "../../src/pkg-merchant/login/index.vue";
import CategoryPage from "../../src/pkg-merchant/category/list.vue";
import { __resetMerchantRuntime } from "../../src/pkg-merchant/application/merchant-runtime";
import { MERCHANT_PROFILE_KEY, MERCHANT_SESSION_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";

const FeedbackStub = defineComponent({ setup(_p, { expose }) { expose({ show: () => undefined }); return () => null; } });
const PopupSpy = defineComponent({ name: "BasePopup", props: ["show"], emits: ["cancel"], setup: (p, { slots }) => () => (p.show ? vh("div", { class: "popup-spy" }, slots.default?.()) : null) });
function setup() {
  h.onLoad.length = 0;
  h.onShow.length = 0;
  h.store.clear();
  h.loginGate = null;
  h.createGate = null;
  h.loginCalls = 0;
  h.createCalls = 0;
  __resetMerchantRuntime();
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => h.store.set(k, v),
    removeStorageSync: (k: string) => h.store.delete(k),
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    getMenuButtonBoundingClientRect: () => ({ left: 280, width: 87 }),
    reLaunch: () => undefined,
    showToast: () => undefined,
    stopPullDownRefresh: () => undefined,
    upx2px: (x: number) => x / 2,
  };
}

describe("⭐提交类按钮的忙碌态（对渲染结果断言：挂载真实页面、让请求悬停，看样式类/文案/防重复）", () => {
  it("登录页：点登录 ⇒ 请求在途期间按钮带 is-busy、文案「登录中...」；忙碌中再点不重复发请求；结束后恢复（变异：删忙碌态/防重入即红）", async () => {
    setup();
    let release: () => void = () => undefined;
    h.loginGate = new Promise<void>((r) => { release = r; });
    const w = mount(LoginPage, { global: { stubs: { CustomNavBar: true, PageFooter: true, BaseFeedback: FeedbackStub } } });
    const inputs = w.findAll(".form-input");
    await inputs[0].setValue("a");
    await inputs[1].setValue("p");
    await w.find(".submit").trigger("click");
    await flushPromises();
    expect(w.find(".submit").classes()).toContain("is-busy");
    expect(w.find(".submit-text").text()).toBe("登录中...");
    await w.find(".submit").trigger("click"); // 忙碌中再点
    await flushPromises();
    expect(h.loginCalls).toBe(1);
    release();
    for (let i = 0; i < 4; i++) await flushPromises();
    expect(w.find(".submit-text").text()).toBe("登录");
    expect(w.find(".submit").classes()).not.toContain("is-busy");
  });
  it("分类页新增弹层：创建请求在途 ⇒ 提交按钮带 is-disabled、文案「提交中...」；忙碌中再点不重复发请求；结束后弹层关闭（变异：删忙碌态/防重入即红）", async () => {
    setup();
    h.store.set(MERCHANT_SESSION_KEY, JSON.stringify({ userId: "7", token: "T", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }));
    h.store.set(MERCHANT_PROFILE_KEY, JSON.stringify({ adminId: 7, merchantId: 1, username: "a", role: "merchant", displayName: "A", roleName: "", permissions: ["category"], shopList: [{ id: 1, name: "A", merchantName: "", status: 1 }] }));
    const w = mount(CategoryPage, { global: { stubs: { PullRefreshIndicator: true, BaseFeedback: FeedbackStub, BaseDialog: true, PageFooter: true, CustomNavBar: true, MerchantNeedLogin: true, BasePopup: PopupSpy, BasePicker: true, SkeletonBlock: true } } });
    h.onLoad[h.onLoad.length - 1]?.();
    for (let i = 0; i < 4; i++) await flushPromises();
    await w.find(".add").trigger("click");
    await flushPromises();
    await w.findAll(".base-field__input")[0].trigger("input", { detail: { value: "新一级" } }); // 真实 BaseField 的原生 input 事件载荷
    let release: () => void = () => undefined;
    h.createGate = new Promise<void>((r) => { release = r; });
    expect(w.find(".sheet-btn").classes()).not.toContain("is-disabled");
    expect(w.find(".sheet-btn-text").text()).toBe("确定");
    await w.find(".sheet-btn").trigger("click");
    await flushPromises();
    expect(w.find(".sheet-btn").classes()).toContain("is-disabled");
    expect(w.find(".sheet-btn-text").text()).toBe("提交中...");
    await w.find(".sheet-btn").trigger("click");
    await flushPromises();
    expect(h.createCalls).toBe(1);
    release();
    for (let i = 0; i < 6; i++) await flushPromises();
    expect(w.find(".sheet-title").exists()).toBe(false); // 成功后弹层关闭
  });
});
