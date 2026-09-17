// P2-07 品牌馆 controller：迟到响应治理/在飞去重/热恢复重查/失败隐藏（phases 行为测试例子落地）。
import { describe, expect, it, vi } from "vitest";
import type { RequestContext } from "../../src/ports/context";
import { createBrandHubController } from "../../src/application/brand-hub-controller";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function ctx(over: Partial<RequestContext> = {}): RequestContext {
  return { platform: "mp-weixin", environment: "trial", brandId: "A", requestId: "r", profileKey: "blueberry", appCode: "blueBerry", scopeRevision: 1, authRevision: 1, ...over };
}

describe("createBrandHubController（P2-07）", () => {
  it("新品牌结果不被迟到的旧品牌响应覆盖", async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    const loadConfig = vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const controller = createBrandHubController({ loadConfig });
    const oldRequest = controller.refresh(ctx({ brandId: "A", scopeRevision: 1 }));
    const newRequest = controller.refresh(ctx({ brandId: "B", scopeRevision: 2 }));
    b.resolve('{"enabled":true}'); await newRequest;
    a.resolve('{"enabled":true}'); await oldRequest;
    // 旧 A 响应迟到：scope 1 < 已应用 scope 2，不得回写
    expect(controller.enabled).toBe(true); // b 先落
    expect(loadConfig).toHaveBeenCalledTimes(2);
  });
  it("迟到旧响应不得把新品牌的 false 改回 true", async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    const loadConfig = vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const controller = createBrandHubController({ loadConfig });
    const oldRequest = controller.refresh(ctx({ brandId: "A", scopeRevision: 1 }));
    const newRequest = controller.refresh(ctx({ brandId: "B", scopeRevision: 2 }));
    b.resolve('{"enabled":false}'); await newRequest;
    a.resolve('{"enabled":true}'); await oldRequest;
    expect(controller.enabled).toBe(false);
  });
  it("同 scope 在飞去重：onLoad/onShow 重叠只查一次", async () => {
    const d = deferred<string>();
    const loadConfig = vi.fn().mockReturnValue(d.promise);
    const controller = createBrandHubController({ loadConfig });
    const p1 = controller.refresh(ctx());
    const p2 = controller.refresh(ctx()); // 同 scopeRevision
    d.resolve('{"enabled":true}');
    await Promise.all([p1, p2]);
    expect(loadConfig).toHaveBeenCalledTimes(1);
  });
  it("成功后热恢复必须重查（不缓存结果）", async () => {
    const loadConfig = vi.fn().mockResolvedValue('{"enabled":true}');
    const controller = createBrandHubController({ loadConfig });
    await controller.refresh(ctx());
    await controller.refresh(ctx()); // 同 scope 但前一查询已完成 → 重查
    expect(loadConfig).toHaveBeenCalledTimes(2);
  });
  it("坏 JSON／loadConfig 拒绝 → 隐藏（enabled=false）不抛", async () => {
    const bad = createBrandHubController({ loadConfig: async () => "broken" });
    await bad.refresh(ctx());
    expect(bad.enabled).toBe(false);
    const failing = createBrandHubController({ loadConfig: async () => { throw new Error("network"); } });
    await expect(failing.refresh(ctx())).resolves.toBeUndefined();
    expect(failing.enabled).toBe(false);
  });
  it("invalidate 后迟到旧响应不写入；invalidate 复位安全默认", async () => {
    const d = deferred<string>();
    const loadConfig = vi.fn().mockReturnValue(d.promise);
    const controller = createBrandHubController({ loadConfig });
    const p = controller.refresh(ctx({ scopeRevision: 1 }));
    controller.invalidate(); // 切品牌
    d.resolve('{"enabled":true}');
    await p;
    expect(controller.enabled).toBe(false); // invalidate 后旧响应作废
  });
});
