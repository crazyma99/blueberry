// T6 详情页：cosThumb 缩略（旧端 imageLoader.uts:33-46）＋冒烟（mock uni 生命周期）。
// 2026-09-28 点赞登录门：未登录（无会话/仅 silent 会话）点赞 ⇒ 弹登录窗且不发点赞请求；
// 登录成功自动补发挂起动作（旧端 401 挂起队列 flushPendingRequests 语义）。
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { cosThumb, isCosHost } from "../../src/application/image";

const h = vi.hoisted(() => ({
  pullDownCalls: [] as Array<() => void>,
  stops: 0,
  detailCalls: 0,
  detailMode: "fail" as "ok" | "fail",
  likeCalls: [] as number[],
  statusCalls: [] as string[],
  likeStatus: [{ albumId: 42, liked: false, likeCount: 3 }] as Array<Record<string, unknown>>,
  store: new Map<string, string>(),
  onLoadCalls: [] as Array<(o: Record<string, unknown>) => void>,
}));
// ⚠️ 2026-09-21：本打桩（下拉刷新计数用，默认 fail）同时承担了下方冒烟用例的失败来源
//   ⇒ 该用例的「加载失败」＝桩 `ok:false`（与真实 client 失败同形）；真实 client＋空 transport 的失败路径见 t6-index（独立 CR 🟡6 据实更正）。
vi.mock("../../src/infrastructure/repositories/albums", () => ({
  createAlbumRepository: () => ({
    getAlbumDetail: async () => {
      h.detailCalls += 1;
      return h.detailMode === "ok"
        ? { ok: true, value: { images: [{ imageUrl: "https://lanmei66.cloud/a.jpg" }], likeCount: 3 } }
        : { ok: false };
    },
    getCategories: async () => ({ ok: false }),
    getAlbumList: async () => ({ ok: false }),
  }),
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o: Record<string, unknown>) => void) => {
    h.onLoadCalls.push(fn);
  },
  onPullDownRefresh: (fn: () => void) => {
    h.pullDownCalls.push(fn);
  },
  onShareAppMessage: () => undefined,
  onShareTimeline: () => undefined,}));

// 2026-09-28 点赞登录门用例：点赞仓储打桩计数（likeStatus 数据驱动，默认单 id 状态 ⇒ likeState 就绪；
// 2026-09-29 收藏态登录门用例借 statusCalls 验证「未登录不拉取点赞态」）
vi.mock("../../src/infrastructure/repositories/likes", () => ({
  createLikeRepository: () => ({
    getLikeStatus: async (_ctx: unknown, albumIds: string) => {
      h.statusCalls.push(albumIds);
      return { ok: true, value: h.likeStatus };
    },
    toggleLike: async (_ctx: unknown, albumId: number) => {
      h.likeCalls.push(albumId);
      return { ok: true, value: { liked: true, likeCount: 4 } };
    },
  }),
}));

// 登录流打桩（runPhoneLogin step2/step3）：换票与绑手机号均成功 ⇒ 登录成功（full 会话）
vi.mock("../../src/infrastructure/repositories/wx-auth", () => ({
  createWxAuthRepository: () => ({
    login: async () => ({ ok: true, value: { token: "tk-full", userInfo: { id: 1, openid: "o1" } } }),
    bindPhone: async () => ({ ok: true, value: { nickname: "测试", avatarUrl: "https://cos.example/av.png" } }),
  }),
}));

// 弹窗组件 stub（同 t24：本测试只验页面接线）
vi.mock("../../src/components/LoginPopup/LoginPopup.vue", () => ({
  default: { name: "LoginPopup", template: '<view class="stub-login-popup" />' },
}));

import DetailPage from "../../src/pages/targetPhotoDetail/index.vue";

const flush = () => new Promise((r) => setTimeout(r, 20));

describe("cosThumb／isCosHost（旧端忠实移植，含 CR 🟡 防误命中）", () => {
  it("COS 主域拼接 WebP 750 缩略；已有 query 用 & 连接", () => {
    expect(isCosHost("https://lanmei66.cloud/a.jpg")).toBe(true);
    expect(isCosHost("https://img.lanmei66.cloud/a.jpg")).toBe(true);
    expect(isCosHost("https://xx-lanmei66.cloud.yy/a.jpg")).toBe(false); // 子串防误命中
    expect(isCosHost("https://evil.example.com/a.jpg")).toBe(false);
    expect(cosThumb("https://lanmei66.cloud/a.jpg", 750)).toBe("https://lanmei66.cloud/a.jpg?imageMogr2/format/webp/thumbnail/750x");
    expect(cosThumb("https://lanmei66.cloud/a.jpg?v=1", 750)).toBe("https://lanmei66.cloud/a.jpg?v=1&imageMogr2/format/webp/thumbnail/750x");
  });
  it("非 COS 域与空串原样返回", () => {
    expect(cosThumb("https://evil.example.com/a.jpg", 750)).toBe("https://evil.example.com/a.jpg");
    expect(cosThumb("", 750)).toBe("");
  });
});

