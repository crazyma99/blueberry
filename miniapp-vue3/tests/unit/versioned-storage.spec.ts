// P2-06 versioned storage：兼容读旧键/平台Profile有效性校验/幂等读旧写新/不删旧键/损坏安全失败。
// 旧端键事实（旧仓实测）：token（auth.uts:23/37/48）、userInfo（auth.uts:62/79/113）、brand_id（brand.uts:17/31）。
import { describe, expect, it } from "vitest";
import { createVersionedStorage } from "../../src/infrastructure/storage/versioned";
import type { StoragePort } from "../../src/ports/storage";

function memStorage(init: Record<string, string> = {}): StoragePort & { data: Map<string, string>; sets: string[] } {
  const data = new Map<string, string>(Object.entries(init));
  const sets: string[] = [];
  return {
    data,
    sets,
    get: (k) => data.get(k) ?? null,
    set: (k, v) => { sets.push(k); data.set(k, v); },
    remove: (k) => { data.delete(k); },
  };
}
const deps = (backend: StoragePort) => ({ backend, platform: "mp-weixin" as const, profileKey: "blueberry" });

describe("createVersionedStorage（P2-06）", () => {
  it("兼容读旧 token/userInfo：迁移返回 session 并写新键，旧键保留不删", () => {
    const backend = memStorage({ token: "legacy-tok", userInfo: JSON.stringify({ userId: "u9", nickname: "n" }) });
    const vs = createVersionedStorage(deps(backend));
    const s = vs.loadSession();
    expect(s).not.toBeNull();
    expect(s!.token).toBe("legacy-tok");
    expect(s!.userId).toBe("u9");
    expect(backend.data.has("lm.session.v1")).toBe(true); // 读旧写新
    expect(backend.data.get("token")).toBe("legacy-tok"); // 验证期间不删旧键
    expect(backend.data.get("userInfo")).not.toBeNull();
  });
  it("幂等：二次 loadSession 不再写新键", () => {
    const backend = memStorage({ token: "t" });
    const vs = createVersionedStorage(deps(backend));
    vs.loadSession();
    const writes = backend.sets.length;
    vs.loadSession();
    expect(backend.sets.length).toBe(writes);
  });
  it("平台/Profile 有效性校验：新键属于其他 Profile → 视为无会话（跨 Profile 隔离）", () => {
    const foreign = JSON.stringify({ userId: "u", token: "t", platform: "mp-weixin", profileKey: "huahua", authRevision: 1 });
    const backend = memStorage({ "lm.session.v1": foreign });
    const vs = createVersionedStorage(deps(backend));
    expect(vs.loadSession()).toBeNull();
    const foreignPlatform = JSON.stringify({ userId: "u", token: "t", platform: "mp-toutiao", profileKey: "blueberry", authRevision: 1 });
    const vs2 = createVersionedStorage(deps(memStorage({ "lm.session.v1": foreignPlatform })));
    expect(vs2.loadSession()).toBeNull();
  });
  it("损坏内容安全失败：新键非法 JSON → null 不抛；旧 userInfo 损坏 → token 仍可迁移", () => {
    const vs1 = createVersionedStorage(deps(memStorage({ "lm.session.v1": "not-json{" })));
    expect(vs1.loadSession()).toBeNull();
    const backend2 = memStorage({ token: "t", userInfo: "broken" });
    const vs2 = createVersionedStorage(deps(backend2));
    const s = vs2.loadSession();
    expect(s).not.toBeNull();
    expect(s!.userId).toBe(""); // 降级：userInfo 损坏不阻断 token 迁移
  });
  it("brand_id 兼容迁移＋新键优先＋旧键保留；clearSession 只清新键", () => {
    const backend = memStorage({ brand_id: "7", token: "t" });
    const vs = createVersionedStorage(deps(backend));
    expect(vs.loadBrandId()).toBe("7");
    expect(backend.data.get("lm.brand.v1")).toBe("7");
    expect(backend.data.get("brand_id")).toBe("7");
    backend.data.set("lm.brand.v1", "9"); // 新键优先
    expect(vs.loadBrandId()).toBe("9");
    vs.saveSession({ userId: "u", token: "t2", platform: "mp-weixin", profileKey: "blueberry", authRevision: 3 });
    vs.clearSession();
    expect(backend.data.has("lm.session.v1")).toBe(false);
    expect(backend.data.get("token")).toBe("t"); // 清新不删旧
  });
});
