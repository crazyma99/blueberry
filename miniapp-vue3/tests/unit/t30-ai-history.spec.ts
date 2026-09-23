// T8（Phase 3）：AI 试衣记录页测试——骨架/空态/列表渲染、openid 缺失空态、静默刷新（bug #7）、
// 状态遮罩与点击分流（completed/processing 跳结果页、failed 仅提示）、封面向口径、时间格式化。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  pullDownCalls: [] as Array<() => void>,
  stops: 0,
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  onShowCalls: [] as Array<() => void>,
  getTasksCalls: 0,
  tasksMode: "ok" as "ok" | "empty" | "fail",
  store: new Map<string, string>(),
  navigateToCalls: [] as Array<{ url: string }>,
  toasts: [] as string[],
  tasks: [
    { id: 1, status: "completed", result_image_url: "https://cos.example/r1.png", template_image_url: "https://cos.example/t1.png", style_name: "汉服", created_at: "2026-09-17 13:05:00" },
    { id: 2, status: "processing", result_image_url: "", template_image_url: "https://cos.example/t2.png", style_name: "", created_at: "2026-09-17 13:06:00" },
    { id: 3, status: "failed", result_image_url: "", template_image_url: "https://cos.example/t3.png", style_name: "旗袍", created_at: "" },
  ] as Array<Record<string, unknown>>,
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => {
    h.onLoadCalls.push(fn);
  },
  onShow: (fn: () => void) => {
    h.onShowCalls.push(fn);
  },
  onPullDownRefresh: (fn: () => void) => {
    h.pullDownCalls.push(fn);
  },}));

vi.mock("../../src/infrastructure/repositories/ai", () => ({
  createAiRepository: () => ({
    getTasks: async () => {
      h.getTasksCalls += 1;
      if (h.tasksMode === "fail") return { ok: false, error: { kind: "network" } };
      return { ok: true, value: h.tasksMode === "empty" ? [] : h.tasks };
    },
  }),
}));

vi.mock("../../src/infrastructure/repositories/page-config", () => ({
  createPageConfigRepository: () => ({
    getPageConfig: async () => ({ ok: true, value: [] }),
  }),
}));

import AiHistoryPage from "../../src/pages/aiTryOnHistory/index.vue";

const flush = () => new Promise((r) => setTimeout(r, 20));

function seedUser(openid: string): void {
  h.store.set("lm.userinfo.v1", JSON.stringify({ id: 1, openid, phone: null, nickname: null, avatarUrl: null }));
}

beforeEach(() => {
  h.getTasksCalls = 0;
  h.tasksMode = "ok";
  h.store.clear();
  h.navigateToCalls.length = 0;
  h.toasts.length = 0;
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => {
      h.store.set(k, v);
    },
    removeStorageSync: (k: string) => {
      h.store.delete(k);
    },
    navigateTo: (o: { url: string }) => {
      h.navigateToCalls.push(o);
    },
    showToast: (o: { title: string }) => {
      h.toasts.push(o.title);
    },
    stopPullDownRefresh: () => {
      h.stops += 1;
    },
  };
});

describe("pages/aiTryOnHistory（T8 记录页）", () => {
  it("有 openid：拉取列表并渲染卡片（封面 400 缩略、风格名缺省、时间格式化 MM-DD HH:mm）", async () => {
    seedUser("o1");
    const w = mount(AiHistoryPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(h.getTasksCalls).toBe(1);
    const cards = w.findAll(".album-card"); // 2026-09-21 起网格/卡片对齐「相册列表」标准（旧 .photoItem 已删）
    expect(cards.length).toBe(3);
    // completed → 结果图 400 缩略
    expect(w.findAll(".album-cover")[0].attributes("src")).toContain("r1.png");
    // processing → 模板图；style_name 为空 → 缺省「AI 试衣」
    expect(w.findAll(".album-title")[1].text()).toBe("AI 试衣");
    // 时间格式化
    expect(w.findAll(".album-time")[0].text()).toBe("09-17 13:05"); // 次级行＝.album-time（对齐相册列表排版）
    // 状态遮罩：processing「生成中」、failed「生成失败」
    expect(w.findAll(".status-badge.processing").length).toBe(1);
    expect(w.findAll(".status-badge.failed").length).toBe(1);
  });

  it("无 openid：不请求、直接空态（旧 :116-122）", async () => {
    const w = mount(AiHistoryPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(h.getTasksCalls).toBe(0);
    expect(w.find(".empty-state").exists()).toBe(true);
    expect(w.text()).toContain("还没有 AI 试衣记录哦");
  });

  it("接口失败/空列表：空态收敛；点击卡片分流（completed/processing 跳结果页、failed 仅提示）", async () => {
    seedUser("o1");
    h.tasksMode = "fail";
    const w = mount(AiHistoryPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".empty-state").exists()).toBe(true);
    expect(h.toasts).toContain("加载失败");

    h.tasksMode = "ok";
    h.onShowCalls[h.onShowCalls.length - 1](); // 首次 onShow＝跳过（firstShow）
    h.onShowCalls[h.onShowCalls.length - 1](); // 二次 onShow＝刷新
    await flush();
    await w.vm.$nextTick();
    await w.findAll(".album-mask")[0].trigger("click"); // completed → 结果页（点击面＝蒙层，同相册列表口径）
    expect(h.navigateToCalls[0]?.url).toBe("/pages/aiTryOnResult/index?taskId=1");
    await w.findAll(".album-mask")[1].trigger("click"); // processing → 结果页继续轮询
    expect(h.navigateToCalls[1]?.url).toBe("/pages/aiTryOnResult/index?taskId=2");
    await w.findAll(".album-mask")[2].trigger("click"); // failed → 仅提示
    expect(h.navigateToCalls.length).toBe(2);
    expect(h.toasts).toContain("该记录生成失败");
  });

  it("⭐静默刷新（旧 bug #7）：onShow 首跳一次；已有数据时刷新不再整页骨架", async () => {
    seedUser("o1");
    const w = mount(AiHistoryPage);
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".sk-wrap").exists()).toBe(false);
    // 首次 onShow 跳过（不重复请求）
    h.onShowCalls[h.onShowCalls.length - 1]();
    await flush();
    expect(h.getTasksCalls).toBe(1);
    // 二次 onShow：刷新但已有数据 ⇒ 不出现骨架
    h.onShowCalls[h.onShowCalls.length - 1]();
    await flush();
    await w.vm.$nextTick();
    expect(h.getTasksCalls).toBe(2);
    expect(w.find(".sk-wrap").exists()).toBe(false);
    expect(w.findAll(".album-card").length).toBe(3);
  });
});

describe("AI试衣记录页 · 下拉刷新（2026-09-21 主人②）", () => {
  it("下拉 ⇒ 重载任务列表（getTasks 第二次）＋收口一次", async () => {
    seedUser("openid-down"); // 有登录态才会真的取任务（旧 :116-122 无 openid 早退）
    h.stops = 0;
    h.pullDownCalls.length = 0;
    h.onLoadCalls.length = 0;
    const w = mount(AiHistoryPage);
    await flush();
    h.onLoadCalls[h.onLoadCalls.length - 1]();
    await flush();
    const base = h.getTasksCalls;
    expect(h.pullDownCalls.length).toBe(1);
    h.pullDownCalls[0]();
    await flush();
    expect(h.getTasksCalls).toBe(base + 1);
    expect(h.stops).toBe(1);
    w.unmount();
  });
});
