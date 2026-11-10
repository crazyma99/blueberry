// 上传/封面遇 401 作废商家会话（issue #14 · CR 🟡3）：multipart 上传不经 http client，client 的 401 自愈覆盖不到——
// 此前只让页面显示「登录失效」，会话还在盘上，用户点「前往登录」后登录页 onShow 看到已登录又弹回工作台，形成循环。
// 变异靶点：①去掉 expireSessionByToken 的 token 比对（旧 token 迟到 401 误杀新会话）②相册上传 401 不作废 ③封面 401 不作废
//          ④页面不接线 expireSession（详情页/列表页）⑤作废后登录页仍自动跳工作台。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  onLoad: [] as Array<(o?: Record<string, unknown>) => void>,
  onShow: [] as Array<() => void>,
  store: new Map<string, string>(),
  reLaunches: [] as string[],
  responder: ((_u: string) => ({ status: 200, code: 200, data: {} })) as (u: string) => { status?: number; code?: number | null; message?: string; data?: unknown },
}));
vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoad.push(fn),
  onShow: (fn: () => void) => h.onShow.push(fn),
  onHide: () => undefined,
  onReachBottom: () => undefined,
  onPullDownRefresh: () => undefined,
}));
vi.mock("../../src/platform/uni/transport", () => ({
  createUniTransport: () => ({
    request: async (req: { url: string }) => {
      const r = h.responder(req.url);
      return { ok: true, value: { status: r.status ?? 200, businessCode: r.code === undefined ? 200 : r.code, message: r.message, requestId: null, data: r.data } };
    },
    cancel: () => undefined,
  }),
}));

