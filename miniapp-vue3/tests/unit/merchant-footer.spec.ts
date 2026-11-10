// 商家端 footer 单测（issue #14 · M2 第一批）：AppFooter solo 修饰 / C 端零变化 / 加载器兜底与会话边界 / 每个商家页都渲染 PageFooter。
// 变异靶点：①solo 判定放宽到「副行非空」（C 端主行非空也变 solo）②加载器失败不兜底 ③加载器设 authRequired（会带商家 token 去 C 端接口）
//          ④某商家页去掉 PageFooter ⑤某页给主行传了文案 ⑥商家 footer 带 X-Brand-Id（brandId 非空）。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AppFooter from "../../src/components/AppFooter/AppFooter.vue";
import PageFooter from "../../src/components/PageFooter/PageFooter.vue";
import { createMerchantFooterLoader } from "../../src/pkg-merchant/composables/use-merchant-footer";
import { FOOTER_SUPPORT_DEFAULT } from "../../src/application/page-config-content";
import type { ClientRequestInput, ClientResult } from "../../src/infrastructure/http/client";
import type { RequestContext } from "../../src/ports/context";

const root = resolve(__dirname, "../..");
const ctx = { requestId: "r" } as RequestContext;
const profile = { copyrightText: "Copyright 版权主行", contactQrSrc: "", contactPhoneText: "" };
function fakeClient(responder: (i: ClientRequestInput) => ClientResult<unknown> | Promise<ClientResult<unknown>>) {
  const seen: ClientRequestInput[] = [];
  return { seen, client: { request: async <T,>(i: ClientRequestInput) => { seen.push(i); return (await responder(i)) as ClientResult<T>; } } };
}

