// P2-18 核心：user-info-store 非空合并语义字段级单测（独立CR 🟡3 补覆盖）。
// 旧端 auth.uts:92-109 mergeUserInfo 语义：非 null 且非空串（id 非 0）才覆盖，否则保留 current；
// current 为 null 时直接 setUserInfo(partial)。空值绝不覆盖已有头像/昵称。
import { describe, expect, it } from "vitest";
import { createUserInfoStore } from "../../src/application/user-info-store";
import type { StoragePort } from "../../src/ports/storage";

function makeStore(): { store: ReturnType<typeof createUserInfoStore>; map: Map<string, string> } {
  const map = new Map<string, string>();
  const backend: StoragePort = {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => {
      map.set(k, v);
    },
    remove: (k) => {
      map.delete(k);
    },
  };
  return { store: createUserInfoStore({ backend }), map };
}

const base = { id: 1, openid: "o1", phone: "138", nickname: "马老师", avatarUrl: "https://a/1.png" };

describe("user-info-store（P2-18 非空合并，旧端 auth.uts:92-109）", () => {
  it("merge 空值不覆盖：nickname/avatarUrl 为 null 或空串时保留 current", () => {
    const { store } = makeStore();
    store.save(base);
    store.merge({ id: 0, openid: "", phone: null, nickname: null, avatarUrl: "" });
    const next = store.load();
    expect(next?.nickname).toBe("马老师");
    expect(next?.avatarUrl).toBe("https://a/1.png");
    expect(next?.id).toBe(1); // id=0 不覆盖
    expect(next?.openid).toBe("o1"); // 空串不覆盖
    expect(next?.phone).toBe("138"); // null 不覆盖
  });

  it("merge 非空覆盖：新昵称/头像替换 current（乐观写入场景）", () => {
    const { store } = makeStore();
    store.save(base);
    store.merge({ id: 2, openid: "o2", phone: "139", nickname: "新昵称", avatarUrl: "https://a/2.png" });
    const next = store.load();
    expect(next?.nickname).toBe("新昵称");
    expect(next?.avatarUrl).toBe("https://a/2.png");
    expect(next?.id).toBe(2);
  });

  it("merge 到空存储：current 为 null 时直接写入 partial（旧端 :95-98）", () => {
    const { store } = makeStore();
    store.merge({ id: 0, openid: "", phone: null, nickname: "只填昵称", avatarUrl: null });
    const next = store.load();
    expect(next?.nickname).toBe("只填昵称");
    expect(next?.avatarUrl).toBeNull();
  });

  it("load 容错：损坏 JSON 视为缺失不抛；clear 后为 null", () => {
    const { store, map } = makeStore();
    map.set("lm.userinfo.v1", "{broken");
    expect(store.load()).toBeNull();
    store.save(base);
    store.clear();
    expect(store.load()).toBeNull();
  });
});
