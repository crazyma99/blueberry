// 平台存储适配：uni KV → ports StoragePort（P2-06 versioned storage 与 P2-03 coordinator 的后端）。
// 容器无该 API 时安全降级为内存空实现（测试环境）。
//
// 2026-09-23：`uni` 改为**惰性解析**（此前在 create 时一次性判定 `hasUni`）。原因：页面在**模块加载**
// 就创建了 storage（如 `pages/aiTryOn` 的 `const uniStorage = createUniStorage()`），而模块加载早于
// 运行时就绪/测试注入 `uni` ⇒ 一旦判定为「无 uni」就永久走内存回退（实测：单测里注入 uni 桩后页面仍读不到会话，
// 导致登录态判定错误、全链路用例被守卫拦住）。口径与 `platform/uni/album-save.ts` 的 `uniApi()` 一致。
import type { StoragePort } from "../../ports/storage";

interface UniStorageLike {
  getStorageSync?: (key: string) => unknown;
  setStorageSync?: (key: string, value: string) => void;
  removeStorageSync?: (key: string) => void;
}

export function createUniStorage(): StoragePort {
  const memory = new Map<string, string>();

  /** 惰性取容器 API：优先注入桩（`globalThis.uni`，测试/H5），再回落**裸 `uni`**（mp 产物由编译器改写） */
  function uniApi(): UniStorageLike | undefined {
    const injected = (globalThis as { uni?: UniStorageLike }).uni;
    if (injected != null) return injected;
    return typeof uni !== "undefined" ? (uni as unknown as UniStorageLike) : undefined;
  }

  return {
    get(key) {
      const u = uniApi();
      if (typeof u?.getStorageSync !== "function") return memory.get(key) ?? null;
      const v = u.getStorageSync(key);
      return typeof v === "string" && v.length > 0 ? v : null;
    },
    set(key, value) {
      const u = uniApi();
      if (typeof u?.setStorageSync !== "function") {
        memory.set(key, value);
        return;
      }
      u.setStorageSync(key, value);
    },
    remove(key) {
      const u = uniApi();
      if (typeof u?.removeStorageSync !== "function") {
        memory.delete(key);
        return;
      }
      u.removeStorageSync(key);
    },
  };
}
