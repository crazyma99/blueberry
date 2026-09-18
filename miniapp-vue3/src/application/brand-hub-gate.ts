// P2-20 品牌馆开关闸门：把 page-config 仓储接进 brand-hub controller（P2-07），
// 供「首页入口显隐」与「品牌馆页自守卫」共用——⭐ P2-20 红线：统一消费同一开关仓储，
// 不允许入口与页内各写一套 /api/page-config 解析（旧端 pageConfig.uts 即为此抽公共工具；
// 旧端 isBrandHubEnabled(force=true) 跳过 60s 缓存 ≡ 新端 controller 无缓存、每次真实查询）。
// 安全默认：解析失败/缺失/网络错误一律隐藏（domain brandHubEnabled 严格 ===true）。
import type { RequestContext } from "../ports/context";
import type { PageConfigItem } from "../infrastructure/repositories/page-config";
import { createBrandHubController, type BrandHubController } from "./brand-hub-controller";

export interface PageConfigLike {
  getPageConfig(context: RequestContext): Promise<
    { ok: true; value: PageConfigItem[] } | { ok: false; error: { kind: string } }
  >;
}

export interface BrandHubGate extends BrandHubController {
  /** 旧端 isBrandHubEnabled(force) 等价：查询后返回开关（查询失败＝false，不外抛） */
  isEnabled(context: RequestContext): Promise<boolean>;
}

export function createBrandHubGate(deps: { pageConfig: PageConfigLike }): BrandHubGate {
  const controller = createBrandHubController({
    // 旧端 pageConfig.uts 口径：page-config 数组取 type==='brand_hub' 的 config 字符串；
    // 缺失/空/失败 → 空串，controller 统一按隐藏（false）处理（Result 纪律：不外抛）
    loadConfig: async (context) => {
      const r = await deps.pageConfig.getPageConfig(context);
      if (!r.ok) return "";
      const comp = r.value.find((c) => c != null && c.type === "brand_hub");
      const cfg = comp != null ? comp.config : null;
      return typeof cfg === "string" ? cfg : "";
    },
  });
  return {
    refresh: controller.refresh,
    get enabled() {
      return controller.enabled;
    },
    invalidate: controller.invalidate,
    async isEnabled(context: RequestContext): Promise<boolean> {
      await controller.refresh(context);
      return controller.enabled;
    },
  };
}