describe("AppFooter solo 修饰（主行空 + 副行非空）", () => {
  it("⭐solo：主行空且副行非空 ⇒ 副行挂 footer-support--solo（去掉空主行上方的间距）", () => {
    const w = mount(AppFooter, { props: { mainLine: "", supportLine: "技术支持行" } });
    expect(w.find(".footer-support").classes()).toContain("footer-support--solo");
  });
  it("⭐C 端零变化：主行非空 ⇒ 绝不 solo（变异：solo 放宽即红）", () => {
    const w = mount(AppFooter, { props: { mainLine: "版权主行", supportLine: "技术支持行" } });
    expect(w.find(".footer-support").classes()).not.toContain("footer-support--solo");
    expect(w.find(".footer-support").classes()).toEqual(["footer-support"]);
  });
  it("两行都空（loading 期）/ 只有主行：不 solo；DOM 结构（两个 text、类名）与改动前一致", () => {
    for (const props of [{ mainLine: "", supportLine: "" }, { mainLine: "只有主行", supportLine: "" }]) {
      const w = mount(AppFooter, { props });
      expect(w.find(".footer-support").classes()).toEqual(["footer-support"]);
      expect(w.findAll("text").length).toBe(2);
      expect(w.find(".footer-main").exists()).toBe(true);
    }
  });
  it("PageFooter 透传：主行空 + 副行 ⇒ 分隔线仍出现（hasText 以任一行非空为闸）且副行 solo；C 端两行都有 ⇒ 不 solo", () => {
    const solo = mount(PageFooter, { props: { mainLine: "", supportLine: "支持行" } });
    expect(solo.find(".divide").exists()).toBe(true);
    expect(solo.find(".footer-support").classes()).toContain("footer-support--solo");
    const c = mount(PageFooter, { props: { mainLine: "版权行", supportLine: "支持行" } });
    expect(c.find(".footer-support").classes()).not.toContain("footer-support--solo");
  });
  it("样式：solo 规则是平铺复合选择器（特异性高于 .footer-support，不嵌套），且 margin-top:0", () => {
    const src = readFileSync(resolve(root, "src/components/AppFooter/AppFooter.vue"), "utf-8");
    expect(src).toMatch(/\.footer-support\.footer-support--solo\s*\{\s*margin-top:\s*0;/);
    // C 端基线规则原样保留
    expect(src).toMatch(/\.footer-support\s*\{\s*margin-top:\s*8rpx;/);
  });
});

describe("商家 footer 加载器（公开接口 · 商家 client · 无 token · 无品牌头）", () => {
  it("⭐请求：GET /api/page-config，**不设 authRequired**（不向 C 端接口发商家 token；变异：设 authRequired 即红）", async () => {
    const f = fakeClient(() => ({ ok: true, value: [{ type: "copyright", config: JSON.stringify({ text: "OPS 主行", supportText: "OPS 支持行" }) }] }));
    await createMerchantFooterLoader({ client: f.client, profile }).loadSupportLine(ctx);
    expect(f.seen.length).toBe(1);
    expect(f.seen[0]).toMatchObject({ method: "GET", url: "/api/page-config" });
    expect(f.seen[0].authRequired).toBeUndefined();
  });
  it("只取 supportLine：OPS 有副行 ⇒ 用 OPS；主行（OPS/Profile）一律不返回给页面", async () => {
    const f = fakeClient(() => ({ ok: true, value: [{ type: "copyright", config: JSON.stringify({ text: "OPS 主行", supportText: "OPS 支持行" }) }] }));
    const line = await createMerchantFooterLoader({ client: f.client, profile }).loadSupportLine(ctx);
    expect(line).toBe("OPS 支持行");
    expect(line).not.toContain("主行");
  });
  it("⭐兜底：OPS 无副行 / 接口失败 / 抛异常 / 畸形配置 ⇒ FOOTER_SUPPORT_DEFAULT，永不抛（变异：不兜底即红）", async () => {
    const cases: Array<() => ClientResult<unknown> | Promise<ClientResult<unknown>>> = [
      () => ({ ok: true, value: [{ type: "copyright", config: JSON.stringify({ text: "仅主行" }) }] }),
      () => ({ ok: true, value: [] }),
      () => ({ ok: true, value: [{ type: "copyright", config: "{坏JSON" }] }),
      () => ({ ok: false, error: { kind: "NETWORK", businessCode: null, message: "x", requestId: null, retryable: true } }),
      () => ({ ok: false, error: { kind: "BUSINESS", businessCode: 500, message: "品牌不存在或已停用", requestId: null, retryable: false } }),
      () => { throw new Error("boom"); },
    ];
    for (const c of cases) {
      const f = fakeClient(c);
      await expect(createMerchantFooterLoader({ client: f.client, profile }).loadSupportLine(ctx)).resolves.toBe(FOOTER_SUPPORT_DEFAULT);
    }
  });
  it("⭐外层兜底（加载器自己的一层）：内容源抛异常 ⇒ 默认文案；内容源返回纯空白副行 ⇒ 默认文案（变异：外层 catch 重抛 / 去掉 trim 兜底即红）", async () => {
    const throwing = { loadFooter: async () => { throw new TypeError("content source exploded"); } };
    await expect(createMerchantFooterLoader({ client: fakeClient(() => ({ ok: true, value: [] })).client, content: throwing }).loadSupportLine(ctx)).resolves.toBe(FOOTER_SUPPORT_DEFAULT);
    const blank = { loadFooter: async () => ({ mainLine: "", supportLine: "   " }) };
    await expect(createMerchantFooterLoader({ client: fakeClient(() => ({ ok: true, value: [] })).client, content: blank }).loadSupportLine(ctx)).resolves.toBe(FOOTER_SUPPORT_DEFAULT);
    const empty = { loadFooter: async () => ({ mainLine: "x", supportLine: "" }) };
    await expect(createMerchantFooterLoader({ client: fakeClient(() => ({ ok: true, value: [] })).client, content: empty }).loadSupportLine(ctx)).resolves.toBe(FOOTER_SUPPORT_DEFAULT);
    const good = { loadFooter: async () => ({ mainLine: "不应出现", supportLine: "正常副行" }) };
    await expect(createMerchantFooterLoader({ client: fakeClient(() => ({ ok: true, value: [] })).client, content: good }).loadSupportLine(ctx)).resolves.toBe("正常副行");
  });
  it("⭐独立会话下实际发出的请求：带商家 runtime 上下文（brandId 恒 null）⇒ 不带 X-Brand-Id、不带 Authorization", async () => {
    const { createMerchantSession } = await import("../../src/pkg-merchant/application/merchant-session");
    const seen: Array<{ headers?: Readonly<Record<string, string>>; url: string }> = [];
    const m = createMerchantSession({
      backend: { get: () => null, set: () => {}, remove: () => {} },
      transport: { request: async <T,>(req: never) => { seen.push(req as never); return { ok: true, value: { status: 200, businessCode: 200, requestId: null, data: [] as T } }; }, cancel: () => {} } as never,
      platform: "mp-weixin", environment: "trial", profileKey: "blueberry", appCode: "blueBerry",
    });
    await createMerchantFooterLoader({ client: m.client, profile }).loadSupportLine(m.nextContext());
    expect(seen[0].url).toBe("/api/page-config");
    expect(seen[0].headers?.Authorization).toBeUndefined();
    expect("X-Brand-Id" in (seen[0].headers ?? {})).toBe(false);
  });
});

describe("⭐每个商家页都渲染 PageFooter（主行空、副行取兜底链）", () => {
  function pageFiles(dir: string, out: string[] = []): string[] {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) pageFiles(p, out);
      else if (p.split("\\").join("/").match(/pkg-merchant\/[^/]+\/[^/]+\.vue$/) && !p.split("\\").join("/").includes("/components/")) out.push(p);
    }
    return out;
  }
  const strip = (s: string) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const pages = pageFiles(resolve(root, "src/pkg-merchant"));

  it("枚举到的商家页 ⊇ 现有四页（防枚举失效导致空跑）", () => {
    const names = pages.map((p) => p.split("\\").join("/").split("pkg-merchant/")[1]).sort();
    for (const need of ["booking/list.vue", "home/index.vue", "login/index.vue", "slot/list.vue"]) expect(names).toContain(need);
  });
  it("⭐每一页：import PageFooter、useMerchantFooter；模板里有 <PageFooter main-line=\"\" :support-line=\"footer.supportLine.value\"（变异：去掉任一页/给主行传文案即红）", () => {
    for (const p of pages) {
      const code = strip(readFileSync(p, "utf-8"));
      const tpl = code.slice(code.indexOf("<template>"));
      expect(code, p).toContain('import PageFooter from "../../components/PageFooter/PageFooter.vue"');
      expect(code, p).toContain("useMerchantFooter()");
      expect(tpl, p).toMatch(/<PageFooter\s+main-line=""\s+:support-line="footer\.supportLine\.value"/);
      expect(tpl.match(/<PageFooter/g)?.length, p + " 只能有一个 footer").toBe(1);
    }
  });
  it("页面根是 flex 列布局（PageFooter 的 margin-top:auto 吸底依赖它）", () => {
    for (const p of pages) {
      const src = readFileSync(p, "utf-8");
      expect(src, p).toMatch(/\.container\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/);
    }
  });
  it("footer 在页面根内最后的位置之一（BaseFeedback/BaseDialog 之前或之后均可），且不被 position:fixed 底部条遮挡——本批四页均无固定底部条", () => {
    for (const p of pages) expect(strip(readFileSync(p, "utf-8")), p).not.toMatch(/position:\s*fixed;[^}]*bottom:/);
  });
});
