// T8 S2尾/S4 接线：aiTryOn 页面级测试——模板双入口与相册回退、生成守卫（未上传照片）。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const h = vi.hoisted(() => ({
  onLoadCalls: [] as Array<(o?: Record<string, unknown>) => void>,
  onShowCalls: [] as Array<() => void>,
  templateQueries: [] as Array<Record<string, string>>,
  albumQueries: [] as Array<Record<string, string>>,
  templatesByQuery: (q: Record<string, string>) =>
    q.album_id != null ? [] : [{ id: 11, imageUrl: "https://lanmei66.cloud/t.png" }],
  store: new Map<string, string>(),
  toasts: [] as string[],
  shareCalls: [] as Array<() => unknown>,
  timelineCalls: [] as Array<() => unknown>,
  // 2026-09-23：4002 全链路用例用——可配置提交结果 + 调用计数（默认成功）
  submitResult: null as unknown,
  submitCalls: 0,
  chooseImageCalls: 0,
}));

vi.mock("@dcloudio/uni-app", () => ({
  onLoad: (fn: (o?: Record<string, unknown>) => void) => h.onLoadCalls.push(fn),
  onShow: (fn: () => void) => h.onShowCalls.push(fn),
  onHide: () => undefined,
  onUnload: () => undefined,
  onShareAppMessage: (fn: () => unknown) => h.shareCalls.push(fn),
  onShareTimeline: (fn: () => unknown) => h.timelineCalls.push(fn),
}));

vi.mock("../../src/infrastructure/repositories/ai", () => ({
  createAiRepository: () => ({
    getTemplates: async (_c: unknown, q: Record<string, string>) => {
      h.templateQueries.push(q);
      return { ok: true, value: h.templatesByQuery(q) };
    },
    getTasks: async () => ({ ok: true, value: [] }),
    submitTryOnTask: async () => {
      h.submitCalls += 1;
      return (h.submitResult ?? { ok: true, value: { task_id: 1 } }) as never;
    },
  }),
}));

vi.mock("../../src/infrastructure/repositories/albums", () => ({
  createAlbumRepository: () => ({
    getAlbumList: async (_c: unknown, q: Record<string, string>) => {
      h.albumQueries.push(q);
      return { ok: true, value: { albums: [{ id: 5, tryonDisabled: false }, { id: 6, tryonDisabled: true }], page: 1, size: 50, total: 2 } };
    },
  }),
}));

vi.mock("../../src/infrastructure/repositories/page-config", () => ({
  createPageConfigRepository: () => ({ getPageConfig: async () => ({ ok: true, value: [] }) }),
}));

vi.mock("../../src/infrastructure/repositories/credits", () => ({
  createCreditRepository: () => ({
    getBalance: async () => ({ ok: true, value: { balance: 0, inited: true, priceFenPerCredit: 0 } }),
    createRecharge: async () => ({ ok: true, value: {} }),
    getRechargeStatus: async () => ({ ok: true, value: { outTradeNo: "T", status: 0, paid: false, credits: 1, balance: 0 } }),
  }),
}));

vi.mock("../../src/infrastructure/repositories/wx-auth", () => ({
  createWxAuthRepository: () => ({ exchange: async () => ({ ok: false, error: { kind: "unsupported" } }) }),
}));

import StubWdPopup from "../stubs/wot/wd-popup/wd-popup.vue";
import AiTryOnPage from "../../src/pages/aiTryOn/index.vue";
import AppPhotoPicker from "../../src/components/AppPhotoPicker/AppPhotoPicker.vue";
import { detectUiPlatform } from "../../src/ui/ui-platform";
import { PROFILE } from "../../src/generated/profile.config";

/** wot 桩（CR 🟡10）：门面 BasePopup 内部是 `wd-popup`，不注册会打 Vue warn 且断言退化为「裸元素」 */
const GLOBAL = { components: { "wd-popup": StubWdPopup } };

const flush = () => new Promise((r) => setTimeout(r, 30));

