// T9b 纪律回归守卫（静态审计）：把「单次 POST 禁重发／禁自建到账轮询／禁 uni.request／finalScore 不凑分／AI 页只进既有 #ifdef 块」
// 这些**靠代码风格维持的验收红线**变成可执行断言——后续任何人改回旧写法都会在这里变红。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf-8");

const loading = read("src/pages/aiRecommendLoading/index.vue");
const result = read("src/pages/aiRecommendResult/index.vue");
const entry = read("src/pages/aiRecommend/index.vue");
const pagesJson = read("src/pages.json");

describe("T9b 纪律守卫（P3-16/17/18）", () => {
  it("⭐等待页：走推荐内核（单次 POST）；**到账轮询不得留在页面**（无 getRechargeStatus／pollRechargeStatus／payPollToken）", () => {
    expect(loading).toContain("createRecommendRunner");
    // 准确信号：页面不得**调用**查单（轮询已整体交共享协调器）；注：注释里提到旧函数名属留痕，故断言调用语法
    const code = loading.replace(/\/\/[^\n]*/g, ""); // 去行注释后判定
    expect(code).not.toContain("getRechargeStatus(");
    expect(code).not.toContain("pollRechargeStatus(");
    expect(code).not.toContain("payPollToken");
    expect(loading).toContain("countdownTimer");
  });

  it("⭐充值一律走共享协调器；「只续跑一次」标记先清后调（resumeAfterCredit）", () => {
    expect(loading).toContain("createPaymentCoordinator");
    expect(loading).toContain("coordinator.recharge");
    expect(loading).toContain("resumeAfterCredit");
    // 先清后调：到账后先清标记，再按标记决定是否续跑（`if (resumeAfterCredit)`）
    const clearedAt = loading.indexOf("resumeAfterCredit = false");
    const resumedAt = loading.indexOf("if (resumeAfterCredit)");
    expect(clearedAt).toBeGreaterThan(-1);
    expect(resumedAt).toBeGreaterThan(-1);
    expect(clearedAt).toBeLessThan(resumedAt);
  });

  it("⭐业务请求不得直连 `uni.request`（走仓储/端口）；结果页分数口径走内核", () => {
    expect(loading).not.toContain("uni.request(");
    expect(result).not.toContain("uni.request(");
    expect(result).toContain("shouldShowScore");
    expect(result).toContain("normalizeFinalScore");
  });

  it("⭐结果页：分数只渲染归一后的 finalScore（不得直接用原始 score 当分数展示）", () => {
    // 允许出现 score（DTO 字段原样保留），但不得出现在展示表达式里与「分」字拼接
    expect(/item\.score\s*\}\}\s*分/.test(result)).toBe(false);
    expect(/finalScore\s*\}\}\s*分/.test(result) || result.includes("shouldShowScore")).toBe(true);
  });

  it("⭐入口页（T9b CR 🟡4 补）：零 `uni.request(`、零自建到账轮询；onHide **与** onUnload 均清一次性续跑标记", () => {
    const code = entry.replace(/\/\/[^\n]*/g, "");
    expect(code).not.toContain("uni.request(");
    expect(code).not.toContain("getRechargeStatus(");
    expect(code).not.toContain("pollRechargeStatus(");
    // onHide / onUnload 各自都要清标记：hide 段与 unload 段各至少一次
    const hideBlock = code.slice(code.indexOf("onHide(() =>"), code.indexOf("onUnload(() =>"));
    const unloadBlock = code.slice(code.indexOf("onUnload(() =>"));
    expect(hideBlock).toContain("resumeAnalyzeAfterCredit.value = false");
    expect(unloadBlock).toContain("resumeAnalyzeAfterCredit.value = false");
  });

  it("⭐注册守卫：三张 T9b 页均在**同一个** MP-WEIXIN 块内（AI 页不新增第二个 #ifdef 块）", () => {
    const blocks = pagesJson.split("#ifdef MP-WEIXIN");
    // 第一个块（webview 的 style 内联）与 AI 块；统计包含 aiRecommend 的块应恰为 1
    const blocksWithAi = blocks.filter((b) => b.includes("aiRecommend"));
    expect(blocksWithAi.length).toBe(1);
    // 且该块以 #endif 收口（块完整性）
    expect(blocksWithAi[0]).toContain("#endif");
  });
});
