// 平台存储适配：uni KV → ports StoragePort（P2-06 versioned storage 与 P2-03 coordinator 的后端）。
// 容器无该 API 时安全降级为内存空实现（测试环境）。
import type { StoragePort } from "../../ports/storage";

export function createUniStorage(): StoragePort {
  const memory = new Map<string, string>();
  const hasUni =
    typeof uni !== "undefined" &&
    typeof uni.getStorageSync === "function" &&
    typeof uni.setStorageSync === "function" &&
    typeof uni.removeStorageSync === "function";
  return {
    get(key) {
      if (!hasUni) return memory.get(key) ?? null;
      const v = uni.getStorageSync(key);
      return typeof v === "string" && v.length > 0 ? v : null;
    },
    set(key, value) {
      if (!hasUni) {
        memory.set(key, value);
        return;
      }
      uni.setStorageSync(key, value);
    },
    remove(key) {
      if (!hasUni) {
        memory.delete(key);
        return;
      }
      uni.removeStorageSync(key);
    },
  };
}
