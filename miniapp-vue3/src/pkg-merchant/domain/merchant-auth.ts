// 商家端登录结果的角色/权限判定（M1 · issue #14）。**纯函数**。
//
// 后端事实（只读核对 lanmei-backend-golang `internal/admin/handler/auth.go`、`platform.go`）：
//   · `POST /auth/login` 的 data = {token, adminId, merchantId, username, role, displayName, shopList[], permissions[], roleName?, shopScope?}；
//   · 商家范围由 JWT 的 merchant_id 自动收敛；`isOperatorLike(role)` = role 以 "operator" 开头（商户运营类）；
//   · 超管 / 平台运营（`super_admin`／`platform_*`）是**平台级**角色，不带商家 ⇒ 商家端不放行。
// 前端的角色放行只是体验层（给出明确提示），**安全边界仍是后端**（permCheck + merchant_scope）。

export interface MerchantProfile {
  adminId: number;
  /** 商家 ID（> 0 才可进入商家端） */
  merchantId: number;
  username: string;
  role: string;
  displayName: string;
  /** 自定义角色的展示名（可选） */
  roleName: string;
  /** 权限键数组（来自登录响应；按钮显隐用，非安全边界） */
  permissions: string[];
  /** 登录响应里的可见系列（店铺）列表；分类/相册都挂在 shopId（系列）下，用于选 shop。缺失/畸形 ⇒ [] */
  shopList: MerchantShop[];
}

/** 系列（shop）：后端把「系列」叫 shop；分类、相册都归属于某个 shopId */
export interface MerchantShop {
  id: number;
  /** 展示名：displayName 优先，其次 shopName */
  name: string;
  /** 所属商户名（登录响应附带，可能为空） */
  merchantName: string;
  /** 1 启用 / 0 停用（缺失当启用） */
  status: number;
}

/** 商家端用到的权限键 */
export const PERM = {
  booking: "booking",
  bookingSlot: "booking_slot",
  bookingSlotTemplate: "booking_slot_template",
  category: "category",
  album: "album",
} as const;

export type RoleGate = { ok: true } | { ok: false; message: string };

export const ROLE_DENIED_MESSAGE = "该账号无商家端权限，请使用商家账号登录";

/** 角色放行：`merchant` 与「带 merchantId 的运营类角色（operator*）」；其余（含超管/平台角色）一律拒绝 */
export function evaluateMerchantRole(input: { role: string; merchantId: number | null }): RoleGate {
  const role = (input.role ?? "").trim();
  const mid = input.merchantId;
  if (mid == null || !Number.isFinite(mid) || mid <= 0) return { ok: false, message: ROLE_DENIED_MESSAGE };
  if (role === "merchant" || role.startsWith("operator")) return { ok: true };
  return { ok: false, message: ROLE_DENIED_MESSAGE };
}

/** 是否持有某权限键（精确匹配；profile 缺失 ⇒ false，fail-closed） */
export function hasPermission(profile: Pick<MerchantProfile, "permissions"> | null, key: string): boolean {
  if (profile == null) return false;
  return profile.permissions.includes(key);
}

/** 档期模板套用需要 `booking_slot_template` **且** `booking_slot`（后端 apply 另校验 booking_slot） */
export function canApplySlotTemplate(profile: Pick<MerchantProfile, "permissions"> | null): boolean {
  return hasPermission(profile, PERM.bookingSlotTemplate) && hasPermission(profile, PERM.bookingSlot);
}

export interface MerchantEntry {
  key: "booking" | "slot" | "category" | "album";
  title: string;
  desc: string;
  url: string;
  perm: string;
}

/** 工作台功能入口（M1 只有预约 + 档期；相册/分类留 M2，**不做**首页概览）。各入口随对应页面落地的提交追加。 */
export const MERCHANT_ENTRIES: readonly MerchantEntry[] = [
  { key: "booking", title: "预约管理", desc: "接单、核销、取消客人预约", url: "/pkg-merchant/booking/list", perm: PERM.booking },
  { key: "slot", title: "档期管理", desc: "新增时段、调整容量、启停、套用模板", url: "/pkg-merchant/slot/list", perm: PERM.bookingSlot },
  { key: "category", title: "分类管理", desc: "一级/二级分类的新增、改名、排序、删除", url: "/pkg-merchant/category/list", perm: PERM.category },
  { key: "album", title: "相册管理", desc: "相册与图片：新建、封面、批量上传、排序、删除", url: "/pkg-merchant/album/list", perm: PERM.album },
];

/** 按权限过滤后的功能入口 */
export function visibleEntries(profile: Pick<MerchantProfile, "permissions"> | null): MerchantEntry[] {
  return MERCHANT_ENTRIES.filter((e) => hasPermission(profile, e.perm));
}

/**
 * 工作台顶部「角色」展示名：自定义角色名 roleName 优先；其次按内置角色映射（merchant→商家，operator* → 商户运营）；其余原样（trim）。
 * 纯展示：不参与任何权限判断（安全边界仍是后端）。
 */
export function roleLabel(p: Pick<MerchantProfile, "role" | "roleName"> | null): string {
  if (p == null) return "";
  const custom = (p.roleName ?? "").trim();
  if (custom !== "") return custom;
  const role = (p.role ?? "").trim();
  if (role === "merchant") return "商家";
  if (role.startsWith("operator")) return "商户运营";
  return role;
}
