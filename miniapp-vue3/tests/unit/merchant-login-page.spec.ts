// 商家登录页（issue #14 · UX P0 批次1）：视觉守卫 / 记住账号 / 键盘避让 / 分享按钮与回调。
// 变异靶点：①账号存储键落到非商家命名空间 ②保存了密码 ③成功登录后不清密码 ④「清除」不清存储 ⑤去掉 adjust-position/cursor-spacing
//          ⑥分享按钮去掉 open-type=share ⑦页面不注册 onShareAppMessage/onShareTimeline ⑧分享路径改错 ⑨引入 backdrop-filter / 嵌套 CSS
//          ⑩logo 不再引用分包静态资源（或资源被放进主包 static）⑪SVG 含 <style>/<image>/<text> 等小程序不渲染的元素。
import { readFileSync, statSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  onShow: [] as Array<() => void>,
  share: [] as Array<() => unknown>,
  timeline: [] as Array<() => unknown>,
  store: new Map<string, string>(),
  reLaunches: [] as string[],
  loginResult: { token: "T9", adminId: 7, merchantId: 3, username: "shopA", role: "merchant", displayName: "A", shopList: [], permissions: ["album"] } as Record<string, unknown>,
  requests: [] as Array<{ url: string; body?: unknown; headers?: Record<string, string> }>,
  shareCard: { type: "share_card", items: [] as unknown[] },
}));
vi.mock("@dcloudio/uni-app", () => ({
  onShow: (fn: () => void) => h.onShow.push(fn),
  onLoad: () => undefined,
  onShareAppMessage: (fn: () => unknown) => h.share.push(fn),
  onShareTimeline: (fn: () => unknown) => h.timeline.push(fn),
}));
vi.mock("../../src/platform/uni/transport", () => ({
  createUniTransport: () => ({
    request: async (req: { url: string; body?: unknown; headers?: Record<string, string> }) => {
      h.requests.push({ url: req.url, body: req.body, headers: req.headers });
      const ok = (data: unknown) => ({ ok: true, value: { status: 200, businessCode: 200, message: undefined, requestId: null, data } });
      if (req.url === "/auth/login") return ok(h.loginResult);
      if (req.url === "/api/page-config") return ok([h.shareCard]);
      return ok([]);
    },
    cancel: () => undefined,
  }),
}));

