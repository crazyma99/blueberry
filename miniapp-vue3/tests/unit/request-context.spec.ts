// T6 装配层测试：request-context 工厂（代次治理单一出口）＋平台传输/存储适配的容器安全回落。
import { describe, expect, it } from "vitest";
import { createContextFactory } from "../../src/application/request-context";
import { createUniStorage } from "../../src/platform/uni/storage";

function factory(over: { getBrandId?: () => string | null } = {}) {
  return createContextFactory({
    platform: "mp-weixin",
    environment: "trial",
    profileKey: "blueberry",
    appCode: "blueBerry",
    getBrandId: over.getBrandId ?? (() => null),
  });
}

describe("createContextFactory（P2-07/P2-03 代次治理）", () => {
  it("next() 字段完整＋requestId 唯一递增", () => {
    const f = factory();
    const a = f.next();
    const b = f.next();
    expect(a).toMatchObject({ platform: "mp-weixin", environment: "trial", profileKey: "blueberry", appCode: "blueBerry", scopeRevision: 0, authRevision: 0 });
    expect(a.requestId).not.toBe(b.requestId);
  });
  it("bumpScope/bumpAuth 递增代次；brandId 每次取最新（切品牌后新请求带新值）", () => {
    let brand: string | null = "7";
    const f = factory({ getBrandId: () => brand });
    expect(f.next().brandId).toBe("7");
    f.bumpScope();
    f.bumpAuth();
    const c = f.next();
    expect(c.scopeRevision).toBe(1);
    expect(c.authRevision).toBe(1);
    brand = "9";
    expect(f.next().brandId).toBe("9"); // 在飞旧请求仍持旧快照（client 冻结），新请求取新值
  });
});

describe("createUniStorage 容器安全回落（无 uni 时内存实现）", () => {
  it("set/get/remove 往返", () => {
    const s = createUniStorage();
    expect(s.get("k")).toBeNull();
    s.set("k", "v");
    expect(s.get("k")).toBe("v");
    s.remove("k");
    expect(s.get("k")).toBeNull();
  });
});
