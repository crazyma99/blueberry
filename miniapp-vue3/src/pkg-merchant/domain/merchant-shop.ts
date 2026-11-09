// 系列（shop）选择：纯逻辑 + 持久化（issue #14 · M2）。
// 分类、相册都挂在 shopId（「系列」）下；商家先用登录响应 shopList 选 shop。多 shop 用 BasePicker，记住上次选择
// （键 `lm.merchant.lastShop.v1`，在商家命名空间之内）。**不硬编码「商家只有 merchant 角色」**：选择逻辑只看 shopList 本身，
// 将来放开 platform 角色（shopList 可能很长/按范围收敛）无需返工。
import type { StoragePort } from "../../ports/storage";
import { createMerchantStorage, MERCHANT_LAST_SHOP_KEY } from "../infrastructure/merchant-storage";
import type { MerchantShop } from "./merchant-auth";
import { isPositiveId } from "./merchant-http";

/** 可用系列：id>0 且未停用（status===0 排除；缺失按启用） */
export function selectableShops(list: readonly MerchantShop[]): MerchantShop[] {
  return list.filter((s) => isPositiveId(s.id) && s.status !== 0);
}

/**
 * 决定当前系列：①记住的上次选择仍在可用列表内 ⇒ 用它；②否则取列表第一个；③列表为空 ⇒ 0（页面给「暂无可管理的系列」空态）。
 */
export function resolveCurrentShop(list: readonly MerchantShop[], remembered: number): number {
  const shops = selectableShops(list);
  if (shops.length === 0) return 0;
  if (isPositiveId(remembered) && shops.some((s) => s.id === remembered)) return remembered;
  return shops[0].id;
}

/** 系列选项（BasePicker 用）：label 带商户名（多商户时便于区分） */
export function shopPickerOptions(list: readonly MerchantShop[]): Array<{ label: string; value: number }> {
  return selectableShops(list).map((s) => ({ label: s.merchantName !== "" ? `${s.name}（${s.merchantName}）` : s.name, value: s.id }));
}

/** 读写「上次选择的系列」：只存数字字符串；损坏/非法 ⇒ 0；写入非法值被忽略 */
export function createLastShopStore(backend: StoragePort) {
  const storage = createMerchantStorage(backend);
  return {
    load(): number {
      const raw = storage.get(MERCHANT_LAST_SHOP_KEY);
      if (raw == null) return 0;
      const n = Number(raw);
      return isPositiveId(n) ? n : 0;
    },
    save(shopId: number): void {
      if (!isPositiveId(shopId)) return;
      storage.set(MERCHANT_LAST_SHOP_KEY, String(shopId));
    },
    clear(): void {
      storage.remove(MERCHANT_LAST_SHOP_KEY);
    },
  };
}