import LoginPage from "../../src/pkg-merchant/login/index.vue";
import { __resetMerchantRuntime } from "../../src/pkg-merchant/application/merchant-runtime";
import { MERCHANT_LAST_LOGIN_NAME_KEY, MERCHANT_SESSION_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";
import { createLastLoginNameStore, LOGIN_CURSOR_SPACING, LOGIN_NAME_MAX } from "../../src/pkg-merchant/domain/merchant-login-ui";
import { MERCHANT_LOGIN_URL } from "../../src/domain/merchant-entry";
import type { StoragePort } from "../../src/ports/storage";

const root = resolve(__dirname, "../..");
const page = readFileSync(resolve(root, "src/pkg-merchant/login/index.vue"), "utf-8");
const style = page.slice(page.indexOf("<style"));
// BaseFeedback 桩需带 show()（登录成功后页面会 toast；`true` 桩没有 show 会抛错、吞掉 enterHome）
const FeedbackStub = defineComponent({ setup(_p, { expose }) { expose({ show: () => undefined }); return () => null; } });
const GLOBAL = { stubs: { CustomNavBar: true, PageFooter: true, BaseFeedback: FeedbackStub } };

function memStorage() {
  const data = new Map<string, string>();
  const s: StoragePort & { data: Map<string, string> } = { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
  return s;
}

beforeEach(() => {
  h.onShow.length = 0;
  h.share.length = 0;
  h.timeline.length = 0;
  h.store.clear();
  h.reLaunches.length = 0;
  h.requests.length = 0;
  h.shareCard.items = [];
  __resetMerchantRuntime();
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => h.store.set(k, v),
    removeStorageSync: (k: string) => h.store.delete(k),
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    getMenuButtonBoundingClientRect: () => ({ left: 280, width: 87 }),
    reLaunch: (o: { url: string }) => h.reLaunches.push(o.url),
    showToast: () => undefined,
    upx2px: (n: number) => n / 2,
  };
});

describe("⭐记住上次账号（只存用户名）", () => {
  it("键在商家命名空间 lm.merchant.*（与 C 端键空间零交集）（变异：键落到别处即红）", () => {
    expect(MERCHANT_LAST_LOGIN_NAME_KEY).toBe("lm.merchant.lastLoginName.v1");
    const b = memStorage();
    createLastLoginNameStore(b).save("shopA");
    expect([...b.data.keys()]).toEqual(["lm.merchant.lastLoginName.v1"]);
    expect([...b.data.keys()].some((k) => k.startsWith("lm.session") || k === "token")).toBe(false);
  });
  it("save/load/clear；trim；空白/超长不写入且不覆盖旧值；脏值读取 ⇒ ''", () => {
    const b = memStorage();
    const s = createLastLoginNameStore(b);
    expect(s.load()).toBe("");
    s.save("  shopA  ");
    expect(s.load()).toBe("shopA");
    s.save("   ");
    expect(s.load()).toBe("shopA");
    s.save("x".repeat(LOGIN_NAME_MAX + 1));
    expect(s.load()).toBe("shopA");
    s.clear();
    expect(s.load()).toBe("");
    b.data.set(MERCHANT_LAST_LOGIN_NAME_KEY, "   ");
    expect(s.load()).toBe("");
  });
});

describe("⭐登录页：回填账号 / 焦点 / 清除 / 密码不落盘", () => {
  it("有记住的账号：进页面回填账号、给密码框接上 focus 属性、出现「不是我的账号？清除」（变异：不回填即红）。⚠️ 仅验证属性接线；真聚焦（键盘是否弹起、光标位置）需真机", async () => {
    h.store.set(MERCHANT_LAST_LOGIN_NAME_KEY, "shopA");
    const w = mount(LoginPage, { global: GLOBAL });
    await flushPromises();
    const inputs = w.findAll(".form-input");
    expect((inputs[0].element as HTMLInputElement).value).toBe("shopA");
    // 这只是 Vue 把 :focus 写到 <input> 属性上的现象，**不是**真聚焦——happy-dom 没有软键盘/焦点环；真机行为未验
    expect((inputs[1].element as HTMLInputElement).focus).toBe(true);
    expect(w.find(".forget").exists()).toBe(true);
  });
  it("无记住账号：不回填、不给密码框接 focus 属性、无清除入口（属性接线，非真聚焦）", async () => {
    const w = mount(LoginPage, { global: GLOBAL });
    const inputs = w.findAll(".form-input");
    expect((inputs[0].element as HTMLInputElement).value).toBe("");
    expect((inputs[1].element as HTMLInputElement).focus).toBe(false);
    expect(w.find(".forget").exists()).toBe(false);
  });
  it("⭐点「清除」：清空输入与存储，入口消失（变异：不清存储即红）", async () => {
    h.store.set(MERCHANT_LAST_LOGIN_NAME_KEY, "shopA");
    const w = mount(LoginPage, { global: GLOBAL });
    await w.find(".forget").trigger("click");
    expect((w.findAll(".form-input")[0].element as HTMLInputElement).value).toBe("");
    expect(h.store.has(MERCHANT_LAST_LOGIN_NAME_KEY)).toBe(false);
    expect(w.find(".forget").exists()).toBe(false);
  });
  it("⭐清除后入口不再复现：清除 ⇒ 入口消失；再输入同名账号入口也不再出现（存储已清，显示与事实一致）（变异：入口回到「常量 === 输入」条件即红）", async () => {
    h.store.set(MERCHANT_LAST_LOGIN_NAME_KEY, "shopA");
    const w = mount(LoginPage, { global: GLOBAL });
    expect(w.find(".forget").exists()).toBe(true);
    await w.find(".forget").trigger("click");
    expect(w.find(".forget").exists()).toBe(false);
    await w.findAll(".form-input")[0].setValue("shopA"); // 再输入同名账号
    expect(w.find(".forget").exists()).toBe(false);
    expect(h.store.has(MERCHANT_LAST_LOGIN_NAME_KEY)).toBe(false);
  });
  it("有记住账号时：用户把输入改成别的名字，入口仍显示（存储里仍有记住账号，点清除可清）", async () => {
    h.store.set(MERCHANT_LAST_LOGIN_NAME_KEY, "shopA");
    const w = mount(LoginPage, { global: GLOBAL });
    await w.findAll(".form-input")[0].setValue("other");
    expect(w.find(".forget").exists()).toBe(true);
  });
  it("⭐焦点接线互斥：有记住账号 ⇒ 密码框 focus、账号框不 focus；点清除 ⇒ 改为账号框 focus、密码框不 focus（仅属性接线，真聚焦需真机）（变异：清除后仍聚焦密码框即红）", async () => {
    h.store.set(MERCHANT_LAST_LOGIN_NAME_KEY, "shopA");
    const w = mount(LoginPage, { global: GLOBAL });
    let inputs = w.findAll(".form-input");
    expect((inputs[0].element as HTMLInputElement).focus).toBe(false);
    expect((inputs[1].element as HTMLInputElement).focus).toBe(true);
    await w.find(".forget").trigger("click");
    inputs = w.findAll(".form-input");
    expect((inputs[0].element as HTMLInputElement).focus).toBe(true);
    expect((inputs[1].element as HTMLInputElement).focus).toBe(false);
  });
  it("无记住账号：两个输入框都不 focus（不抢焦点）", () => {
    const w = mount(LoginPage, { global: GLOBAL });
    const inputs = w.findAll(".form-input");
    expect((inputs[0].element as HTMLInputElement).focus).toBe(false);
    expect((inputs[1].element as HTMLInputElement).focus).toBe(false);
  });
  it("⭐登录成功：存用户名、绝不存密码、密码输入框被清空、跳工作台（变异：存密码/不清密码即红）", async () => {
    const w = mount(LoginPage, { global: GLOBAL });
    const inputs = w.findAll(".form-input");
    await inputs[0].setValue("shopA");
    await inputs[1].setValue("S3cretPwd!");
    await w.find(".submit").trigger("click");
    await flushPromises();
    await flushPromises();
    expect(h.store.get(MERCHANT_LAST_LOGIN_NAME_KEY)).toBe("shopA");
    for (const [k, v] of h.store) expect(v.includes("S3cretPwd!"), "密码泄漏到存储键 " + k).toBe(false);
    expect((w.findAll(".form-input")[1].element as HTMLInputElement).value).toBe("");
    expect(h.reLaunches).toContain("/pkg-merchant/home/index");
    expect(h.store.has(MERCHANT_SESSION_KEY)).toBe(true);
  });
  it("登录失败：不记住账号（避免记住打错的名字）；显示错误文案", async () => {
    h.loginResult = { token: "" } as Record<string, unknown>; // 无 token ⇒ 登录失败
    const w = mount(LoginPage, { global: GLOBAL });
    const inputs = w.findAll(".form-input");
    await inputs[0].setValue("typo-name");
    await inputs[1].setValue("pw");
    await w.find(".submit").trigger("click");
    await flushPromises();
    await flushPromises();
    expect(h.store.has(MERCHANT_LAST_LOGIN_NAME_KEY)).toBe(false);
    expect(w.find(".error").exists()).toBe(true);
    h.loginResult = { token: "T9", adminId: 7, merchantId: 3, username: "shopA", role: "merchant", displayName: "A", shopList: [], permissions: ["album"] };
  });
});

describe("⭐键盘避让", () => {
  it("两个输入框都带 adjust-position 与 cursor-spacing=20（变异：去掉即红）", () => {
    const w = mount(LoginPage, { global: GLOBAL });
    for (const i of w.findAll(".form-input")) {
      expect(i.attributes("adjust-position")).not.toBe("false");
      expect(i.attributes("adjust-position")).toBeDefined();
      expect(i.attributes("cursor-spacing")).toBe(String(LOGIN_CURSOR_SPACING));
    }
    expect(LOGIN_CURSOR_SPACING).toBe(20);
  });
  it("页面主体在纵向 scroll-view 内（小屏 + 键盘时可滚动）；页根 flex 列布局，footer 在滚动内容的末尾（吸底）", () => {
    expect(page).toMatch(/<scroll-view scroll-y class="scroller"/);
    expect(style).toMatch(/\.container \{[^}]*display: flex;[^}]*flex-direction: column/);
    expect(style).toMatch(/\.container \{[^}]*height: 100vh/);
    expect(page.indexOf("<PageFooter")).toBeGreaterThan(page.indexOf('class="card"'));
  });
});

