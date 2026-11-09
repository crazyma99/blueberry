// 商家端本地存储隔离（M1 · issue #14）：把商家会话的全部落盘键**重映射到独立命名空间**。
//
// 为什么不改共用的 `createAuthCoordinator`：它把落盘键写死为 `lm.session.v1`，并在 401 自愈（expireSession）时
// 顺带清理旧端 legacy 键 `token`——若商家端直接复用，**商家 401 会清掉 C 端会话**、商家登录会覆盖 C 端会话。
// 方案：包一层 StoragePort——协调器看到的 `lm.session.v1` 实际落在 `lm.merchant.session.v1`；
// 已带 `lm.merchant.` 前缀的键原样放行（商家资料键）；其余任何键（含 legacy `token`）一律落进 `lm.merchant.x.` 前缀，
// ⇒ **与 C 端键空间零交集**。
import type { StoragePort } from "../../ports/storage";

/** 协调器内部使用的会话键（auth-coordinator.ts 内常量；此处仅为重映射源） */
export const COORDINATOR_SESSION_KEY = "lm.session.v1";
/** 商家会话落盘键（独立于 C 端 `lm.session.v1`） */
export const MERCHANT_SESSION_KEY = "lm.merchant.session.v1";
/** 商家资料（权限/商家 ID/展示名）落盘键 */
export const MERCHANT_PROFILE_KEY = "lm.merchant.profile.v1";
const MERCHANT_PREFIX = "lm.merchant.";
const OTHER_PREFIX = "lm.merchant.x.";

export function merchantKeyOf(key: string): string {
  if (key === COORDINATOR_SESSION_KEY) return MERCHANT_SESSION_KEY;
  if (key.startsWith(MERCHANT_PREFIX)) return key;
  return OTHER_PREFIX + key;
}

/** 商家命名空间存储：所有读写经 merchantKeyOf 重映射 */
export function createMerchantStorage(backend: StoragePort): StoragePort {
  return {
    get: (key) => backend.get(merchantKeyOf(key)),
    set: (key, value) => backend.set(merchantKeyOf(key), value),
    remove: (key) => backend.remove(merchantKeyOf(key)),
  };
}
