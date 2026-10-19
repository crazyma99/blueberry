// 「本次进入参数 → 品牌上下文」统一编排（2026-10-19 · task-71 线上 P0）。
//
// 为什么要有这一层：微信**热启动/再次扫码时 onLoad 不执行**（已驻留 tab 页只走 onShow）⇒ 旧实现把 scene/?brandId= 的消费
// 全放在 onLoad ⇒ 新商户被丢弃、仍停在旧商户。⇒ App 级 onShow 统一消费（任何落地页都生效），页面级 onShow 只按上下文刷新
// （index.vue / priceHomePage 的既有品牌基线检测会据此重载）。**两处共用本函数，避免双份逻辑**。
//
// 纪律：
//   · **相同/无参数一律零动作**（防抖：不能每次回前台都重载）；
//   · 「已知商家编码」校验由 `saveBrandId` 内部把关（2026-10-13 脏值 500 事故）⇒ 这里**回读生效值**再决定后续；
//   · 生效值确实变了才 `bumpScope()`（作废在飞旧品牌响应 P2-07）并回调 `onChanged`（页面据此骨架重现 + 重载）。
import { resolveEnterBrand, type EnterBrandSource } from "../domain/enter-brand";
import { isKnownBrandCode } from "../domain/brand-code";
import { refreshKnownBrandCodesOnce, type BrandAllowlistRefreshDeps } from "./brand-allowlist";

export interface EnterBrandSyncDeps {
  /** ⭐层2：解析出的编码**未命中已知列表**时，先补齐一次（一次/会话、超时、失败静默） */
  refreshBrandCodes?: BrandAllowlistRefreshDeps;
  /** 平台层读取本次进入参数（platform/uni/enter-options.ts） */
  readEnterOptions(): { scene: string; queryBrandId: string };
  loadBrandId(): string | null;
  /** 内部含「已知商家编码」白名单校验：脏值不写入 */
  saveBrandId(id: string): void;
  /** 作废在飞旧品牌响应（页面级 ctxFactory；App 级可不传——由页面基线分支负责） */
  bumpScope?(): void;
  /** 品牌确有变化时回调（页面：brandHubOn=false / ready=false / init()） */
  onChanged?(brandId: string): void;
}

export interface EnterBrandSyncResult {
  /** 是否真的切换了品牌上下文 */
  changed: boolean;
  /** 切换后的生效品牌（未切换则为当前值） */
  brandId: string;
  /** 本次参数来源（scene／query／stored／none） */
  source: EnterBrandSource;
}

/**
 * ⭐2026-10-19（task-71 层2）：**异步编排**——先按现状解析；若来源是 scene/query 且该编码**不在已知列表**，
 * 先 `await refreshKnownBrandCodesOnce()` 补齐（`GET /api/brands` → `rememberBrandCodes`），再走同一同步编排。
 * 目的：干净环境（`lm.brands.v1` 为空、未进过品牌馆）扫「线上存在但种子没有」的商户也能切过去。
 */
export async function syncBrandFromEnterOptionsAsync(deps: EnterBrandSyncDeps): Promise<EnterBrandSyncResult> {
  // ⭐**不阻塞**：先按「已知 ∪ 形态合法」立即判定并写入/切换（放宽后无需等网络，见 domain/brand-code.ts）；
  // 随后**后台**补齐一次已知列表（一次/会话、超时、失败静默）——只为让后续会话「已知」，不参与本次判定。
  const result = syncBrandFromEnterOptions(deps);
  if (deps.refreshBrandCodes != null) {
    const enter = deps.readEnterOptions();
    const current = deps.loadBrandId() ?? "";
    const resolved = resolveEnterBrand({ scene: enter.scene, queryBrandId: enter.queryBrandId, storedBrandId: current });
    const fromEntry = resolved.source === "scene" || resolved.source === "query";
    if (fromEntry && resolved.brandId !== "" && !isKnownBrandCode(resolved.brandId)) {
      void refreshKnownBrandCodesOnce(deps.refreshBrandCodes).then((ok) => {
        if (ok) console.log("[enter-brand] 已补齐已知品牌列表（下次即可命中）:", resolved.brandId);
      });
    }
  }
  return result;
}

/**
 * ⭐2026-10-19（task-74 必修1）：**进参消费幂等**——同一份 enter options 只消费一次。
 * 背景（round-2 CR 抓到的真回归）：容器在「切 tab／回前台」时可能**继续返回上一份 enter options**（粘滞），
 * 若每次都消费 ⇒ 用户在品牌馆手选 B 后回前台会被写回扫码的 A（且 init 重载）⇒ **打回用户手选品牌**。
 * 口径：摘要＝scene|queryBrandId；**同一摘要不再消费**；冷启动（模块状态重置）或摘要变化才消费。
 */
let consumedEnterDigest: string | null = null;

/** 仅供测试复位「已消费摘要」 */
export function __resetEnterBrandConsumption(): void {
  consumedEnterDigest = null;
}

function digestOfEnter(enter: { scene: string; queryBrandId: string }): string {
  const scene = typeof enter.scene === "string" ? enter.scene : "";
  const query = typeof enter.queryBrandId === "string" ? enter.queryBrandId : "";
  return scene === "" && query === "" ? "" : scene + "|" + query;
}

export function syncBrandFromEnterOptions(deps: EnterBrandSyncDeps): EnterBrandSyncResult {
  const enter = deps.readEnterOptions();
  const current = deps.loadBrandId() ?? "";
  const digest = digestOfEnter(enter);
  // ⭐幂等：**同一份进参只消费一次**（防「粘滞 enter options」把手选品牌打回）
  if (digest !== "" && digest === consumedEnterDigest) {
    return { changed: false, brandId: current, source: "none" };
  }
  const resolved = resolveEnterBrand({
    scene: enter.scene,
    queryBrandId: enter.queryBrandId,
    storedBrandId: current,
  });
  // 无本次进入参数（只有记忆值/空）⇒ **零动作**（防抖）
  if (resolved.source === "stored" || resolved.source === "none") {
    return { changed: false, brandId: current, source: resolved.source };
  }
  // 标记「已消费该摘要」：无论是否发生切换，此后同一份进参都不再处理
  consumedEnterDigest = digest;
  // 与当前相同 ⇒ **零动作**（防抖：每次回前台不重载）
  if (resolved.brandId === current) {
    return { changed: false, brandId: current, source: resolved.source };
  }
  deps.saveBrandId(resolved.brandId);
  const effective = deps.loadBrandId() ?? "";
  // 脏值被白名单剔除 ⇒ 上下文未变：不 bumpScope、不回调（保持原品牌，绝不误重载）
  if (effective === current) {
    return { changed: false, brandId: current, source: resolved.source };
  }
  deps.bumpScope?.();
  deps.onChanged?.(effective);
  return { changed: true, brandId: effective, source: resolved.source };
}