describe("⭐分享：按钮 + 回调", () => {
  it("页内「分享给同事」是 <button open-type=share>，且重置了 button 默认样式（::after 无边框）（变异：去掉 open-type 即红）", () => {
    const w = mount(LoginPage, { global: GLOBAL });
    const b = w.find("button.share-btn");
    expect(b.exists()).toBe(true);
    expect(b.attributes("open-type")).toBe("share");
    expect(b.text()).toBe("分享给同事");
    expect(style).toMatch(/\.share-btn::after \{\s*border: none/);
    expect(style).toMatch(/\.share-btn \{[^}]*margin: 24rpx 0 0/);
    expect(style).toMatch(/\.share-btn \{[^}]*padding: 0/);
  });
  it("⭐注册 onShareAppMessage / onShareTimeline；路径固定为 /pkg-merchant/login/index；解析前即可同步取得默认卡片（变异：不注册/路径改错即红）", () => {
    mount(LoginPage, { global: GLOBAL });
    expect(h.share.length).toBe(1);
    expect(h.timeline.length).toBe(1);
    const app = h.share[0]() as { title: string; path: string; imageUrl: string };
    expect(app.path).toBe("/pkg-merchant/login/index");
    expect(app.path).toBe(MERCHANT_LOGIN_URL);
    expect(app.title).toBe("蓝梅旅拍 · 商家工作台");
    expect(app.imageUrl).toBe("");
    const tl = h.timeline[0]() as { title: string; query: string };
    expect(tl.title).toBe("蓝梅旅拍 · 商家工作台");
    expect(tl.query).toBe("");
  });
  it("配置下发后（OPS 槽位 merchantLogin）：标题与缩略图生效；发给 /api/page-config 的请求不带 Authorization、不带 X-Brand-Id（本用例的 mock 记录了传输层收到的 headers；头部由真实 client 生成的实证另见 merchant-footer.spec.ts:94）", async () => {
    h.shareCard.items = [{ bizName: "merchantLogin", title: "商家工作台 · 登录", imageUrl: "https://bkt.cos.ap-guangzhou.myqcloud.com/a/b.jpg" }];
    mount(LoginPage, { global: GLOBAL });
    for (let i = 0; i < 6; i++) await flushPromises();
    const app = h.share[0]() as { title: string; imageUrl: string };
    expect(app.title).toBe("商家工作台 · 登录");
    expect(app.imageUrl).toBe("https://www.lanmei66.cloud/a/b.jpg?imageMogr2/thumbnail/500x/format/jpg");
    const pc = h.requests.filter((r) => r.url === "/api/page-config");
    expect(pc.length).toBeGreaterThan(0);
    for (const r of pc) {
      expect(r.headers?.Authorization, "分享/footer 的公开接口不得带商家 token").toBeUndefined();
      expect("X-Brand-Id" in (r.headers ?? {})).toBe(false);
    }
  });
});

describe("⭐视觉守卫（源码级）", () => {
  it("背景三层（顶部径向光晕 + 底部微光 + 极淡斜纹）全部为纯 CSS 渐变，无背景图片（变异：去掉光晕即红）", () => {
    expect(style).toMatch(/\.bg-glow-top \{[^}]*radial-gradient/);
    expect(style).toMatch(/\.bg-glow-bottom \{[^}]*radial-gradient/);
    expect(style).toMatch(/\.bg-stripes \{[^}]*repeating-linear-gradient/);
    expect(style).not.toMatch(/url\(/);
  });
  it("卡片质感：半透明底 + 2rpx 金描边 + 内阴影；不依赖 backdrop-filter（变异：引入即红）", () => {
    expect(style).toMatch(/\.card \{[^}]*background: rgba\(/);
    expect(style).toMatch(/\.card \{[^}]*border: 2rpx solid rgba\(241, 205, 145/);
    expect(style).toMatch(/\.card \{[^}]*box-shadow: inset/);
    expect(style).not.toContain("backdrop-filter");
  });
  it("入场动效：淡入 + 上移，240ms", () => {
    expect(style).toMatch(/\.card \{[^}]*animation: login-card-in 240ms ease-out/);
    expect(style).toMatch(/@keyframes login-card-in \{[\s\S]*opacity: 0;[\s\S]*translateY\(24rpx\)[\s\S]*opacity: 1/);
  });
  it("不嵌套 CSS：.a { .b { } } 禁止；色值只能用 token 变量或 rgba/渐变先例（无裸十六进制，除既有金渐变与错误红）", () => {
    // 去注释后按花括号深度检查：任何规则体内再出现 `{` 视为嵌套（@keyframes 的 from/to 是 at-rule 内部，允许）
    const css = style.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^<style[^>]*>/, "").replace(/<\/style>\s*$/, "");
    let depth = 0;
    let max = 0;
    let inKeyframes = false;
    for (let i = 0; i < css.length; i++) {
      if (css.startsWith("@keyframes", i)) inKeyframes = true;
      if (css[i] === "{") {
        depth++;
        if (!inKeyframes) max = Math.max(max, depth);
      } else if (css[i] === "}") {
        depth--;
        if (depth === 0) inKeyframes = false;
      }
    }
    expect(max).toBe(1);
    const hex = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
    // 允许：既有金色主按钮渐变三端点、错误红（全仓先例）
    const allowed = new Set(["#ffdf9f", "#f1cd91", "#d9a75c", "#ff6b6b"]);
    expect(hex.filter((x) => !allowed.has(x))).toEqual([]);
  });
  it("品牌区：logo + 品牌名（PROFILE.brandName）+ slogan（SLOGAN_DEFAULT 常量复用）", () => {
    const w = mount(LoginPage, { global: GLOBAL });
    expect(w.find(".brand-logo").exists()).toBe(true);
    expect(w.find(".brand-name").text()).toBe("蓝梅旅拍");
    expect(w.find(".brand-slogan").text()).toBe("蓝梅，让世界看见东方美");
    expect(page).toContain("SLOGAN_DEFAULT");
  });
});

describe("⭐Logo 资源（服务端 darkmode SVG）：在分包内、体积预算内、仅含小程序可渲染元素", () => {
  const svgPath = resolve(root, "src/pkg-merchant/static/darkmode_web_logo.svg");
  const svg = existsSync(svgPath) ? readFileSync(svgPath, "utf-8") : "";
  it("页面引用分包静态资源全路径；资源在 pkg-merchant/static，不在主包 src/static（变异：搬进主包即红）", () => {
    expect(page).toContain('"/pkg-merchant/static/darkmode_web_logo.svg"');
    expect(existsSync(svgPath)).toBe(true);
    expect(existsSync(resolve(root, "src/static/darkmode_web_logo.svg"))).toBe(false);
    expect(existsSync(resolve(root, "src/static/lightmode_web_logo.svg"))).toBe(false); // 不拷 lightmode 版
    expect(existsSync(resolve(root, "src/pkg-merchant/static/lightmode_web_logo.svg"))).toBe(false);
  });
  it("体积 ≤ 25KB（原件 18,922 B）", () => {
    expect(statSync(svgPath).size).toBeLessThanOrEqual(25 * 1024);
  });
  it("与服务端原文件逐字节一致（保留原图形/版权信息，不改内容）", () => {
    const src = resolve(root, "../../lanmei-backend-golang/admin-web/src/assets/brand/darkmode_web_logo.svg");
    if (!existsSync(src)) return; // CI 无后端仓时跳过对照，仍受下面的元素守卫约束
    expect(readFileSync(svgPath, "utf-8")).toBe(readFileSync(src, "utf-8"));
  });
  it("微信 <image> 渲染 SVG 的限制守卫：只含 <svg>+<path>，无 <style>/<text>/<image>/<filter>/<foreignObject>/外部引用/script（变异：加入即红）", () => {
    expect(svg).toMatch(/^<svg\b/);
    const tags = [...svg.matchAll(/<([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
    expect([...new Set(tags)].sort()).toEqual(["path", "svg"]);
    for (const bad of ["<style", "<text", "<image", "<filter", "<foreignObject", "<script", "xlink:href", "href=", "url(http"]) expect(svg.includes(bad), bad).toBe(false);
  });
  it("长宽比与 viewBox(98×172) 一致：150rpx × 263rpx", () => {
    expect(svg).toContain('viewBox="0 0 98 172"');
    expect(style).toMatch(/\.brand-logo \{\s*width: 150rpx;\s*height: 263rpx;/);
    expect(Math.abs(150 / 263 - 98 / 172)).toBeLessThan(0.005);
  });
});
