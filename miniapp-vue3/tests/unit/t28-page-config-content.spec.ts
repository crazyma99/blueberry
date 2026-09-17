// P2-21：page-config 内容用例字段级单测——优先级链 props 覆盖 → OPS 下发 → Profile 注入 → 本地兜底，
// 以及失败/畸形一律回落（页面不中断）。旧端口径对照 AppFooter.uvue:60-79 与 ServiceContact.uvue:102-131。
import { describe, expect, it } from "vitest";
import {
  createPageConfigContent,
  FOOTER_SUPPORT_DEFAULT,
  SERVICE_LIST_DEFAULT,
  SLOGAN_DEFAULT,
  COOP_PHONE_DEFAULT,
} from "../../src/application/page-config-content";
import type { PageConfigItem } from "../../src/infrastructure/repositories/page-config";
import type { RequestContext } from "../../src/ports/context";

const ctx: RequestContext = {
  platform: "mp-weixin",
  environment: "trial",
  brandId: null,
  requestId: "r",
  profileKey: "blueberry",
  appCode: "blueBerry",
  scopeRevision: 1,
  authRevision: 1,
};

const profile = {
  copyrightText: "Copyright 2025 蓝梅旗袍·汉服·民族服体验馆 - 版权所有",
  contactQrSrc: "https://cos.example/qr.png",
  contactPhoneText: "18068842642",
};

function makeContent(
  rows: PageConfigItem[] | "fail",
): ReturnType<typeof createPageConfigContent> {
  return createPageConfigContent({
    pageConfig: {
      getPageConfig: async () =>
        rows === "fail" ? { ok: false as const, error: { kind: "network" } } : { ok: true as const, value: rows },
    },
    profile,
  });
}

describe("page-config-content（P2-21 内容上提用例）", () => {
  it("页脚：props 覆盖 → OPS copyright.text → Profile copyrightText；supportText 同链", async () => {
    const rows: PageConfigItem[] = [
      { type: "copyright", config: JSON.stringify({ text: "OPS 版权", supportText: "OPS 支持行" }) },
    ];
    const c = makeContent(rows);
    // OPS 优先于 Profile
    const a = await c.loadFooter(ctx);
    expect(a.mainLine).toBe("OPS 版权");
    expect(a.supportLine).toBe("OPS 支持行");
    // props 覆盖优先于 OPS（旧 AppFooter :52-58）
    const b = await c.loadFooter(ctx, { mainText: "AI 生成提示", supportText: "技术支持行" });
    expect(b.mainLine).toBe("AI 生成提示");
    expect(b.supportLine).toBe("技术支持行");
    // 无 OPS 时回退 Profile 版权＋本地支持行默认
    const d = await makeContent([]).loadFooter(ctx);
    expect(d.mainLine).toBe(profile.copyrightText);
    expect(d.supportLine).toBe(FOOTER_SUPPORT_DEFAULT);
  });

  it("服务保障：OPS items[].title 与 config.slogan 覆盖；缺失回落本地默认", async () => {
    const rows: PageConfigItem[] = [
      {
        type: "service_guarantee",
        items: [{ title: "OPS 条目一" }, { title: "" }, { title: "OPS 条目二" }],
        config: JSON.stringify({ slogan: "OPS 标语" }),
      },
    ];
    const c = makeContent(rows);
    const a = await c.loadContact(ctx);
    // 空标题被过滤，仅保留非空；titles 全空则回落本地默认（旧端仅判 items.length>0 不过滤——属有意加固，见组件头/deviation）
    expect(a.list).toEqual(["OPS 条目一", "OPS 条目二"]);
    expect(a.slogan).toBe("OPS 标语");
    // 无 service_guarantee 行 → 本地默认 3 条＋默认标语
    const b = await makeContent([]).loadContact(ctx);
    expect(b.list).toEqual([...SERVICE_LIST_DEFAULT]);
    expect(b.slogan).toBe(SLOGAN_DEFAULT);
  });

  it("联系我们：OPS contact_info 覆盖 qrSrc/phone/coopPhone；缺失回落 Profile 与本地默认", async () => {
    const rows: PageConfigItem[] = [
      {
        type: "contact_info",
        config: JSON.stringify({ qrSrc: "https://ops.example/qr.png", phone: "13900000000", coopPhone: "13700000000" }),
      },
    ];
    const a = await makeContent(rows).loadContact(ctx);
    expect(a.qrSrc).toBe("https://ops.example/qr.png");
    expect(a.phone).toBe("13900000000");
    expect(a.coopPhone).toBe("13700000000");
    // 缺失 → Profile 注入锚点（qrSrc/phone）＋本地 coopPhone 默认
    const b = await makeContent([{ type: "contact_info" }]).loadContact(ctx);
    expect(b.qrSrc).toBe(profile.contactQrSrc);
    expect(b.phone).toBe(profile.contactPhoneText);
    expect(b.coopPhone).toBe(COOP_PHONE_DEFAULT);
  });

  it("容错：接口失败／config 非法 JSON／非对象 一律回落本地，不抛（页面不中断）", async () => {
    const fail = await makeContent("fail").loadFooter(ctx);
    expect(fail.mainLine).toBe(profile.copyrightText);
    expect(fail.supportLine).toBe(FOOTER_SUPPORT_DEFAULT);
    const broken = await makeContent([
      { type: "copyright", config: "{broken" },
      { type: "service_guarantee", config: "123" },
      { type: "contact_info", config: JSON.stringify("just-a-string") },
    ]).loadContact(ctx);
    expect(broken.slogan).toBe(SLOGAN_DEFAULT);
    expect(broken.list).toEqual([...SERVICE_LIST_DEFAULT]);
    expect(broken.qrSrc).toBe(profile.contactQrSrc);
  });
});
