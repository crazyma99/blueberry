// 系列（shop）选择状态（页面用 · issue #14 M2）：读登录资料里的 shopList，恢复/记住上次选择。
// 逻辑在 domain/merchant-shop.ts（纯函数），本文件只做响应式装配与存储接线。
import { computed, ref } from "vue";
import { createUniStorage } from "../../platform/uni/storage";
import { getMerchantRuntime } from "../application/merchant-runtime";
import type { MerchantShop } from "../domain/merchant-auth";
import { createLastShopStore, resolveCurrentShop, selectableShops, shopPickerOptions } from "../domain/merchant-shop";

export function useMerchantShop() {
  const rt = getMerchantRuntime();
  const store = createLastShopStore(createUniStorage());
  const shops = ref<MerchantShop[]>([]);
  const shopId = ref(0);

  /** 重新读取登录资料并决定当前系列（onLoad/onShow 调用；shopList 缺失 ⇒ 空） */
  function refresh(): void {
    const list = rt.getState().profile?.shopList ?? [];
    shops.value = selectableShops(list);
    shopId.value = resolveCurrentShop(list, shopId.value > 0 ? shopId.value : store.load());
  }
  function select(id: number): void {
    if (!shops.value.some((s) => s.id === id)) return;
    shopId.value = id;
    store.save(id);
  }
  const options = computed(() => shopPickerOptions(shops.value));
  const currentName = computed(() => shops.value.find((s) => s.id === shopId.value)?.name ?? "");
  const hasShop = computed(() => shopId.value > 0);
  const multiple = computed(() => shops.value.length > 1);
  return { shops, shopId, options, currentName, hasShop, multiple, refresh, select };
}
