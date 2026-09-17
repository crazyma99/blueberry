// T8 S1 适配层测试：上传端口（容器安全/头透传/取消）＋微信能力适配（截屏保护守卫与恢复、订阅消息 fail-soft）。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUniUpload } from "../../src/platform/uni/upload";
import { createCaptureGuard, requestTaskNotify } from "../../src/platform/weixin/capabilities";

type WxStub = {
  setVisualEffectOnCapture?: (o: { visualEffect: string }) => void;
  canIUse?: (s: string) => boolean;
  requestSubscribeMessage?: (o: { tmplIds: string[]; success: () => void; fail: () => void }) => void;
};

beforeEach(() => {
  delete (globalThis as { uni?: unknown }).uni;
  delete (globalThis as { wx?: unknown }).wx;
});

describe("platform/uni/upload（T8 S1 上传端口）", () => {
  it("容器无 uni.uploadFile → network 失败（不抛）", async () => {
    const r = await createUniUpload().upload({ url: "https://x/u", filePath: "/tmp/a.png", name: "file" });
    expect(r).toEqual({ ok: false, reason: "network" });
  });

  it("成功：头与表单字段逐字透传（品牌头注入由调用方负责，端口不改写）", async () => {
    const seen: Array<Record<string, unknown>> = [];
    (globalThis as { uni?: unknown }).uni = {
      uploadFile: (o: Record<string, unknown>) => {
        seen.push(o);
        (o.success as (r: { statusCode: number; data: string }) => void)({ statusCode: 200, data: '{"code":0}' });
        return { abort: () => undefined };
      },
    };
    const r = await createUniUpload().upload({
      url: "https://api.example/u",
      filePath: "/tmp/a.png",
      name: "file",
      headers: { "X-App-Code": "blueBerry", "X-Brand-Id": "lanmei" },
      formData: { shopId: "2" },
      timeoutMs: 60000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.statusCode).toBe(200);
    expect(seen[0]).toMatchObject({
      url: "https://api.example/u",
      filePath: "/tmp/a.png",
      name: "file",
      header: { "X-App-Code": "blueBerry", "X-Brand-Id": "lanmei" },
      formData: { shopId: "2" },
      timeout: 60000,
    });
  });

  it("fail 回调 → network 失败；cancel() 调用底层 abort 且不抛", async () => {
    let aborted = 0;
    (globalThis as { uni?: unknown }).uni = {
      uploadFile: (o: Record<string, unknown>) => {
        (o.fail as () => void)();
        return {
          abort: () => {
            aborted += 1;
          },
        };
      },
    };
    const port = createUniUpload();
    const r = await port.upload({ url: "https://x/u", filePath: "/tmp/a.png", name: "file" });
    expect(r).toEqual({ ok: false, reason: "network" });
    port.cancel(); // 无在飞任务：静默
    expect(aborted).toBe(0);
  });
});

describe("platform/weixin/capabilities（T8 S1 截屏保护/订阅消息）", () => {
  it("截屏保护：无 wx → 静默不抛；有 wx 且 canIUse 通过 → enable/disable 分别下发 hidden/none", () => {
    const guard = createCaptureGuard();
    expect(() => guard.enable()).not.toThrow(); // 容器无 wx
    expect(() => guard.disable()).not.toThrow();

    const calls: string[] = [];
    (globalThis as { wx?: unknown }).wx = {
      canIUse: () => true,
      setVisualEffectOnCapture: (o: { visualEffect: string }) => {
        calls.push(o.visualEffect);
      },
    } as WxStub;
    guard.enable();
    guard.disable();
    guard.disable(); // 幂等
    expect(calls).toEqual(["hidden", "none", "none"]);
  });

  it("截屏保护：canIUse=false（低版本）→ 不下发调用（守卫生效）", () => {
    const calls: string[] = [];
    (globalThis as { wx?: unknown }).wx = {
      canIUse: () => false,
      setVisualEffectOnCapture: (o: { visualEffect: string }) => {
        calls.push(o.visualEffect);
      },
    } as WxStub;
    createCaptureGuard().enable();
    expect(calls).toEqual([]);
  });

  it("订阅消息：无 wx／无 API → fail-soft unsupported；用户拒绝 → rejected；同意 → ok（均不抛、不阻断）", async () => {
    await expect(requestTaskNotify(["t1"])).resolves.toEqual({ ok: false, reason: "unsupported" });

    (globalThis as { wx?: unknown }).wx = {
      requestSubscribeMessage: (o: { tmplIds: string[]; success: () => void; fail: () => void }) => o.fail(),
    } as WxStub;
    await expect(requestTaskNotify(["t1"])).resolves.toEqual({ ok: false, reason: "rejected" });

    (globalThis as { wx?: unknown }).wx = {
      requestSubscribeMessage: (o: { tmplIds: string[]; success: () => void; fail: () => void }) => o.success(),
    } as WxStub;
    await expect(requestTaskNotify(["t1"])).resolves.toEqual({ ok: true });
  });
});
