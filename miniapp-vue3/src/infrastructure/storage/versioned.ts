// P2-06 versioned storage：兼容读旧键（token/userInfo/brand_id）→ 幂等读旧写新（验证期不删旧键）；
// 新键带平台/Profile 归属，读取时校验（跨 Profile 隔离）；损坏内容安全失败（视为缺失，不抛）。
// 旧端键事实：token（auth.uts:23/37/48）、userInfo（auth.uts:62/79/113）、brand_id（brand.uts:17/31）。
import type { Platform } from "../../ports/context";
import type { StoragePort } from "../../ports/storage";
import type { Session } from "../http/client";
import { isKnownBrandCode, rememberKnownBrandCodes, warnBrandCodeRejected } from "../../domain/brand-code";

const K_SESSION = "lm.session.v1";
const K_BRAND = "lm.brand.v1";
/** 已知商家编码缓存（品牌馆拉取 `GET /api/brands` 后并入；2026-10-13 事故修复新增） */
const K_BRANDS = "lm.brands.v1";
const LEGACY_TOKEN = "token";
const LEGACY_USER = "userInfo";
const LEGACY_BRAND = "brand_id";

export interface VersionedStorage {
  loadSession(): Session | null;
  saveSession(session: Session): void;
  /** 只清新键；旧键验证期间一律保留 */
  clearSession(): void;
  /** 品牌上下文（**商家编码**）；非法/未知值返回 null 并清理存量脏值（2026-10-13 事故修复） */
  loadBrandId(): string | null;
  /** 仅接受**已知商家编码**；非法值**不写入**（保留既有合法值） */
  saveBrandId(id: string): void;
  /** 已知商家编码缓存（品牌馆拉到 /api/brands 后并入，供离线/首启兜底） */
  loadKnownBrandCodes(): string[];
  rememberBrandCodes(codes: readonly string[]): void;
}

/**
 * 2026-09-28 UX 登录门口径：仅弹窗交互登录（kind==="full"）算「已登录」。
 * 静默换票会话（silent）只给 authRequired 接口带票，不得通过 UX 门——
 * 否则用户从不弹登录窗（AI 试衣/AI 推荐等转化场景失守）。
 */
export function isFullSession(s: Session | null): boolean {
  return s != null && s.kind === "full";
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
      kind: "full", // 旧端 token 仅来自弹窗交互登录（auth.uts loginSuccess）⇒ 迁移即 full（2026-09-28）
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

  /** 读取已知编码缓存（损坏安全失败＝空列表） */
  function loadKnownBrandCodes(): string[] {
    const raw = deps.backend.get(K_BRANDS);
    if (raw == null || raw === "") return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      const list = parsed.filter((x): x is string => typeof x === "string" && x !== "");
      // 并入运行期注册表：无 storage 的一侧（http client）据此同步校验
      rememberKnownBrandCodes(list);
      return list;
    } catch {
      return [];
    }
  }

  /** 并入已知编码（幂等去重后持久化） */
  function rememberBrandCodes(codes: readonly string[]): void {
    const merged = Array.from(new Set([...loadKnownBrandCodes(), ...codes.filter((c) => typeof c === "string" && c !== "")]));
    deps.backend.set(K_BRANDS, JSON.stringify(merged));
    rememberKnownBrandCodes(merged);
  }

  /**
   * 品牌上下文＝**商家编码**（2026-10-13 事故修复）：读到非法/未知值一律**视为无品牌**并**清理存量脏值**，
   * 否则老用户会被历史脏值长期锁死（后端对已存在的品牌头不回落，直接 500「品牌不存在或已停用」⇒ 整站空白）。
   */
  function loadBrandId(): string | null {
    const known = loadKnownBrandCodes();
    const fresh = deps.backend.get(K_BRAND);
    const hasFresh = fresh != null && fresh.length > 0;
    const raw = hasFresh ? (fresh as string) : deps.backend.get(LEGACY_BRAND);
    if (raw == null || raw === "") return null;
    if (!isKnownBrandCode(raw, known)) {
      warnBrandCodeRejected(raw, "非已知商家编码（loadBrandId）");
      // 存量脏值清理：新键必清；旧键仅在值相同时清（避免误删他处写入）
      deps.backend.remove(K_BRAND);
      if (deps.backend.get(LEGACY_BRAND) === raw) deps.backend.remove(LEGACY_BRAND);
      return null;
    }
    if (!hasFresh) deps.backend.set(K_BRAND, raw); // 读旧写新（仅合法值才迁移）
    return raw;
  }

  /** 仅接受已知商家编码：非法值不写入（保留既有合法值），并打一次性日志 */
  function saveBrandId(id: string): void {
    if (!isKnownBrandCode(id, loadKnownBrandCodes())) {
      warnBrandCodeRejected(id, "saveBrandId 拒写非已知商家编码");
      return;
    }
    deps.backend.set(K_BRAND, id);
  }

  return { loadSession, saveSession, clearSession, loadBrandId, saveBrandId, loadKnownBrandCodes, rememberBrandCodes };
}
