// T56（2026-10-13 · 表2 #13/#14/#15 端侧修复）：AI 试衣失败态**可诊断**。
// 背景：修复前 pages/aiTryOnResult/index.vue 的失败态是固定文案链，且 taskErrorMessage 全页只赋值不渲染
// ⇒ 「登录失效（401）／作品不可查看（分享只读：品牌门或令牌问题）／真·生成失败」在界面上**完全不可区分**，
// 这正是三条 BUG 被记成三种现象的端侧原因。本 spec 守卫：
//   ① 四类文案映射（优先级：分享只读 ＞ 鉴权失效 ＞ 连续重试 ＞ 通用）；
//   ② canRetry 与原模板内联条件 '!shareReadOnly && failCount < 3' **逐字等价**（交互口径不变）；
//   ③ 内核把 AppError.kind 透出（页面只认 AUTH_EXPIRED，不解析文案）；
//   ④ 页面接线：文案必须走 failureView，且 **template 段不得出现 taskErrorMessage**（内部 message 不上屏）。
//   ⑤（2026-10-13 CR 收口①）**页面级接线**另有行为用例 t62-page-failure-view.spec.ts：撤掉 index.vue 内
//      「s.errorKind === 'AUTH_EXPIRED'」一行即红——本 spec 只锁纯函数与模板字面，不覆盖页面接线。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createResultPoller,
  resolveFailureView,
  type ResultPollState,
  type ResultSnapshot,
} from "../../src/application/ai-result-flow";
import type { RequestContext } from "../../src/ports/context";
import type { RepoResult } from "../../src/infrastructure/repositories/carousels";

const ctx: RequestContext = {
  platform: "mp-weixin",
  environment: "trial",
  brandId: null,
  requestId: "r",
  profileKey: "blueberry",
  appCode: "blueBerry",
  scopeRevision: 1,
  authRevision: 1,
};

/** 文案白名单：改文案必须同步改这里（防文案悄悄漂移 / 防把后端 message 拼进来） */
const TEXTS = {
  // 2026-10-13 CR 收口③：只读态 canRetry 恒 false、无重试入口 ⇒ 必须保留「暂时性」语义
  unavailable: "该作品暂时无法查看，请稍后再试",
  // 2026-10-13 CR 收口②：与「重试」按钮动作对齐，不夸大为「已失效」（AUTH_EXPIRED 亦覆盖换票网络失败）
  auth: "登录状态异常，请点击重试",
  busy: "当前服务繁忙，请稍后再试",
  generic: "生成失败，请重试",
} as const;

/** 后端内部文案样本（品牌门真实返回之一，端侧**绝不能**上屏） */
const INTERNAL_MESSAGE = "店铺不存在、已停用或不属于当前品牌";

const failed = (kind: string, message: string): RepoResult<ResultSnapshot> =>
  ({
    ok: false,
    error: { kind, businessCode: null, message, requestId: "r", retryable: false },
  }) as unknown as RepoResult<ResultSnapshot>;

const noopTimers = {
  setTimeout: () => 1,
  clearTimeout: () => undefined,
  setInterval: () => 2,
  clearInterval: () => undefined,
};

async function runPoller(res: RepoResult<ResultSnapshot>, id = "42"): Promise<ResultPollState> {
  const states: ResultPollState[] = [];
  const poller = createResultPoller({
    getResult: async () => res,
    nextContext: () => ctx,
    onState: (s) => states.push({ ...s }),
    timers: noopTimers,
  });
  poller.start(id);
  await Promise.resolve();
  await Promise.resolve();
  return poller.getState();
}

