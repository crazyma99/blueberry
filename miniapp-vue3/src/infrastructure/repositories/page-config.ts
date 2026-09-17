// P2-20 repositories · 页面组件配置（旧端实测 GET /api/page-config，公开读）。
// 旧端 pageConfig.uts:405 起：响应 {code, data: Array<{type, config, ...}>}；品牌馆开关取 type==='brand_hub'
// 的 config JSON 字符串。旧端带 60s 内存缓存且切品牌视为失效；新端由 brand-hub-controller 的
// scope 代次治理取代（在飞去重＋切品牌作废，P2-07），故本仓储保持无缓存（单一事实源＝controller）。
// ⭐ P2-20：本仓储是「品牌馆开关」的唯一入口——首页入口显隐与品牌馆页自守卫必须共用同一仓储，
// 禁止两处各写一套 /api/page-config 解析（旧端 pageConfig.uts 就是为此抽公共工具）。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "./carousels";

export interface PageConfigItem {
  type?: string;
  config?: unknown;
  /** service_guarantee 行的条目列表（旧端组件直接读 service.items[].title） */
  items?: unknown;
}

export function createPageConfigRepository(deps: { client: ClientLike }) {
  return {
    /** 旧端 getPageConfig(force)：GET /api/page-config（公开，无需登录） */
    getPageConfig(context: RequestContext): Promise<RepoResult<PageConfigItem[]>> {
      return deps.client.request<PageConfigItem[]>({
        method: "GET",
        url: "/api/page-config",
        replayPolicy: "idempotent",
        context,
      });
    },
  };
}
