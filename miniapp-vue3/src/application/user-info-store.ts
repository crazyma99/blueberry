// P2-18 用户信息本地存储＋非空合并（旧端 utils/auth.uts 的 UserInfo 管理忠实移植）。
// 旧端事实（auth.uts）：UserInfo{id,openid,phone,nickname,avatarUrl} 存 'userInfo' 键；
// mergeUserInfo（:92-109）＝非空合并——partial 的字段非 null 且非空串才覆盖，否则保留 current；
// current 为 null 时直接 setUserInfo(partial)。P2-18 核心语义：头像/昵称非空合并，空值绝不覆盖已有值。
// 新端版本化键 lm.userinfo.v1（同 lm.session.v1/lm.brand.v1 口径）；旧键 'userInfo' 验证期兼容读取。
import type { StoragePort } from "../ports/storage";

const K_USER = "lm.userinfo.v1";
const LEGACY_USER = "userInfo";

export interface WxUserInfoLocal {
  id: number;
  openid: string;
  phone: string | null;
  nickname: string | null;
  avatarUrl: string | null;
}

export interface UserInfoStore {
  load(): WxUserInfoLocal | null;
  save(info: WxUserInfoLocal): void;
  /** 旧端 mergeUserInfo 语义：非空字段才覆盖（:92-109 逐字） */
  merge(partial: WxUserInfoLocal): void;
  clear(): void;
}

export function createUserInfoStore(deps: { backend: StoragePort }): UserInfoStore {
  function load(): WxUserInfoLocal | null {
    const raw = deps.backend.get(K_USER) ?? deps.backend.get(LEGACY_USER);
    if (raw == null || raw.length === 0) return null;
    try {
      const parsed = JSON.parse(raw) as WxUserInfoLocal | null;
      if (parsed != null && typeof parsed.openid === "string") return parsed;
      return null;
    } catch {
      return null; // 损坏内容安全失败
    }
  }

  function save(info: WxUserInfoLocal): void {
    deps.backend.set(K_USER, JSON.stringify(info));
  }

  function merge(partial: WxUserInfoLocal): void {
    const current = load();
    if (current == null) {
      save(partial);
      return;
    }
    // 旧端 :99-105 逐字：非 null 且非空串（id 非 0）才取 partial，否则保留 current
    const next: WxUserInfoLocal = {
      id: partial.id != null && partial.id !== 0 ? partial.id : current.id,
      openid: partial.openid != null && partial.openid !== "" ? partial.openid : current.openid,
      phone: partial.phone != null && partial.phone !== "" ? partial.phone : current.phone,
      nickname: partial.nickname != null && partial.nickname !== "" ? partial.nickname : current.nickname,
      avatarUrl:
        partial.avatarUrl != null && partial.avatarUrl !== "" ? partial.avatarUrl : current.avatarUrl,
    };
    save(next);
  }

  function clear(): void {
    deps.backend.remove(K_USER);
  }

  return { load, save, merge, clear };
}