describe("t56 · 失败态文案映射（resolveFailureView）", () => {
  it("分享只读落地失败 → 「该作品暂时无法查看，请稍后再试」（暂存语义＋不与「生成失败」混淆＋不给重试）", () => {
    expect(resolveFailureView({ shareReadOnly: true, failCount: 0, authExpired: false })).toEqual({
      kind: "unavailable",
      text: TEXTS.unavailable,
      canRetry: false,
    });
    // 只读落地无论重试计数如何都是作品维度问题（优先级最高）
    expect(resolveFailureView({ shareReadOnly: true, failCount: 9, authExpired: true }).kind).toBe("unavailable");
  });

  it("⭐鉴权异常 → 「登录状态异常，请点击重试」（可重试区间优先于「服务繁忙」）", () => {
    // 可重试区间（failCount<3）：可行动类别排在服务维度之前
    expect(resolveFailureView({ shareReadOnly: false, failCount: 0, authExpired: true })).toEqual({
      kind: "auth",
      text: TEXTS.auth,
      canRetry: true,
    });
    expect(resolveFailureView({ shareReadOnly: false, failCount: 2, authExpired: true })).toEqual({
      kind: "auth",
      text: TEXTS.auth,
      canRetry: true,
    });
    // ⚠️ 2026-10-13 CR ② 更正：留档——**曾经**此处断言 failCount=3 时仍返回 auth 文案，但那时 canRetry=false、
  // 页面没有按钮（「请点击重试」文不对钮）。现由 resolveFailureView 的自洽兜底改为「服务繁忙」文案（无祈使句）。
    expect(resolveFailureView({ shareReadOnly: false, failCount: 3, authExpired: true })).toEqual({
      kind: "busy",
      text: TEXTS.busy,
      canRetry: false,
    });
  });

  it("其它失败：未达 3 次 → 「生成失败，请重试」；达 3 次 → 「当前服务繁忙，请稍后再试」", () => {
    expect(resolveFailureView({ shareReadOnly: false, failCount: 2, authExpired: false })).toEqual({
      kind: "generic",
      text: TEXTS.generic,
      canRetry: true,
    });
    expect(resolveFailureView({ shareReadOnly: false, failCount: 3, authExpired: false })).toEqual({
      kind: "busy",
      text: TEXTS.busy,
      canRetry: false,
    });
  });

  it("⭐canRetry 与旧模板内联条件 '!shareReadOnly && failCount < 3' 全组合逐字等价（交互口径未变）", () => {
    for (const shareReadOnly of [true, false]) {
      for (let failCount = 0; failCount <= 5; failCount++) {
        for (const authExpired of [true, false]) {
          expect(resolveFailureView({ shareReadOnly, failCount, authExpired }).canRetry).toBe(
            !shareReadOnly && failCount < 3,
          );
        }
      }
    }
  });

  it("⭐（CR ②）文案自洽不变式：凡出现祈使句「点击重试」的分支，必须同时给出可点的重试按钮（全组合）", () => {
    for (const shareReadOnly of [true, false]) {
      for (let failCount = 0; failCount <= 5; failCount++) {
        for (const authExpired of [true, false]) {
          const v = resolveFailureView({ shareReadOnly, failCount, authExpired });
          if (v.text.includes("点击重试")) {
            expect(v.canRetry, "文案要求点击重试却无按钮：" + JSON.stringify({ shareReadOnly, failCount, authExpired })).toBe(true);
          }
        }
      }
    }
    // 反例回归：鉴权异常 ∧ 已重试 3 次 ⇒ 必须降级为不含祈使句的「服务繁忙」文案（而不是「请点击重试」却没按钮）
    expect(resolveFailureView({ shareReadOnly: false, failCount: 3, authExpired: true })).toEqual({
      kind: "busy",
      text: TEXTS.busy,
      canRetry: false,
    });
  });

  it("⭐不泄露后端 message：入参只有布尔/计数，四类文案均在白名单内", () => {
    const views = [
      resolveFailureView({ shareReadOnly: true, failCount: 0, authExpired: false }),
      resolveFailureView({ shareReadOnly: false, failCount: 0, authExpired: true }),
      resolveFailureView({ shareReadOnly: false, failCount: 3, authExpired: false }),
      resolveFailureView({ shareReadOnly: false, failCount: 0, authExpired: false }),
    ];
    for (const v of views) {
      expect(Object.values(TEXTS)).toContain(v.text);
      expect(v.text).not.toContain("店铺");
      expect(v.text).not.toContain(INTERNAL_MESSAGE);
    }
  });
});

describe("t56 · 内核把 AppError.kind 透出（页面只认 AUTH_EXPIRED）", () => {
  it("⭐401：errorKind=AUTH_EXPIRED（页面据此显示「登录状态异常」），且 errorMessage 与界面文案同源", async () => {
    const s = await runPoller(failed("AUTH_EXPIRED", "unauthorized"));
    expect(s).toMatchObject({ status: "failed", stopped: true, errorKind: "AUTH_EXPIRED", errorMessage: TEXTS.auth });
  });

  it("业务失败（品牌门/归属校验）→ errorKind=BUSINESS，errorMessage 原样保留（**仅供 console**，不上屏）", async () => {
    const s = await runPoller(failed("BUSINESS", INTERNAL_MESSAGE));
    expect(s).toMatchObject({ status: "failed", stopped: true, errorKind: "BUSINESS", errorMessage: INTERNAL_MESSAGE });
    // 端侧渲染的永远是白名单文案，故上面这条 message 不会出现在界面
    expect(
      resolveFailureView({ shareReadOnly: false, failCount: 0, authExpired: s.errorKind === "AUTH_EXPIRED" }).text,
    ).toBe(TEXTS.generic);
  });

  it("任务本体 failed（正常返回）→ errorKind 空串（不误标为鉴权）", async () => {
    const s = await runPoller({ ok: true, value: { status: "failed", error_message: "模型超时" } });
    expect(s).toMatchObject({ status: "failed", errorKind: "", errorMessage: "模型超时" });
  });

  it("空 taskId 兜底失败 → errorKind 空串", async () => {
    const s = await runPoller({ ok: true, value: { status: "pending" } }, "");
    expect(s).toMatchObject({ status: "failed", errorKind: "" });
  });
});

describe("t56 · 页面接线守卫（防回退成固定文案 / 防内部 message 上屏）", () => {
  const page = readFileSync(resolve(__dirname, "../../src/pages/aiTryOnResult/index.vue"), "utf-8");
  const template = page.slice(page.indexOf("<template>"), page.indexOf("</template>"));

  it("⭐失败态文案必须来自 application 层映射（单一事实源）", () => {
    expect(template).toContain("{{ failureView.text }}");
    expect(template).toContain('v-if="failureView.canRetry"');
    expect(page).toContain("resolveFailureView(");
  });

  it("⭐template 段不得出现 taskErrorMessage（后端内部文案只进 console）", () => {
    expect(template).not.toContain("taskErrorMessage");
  });

  it("旧的三段固定文案链已移除（否则又不可区分）", () => {
    // 注意：此处引用**最初版固定文案**，语义是**反向守卫**（该串必须不再出现于 template），不是过期引用
    expect(template).not.toContain("该作品暂不可查看");
    expect(template).not.toContain(">当前服务繁忙，请稍后再试<");
    expect(template).not.toContain(">生成失败，请重试<");
    // 只读落地仍保留「我也要试」入口（既有交互口径不变）
    expect(template).toContain('v-if="shareReadOnly"');
  });
});
