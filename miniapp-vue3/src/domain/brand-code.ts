// 品牌上下文取值守卫（2026-10-13 真机全站空白事故的根因修复）。
//
// 事故：真机带了 **X-Brand-Id: <数字>**（不是「商家编码」，而是历史脏值/商户数字 id），而后端
// `internal/wx/handler/brand.go::resolveRequestMerchant` 对**已存在**的品牌头**不做回落**——解析不到启用商家
// 即 500「品牌不存在或已停用」⇒ 所有接口只剩 64 字节 ⇒ 真机整站空白（IDE 无该头故正常）。
// ⇒ 口径（本模块即唯一事实源）：**X-Brand-Id 必须是「商家编码」（MerchantCode）**；非法值**一律不写入、不发送**
//   （按「无品牌上下文」处理，退回平台范围数据）。
//
// 校验＝**形态 ＋ 命中已知列表**（已知列表的事实源＝ `GET /api/brands` 的 brandId 字段）：
//   · 形态：1–64 位，字母/数字/短横线/下划线。**刻意不禁止纯数字**——线上实测确有 `123323`／`123456789`
//     这类**合法**商家编码（2026-10-13 curl /api/brands 实证 9 条），若按「拒纯数字」做会把它们误杀。
//   · 命中：**离线种子**（下方快照，兜底首启/无网）∪ **运行时列表**（品牌馆拉取后 `rememberBrandCodes` 写入，
//     并持久化到 `lm.brands.v1`）⇒ `foo` 这类「形态合法但后端同样 500」的值也必须被拦下。
//   · 单靠形态校验**不够**（`foo` 会漏），单靠列表校验在首启/无网时不可用 ⇒ 两者必须并用。

/** 商家编码形态：首位字母/数字，其余字母/数字/短横线/下划线，总长 1–64（不禁止纯数字，见文件头） */
const SHAPE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * 平台已知商家编码**离线种子**（2026-10-13 对照 https://crazyma99.xyz/api/brands 实测 9 条；仅作兜底，
 * 运行时以品牌馆拉到的实时列表为准）。新增商家后无需改这里——`rememberBrandCodes` 会并入实时列表。
 */
export const KNOWN_BRAND_CODES_SEED: readonly string[] = [
  "lanmei",
  "huahua",
  "123323",
  "123456789",
  "jiandan",
  "chayu",
  "nj-qiyue-qipao",
  "dd985",
  "dd985-2",
];

/** 运行期已知编码（品牌馆拉取后写入；模块级，供无 storage 的一侧——如 http client——同步校验复用） */
const runtimeKnown = new Set<string>();

/** 形态校验（无状态） */
export function isBrandCodeShape(value: unknown): value is string {
  return typeof value === "string" && SHAPE_RE.test(value);
}

/** 并入运行期已知编码（幂等；用于品牌馆拉到 `GET /api/brands` 之后） */
export function rememberKnownBrandCodes(codes: readonly string[] | null | undefined): void {
  if (!Array.isArray(codes)) return;
  for (const c of codes) if (typeof c === "string" && c !== "") runtimeKnown.add(c);
}

/** 运行期已知编码快照（只读副本） */
export function knownBrandCodes(): string[] {
  return Array.from(runtimeKnown);
}

/**
 * 是否为**可发送**的商家编码：形态合法 ∧ 命中（离线种子 ∪ 运行期 ∪ `extra` 持久化列表）。
 * `extra` 供有持久化列表的一侧（`versioned.loadBrandId`）传入 `lm.brands.v1` 的内容。
 */
export function isKnownBrandCode(value: unknown, extra?: readonly string[] | null): boolean {
  if (!isBrandCodeShape(value)) return false;
  const v = value;
  if (KNOWN_BRAND_CODES_SEED.includes(v)) return true;
  if (runtimeKnown.has(v)) return true;
  return Array.isArray(extra) ? extra.includes(v) : false;
}

/** 一次性日志去重表（同一 原值+理由 只打一次，避免每请求刷屏） */
const warned = new Set<string>();

/**
 * 剔除非法品牌上下文时打一条**一次性**日志（含原值，便于日后排障）。
 * 纪律：原值是商家编码/脏值，不含敏感信息；**不得**在此打印 token／手机号等。
 */
export function warnBrandCodeRejected(raw: unknown, reason: string): void {
  const key = reason + "::" + String(raw);
  if (warned.has(key)) return;
  warned.add(key);
  console.warn("[brand] 品牌上下文取值被剔除（" + reason + "），原值=" + String(raw) + " ⇒ 按「无品牌上下文」处理（不发 X-Brand-Id）");
}

/** 仅测试用：清空一次性日志去重表（避免用例间互相吞日志） */
export function __resetBrandCodeWarnings(): void {
  warned.clear();
}
