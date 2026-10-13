// T71（2026-10-13 主人报障 · 表1 #25「首页底部，长按客服二维码，无反应」）：
// 修复形态＝**确定性地弹出可扫码大图**（点击或长按都触发），不再只依赖 show-menu-by-longpress 的原生菜单。
// 本 spec 守卫三件事：
//   ① 预览地址取**原图**（不是 cosThumb 的 300px WebP 缩略）——纯函数 qrPreviewUrl；
//   ② 组件接线：微信端 click / longpress 都调 uni.previewImage 且传原图；抖音端不渲染二维码⇒不可达；
//   ③ 防回退：源码里预览链路必须走 qrPreviewUrl、且保留 show-menu-by-longpress（加分项）+ 新文案。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { qrPreviewUrl } from "../../src/application/image";
import ServiceContact from "../../src/components/ServiceContact/ServiceContact.vue";
import { setUiPlatformOverride } from "../../src/ui/ui-platform";

const QR_ORIGIN = "https://www.lanmei66.cloud/admin/admin20250928234704_495_147.png";
const QR_THUMB = QR_ORIGIN + "?imageMogr2/format/webp/thumbnail/300x";

interface PreviewCall { urls: string[]; current?: string }
const previews: PreviewCall[] = [];
const toasts: string[] = [];
let previewAvailable = true;

beforeEach(() => {
  previews.length = 0;
  toasts.length = 0;
  previewAvailable = true;
  (globalThis as { uni?: unknown }).uni = {
    showToast: (o: { title: string }) => {
      toasts.push(o.title);
    },
    getSystemInfoSync: () => ({ platform: "devtools", uniPlatform: "mp-weixin" }),
    getDeviceInfo: () => ({ platform: "devtools" }),
    get previewImage() {
      if (!previewAvailable) return undefined;
      return (o: PreviewCall) => {
        previews.push(o);
      };
    },
  };
});

afterEach(() => {
  setUiPlatformOverride(null);
});

function mountContact() {
  return mount(ServiceContact, {
    props: {
      list: ["服务保障一"],
      slogan: "蓝梅旅拍 · 服务保障",
      qrSrc: QR_ORIGIN,
      phone: "18068842642",
      coopPhone: "18068842642",
    },
  });
}

describe("t71 · qrPreviewUrl：预览必须取原图（不是 300px WebP 缩略）", () => {
  it("⭐已带缩略参数的地址 → 剔除 imageMogr2，回归原图（源图仅 327×326，缩略后放大更糊）", () => {
    expect(qrPreviewUrl(QR_THUMB)).toBe(QR_ORIGIN);
    expect(qrPreviewUrl(QR_ORIGIN + "?imageMogr2=1&a=b")).toBe(QR_ORIGIN + "?a=b");
  });

  it("原图/无参数地址原样返回；COS 源站改写为 CDN 域且不带缩略参数", () => {
    expect(qrPreviewUrl(QR_ORIGIN)).toBe(QR_ORIGIN);
    const cos = "https://bucket-1.cos.ap-shanghai.myqcloud.com/admin/qr.png?imageMogr2/format/webp/thumbnail/300x";
    const out = qrPreviewUrl(cos);
    expect(out).toBe("https://www.lanmei66.cloud/admin/qr.png");
    expect(out).not.toContain("imageMogr2");
  });

  it("空值/空串健壮：返回空串（调用方据此静默返回，不弹空预览）", () => {
    expect(qrPreviewUrl("")).toBe("");
    expect(qrPreviewUrl(null)).toBe("");
    expect(qrPreviewUrl(undefined)).toBe("");
  });
});