beforeEach(() => {
  h.templateQueries.length = 0;
  h.albumQueries.length = 0;
  h.toasts.length = 0;
  h.shareCalls.length = 0;
  h.timelineCalls.length = 0;
  h.submitResult = null;
  h.submitCalls = 0;
  h.chooseImageCalls = 0;
  h.store.clear();
  (globalThis as { uni?: unknown }).uni = {
    getStorageSync: (k: string) => h.store.get(k) ?? "",
    setStorageSync: (k: string, v: string) => {
      h.store.set(k, v);
    },
    removeStorageSync: (k: string) => {
      h.store.delete(k);
    },
    showToast: (o: { title: string }) => {
      h.toasts.push(o.title);
    },
    showLoading: () => undefined,
    hideLoading: () => undefined,
    showModal: () => undefined,
    navigateTo: () => undefined,
    getSystemInfoSync: () => ({ statusBarHeight: 20 }),
    // 全链路 4002 用例：选图 → 上传（服务端返回 filename）
    chooseImage: (o: Record<string, unknown>) => {
      h.chooseImageCalls += 1;
      (o.success as (r: unknown) => void)({ tempFilePaths: ["/tmp/pick.jpg"], tempFiles: [{ size: 1024 * 1024 }] });
    },
    uploadFile: (o: Record<string, unknown>) => {
      (o.success as (r: unknown) => void)({ statusCode: 200, data: JSON.stringify({ code: 200, data: { filename: "f.jpg" } }) });
      return { onProgressUpdate: () => undefined, abort: () => undefined };
    },
    getImageInfo: (o: Record<string, unknown>) => {
      (o.success as (r: unknown) => void)({ width: 1200, height: 1600 });
    },
  };
});

