// 商家登录页的纯逻辑（issue #14 · UX P0）：记住上次账号（只存用户名）+ 键盘避让常量。**纯函数/工厂**，无平台依赖。
import type { StoragePort } from "../../ports/storage";
import { createMerchantStorage, MERCHANT_LAST_LOGIN_NAME_KEY } from "../infrastructure/merchant-storage";

/** 输入框与键盘之间的间距（px）：约 20px，保证输入行不贴着键盘上沿 */
export const LOGIN_CURSOR_SPACING = 20;
/** 用户名最大长度（与登录页 input maxlength 同值；防异常大值写入存储） */
export const LOGIN_NAME_MAX = 64;

/** 读写「上次登录的用户名」：只存 trim 后的非空用户名；读到非字符串/空白/超长 ⇒ ""；写入空白被忽略（不覆盖旧值）。**永不涉及密码** */
export function createLastLoginNameStore(backend: StoragePort) {
  const storage = createMerchantStorage(backend);
  return {
    load(): string {
      const raw = storage.get(MERCHANT_LAST_LOGIN_NAME_KEY);
      if (typeof raw !== "string") return "";
      const v = raw.trim();
      return v !== "" && [...v].length <= LOGIN_NAME_MAX ? v : "";
    },
    save(name: string): void {
      const v = (typeof name === "string" ? name : "").trim();
      if (v === "" || [...v].length > LOGIN_NAME_MAX) return;
      storage.set(MERCHANT_LAST_LOGIN_NAME_KEY, v);
    },
    clear(): void {
      storage.remove(MERCHANT_LAST_LOGIN_NAME_KEY);
    },
  };
}
