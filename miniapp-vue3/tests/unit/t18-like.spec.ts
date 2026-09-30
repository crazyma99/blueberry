// P2-14 点赞乐观更新（旧端 demoDetail:660-693 语义）＋T6 相册页冒烟（mock uni 生命周期）。
// 2026-09-28 点赞登录门：未登录（无会话/仅 silent 会话）点赞 ⇒ 弹登录窗且不发点赞请求；
// 登录成功自动补发挂起动作（旧端 401 挂起队列 flushPendingRequests 语义）；取消登录清除挂起。
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createLikeToggler, type LikeableItem } from "../../src/composables/use-like";
import type { RepoResult } from "../../src/infrastructure/repositories/carousels";
import type { ToggleLikeResult } from "../../src/infrastructure/repositories/likes";
import type { RequestContext } from "../../src/ports/context";

// uni 生命周期在非页面容器不可用（vue.injectHook 不存在）——mock 后手动驱动 onLoad
const h = vi.hoisted(() => ({
  pullDownCalls: [] as Array<() => void>,
  stops: 0,
  albumCalls: 0,
  albumMode: "fail" as "ok" | "fail",
  albumItems: [] as Array<Record<string, unknown>>,
  likeCalls: [] as number[],
  statusCalls: [] as string[],
  likeStatus: [] as Array<Record<string, unknown>>,
  store: new Map<string, string>(),
  onLoadCalls: [] as Array<(o: Record<string, unknown>) => void>,
}));
vi.mock("../../src/infrastructure/repositories/albums", () => ({
  createAlbumRepository: () => ({
    getCategories: async () =>
      h.albumMode === "ok"
        ? { ok: true, value: [{ categoryName: "风", subCategory: [{ name: "旗袍", query: { childId: "9" } }] }] }
        : { ok: false },
    getAlbumList: async () => {
      h.albumCalls += 1;
      return h.albumMode === "ok"
        ? { ok: true, value: { albums: h.albumItems, page: 1, size: 10, total: h.albumItems.length } }
        : { ok: false };
    },
    getAlbumDetail: async () => ({ ok: false }),
  }),
}));

// 2026-09-28 点赞登录门用例：点赞仓储打桩计数（likeStatus 数据驱动，默认空 ⇒ 列表项保持初始 liked；
// 2026-09-29 收藏态登录门用例借 statusCalls 验证「未登录不拉取点赞态」）
vi.mock("../../src/infrastructure/repositories/likes", () => ({
  createLikeRepository: () => ({
    getLikeStatus: async (_ctx: unknown, albumIds: string) => {
      h.statusCalls.push(albumIds);
      return { ok: true, value: h.likeStatus };
    },
    toggleLike: async (_ctx: unknown, albumId: number) => {
      h.likeCalls.push(albumId);
      return { ok: true, value: { liked: true, likeCount: 1 } };
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

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o: Record<string, unknown>) => void) => {
    h.onLoadCalls.push(fn);
  },
  onReachBottom: () => {},
  onPullDownRefresh: (fn: () => void) => {
    h.pullDownCalls.push(fn);
  },
  onShareAppMessage: () => undefined,
  onShareTimeline: () => undefined,}));

import DemoDetail from "../../src/pages/demoDetail/index.vue";

const ctx: RequestContext = {
  platform: "mp-weixin", environment: "trial", brandId: null, requestId: "l2",
  profileKey: "blueberry", appCode: "blueBerry", scopeRevision: 1, authRevision: 1,
};
function deferred<T>() {
  let resolve!: (v: T) => void; let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = () => new Promise((r) => setTimeout(r, 20));

describe("createLikeToggler（P2-14 乐观更新/乱序/回滚）", () => {
  it("乐观更新立即生效；服务端返回为准采纳", async () => {
    const d = deferred<RepoResult<ToggleLikeResult>>();
    const toggler = createLikeToggler({ likes: { toggleLike: async () => d.promise } });
    const item: LikeableItem = { id: 1, liked: false, likeCount: 5 };
    const p = toggler.toggle(ctx, item);
    expect(item.liked).toBe(true);
    expect(item.likeCount).toBe(6);
    d.resolve({ ok: true, value: { liked: true, likeCount: 7 } });
    expect(await p).toBe("confirmed");
    expect(item.likeCount).toBe(7);
  });
  it("取消点赞计数不为负；失败回滚到前态", async () => {
    const toggler = createLikeToggler({
      likes: { toggleLike: async () => ({ ok: false, error: { kind: "BUSINESS", businessCode: 5001, message: "x", requestId: "l2", retryable: false } }) },
    });
    const zero: LikeableItem = { id: 2, liked: true, likeCount: 0 };
    expect(await toggler.toggle(ctx, zero)).toBe("rolled-back");
    expect(zero.liked).toBe(true);
    expect(zero.likeCount).toBe(0);
    const item: LikeableItem = { id: 3, liked: false, likeCount: 3 };
    expect(await toggler.toggle(ctx, item)).toBe("rolled-back");
    expect(item.liked).toBe(false);
    expect(item.likeCount).toBe(3);
  });
  it("乱序：首次响应晚到被 seq 守卫丢弃，终态由最新一次决定", async () => {
    const d1 = deferred<RepoResult<ToggleLikeResult>>();
    const d2 = deferred<RepoResult<ToggleLikeResult>>();
    const queue = [d1, d2];
    let calls = 0;
    const toggler = createLikeToggler({ likes: { toggleLike: async () => queue[calls++].promise } });
    const item: LikeableItem = { id: 4, liked: false, likeCount: 1 };
    const p1 = toggler.toggle(ctx, item);
    const p2 = toggler.toggle(ctx, item);
    d2.resolve({ ok: true, value: { liked: false, likeCount: 1 } });
    expect(await p2).toBe("confirmed");
    d1.resolve({ ok: true, value: { liked: true, likeCount: 99 } });
    expect(await p1).toBe("discarded-stale");
    expect(item.liked).toBe(false);
    expect(item.likeCount).toBe(1);
  });
});

describe("pages/demoDetail 冒烟（mock 生命周期驱动）", () => {
  it("无入参 onLoad（缺 idx）→ 安全停留在加载态；有入参 → 加载收敛空态", async () => {
    const w = mount(DemoDetail);
    await w.vm.$nextTick();
    expect(h.onLoadCalls.length).toBeGreaterThan(0);
    // 缺 idx：parseListParams null → 不 init，停留加载态
    h.onLoadCalls[h.onLoadCalls.length - 1]({});
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".sk-wrap").exists()).toBe(true);
    // 有入参：init → getCategories 网络失败（容器无 uni）→ 分类空 → 空列表收敛
    h.onLoadCalls[h.onLoadCalls.length - 1]({ idx: "1" });
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".sk-wrap").exists()).toBe(false);
    expect(w.text()).toContain("暂无客片");
  });
});