describe("pages/targetPhotoDetail 冒烟（mock 生命周期）", () => {
  it("缺入参兜底回首页 tab（2026-09-22 主人拍板 A）；有入参 → 详情请求失败收敛错误态＋可重试", async () => {
    const w = mount(DetailPage);
    await w.vm.$nextTick();
    expect(h.onLoadCalls.length).toBeGreaterThan(0);
    const reLaunch = vi.fn();
    const toastSpy = vi.fn();
    const uniObj = (globalThis as { uni?: Record<string, unknown> }).uni ?? {};
    (globalThis as { uni?: Record<string, unknown> }).uni = { ...uniObj, reLaunch, showToast: toastSpy };
    h.onLoadCalls[h.onLoadCalls.length - 1]({ liked: "true" }); // 缺 idx ⇒ 兜底
    await flush();
    await w.vm.$nextTick();
    expect(toastSpy).toHaveBeenCalled();
    expect(reLaunch).toHaveBeenCalledWith({ url: "/pages/index/index" });
    h.onLoadCalls[h.onLoadCalls.length - 1]({ idx: "42", type: "1" });
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".sk-container").exists()).toBe(false);
    expect(w.text()).toContain("加载失败");
    expect(w.find(".retry-btn").exists()).toBe(true);
  });
});

describe("客片详情页 · 下拉刷新（2026-09-21 主人②）", () => {
  it("下拉 ⇒ 重载详情（getAlbumDetail 第二次）＋收口一次", async () => {
    (globalThis as { uni?: unknown }).uni = {
      stopPullDownRefresh: () => {
        h.stops += 1;
      },
    };
    h.detailMode = "ok";
    h.detailCalls = 0;
    h.stops = 0;
    h.pullDownCalls.length = 0;
    h.onLoadCalls.length = 0;
    const w = mount(DetailPage);
    await flush();
    h.onLoadCalls[h.onLoadCalls.length - 1]({ idx: "42", type: "1" });
    await flush();
    expect(h.detailCalls).toBe(1);
    expect(h.pullDownCalls.length).toBe(1);
    h.pullDownCalls[0]();
    await flush();
    expect(h.detailCalls).toBe(2);
    expect(h.stops).toBe(1);
    delete (globalThis as { uni?: unknown }).uni;
    w.unmount();
  });
});

// ===== 2026-09-28 点赞登录门（旧端 login-required 订阅弹窗＋401 挂起队列自动重试 ⇒ 页面门＋pending 补发）=====
describe("pages/targetPhotoDetail 点赞登录门（只认 full 会话；静默会话不算已登录）", () => {
  function seedSession(kind: "silent" | "full"): void {
    h.store.set(
      "lm.session.v1",
      JSON.stringify({
        userId: "1",
        token: "tk-" + kind,
        platform: "mp-weixin",
        profileKey: "blueberry",
        authRevision: 1,
        kind,
      }),
    );
  }

  beforeEach(() => {
    h.store.clear();
    h.likeCalls.length = 0;
    h.detailMode = "ok";
    h.detailCalls = 0;
    h.onLoadCalls.length = 0;
    (globalThis as { uni?: unknown }).uni = {
      getStorageSync: (k: string) => h.store.get(k) ?? "",
      setStorageSync: (k: string, v: string) => {
        h.store.set(k, v);
      },
      removeStorageSync: (k: string) => {
        h.store.delete(k);
      },
      login: (o: { success?: (r: { code: string }) => void }) => o.success?.({ code: "wx-code-1" }),
      showLoading: () => undefined,
      hideLoading: () => undefined,
    };
  });

  async function mountDetail(): Promise<VueWrapper> {
    const w = mount(DetailPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]({ idx: "42", type: "1" });
    await flush();
    await w.vm.$nextTick();
    return w;
  }

  /** 弹窗内完成手机号授权登录（协议已勾选 → getPhoneNumber ok → runPhoneLogin 全链路桩成功） */
  async function loginViaPopup(w: VueWrapper): Promise<void> {
    const popup = w.findComponent({ name: "LoginPopup" });
    popup.vm.$emit("toggle-agreement");
    popup.vm.$emit("get-phone", { detail: { errMsg: "getPhoneNumber:ok", code: "phone-code-1" } });
    await flush();
    await w.vm.$nextTick();
  }

  it("未登录（无会话）点赞 ⇒ 弹登录窗、不发点赞请求；登录成功后自动补发一次", async () => {
    const w = await mountDetail();
    expect(w.find(".collect").exists()).toBe(true);
    expect(w.find(".stub-login-popup").exists()).toBe(false);
    await w.find(".collect").trigger("click");
    await w.vm.$nextTick();
    expect(w.find(".stub-login-popup").exists()).toBe(true);
    expect(h.likeCalls).toEqual([]); // 门禁在乐观更新之前：无请求
    await loginViaPopup(w);
    expect(w.find(".stub-login-popup").exists()).toBe(false);
    expect(h.likeCalls).toEqual([42]); // 自动补发挂起的那次点赞（旧端 flushPendingRequests 语义）
    w.unmount();
  });

  it("仅静默会话（kind:silent）点赞 ⇒ 同样弹登录窗、不发请求；登录成功后补发", async () => {
    seedSession("silent");
    const w = await mountDetail();
    await w.find(".collect").trigger("click");
    await w.vm.$nextTick();
    expect(w.find(".stub-login-popup").exists()).toBe(true);
    expect(h.likeCalls).toEqual([]);
    await loginViaPopup(w);
    expect(h.likeCalls).toEqual([42]);
    w.unmount();
  });

  it("取消登录清除挂起：登录成功后不再补发旧动作", async () => {
    const w = await mountDetail();
    await w.find(".collect").trigger("click"); // 挂起
    await w.vm.$nextTick();
    w.findComponent({ name: "LoginPopup" }).vm.$emit("close"); // 取消登录
    await w.vm.$nextTick();
    expect(w.find(".stub-login-popup").exists()).toBe(false);
    // 此后通过其它入口登录成功（此处直接再点赞触发弹窗并登录）⇒ 只补发最新一次
    await w.find(".collect").trigger("click");
    await w.vm.$nextTick();
    await loginViaPopup(w);
    expect(h.likeCalls).toEqual([42]); // 恰好一次：旧挂起已随取消清除
    w.unmount();
  });

  it("full 会话点赞 ⇒ 直接发请求、不弹登录窗", async () => {
    seedSession("full");
    const w = await mountDetail();
    await w.find(".collect").trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".stub-login-popup").exists()).toBe(false);
    expect(h.likeCalls).toEqual([42]);
    w.unmount();
  });
});