describe("pages/aiTryOn（T8 装配）", () => {
  it("默认入口：按 travel 维度加载模板（category=travel，带 shop_id）", async () => {
    const w = mount(AiTryOnPage, { global: GLOBAL });
    h.onLoadCalls[h.onLoadCalls.length - 1]({ shopId: "7" });
    await flush();
    await w.vm.$nextTick();
    expect(h.templateQueries[0]).toMatchObject({ category: "travel", shop_id: "7" });
    expect(w.text()).toContain("左右横向滑动支持切换模板");
  });

  it("⭐albumId=random：先随机解析相册（过滤 tryonDisabled），再按 album_id 精确取模板；相册空则回退本店全部并提示", async () => {
    const w = mount(AiTryOnPage, { global: GLOBAL });
    h.onLoadCalls[h.onLoadCalls.length - 1]({ shopId: "7", albumId: "random" });
    await flush();
    await w.vm.$nextTick();
    expect(h.albumQueries[0]).toMatchObject({ shopId: "7", page: "1", size: "50" });
    // 第一次按 album_id 取（返回空）→ 回退：清空 album_id 再取本店全部
    expect(h.templateQueries[0].album_id).toBe("5"); // 仅 tryonDisabled!==true 的相册入池
    expect(h.templateQueries[1]).toEqual({ category: "travel", shop_id: "7" });
    expect(h.toasts).toContain("该相册暂无可试衣客片，已展示本店全部模板");
  });

  it("生成守卫（未登录）：点生成 → 弹登录弹窗、不发提交请求（守卫顺序逐条已由 t37 覆盖）", async () => {
    const w = mount(AiTryOnPage, { global: GLOBAL });
    h.onLoadCalls[h.onLoadCalls.length - 1]({ shopId: "7" });
    await flush();
    await w.vm.$nextTick();
    expect(w.find(".login-card").exists()).toBe(false); // 2026-09-22 起登录弹窗走 wot Popup 门面（原 .login-overlay 已删）
    await w.find(".generate-btn").trigger("click");
    await flush();
    await w.vm.$nextTick();
    // 旧端守卫顺序：登录先于照片 ⇒ 未登录时拉登录弹窗（而非提示上传）
    expect(w.find(".login-card").exists()).toBe(true);
    expect(h.toasts).not.toContain("请先上传照片");
  });
  // ===== 2026-09-22 主人报 Bug：A→B→C 二次转发后 C 打开空白 =====
  // 根因：结果页分享卡片的落地页是本页（试衣页），而本页**没有实现分享处理器** ⇒ B 从本页转发走微信默认转发、
  // 查询参数丢失 ⇒ C 冷启动落在无参页（无门店/相册/模板/品牌上下文）⇒ 模板列表为空、页面空白。
  describe("分享：B 从本页二次转发不得丢参（C 能看到同一上下文）", () => {
    it("landing 页（带 share_from/templateId/shopId/brandId）转发时，path 原样带出全部上下文", async () => {
      const w = mount(AiTryOnPage, { global: GLOBAL });
      // A 的卡片参数（结果页 buildSharePath 产出的那套）
      h.onLoadCalls[h.onLoadCalls.length - 1]({ share_from: "tryon_result", templateId: "99", shopId: "1010", brandId: "brand9" });
      await flush();
      await w.vm.$nextTick();
      expect(h.shareCalls.length).toBe(1); // 本页必须显式声明（否则走默认转发＝丢参）
      const share = h.shareCalls[0]() as { title: string; path: string; imageUrl?: string };
      expect(share.path.startsWith("/pages/aiTryOn/index?")).toBe(true);
      expect(share.path).toContain("share_from=tryon_result");
      expect(share.path).toContain("templateId=11"); // 取**当前选中**（落参 99 不在列表内 ⇒ 回落第一项 11）
      expect(share.path).not.toContain("templateId=99");
      expect(share.path).toContain("shopId=1010");
      expect(share.path).toContain("brandId=brand9");
      expect(share.imageUrl).toBe("https://lanmei66.cloud/t.png"); // 以当前模板图作封面
      expect(share.title).toContain("AI 换装");
    });

    it("朋友圈（onShareTimeline）query 同样带参（单页模式打开的是本页）", async () => {
      const w = mount(AiTryOnPage, { global: GLOBAL });
      h.onLoadCalls[h.onLoadCalls.length - 1]({ share_from: "tryon_result", templateId: "11", shopId: "1010", brandId: "brand9" });
      await flush();
      await w.vm.$nextTick();
      expect(h.timelineCalls.length).toBe(1);
      const tl = h.timelineCalls[0]() as { query: string };
      expect(tl.query).toContain("share_from=tryon_result");
      expect(tl.query).toContain("templateId=11");
      expect(tl.query).toContain("shopId=1010");
      expect(tl.query).toContain("brandId=brand9");
    });

    it("自己从首页进入（无 share_from）转发：不带 share_from，但仍带自有上下文", async () => {
      const w = mount(AiTryOnPage, { global: GLOBAL });
      h.onLoadCalls[h.onLoadCalls.length - 1]({ shopId: "7" });
      await flush();
      await w.vm.$nextTick();
      const share = h.shareCalls[0]() as { path: string };
      expect(share.path).not.toContain("share_from=");
      expect(share.path).toContain("shopId=7");
      expect(share.path).toContain("templateId=11"); // 当前选中模板（自己进入时也带）
    });

    it("空态兜底：模板为空时渲染可读提示与「重新加载」，不再是白屏（页面级）", async () => {
      h.templatesByQuery = () => [];
      const w = mount(AiTryOnPage, { global: GLOBAL });
      h.onLoadCalls[h.onLoadCalls.length - 1]({ shopId: "7" });
      await flush();
      await w.vm.$nextTick();
      expect(w.find(".tpl-empty").exists()).toBe(true);
      expect(w.text()).toContain("暂无可试衣模板");
      h.templatesByQuery = (q: Record<string, string>) => (q.album_id != null ? [] : [{ id: 11, imageUrl: "https://lanmei66.cloud/t.png" }]);
      // 🟡负断言：有模板时**不得**出现空态（CR 变异实测「摘 v-if 全绿」＝假绿）
      const w2 = mount(AiTryOnPage, { global: GLOBAL });
      h.onLoadCalls[h.onLoadCalls.length - 1]({ shopId: "7" });
      await flush();
      await w2.vm.$nextTick();
      expect(w2.find(".tpl-empty").exists()).toBe(false);
      expect(w2.find(".album-card, .template-swiper, .swiper-wrap").exists() || w2.text().length > 0).toBe(true);
      const before = h.templateQueries.length;
      await w.find(".tpl-empty-btn").trigger("click");
      await flush();
      expect(h.templateQueries.length).toBe(before + 1); // 可重试
      h.templatesByQuery = (q: Record<string, string>) => (q.album_id != null ? [] : [{ id: 11, imageUrl: "https://lanmei66.cloud/t.png" }]);
    });
  });

  // ⚠️ 2026-09-23 留痕（仍未落地）：页面层「全链路 4002」用例（选图→上传→生成→弹层→重选）**缺**。
  // 已排除：登录态（会话须带 platform/profileKey，且 updateLoginState 在 onShow 刷新——本轮已核实并可用于其他用例）；
  // 已修：`platform/uni/{storage,chooser,upload}.ts` 取 `uni` 统一为「注入桩优先 + 裸 uni 兜底」（此前 chooser/upload 只认裸 uni）。
  // 仍未定位：`.app-photo-picker` 的 click 在 VTU 下未驱动到页面 `choosePhoto`（同文件其它用例的 `.generate-btn` click 正常），
  // 故无法在页面级跑通「选图→上传」半段。现状覆盖＝分层行为（t61）＋页面接线守卫（t61）；补法：把页面内 `uni.*` 继续收进端口后
  // 用端口替身驱动，或改用真机/开发者工具做一次手工冒烟（已登记为 CR 后的待办）。

});