describe("客片列表页 · 下拉刷新（2026-09-21 主人②；旧端 demoDetail.uvue:348-355）", () => {
  it("分类态下拉 ⇒ 重新取列表（getAlbumList 第二次）＋收口一次；搜索态下拉走同一 reload 路径", async () => {
    (globalThis as { uni?: unknown }).uni = {
      stopPullDownRefresh: () => {
        h.stops += 1;
      },
    };
    h.albumMode = "ok";
    h.albumCalls = 0;
    h.stops = 0;
    h.pullDownCalls.length = 0;
    h.onLoadCalls.length = 0;
    const w = mount(DemoDetail);
    await flush();
    h.onLoadCalls[h.onLoadCalls.length - 1]({ idx: "7" });
    await flush();
    const base = h.albumCalls;
    expect(base).toBeGreaterThan(0);
    expect(h.pullDownCalls.length).toBe(1);
    h.pullDownCalls[0]();
    await flush();
    expect(h.albumCalls).toBeGreaterThan(base); // 下拉确实重新取列表
    expect(h.stops).toBe(1);
    delete (globalThis as { uni?: unknown }).uni;
    w.unmount();
  });
});

// ===== 2026-09-28 点赞登录门（旧端 login-required 订阅弹窗＋401 挂起队列自动重试 ⇒ 页面门＋pending 补发）=====
describe("pages/demoDetail 点赞登录门（只认 full 会话；静默会话不算已登录）", () => {
  const albumA = { id: 101, title: "客片A", coverImageUrl: "https://cos.example/a.png", likeCount: 2 };
  const albumB = { id: 102, title: "客片B", coverImageUrl: "https://cos.example/b.png", likeCount: 0 };

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
    h.albumItems = [albumA, albumB];
    h.albumMode = "ok";
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

  async function mountList(): Promise<VueWrapper> {
    const w = mount(DemoDetail);
    h.onLoadCalls[h.onLoadCalls.length - 1]({ idx: "7" });
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
    const w = await mountList();
    expect(w.find(".stub-login-popup").exists()).toBe(false);
    await w.findAll(".like-row")[0].trigger("click");
    await w.vm.$nextTick();
    expect(w.find(".stub-login-popup").exists()).toBe(true);
    expect(h.likeCalls).toEqual([]); // 门禁在乐观更新之前：无请求、无本地翻转
    expect(albumA.liked).toBeUndefined();
    await loginViaPopup(w);
    expect(w.find(".stub-login-popup").exists()).toBe(false);
    expect(h.likeCalls).toEqual([101]); // 自动补发挂起的那次点赞（旧端 flushPendingRequests 语义）
    w.unmount();
  });

  it("仅静默会话（kind:silent）点赞 ⇒ 同样弹登录窗、不发请求；登录成功后补发", async () => {
    seedSession("silent");
    const w = await mountList();
    await w.findAll(".like-row")[1].trigger("click");
    await w.vm.$nextTick();
    expect(w.find(".stub-login-popup").exists()).toBe(true);
    expect(h.likeCalls).toEqual([]);
    await loginViaPopup(w);
    expect(h.likeCalls).toEqual([102]);
    w.unmount();
  });

  it("取消登录清除挂起：再次点赞另一项并登录 ⇒ 只补发最新动作，不误补发旧动作", async () => {
    const w = await mountList();
    await w.findAll(".like-row")[0].trigger("click"); // 挂起 A
    await w.vm.$nextTick();
    w.findComponent({ name: "LoginPopup" }).vm.$emit("close"); // 取消登录
    await w.vm.$nextTick();
    expect(w.find(".stub-login-popup").exists()).toBe(false);
    await w.findAll(".like-row")[1].trigger("click"); // 挂起 B
    await w.vm.$nextTick();
    await loginViaPopup(w);
    expect(h.likeCalls).toEqual([102]); // A 已随取消清除
    w.unmount();
  });

  it("full 会话点赞 ⇒ 直接发请求、不弹登录窗", async () => {
    seedSession("full");
    const w = await mountList();
    await w.findAll(".like-row")[0].trigger("click");
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".stub-login-popup").exists()).toBe(false);
    expect(h.likeCalls).toEqual([101]);
    w.unmount();
  });
});

