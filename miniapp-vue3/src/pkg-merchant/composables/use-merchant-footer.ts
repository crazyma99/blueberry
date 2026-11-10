// 商家端 footer 文案（issue #14 · M2）：**只展示第二行 supportLine**（OPS 后台 copyright.supportText），主行恒传空串。
//
// 数据源与会话边界（已核对后端 wx/handler/misc.go GetPageConfigHandler）：
//   · /api/page-config 是公开、限流、无需 token 的接口；**不带 X-Brand-Id 时返回全局配置**（带品牌头才按品牌取，且品牌不存在会直接报错）；
//   · 商家 client 的 brandId 恒为 null ⇒ 取全局文案，不会取错品牌、也不会因品牌头失败；
//   · 这里用**商家 runtime 的 client** 且**不设 authRequired**：不会向 C 端接口发商家 token，C 端 client 也读不到商家 token，
//     且不触发 C 端静默登录 / 品牌写入等副作用。
//   · 失败/空 ⇒ 兜底链终点 FOOTER_SUPPORT_DEFAULT；初始值即兜底，footer 永远不空白、永不抛错。
import { ref } from "vue";
import { PROFILE } from "../../generated/profile.config";
import { createPageConfigRepository } from "../../infrastructure/repositories/page-config";
import { createPageConfigContent, FOOTER_SUPPORT_DEFAULT } from "../../application/page-config-content";
import { getMerchantRuntime } from "../application/merchant-runtime";
import type { RequestContext } from "../../ports/context";
import type { ClientLike } from "../../infrastructure/repositories/carousels";

/** 商家 footer 文案装载器（可注入 client/profile，测试用）。**永不抛**，失败回落默认文案 */
export function createMerchantFooterLoader(deps: {
  client: ClientLike;
  profile?: { copyrightText: string; contactQrSrc: string; contactPhoneText: string };
  /** 注入文案内容源（测试用：验证本加载器外层兜底；缺省走共享的 createPageConfigContent） */
  content?: { loadFooter(ctx: RequestContext): Promise<{ mainLine: string; supportLine: string }> };
}) {
  const content = deps.content ?? createPageConfigContent({
    pageConfig: createPageConfigRepository({ client: deps.client }),
    profile: deps.profile ?? { copyrightText: PROFILE.copyrightText, contactQrSrc: PROFILE.contactQrSrc, contactPhoneText: PROFILE.contactPhoneText },
  });
  return {
    async loadSupportLine(context: RequestContext): Promise<string> {
      try {
        const f = await content.loadFooter(context);
        // trim：OPS 若误配了纯空白（"   "），共享用例的 str() 只判 !== "" 会放行，页脚会"有元素却看不见字"；这里按空白也兜底
        return f.supportLine.trim() !== "" ? f.supportLine : FOOTER_SUPPORT_DEFAULT;
      } catch {
        return FOOTER_SUPPORT_DEFAULT;
      }
    },
  };
}

/** 页面用：返回 supportLine（初始即兜底）与一次性加载函数；mainLine 由页面恒传 "" */
export function useMerchantFooter() {
  const rt = getMerchantRuntime();
  const loader = createMerchantFooterLoader({ client: rt.client });
  const supportLine = ref<string>(FOOTER_SUPPORT_DEFAULT);
  let loaded = false;
  async function load(): Promise<void> {
    if (loaded) return;
    loaded = true; // 同一页面实例只取一次（OPS 文案变更无需实时）
    supportLine.value = await loader.loadSupportLine(rt.nextContext());
  }
  void load();
  return { supportLine };
}
