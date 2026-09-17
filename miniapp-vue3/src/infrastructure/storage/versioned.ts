// P2-06 versioned storage：兼容读旧键（token/userInfo/brand_id）→ 幂等读旧写新（验证期不删旧键）；
// 新键带平台/Profile 归属，读取时校验（跨 Profile 隔离）；损坏内容安全失败（视为缺失，不抛）。
// 旧端键事实：token（auth.uts:23/37/48）、userInfo（auth.uts:62/79/113）、brand_id（brand.uts:17/31）。
import type { Platform } from "../../ports/context";
import type { StoragePort } from "../../ports/storage";
import type { Session } from "../http/client";

const K_SESSION = "lm.session.v1";
const K_BRAND = "lm.brand.v1";
const LEGACY_TOKEN = "token";
const LEGACY_USER = "userInfo";
const LEGACY_BRAND = "brand_id";

export interface VersionedStorage {
  loadSession(): Session | null;
  saveSession(session: Session): void;
  /** 只清新键；旧键验证期间一律保留 */
  clearSession(): void;
  loadBrandId(): string | null;
  saveBrandId(id: string): void;
}

export function createVersionedStorage(deps: {
  backend: StoragePort;
  platform: Platform;
  profileKey: string;
}): VersionedStorage {
  function validForThisProfile(s: Session): boolean {
    return s.platform === deps.platform && s.profileKey === deps.profileKey;
  }

  function loadSession(): Session | null {
    const raw = deps.backend.get(K_SESSION);
    if (raw != null) {
      try {
        const parsed = JSON.parse(raw) as Session | null;
        if (parsed != null && typeof parsed.token === "string" && typeof parsed.authRevision === "number") {
          // 平台/Profile 归属校验：不属于当前组合的会话视为无会话（跨 Profile 隔离）
          return validForThisProfile(parsed) ? parsed : null;
        }
        return null;
      } catch {
        return null; // 损坏内容安全失败
      }
    }
    // 兼容读旧键：token 为主键，userInfo 仅补充 userId（损坏不阻断迁移）
    const legacyToken = deps.backend.get(LEGACY_TOKEN);
    if (legacyToken == null || legacyToken.length === 0) return null;
    let userId = "";
    const rawUser = deps.backend.get(LEGACY_USER);
    if (rawUser != null) {
      try {
        const u = JSON.parse(rawUser) as { userId?: unknown } | null;
        if (u != null && typeof u.userId === "string") userId = u.userId;
      } catch {
        userId = "";
      }
    }
    const migrated: Session = {
      userId,
      token: legacyToken,
      platform: deps.platform,
      profileKey: deps.profileKey,
      authRevision: 0,
    };
    // 幂等读旧写新：仅在新键缺失时写入（本分支即缺失）；旧键保留不删
    deps.backend.set(K_SESSION, JSON.stringify(migrated));
    return migrated;
  }

  function saveSession(session: Session): void {
    deps.backend.set(K_SESSION, JSON.stringify(session));
  }

  function clearSession(): void {
    deps.backend.remove(K_SESSION);
  }

  function loadBrandId(): string | null {
    const fresh = deps.backend.get(K_BRAND);
    if (fresh != null && fresh.length > 0) return fresh; // 新键优先
    const legacy = deps.backend.get(LEGACY_BRAND);
    if (legacy != null && legacy.length > 0) {
      deps.backend.set(K_BRAND, legacy); // 读旧写新；旧键保留
      return legacy;
    }
    return null;
  }

  function saveBrandId(id: string): void {
    deps.backend.set(K_BRAND, id);
  }

  return { loadSession, saveSession, clearSession, loadBrandId, saveBrandId };
}
