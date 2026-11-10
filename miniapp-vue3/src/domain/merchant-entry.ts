// 商家端入口判定（M1 · issue #14）。**纯函数**，无平台依赖，便于单测。
//
// 背景：商家专属小程序码直接落地 `pkg-merchant/login/index`（后端生成码时指定 page），不经首页、不走 scene→reLaunch。
// 冲突点：`App.vue` onShow 的「进入参数 → 品牌上下文」同步会把整串 `query.scene` 当品牌编码消费；
// 商家码的 scene（若有）绝不能被当成 C 端品牌写入 `lm.brand.v1`。
// 方案：按**落地页路径**分流——落地页以 `pkg-merchant/` 开头 ⇒ 整次进入都不做品牌同步（见 application/enter-brand-sync.ts）。

/** 商家分包根目录（与 pages.json `subPackages[].root` 一致） */
export const MERCHANT_PKG_ROOT = "pkg-merchant";

/** 商家登录页（商家码落地页；未登录跳转的统一目标，写全路径） */
export const MERCHANT_LOGIN_URL = "/pkg-merchant/login/index";
/** 商家工作台首页 */
export const MERCHANT_HOME_URL = "/pkg-merchant/home/index";

/** 归一化落地页路径：去查询串、去前导斜杠；非字符串/空 ⇒ "" */
export function normalizeEnterPath(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let p = raw.trim();
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  while (p.startsWith("/")) p = p.slice(1);
  return p;
}

/** 落地页是否属于商家分包（必须是 `pkg-merchant/` 目录前缀；`pkg-merchantx/…` 之类不算） */
export function isMerchantLandingPath(raw: unknown): boolean {
  return normalizeEnterPath(raw).startsWith(MERCHANT_PKG_ROOT + "/");
}
