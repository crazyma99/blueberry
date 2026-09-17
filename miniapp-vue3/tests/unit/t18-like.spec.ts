// P2-14 点赞乐观更新（旧端 demoDetail:660-693 语义）＋T6 相册页冒烟（mock uni 生命周期）。
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createLikeToggler, type LikeableItem } from "../../src/composables/use-like";
import type { RepoResult } from "../../src/infrastructure/repositories/carousels";
import type { ToggleLikeResult } from "../../src/infrastructure/repositories/likes";
import type { RequestContext } from "../../src/ports/context";

// uni 生命周期在非页面容器不可用（vue.injectHook 不存在）——mock 后手动驱动 onLoad
const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o: Record<string, unknown>) => void>,
}));
vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o: Record<string, unknown>) => void) => {
    h.onLoadCalls.push(fn);
  },
  onReachBottom: () => {},
}));

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