// ===== 2026-09-29 收藏态登录门（未登录态不展示收藏状态；同 demoDetail 一族）=====
// 回归背景：旧端无静默换票，匿名请求后端 liked 恒 false；新端 getLikeStatus 微信端 authRequired
// 静默换票带票，详情页若不门控会把该身份历史收藏带进未登录 UI（爱心误点亮）。
describe("pages/targetPhotoDetail 收藏态登录门（未登录不拉取点赞态）", () => {
  function seedSession(kind: "silent" | "full"): void {
    h.store.set(
      "lm.session.v1",
      JSON.stringify({
        userId: "1",
        token: "tk-" + kind,
        platform: "mp-weixin",
        profileKey: "blueberry",
        authRevision: 1,
        kind,
      }),
    );
  }

  beforeEach(() => {
    h.store.clear();
    h.statusCalls.length = 0;
    // 后端返回「42 已收藏」：能否点亮爱心即合并是否发生的确据
    h.likeStatus = [{ albumId: 42, liked: true, likeCount: 9 }];
    h.detailMode = "ok";
    h.detailCalls = 0;
    h.onLoadCalls.length = 0;
    (globalThis as { uni?: unknown }).uni = {
      getStorageSync: (k: string) => h.store.get(k) ?? "",
      setStorageSync: (k: string, v: string) => {
        h.store.set(k, v);
      },
      removeStorageSync: (k: string) => {
        h.store.delete(k);
      },
    };
  });

  async function mountDetail(): Promise<VueWrapper> {
    const w = mount(DetailPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]({ idx: "42", type: "1" });
    await flush();
    await w.vm.$nextTick();
    return w;
  }

  function heartSrc(w: VueWrapper): string | undefined {
    return w.find(".heart").attributes("src");
  }

  it("无会话 ⇒ 不请求点赞态，爱心保持未点亮（计数取详情接口口径）", async () => {
    const w = await mountDetail();
    expect(h.statusCalls).toEqual([]);
    expect(heartSrc(w)).toBe("/static/iconpark/like.svg");
    expect(w.find(".like-num").text()).toBe("3"); // 详情接口 likeCount=3
    w.unmount();
  });

  it("仅静默会话（kind:silent）⇒ 同样不请求、不点亮", async () => {
    seedSession("silent");
    const w = await mountDetail();
    expect(h.statusCalls).toEqual([]);
    expect(heartSrc(w)).toBe("/static/iconpark/like.svg");
    w.unmount();
  });

  it("full 会话 ⇒ 拉取并合并点赞态，已收藏爱心点亮", async () => {
    seedSession("full");
    const w = await mountDetail();
    expect(h.statusCalls).toEqual(["42"]);
    expect(heartSrc(w)).toBe("/static/iconpark/like-filled.svg");
    expect(w.find(".like-num").text()).toBe("9");
    w.unmount();
  });
});