describe("t71 · ServiceContact 组件接线：点击/长按都弹大图", () => {
  it("⭐微信端：点击二维码 → uni.previewImage 收到**原图**（不含 imageMogr2）", async () => {
    setUiPlatformOverride("mp-weixin");
    const w = mountContact();
    const code = w.find(".code");
    expect(code.exists(), "微信端应渲染二维码").toBe(true);
    await code.trigger("click");
    expect(previews.length).toBe(1);
    expect(previews[0].urls).toEqual([QR_ORIGIN]);
    expect(previews[0].current).toBe(QR_ORIGIN);
  });

  it("⭐微信端：长按**不**弹大图 ⇒ 手势让给原生 show-menu-by-longpress 菜单（验收点①「长按出菜单」）", async () => {
    setUiPlatformOverride("mp-weixin");
    const w = mountContact();
    await w.find(".code").trigger("longpress");
    expect(previews.length).toBe(0); // 不抢占：原生菜单才不会被全屏预览盖住
  });

  it("⭐展示图＝原图（对齐线上旧端 :src=qrSrc）：不含 imageMogr2 缩略参数", () => {
    setUiPlatformOverride("mp-weixin");
    const w = mountContact();
    const srcAttr = w.find(".code").attributes("src");
    expect(srcAttr).toBe(QR_ORIGIN);
    expect(srcAttr).not.toContain("imageMogr2");
    expect(srcAttr).not.toContain("thumbnail");
  });

  it("⭐抖音端：不渲染二维码 ⇒ 预览链路不可达（端行为完全不变）", async () => {
    setUiPlatformOverride("mp-toutiao");
    const w = mountContact();
    expect(w.find(".code").exists()).toBe(false);
    expect(previews.length).toBe(0);
    expect(w.text()).not.toContain("长按");
  });

  it("容器安全：无 uni.previewImage 时静默返回（不抛、不阻断页面）", async () => {
    setUiPlatformOverride("mp-weixin");
    previewAvailable = false;
    const w = mountContact();
    await w.find(".code").trigger("click");
    expect(previews.length).toBe(0);
  });

  it("文案与实现同步：微信端提示「长按二维码扫码添加客服」（长按=原生菜单扫码；点击另有大图保底）", () => {
    setUiPlatformOverride("mp-weixin");
    const w = mountContact();
    expect(w.text()).toContain("长按二维码扫码添加客服");
    expect(w.text()).not.toContain("点击二维码查看大图"); // 上一版措辞已下线
    expect(w.text()).not.toContain("长按下面二维码添加客服"); // 最初措辞不得回流
  });
});

describe("t71 · 防回退守卫（源码级）", () => {
  const src = readFileSync(resolve(__dirname, "../../src/components/ServiceContact/ServiceContact.vue"), "utf-8");
  const body = src.slice(src.indexOf("function previewQr"), src.indexOf("\n}", src.indexOf("function previewQr")));

  it("⭐预览链路必须走 qrPreviewUrl、且**不得**用 cosThumb（否则又回到 300px 缩略）", () => {
    expect(body).toContain("qrPreviewUrl(");
    expect(body).not.toContain("cosThumb");
  });

  it("⭐交互分工：click ⇒ 弹大图；**不得**绑 longpress（让原生菜单可用）；show-menu-by-longpress 必须在", () => {
    // 只看 template 段：注释里出现「@longpress」是说明文字，不算绑定
    // ⚠️ 必须用 lastIndexOf：根模板块内还有 <template #native>…</template> 的插槽子块，indexOf 会截断到它
    const tpl = src.slice(src.indexOf("<template>"), src.lastIndexOf("</template>"));
    expect(tpl).toContain('@click="previewQr(qrSrc)"');
    expect(tpl).not.toContain("@longpress");
    expect(tpl).toContain(":show-menu-by-longpress=\"true\"");
  });

  it("⭐展示图必须走 qrPreviewUrl（原图口径），**不得**退回 cosThumb 缩略（2026-10-13 二次返修）", () => {
    const start = src.indexOf('class="code"');
    const imgTag = src.slice(start, src.indexOf("></image>", start));
    expect(imgTag).toContain(':src="qrPreviewUrl(qrSrc)"');
    expect(imgTag).not.toContain("cosThumb");
  });

  it("⭐.code 必须显式置顶：position: relative 与 z-index（否则被 absolute 的 contact-bg 盖住并截获触摸）", () => {
    const css = src.slice(src.indexOf(".service-contain .contact-main .code"));
    const rule = css.slice(0, css.indexOf("}"));
    expect(rule).toContain("position: relative");
    expect(rule).toContain("z-index: 1");
  });

  it("⭐逻辑层（script 段）的**代码/字符串**不得出现「二维码／长按」等引流词——逻辑层内容会同时打进抖音包（2026-10-10 提审打回纪律）", () => {
    // 注释在构建时被剥离（与 scan-platform-usage.mjs 同口径：去注释后判定），故此处先剥注释再看代码
    const script = src
      .slice(0, src.indexOf("<template>"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(script).not.toContain("二维码");
    expect(script).not.toContain("长按");
  });
});