// ===== 2026-09-29 收藏态登录门（未登录态不展示收藏状态；对齐旧端 demoDetail.uvue:607 `if (!isLoggedIn()) return`）=====
// 回归背景：新端 getLikeStatus 微信端 authRequired ⇒ 静默换票带票，后端会返回该身份历史点赞；
// 列表页若不门控，未登录 UI 态也会点亮「已收藏」爱心。
describe("pages/demoDetail 收藏态登录门（未登录不拉取/不合并点赞态）", () => {
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
    // 后端返回「103 已收藏」：能否点亮爱心即合并是否发生的确据
    h.likeStatus = [{ albumId: 103, liked: true, likeCount: 8 }];
    h.albumItems = [{ id: 103, title: "客片C", coverImageUrl: "https://cos.example/c.png", likeCount: 1 }];
    h.albumMode = "ok";
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

  async function mountList(): Promise<VueWrapper> {
    const w = mount(DemoDetail);
    h.onLoadCalls[h.onLoadCalls.length - 1]({ idx: "7" });
    await flush();
    await w.vm.$nextTick();
    return w;
  }

  function heartSrc(w: VueWrapper): string | undefined {
    return w.findAll(".like-icon")[0]?.attributes("src");
  }

  it("无会话 ⇒ 不请求点赞态，爱心保持未点亮", async () => {
    const w = await mountList();
    expect(h.statusCalls).toEqual([]);
    expect(heartSrc(w)).toBe("/static/iconpark/like.svg");
    w.unmount();
  });

  it("仅静默会话（kind:silent）⇒ 同样不请求、不点亮", async () => {
    seedSession("silent");
    const w = await mountList();
    expect(h.statusCalls).toEqual([]);
    expect(heartSrc(w)).toBe("/static/iconpark/like.svg");
    w.unmount();
  });

  it("full 会话 ⇒ 拉取并合并点赞态，已收藏爱心点亮", async () => {
    seedSession("full");
    const w = await mountList();
    expect(h.statusCalls).toEqual(["103"]);
    expect(heartSrc(w)).toBe("/static/iconpark/like-filled.svg");
    w.unmount();
  });

  // 复现「未登录却亮爱心」的环境根因：新旧端共用同一 AppID，旧端 storage 的 token 键
  // 被 versioned.loadSession 迁移为 full 会话（versioned.ts:68-77，09-28 有意保留的兼容迁移）
  // ⇒ 门禁视同已登录 ⇒ 拉取真实点赞态。此时 mine 页同样显示已登录，非本门失守。
  it("仅存旧端 legacy token 键 ⇒ 迁移为 full 会话，爱心点亮（等价已登录，非匿名泄漏）", async () => {
    h.store.set("token", "legacy-tk");
    const w = await mountList();
    expect(h.statusCalls).toEqual(["103"]);
    expect(heartSrc(w)).toBe("/static/iconpark/like-filled.svg");
    w.unmount();
  });
});
