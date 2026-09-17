// P2-21 页面配置内容用例：把 AppFooter/ServiceContact 原本「组件内 mounted 取数」上提为可测用例，
// 组件改为纯 props 渲染（组件内禁请求）。逐项保留旧端优先级链：props 覆盖 → OPS 下发 → Profile 注入 → 本地兜底。
// 旧端事实：AppFooter.uvue 的 loadCopyright（mounted）取 type==='copyright' 的 config.text/supportText；
// ServiceContact.uvue 的 loadContactConfig（mounted）取 service_guarantee（items[].title＋config.slogan）
// 与 contact_info（config.qrSrc/phone/coopPhone）。Profile 注入锚点（apply-profile.mjs）：copyrightText 与
// contact 的 qrSrc/phone 字段名是正则依赖，**不得改名**（新端以 PROFILE.copyrightText/contactQrSrc/contactPhoneText 承载）。
import type { RequestContext } from "../ports/context";
import type { PageConfigItem } from "../infrastructure/repositories/page-config";

/** 本地兜底（旧端组件 data 内默认值；Profile 未提供者用此值） */
export const FOOTER_SUPPORT_DEFAULT = "小程序及AI技术能力由 蓝梅网络 提供支持";
/** 本地兜底（旧端 ServiceContact.uvue:79-88 组件内硬编码默认 8 条；非品牌注入项）——CR 🟡1 补全 */
export const SERVICE_LIST_DEFAULT: readonly string[] = [
  "一价全包，全程无任何隐形消费",
  "妆面不满意免费重化，满意再出门",
  "拍摄不满意重拍，重拍不满意退款",
  "拍摄现场拍、看、审，品质保证",
  "全职专业摄影师、化妆师，拒绝兼职",
  "所有道具、饰品免费提供免费使用",
  "所有作品均自主创作，所见即所得",
  "明码标价，用心做品质，拒绝套路",
];
export const SLOGAN_DEFAULT = "蓝梅，让世界看见东方美";
export const COOP_PHONE_DEFAULT = "13269920775";

export interface FooterContent {
  /** 主行：props 覆盖 → OPS copyright.text → Profile copyrightText */
  mainLine: string;
  /** 支持行：props 覆盖 → OPS copyright.supportText → 本地固定文案 */
  supportLine: string;
}

export interface ContactContent {
  list: string[];
  slogan: string;
  qrSrc: string;
  phone: string;
  coopPhone: string;
}

type RepoLike = {
  getPageConfig(
    context: RequestContext,
  ): Promise<{ ok: true; value: PageConfigItem[] } | { ok: false; error: { kind: string } }>;
};

function firstOf(rows: PageConfigItem[], type: string): PageConfigItem | undefined {
  return rows.find((c) => c != null && c.type === type);
}

/** 严格解析 config JSON 字符串：非字符串／空串／非法 JSON／非对象一律 null（不抛） */
function parseConfig(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed != null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 非空字符串收窄 */
function str(v: unknown): string {
  return typeof v === "string" && v !== "" ? v : "";
}

export function createPageConfigContent(deps: {
  pageConfig: RepoLike;
  profile: { copyrightText: string; contactQrSrc: string; contactPhoneText: string };
}) {
  /** 取配置行；接口失败／畸形一律空数组（落到本地兜底，页面不中断） */
  async function rows(ctx: RequestContext): Promise<PageConfigItem[]> {
    try {
      const r = await deps.pageConfig.getPageConfig(ctx);
      return r.ok && Array.isArray(r.value) ? r.value : [];
    } catch {
      return [];
    }
  }

  /** 页脚版权（旧 AppFooter.loadCopyright 语义） */
  async function loadFooter(
    ctx: RequestContext,
    overrides?: { mainText?: string; supportText?: string },
  ): Promise<FooterContent> {
    const list = await rows(ctx);
    const comp = firstOf(list, "copyright");
    const cfg = comp != null ? parseConfig(comp.config) : null;
    const opsMain = cfg != null ? str(cfg.text) : "";
    const opsSupport = cfg != null ? str(cfg.supportText) : "";
    const mainText = str(overrides?.mainText);
    const supportText = str(overrides?.supportText);
    return {
      mainLine: mainText !== "" ? mainText : opsMain !== "" ? opsMain : deps.profile.copyrightText,
      supportLine: supportText !== "" ? supportText : opsSupport !== "" ? opsSupport : FOOTER_SUPPORT_DEFAULT,
    };
  }

  /** 服务保障＋联系方式（旧 ServiceContact.loadContactConfig 语义） */
  async function loadContact(ctx: RequestContext): Promise<ContactContent> {
    const list = await rows(ctx);

    const svc = firstOf(list, "service_guarantee");
    let items: string[] = [...SERVICE_LIST_DEFAULT];
    let slogan = SLOGAN_DEFAULT;
    if (svc != null) {
      if (Array.isArray(svc.items) && svc.items.length > 0) {
        const titles = (svc.items as Array<{ title?: unknown }>)
          .map((it) => (it != null ? str(it.title) : ""))
          .filter((t) => t !== "");
        if (titles.length > 0) items = titles;
      }
      const cfg = parseConfig(svc.config);
      if (cfg != null && str(cfg.slogan) !== "") slogan = str(cfg.slogan);
    }

    const contact = firstOf(list, "contact_info");
    const ccfg = contact != null ? parseConfig(contact.config) : null;
    return {
      list: items,
      slogan,
      // Profile 注入锚点：qrSrc/phone 由 PROFILE.contactQrSrc/contactPhoneText 承载；coopPhone 无 Profile 字段用本地默认
      qrSrc: ccfg != null && str(ccfg.qrSrc) !== "" ? str(ccfg.qrSrc) : deps.profile.contactQrSrc,
      phone: ccfg != null && str(ccfg.phone) !== "" ? str(ccfg.phone) : deps.profile.contactPhoneText,
      coopPhone: ccfg != null && str(ccfg.coopPhone) !== "" ? str(ccfg.coopPhone) : COOP_PHONE_DEFAULT,
    };
  }

  return { loadFooter, loadContact };
}