import LoginPage from "../../src/pkg-merchant/login/index.vue";
import { __resetMerchantRuntime, getMerchantRuntime } from "../../src/pkg-merchant/application/merchant-runtime";
import { createMerchantSession } from "../../src/pkg-merchant/application/merchant-session";
import { createAlbumUploader } from "../../src/pkg-merchant/application/merchant-album-uploader";
import { createCoverUploader } from "../../src/pkg-merchant/application/merchant-cover-uploader";
import { createImageUseCases } from "../../src/pkg-merchant/application/merchant-image-flow";
import { createMerchantImageRepository } from "../../src/pkg-merchant/infrastructure/merchant-images";
import { MERCHANT_PROFILE_KEY, MERCHANT_SESSION_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";
import type { StoragePort } from "../../src/ports/storage";
import type { HttpPort, HttpRequest } from "../../src/ports/http";
import type { UploadPort } from "../../src/ports/upload";

const root = resolve(__dirname, "../..");
const loginData = (token: string) => ({ token, adminId: 7, merchantId: 3, username: "a", role: "merchant", displayName: "A", shopList: [], permissions: ["album"] });
function memStorage() {
  const data = new Map<string, string>();
  const s: StoragePort & { data: Map<string, string> } = { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
  return s;
}
function mkSession(backend: StoragePort, tokenSeq: string[] = ["T1"]) {
  let i = 0;
  const transport: HttpPort = {
    request: async <T,>(req: HttpRequest) => ({ ok: true, value: { status: 200, businessCode: 200, requestId: null, data: (req.url === "/auth/login" ? loginData(tokenSeq[Math.min(i++, tokenSeq.length - 1)]) : {}) as T } }),
    cancel: () => {},
  };
  return createMerchantSession({ backend, transport, platform: "mp-weixin", environment: "trial", profileKey: "blueberry", appCode: "blueBerry" });
}
const resp = (statusCode: number, body: unknown) => ({ ok: true as const, value: { statusCode, data: JSON.stringify(body) } });
const goodCompress = { compress: async (p: string) => ({ path: "c-" + p, size: 1, width: 1, height: 1, reused: false }) };
const settle = async (u: ReturnType<typeof createAlbumUploader>) => { for (let i = 0; i < 200 && u.isRunning(); i++) await new Promise((r) => setTimeout(r, 0)); };

describe("expireSessionByToken：按「在飞请求所用 token」精确作废", () => {
  it("⭐token 相同 ⇒ 作废（会话与盘上键清除，getState 变未登录）", async () => {
    const backend = memStorage();
    const m = mkSession(backend);
    await m.login("a", "b");
    expect(m.getState().loggedIn).toBe(true);
    expect(m.expireSessionByToken("T1")).toBe(true);
    expect(m.getState().loggedIn).toBe(false);
    expect(backend.data.has(MERCHANT_SESSION_KEY)).toBe(false);
  });
  it("⭐旧 token 的迟到 401 不误杀新会话：先 T1 → 重新登录得 T2 → 再来一个 T1 的 401 ⇒ 不作废（变异：去掉 token 比对即红）", async () => {
    const m = mkSession(memStorage(), ["T1", "T2"]);
    await m.login("a", "b");
    m.expireSessionByToken("T1");
    await m.login("a", "b"); // 重新登录，拿到 T2
    expect(m.getToken()).toBe("T2");
    expect(m.expireSessionByToken("T1")).toBe(false); // 迟到的旧 token 401
    expect(m.getState().loggedIn).toBe(true);
    expect(m.getToken()).toBe("T2");
  });
  it("空 token / 未登录 ⇒ 不作废、不抛；只清商家键，C 端键原封不动", async () => {
    const backend = memStorage();
    backend.set("lm.session.v1", JSON.stringify({ token: "C-TOKEN" }));
    backend.set("token", "C-LEGACY");
    const m = mkSession(backend);
    expect(m.expireSessionByToken("T1")).toBe(false);
    await m.login("a", "b");
    expect(m.expireSessionByToken("")).toBe(false);
    expect(m.expireSessionByToken("T1")).toBe(true);
    expect(backend.data.get("lm.session.v1")).toBe(JSON.stringify({ token: "C-TOKEN" }));
    expect(backend.data.get("token")).toBe("C-LEGACY");
  });
});

describe("⭐相册批量上传 401 ⇒ 作废会话（用本次请求所用 token）", () => {
  it("HTTP 401：expireSession 收到的是请求实际带的 token；剩余项标失败；onAuthExpired 通知", async () => {
    const used: string[] = [];
    let expired = 0;
    const port: UploadPort = { upload: async () => ({ ok: true, value: { statusCode: 401, data: "x" } }), cancel: () => {} };
    const u = createAlbumUploader({ upload: port, compress: goodCompress, getToken: () => "T-USED", uploadUrl: "u", shopId: 3, albumId: 7, expireSession: (t) => used.push(t), onAuthExpired: () => expired++ });
    u.enqueue([{ path: "a", size: 1 }, { path: "b", size: 1 }]);
    await settle(u);
    expect(used).toEqual(["T-USED"]);
    expect(expired).toBe(1);
    expect(u.items().every((i) => i.status === "failed")).toBe(true);
  });
  it("信封 code=401 同样作废；非 401 失败（业务错/网络）不作废（变异：401 不作废即红）", async () => {
    const used: string[] = [];
    const mk = (r: ReturnType<typeof resp> | { ok: false; reason: "network" }) =>
      createAlbumUploader({ upload: { upload: async () => r, cancel: () => {} }, compress: goodCompress, getToken: () => "T", uploadUrl: "u", shopId: 3, albumId: 7, expireSession: (t) => used.push(t) });
    const a = mk(resp(200, { code: 401, message: "x" }));
    a.enqueue([{ path: "a", size: 1 }]);
    await settle(a);
    expect(used).toEqual(["T"]);
    used.length = 0;
    for (const r of [resp(200, { code: 500, message: "相册不存在或无权限" }), resp(200, { code: 200, data: [] }), { ok: false as const, reason: "network" as const }]) {
      const b = mk(r);
      b.enqueue([{ path: "a", size: 1 }]);
      await settle(b);
    }
    expect(used).toEqual([]);
  });
  it("expireSession 抛异常不影响收口（仍通知页面、仍结束）", async () => {
    let expired = 0;
    const u = createAlbumUploader({ upload: { upload: async () => ({ ok: true, value: { statusCode: 401, data: "" } }), cancel: () => {} }, compress: goodCompress, getToken: () => "T", uploadUrl: "u", shopId: 3, albumId: 7, expireSession: () => { throw new Error("boom"); }, onAuthExpired: () => expired++ });
    u.enqueue([{ path: "a", size: 1 }]);
    await settle(u);
    expect(expired).toBe(1);
    expect(u.isRunning()).toBe(false);
  });
});

describe("⭐封面上传 401 ⇒ 作废会话", () => {
  const mk = (r: ReturnType<typeof resp>, used: string[]) =>
    createCoverUploader({ upload: { upload: async () => r, cancel: () => {} }, compress: goodCompress, getToken: () => "T-COVER", uploadUrl: "u", expireSession: (t) => used.push(t) });
  it("HTTP 401 / code=401 ⇒ 用所用 token 作废并返回 auth-expired；其余失败不作废（变异：不作废即红）", async () => {
    const used: string[] = [];
    expect(await mk(resp(401, {}), used).upload({ shopId: 3, path: "a", size: 1 })).toMatchObject({ ok: false, kind: "auth-expired" });
    expect(await mk(resp(200, { code: 401 }), used).upload({ shopId: 3, path: "a", size: 1 })).toMatchObject({ ok: false, kind: "auth-expired" });
    expect(used).toEqual(["T-COVER", "T-COVER"]);
    used.length = 0;
    await mk(resp(200, { code: 500, message: "图片不能超过 20MB" }), used).upload({ shopId: 3, path: "a", size: 1 });
    await mk(resp(413, {}), used).upload({ shopId: 3, path: "a", size: 1 });
    expect(used).toEqual([]);
  });
});

describe("⭐经 http client 的写接口 401（排序/删除/试衣）本就作废会话——补用例固定", () => {
  it("setTryon / move / remove 遇 401 ⇒ 商家会话被作废（不依赖页面再做什么）", async () => {
    for (const run of ["tryon", "sort", "delete"] as const) {
      const backend = memStorage();
      let respond401 = false;
      const transport: HttpPort = {
        request: async <T,>(req: HttpRequest) => {
          if (req.url === "/auth/login") return { ok: true, value: { status: 200, businessCode: 200, requestId: null, data: loginData("T1") as T } };
          return respond401 ? { ok: true, value: { status: 401, businessCode: 401, requestId: null, data: null as T } } : { ok: true, value: { status: 200, businessCode: 200, requestId: null, data: [] as T } };
        },
        cancel: () => {},
      };
      const m = createMerchantSession({ backend, transport, platform: "mp-weixin", environment: "trial", profileKey: "blueberry", appCode: "blueBerry" });
      await m.login("a", "b");
      const uc = createImageUseCases({ images: createMerchantImageRepository({ client: m.client }) });
      respond401 = true;
      const perm = { permissions: ["album"] };
      const img = { id: 1, albumId: 7, imageUrl: "u", sortOrder: 0, aiTryonStatus: 0, aiTryonReason: "", aiTryonManual: 0 };
      const r = run === "tryon" ? await uc.setTryon(m.nextContext(), perm, 3, img)
        : run === "sort" ? await uc.move(m.nextContext(), perm, 3, 7, [img, { ...img, id: 2 }], 2, "up")
        : await uc.remove(m.nextContext(), perm, 3, 7, [1]);
      expect(r, run).toMatchObject({ ok: false, kind: "auth-expired" });
      expect(m.getState().loggedIn, run).toBe(false);
    }
  });
});

describe("⭐循环：401 后「前往登录」不再被自动弹回工作台（真实登录页 + 真实运行时）", () => {
  beforeEach(() => {
    h.onLoad.length = 0;
    h.onShow.length = 0;
    h.store.clear();
    h.reLaunches.length = 0;
    __resetMerchantRuntime();
    h.store.set(MERCHANT_SESSION_KEY, JSON.stringify({ userId: "7", token: "T1", platform: "mp-weixin", profileKey: "blueberry", authRevision: 1, kind: "full" }));
    h.store.set(MERCHANT_PROFILE_KEY, JSON.stringify({ adminId: 7, merchantId: 3, username: "a", role: "merchant", displayName: "A", roleName: "", permissions: ["album"], shopList: [] }));
    (globalThis as { uni?: unknown }).uni = {
      getStorageSync: (k: string) => h.store.get(k) ?? "",
      setStorageSync: (k: string, v: string) => h.store.set(k, v),
      removeStorageSync: (k: string) => h.store.delete(k),
      getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
      getMenuButtonBoundingClientRect: () => ({ left: 280, width: 87 }),
      reLaunch: (o: { url: string }) => h.reLaunches.push(o.url),
      showToast: () => undefined,
      upx2px: (n: number) => n / 2,
    };
  });
  const GLOBAL = { stubs: { BaseFeedback: true, PageFooter: true, CustomNavBar: true } };

  it("对照：会话仍有效时进登录页会被弹回工作台（循环成因）", async () => {
    mount(LoginPage, { global: GLOBAL });
    h.onShow[h.onShow.length - 1]?.();
    await flushPromises();
    expect(h.reLaunches).toEqual(["/pkg-merchant/home/index"]);
  });
  it("⭐上传 401 作废会话后再进登录页：不再 reLaunch 回工作台（变异：不作废/登录页仍自动跳即红）", async () => {
    const rt = getMerchantRuntime();
    const u = createAlbumUploader({
      upload: { upload: async () => ({ ok: true, value: { statusCode: 401, data: "x" } }), cancel: () => {} },
      compress: goodCompress,
      getToken: () => rt.getToken(),
      uploadUrl: "u",
      shopId: 3,
      albumId: 7,
      expireSession: (t) => void rt.expireSessionByToken(t), // 页面接线同款
    });
    u.enqueue([{ path: "a", size: 1 }]);
    await settle(u);
    expect(rt.getState().loggedIn).toBe(false);
    h.reLaunches.length = 0;
    mount(LoginPage, { global: GLOBAL });
    h.onShow[h.onShow.length - 1]?.();
    await flushPromises();
    expect(h.reLaunches).toEqual([]); // 停在登录页
  });
  it("页面接线（源码级）：详情页传 expireSession → rt.expireSessionByToken；列表页封面上传传同款", () => {
    const strip = (x: string) => x.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const detail = strip(readFileSync(resolve(root, "src/pkg-merchant/album/detail.vue"), "utf-8"));
    const list = strip(readFileSync(resolve(root, "src/pkg-merchant/album/list.vue"), "utf-8"));
    expect(detail).toMatch(/expireSession:\s*\(usedToken\)\s*=>\s*\{\s*rt\.expireSessionByToken\(usedToken\);/);
    expect(list).toContain("expireSession: (usedToken) => void rt.expireSessionByToken(usedToken)");
  });
});
