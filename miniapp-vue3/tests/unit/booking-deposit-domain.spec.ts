// 预约保证金领域纯函数单测：金额格式化（含边界）、状态映射（含 refund_abnormal→退款处理中、未知回落）、
// 倒计时（注入 now、UTC+8、过期=0、非法=0）、规则摘要（各分支）、取消确认文案、结算原因、一行文案。
import { describe, expect, it } from "vitest";
import {
  MAX_PAY_HOLD_MINUTES,
  cancelConfirmText,
  cancelDoneText,
  describePaidResult,
  expireAtMs,
  describeDepositLine,
  describeDepositStatus,
  describeSettleReason,
  describeUnpaidResult,
  formatCountdown,
  formatFen,
  isDepositActive,
  remainingPaySeconds,
  retainMinutes,
  summarizeDepositRule,
  type DepositRuleView,
  type DepositView,
} from "../../src/domain/booking-deposit";

describe("formatFen：整数分 → ¥x.xx（整数运算，边界安全）", () => {
  it("常规值", () => {
    expect(formatFen(5000)).toBe("¥50.00");
    expect(formatFen(100)).toBe("¥1.00");
    expect(formatFen(5)).toBe("¥0.05");
    expect(formatFen(0)).toBe("¥0.00");
  });
  it("十位分补零正确（50→¥0.50 而非 ¥0.5）", () => {
    expect(formatFen(50)).toBe("¥0.50");
    expect(formatFen(1050)).toBe("¥10.50");
    expect(formatFen(9)).toBe("¥0.09");
  });
  it("非有限数/负数/小数安全处理（不抛，回落 0 或截断）", () => {
    expect(formatFen(NaN)).toBe("¥0.00");
    expect(formatFen(Infinity)).toBe("¥0.00");
    expect(formatFen(-100)).toBe("¥0.00");
    expect(formatFen(199.9)).toBe("¥1.99"); // 向零截断
    expect(formatFen(5000.4)).toBe("¥50.00");
  });
  it("大额不丢精度（不用浮点累加）", () => {
    expect(formatFen(1234567)).toBe("¥12345.67");
  });
});

describe("describeDepositStatus：状态 → label+tone", () => {
  it("已知状态", () => {
    expect(describeDepositStatus("pending")).toEqual({ label: "待支付", tone: "action" });
    expect(describeDepositStatus("paid")).toEqual({ label: "已支付", tone: "action" });
    expect(describeDepositStatus("refunding")).toEqual({ label: "退还中", tone: "muted" });
    expect(describeDepositStatus("refunded")).toEqual({ label: "已退还", tone: "muted" });
    expect(describeDepositStatus("forfeited")).toEqual({ label: "已扣除", tone: "danger" });
    expect(describeDepositStatus("closed")).toEqual({ label: "已关闭", tone: "muted" });
  });
  it("refund_abnormal 对用户显示「退款处理中」", () => {
    expect(describeDepositStatus("refund_abnormal")).toEqual({ label: "退款处理中", tone: "muted" });
  });
  it("未知状态回落「处理中」+ muted，不把英文原串展示给用户", () => {
    expect(describeDepositStatus("weird")).toEqual({ label: "处理中", tone: "muted" });
    expect(describeDepositStatus("")).toEqual({ label: "处理中", tone: "muted" });
  });
});

describe("describeSettleReason：结算原因 → 可读短语（未知回落空串）", () => {
  it("已知原因", () => {
    expect(describeSettleReason("cancel_late")).toBe("迟取消");
    expect(describeSettleReason("no_show")).toBe("爽约");
    expect(describeSettleReason("completed")).toBe("已完成");
    expect(describeSettleReason("merchant_cancel")).toBe("商家取消");
    expect(describeSettleReason("hold_expired")).toBe("超时未支付");
    expect(describeSettleReason("auto_grace")).toBe("超期自动退还");
    expect(describeSettleReason("cancel_free")).toBe("免费取消");
  });
  it("空串/未知回落空串", () => {
    expect(describeSettleReason("")).toBe("");
    expect(describeSettleReason("??")).toBe("");
  });
});

function dep(partial: Partial<DepositView>): DepositView {
  return {
    status: "pending",
    amountFen: 5000,
    refundFen: 0,
    forfeitFen: 0,
    payExpireTime: "",
    settleReason: "",
    ...partial,
  };
}

describe("describeDepositLine：一行文案", () => {
  it("null → 空串", () => {
    expect(describeDepositLine(null)).toBe("");
  });
  it("已支付", () => {
    expect(describeDepositLine(dep({ status: "paid" }))).toBe("保证金 ¥50.00 · 已支付");
  });
  it("待支付", () => {
    expect(describeDepositLine(dep({ status: "pending" }))).toBe("保证金 ¥50.00 · 待支付");
  });
  it("已退还（用 refundFen）", () => {
    expect(describeDepositLine(dep({ status: "refunded", refundFen: 5000 }))).toBe("¥50.00 已原路退还");
  });
  it("全额扣除 + 原因", () => {
    expect(describeDepositLine(dep({ status: "forfeited", forfeitFen: 5000, refundFen: 0, settleReason: "no_show" }))).toBe(
      "已扣除 ¥50.00（爽约）",
    );
  });
  it("部分扣除同时显示退还与扣除", () => {
    expect(
      describeDepositLine(dep({ status: "forfeited", forfeitFen: 2500, refundFen: 2500, settleReason: "cancel_late" })),
    ).toBe("已扣除 ¥25.00，退还 ¥25.00（迟取消）");
  });
  it("refund_abnormal → 退款处理中", () => {
    expect(describeDepositLine(dep({ status: "refund_abnormal" }))).toBe("保证金 ¥50.00 · 退款处理中");
  });
  it("未知状态：不留空行、不透出英文，显示「处理中」", () => {
    expect(describeDepositLine(dep({ status: "weird" as never }))).toBe("保证金 ¥50.00 · 处理中");
  });
  it("退还中/已关闭", () => {
    expect(describeDepositLine(dep({ status: "refunding" }))).toBe("保证金 ¥50.00 · 退还中");
    expect(describeDepositLine(dep({ status: "closed" }))).toBe("保证金 ¥50.00 · 已关闭");
  });
  it("迟取消部分扣除后走 refunding→refunded：已退还必须同时展示扣除金额与原因（不得只显示退还额）", () => {
    expect(
      describeDepositLine(dep({ status: "refunded", refundFen: 2500, forfeitFen: 2500, settleReason: "cancel_late" })),
    ).toBe("¥25.00 已原路退还，已扣除 ¥25.00（迟取消）");
    expect(
      describeDepositLine(dep({ status: "refunding", refundFen: 2500, forfeitFen: 2500, settleReason: "no_show" })),
    ).toBe("退还 ¥25.00（退还中），已扣除 ¥25.00（爽约）");
    // 不得以「保证金 ¥x」开头（会被读成原保证金金额）
    expect(
      describeDepositLine(dep({ status: "refunding", refundFen: 3000, forfeitFen: 2000, settleReason: "cancel_late" })),
    ).toBe("退还 ¥30.00（退还中），已扣除 ¥20.00（迟取消）");
  });
  it("全额退还无扣除：不出现「已扣除」", () => {
    expect(describeDepositLine(dep({ status: "refunded", refundFen: 5000, forfeitFen: 0, settleReason: "cancel_free" }))).toBe(
      "¥50.00 已原路退还",
    );
  });
});

describe("retainMinutes：预约保留剩余分钟（向上取整，优先按截止时间）", () => {
  const base = Date.parse("2026-11-05T12:00:00+08:00");
  it("按 payExpireTime 向上取整（用户在支付面板停留的时间不算已保留）", () => {
    expect(retainMinutes(dep({ payExpireTime: "2026-11-05 12:08:01" }), base, 10)).toBe(9);
    expect(retainMinutes(dep({ payExpireTime: "2026-11-05 12:08:00" }), base, 10)).toBe(8);
    expect(retainMinutes(dep({ payExpireTime: "2026-11-05 12:00:30" }), base, 10)).toBe(1);
  });
  it("已过期 = 0", () => {
    expect(retainMinutes(dep({ payExpireTime: "2026-11-05 11:59:00" }), base, 10)).toBe(0);
  });
  it("缺截止时间/deposit 为空 → 回落配置的保留分钟；脏回落值 → 0", () => {
    expect(retainMinutes(dep({ payExpireTime: "" }), base, 10)).toBe(10);
    expect(retainMinutes(null, base, 15)).toBe(15);
    expect(retainMinutes(null, base, NaN)).toBe(0);
  });
  it("【时钟偏慢】本地剩余大于保留期上限 → 取 min(本地剩余, 上限)：不超过 payHoldMinutes；无配置时以契约上界 30 封顶", () => {
    // 设备时钟比服务端慢 40 分钟：本地看还剩 50 分钟，但保留期上限只有 10 分钟
    expect(retainMinutes(dep({ payExpireTime: "2026-11-05 12:50:00" }), base, 10)).toBe(10);
    expect(retainMinutes(dep({ payExpireTime: "2026-11-05 12:50:00" }), base, 0)).toBe(MAX_PAY_HOLD_MINUTES);
    // 不超上限时仍按本地剩余
    expect(retainMinutes(dep({ payExpireTime: "2026-11-05 12:03:00" }), base, 10)).toBe(3);
  });
});

describe("提交结果页文案", () => {
  it("取消支付／支付失败：必须告知「预约已保留 N 分钟，可在「我的预约」继续支付」", () => {
    expect(describeUnpaidResult("cancelled", 10)).toEqual({
      title: "预约已保留",
      desc: "已取消支付，预约已保留 10 分钟，可在「我的预约」继续支付",
    });
    expect(describeUnpaidResult("payment-failed", 7).desc).toBe("支付未完成，预约已保留 7 分钟，可在「我的预约」继续支付");
  });
  it("保留分钟为 0（已临近/过期）→ 不写「保留 0 分钟」", () => {
    const d = describeUnpaidResult("cancelled", 0).desc;
    expect(d).not.toContain("0 分钟");
    expect(d).toContain("我的预约");
  });
  it("超时（结果未知）：不得说失败，提示到「我的预约」查看支付结果且勿重复支付；不承诺「状态会自动更新」（预约页不再轮询）", () => {
    const r = describeUnpaidResult("timeout", 5);
    expect(r.title).toBe("支付结果确认中");
    expect(r.desc).toBe("暂未收到支付结果，请到「我的预约」查看支付结果，请勿重复支付");
    expect(r.desc).not.toContain("失败");
    expect(r.desc).not.toContain("自动更新");
  });
  it("金额已变化（amount-changed）：不自动付款，文案说明金额变化并引导到「我的预约」查看后再支付", () => {
    const r = describeUnpaidResult("amount-changed", 8);
    expect(r.title).toBe("预约已保留");
    expect(r.desc).toContain("保证金金额已变化，请到「我的预约」查看后再支付");
    expect(r.desc).toContain("8 分钟");
    expect(describeUnpaidResult("amount-changed", 0).desc).not.toContain("0 分钟");
  });
  it("已关闭：说明已关闭且已扣款会原路退回", () => {
    const r = describeUnpaidResult("closed", 0);
    expect(r.title).toBe("预约已关闭");
    expect(r.desc).toContain("原路退回");
  });
  it("规则未明示（rules-unseen）／缺支付参数：不自动支付，引导去「我的预约」查看保证金", () => {
    expect(describeUnpaidResult("rules-unseen", 10).desc).toBe("预约已保留 10 分钟，请在「我的预约」查看保证金并完成支付");
    expect(describeUnpaidResult("no-pay-params", 10).desc).toContain("查看保证金");
  });
  it("已支付成功态含金额与「按规则原路退回」，且全程不出现「定金」「押金」", () => {
    const r = describePaidResult(5000);
    expect(r.title).toBe("预约已提交");
    expect(r.desc).toContain("¥50.00");
    expect(r.desc).toContain("等待门店确认");
    for (const t of [r.desc, describeUnpaidResult("cancelled", 3).desc, describeUnpaidResult("timeout", 3).desc]) {
      expect(t).not.toMatch(/定金|押金/);
    }
  });
});

describe("remainingPaySeconds：按 UTC+8 解析，可注入 now", () => {
  // 2026-11-05 12:00:00+08:00 === 1762315200000 ms
  const base = Date.parse("2026-11-05T12:00:00+08:00");
  it("剩余 90 秒（不依赖运行时区）", () => {
    expect(remainingPaySeconds("2026-11-05 12:01:30", base)).toBe(90);
  });
  it("刚好到期 = 0；已过期 = 0（不返回负数）", () => {
    expect(remainingPaySeconds("2026-11-05 12:00:00", base)).toBe(0);
    expect(remainingPaySeconds("2026-11-05 11:59:00", base)).toBe(0);
  });
  it("空串/非法格式 = 0", () => {
    expect(remainingPaySeconds("", base)).toBe(0);
    expect(remainingPaySeconds("2026/11/05 12:00:00", base)).toBe(0);
    expect(remainingPaySeconds("not-a-date", base)).toBe(0);
    expect(remainingPaySeconds("2026-11-05T12:00:00", base)).toBe(0); // 带 T 不匹配空格格式
  });
  it("UTC+8 口径：同一墙钟字符串在任何运行时区得到相同剩余秒（固定 +08:00）", () => {
    // now 也按 +08:00 的绝对毫秒注入 ⇒ 解析不受环境 TZ 影响
    const now = Date.parse("2026-11-05T12:00:00+08:00");
    expect(remainingPaySeconds("2026-11-05 12:05:00", now)).toBe(300);
  });
  it("非法 now 回落 0", () => {
    expect(remainingPaySeconds("2026-11-05 12:05:00", NaN)).toBe(0);
  });
  it("capSeconds：取 min(本地剩余, 上限)；已到期仍为 0；未传上限不变", () => {
    expect(remainingPaySeconds("2026-11-05 12:50:00", base, 600)).toBe(600);
    expect(remainingPaySeconds("2026-11-05 12:05:00", base, 600)).toBe(300);
    expect(remainingPaySeconds("2026-11-05 11:59:00", base, 600)).toBe(0);
    expect(remainingPaySeconds("2026-11-05 12:50:00", base)).toBe(3000);
  });
});

describe("expireAtMs：UTC+8 墙钟 → 绝对毫秒", () => {
  it("固定 +08:00，与运行时区无关；空串/非法 = 0", () => {
    expect(expireAtMs("2026-11-05 12:00:00")).toBe(Date.parse("2026-11-05T12:00:00+08:00"));
    expect(expireAtMs("")).toBe(0);
    expect(expireAtMs("2026-11-05T12:00:00")).toBe(0);
  });
});

describe("formatCountdown：秒 → mm:ss", () => {
  it("常规", () => {
    expect(formatCountdown(90)).toBe("01:30");
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(5)).toBe("00:05");
    expect(formatCountdown(600)).toBe("10:00");
  });
  it("超 99 分钟按实际分钟", () => {
    expect(formatCountdown(6005)).toBe("100:05");
  });
  it("负数/非有限回落 00:00", () => {
    expect(formatCountdown(-5)).toBe("00:00");
    expect(formatCountdown(NaN)).toBe("00:00");
  });
});

function rule(partial: Partial<DepositRuleView>): DepositRuleView {
  return {
    enabled: true,
    amountFen: 5000,
    freeCancelHours: 24,
    lateCancelForfeitPct: 50,
    noShowForfeitPct: 100,
    refundTrigger: "manual",
    ...partial,
  };
}

describe("summarizeDepositRule：规则摘要（字符串数组）", () => {
  it("未开启 → 空数组", () => {
    expect(summarizeDepositRule(rule({ enabled: false }))).toEqual([]);
  });
  it("典型：迟取消扣 50%、爽约扣 100%（人工退还）", () => {
    expect(summarizeDepositRule(rule({}))).toEqual([
      "门店确认后，开始前 24 小时内取消，扣除 50% 保证金；门店确认前取消全额退还",
      "爽约扣除 100% 保证金",
      "预约完成后由门店确认退还保证金",
      "预约开始后如需处理，请联系门店",
      "其余情形（含门店取消）全额退还，款项原路退回",
    ]);
  });
  it("refundTrigger=auto_on_complete → 完成后系统自动退还", () => {
    expect(summarizeDepositRule(rule({ refundTrigger: "auto_on_complete" }))).toContain("预约完成后系统自动退还保证金");
  });
  it("迟取消扣 0%（全退）→ 整体可免费取消；不写「开始前 24 小时内…可免费取消」（会被误读成只有窗口内才免费）", () => {
    const r = summarizeDepositRule(rule({ lateCancelForfeitPct: 0, noShowForfeitPct: 0 }));
    expect(r[0]).toBe("开始前取消，可免费取消");
    expect(r.join("")).not.toContain("24 小时");
    expect(r).toContain("爽约不扣除保证金");
  });
  it("迟取消扣 100% → 与其它比例同口径写「扣除 100% 保证金」；且声明仅适用于门店确认后", () => {
    expect(summarizeDepositRule(rule({ lateCancelForfeitPct: 100 }))[0]).toBe(
      "门店确认后，开始前 24 小时内取消，扣除 100% 保证金；门店确认前取消全额退还",
    );
  });
  it("【摘要补全】迟取消规则只适用于门店确认后；各取值下都说明预约开始后联系门店", () => {
    for (const r of [
      rule({}),
      rule({ lateCancelForfeitPct: 0, noShowForfeitPct: 0 }),
      rule({ freeCancelHours: 0 }),
      rule({ lateCancelForfeitPct: 100, noShowForfeitPct: 100, refundTrigger: "auto_on_complete" }),
    ]) {
      const lines = summarizeDepositRule(r);
      expect(lines).toContain("预约开始后如需处理，请联系门店");
      expect(lines[lines.length - 1]).toBe("其余情形（含门店取消）全额退还，款项原路退回");
    }
    // 有迟取消扣除窗口的取值：必须出现「门店确认后」「门店确认前取消全额退还」；无窗口/全退的取值不出现（免费取消不分确认前后）
    expect(summarizeDepositRule(rule({}))[0]).toContain("门店确认后");
    expect(summarizeDepositRule(rule({}))[0]).toContain("门店确认前取消全额退还");
    expect(summarizeDepositRule(rule({ lateCancelForfeitPct: 0 }))[0]).toBe("开始前取消，可免费取消");
    expect(summarizeDepositRule(rule({ freeCancelHours: 0 }))[0]).toBe("开始前取消，可免费取消");
  });
  it("freeCancelHours=0（无迟取消窗口）→ 不说「开始前 0 小时内」，开始前取消可免费取消，不展示迟取消扣除比例", () => {
    for (const pct of [0, 50, 100]) {
      expect(summarizeDepositRule(rule({ freeCancelHours: 0, lateCancelForfeitPct: pct }))[0]).toBe("开始前取消，可免费取消");
    }
  });
  it("爽约 0% → 爽约不扣除", () => {
    expect(summarizeDepositRule(rule({ noShowForfeitPct: 0 }))).toContain("爽约不扣除保证金");
  });
  it("爽约部分比例", () => {
    expect(summarizeDepositRule(rule({ noShowForfeitPct: 30 }))).toContain("爽约扣除 30% 保证金");
  });
  it("最后一行始终说清全额退还 + 原路退回", () => {
    const r = summarizeDepositRule(rule({}));
    expect(r[r.length - 1]).toBe("其余情形（含门店取消）全额退还，款项原路退回");
  });
  it("摘要全文不出现「定金」「押金」", () => {
    expect(summarizeDepositRule(rule({})).join("")).not.toMatch(/定金|押金/);
  });
});

describe("cancelConfirmText：取消确认文案", () => {
  it("forfeit>0 → 取消后将扣除 ¥x，退还 ¥y；已知原因时追加（迟取消）", () => {
    expect(cancelConfirmText({ refundFen: 2500, forfeitFen: 2500 })).toBe("取消后将扣除 ¥25.00，退还 ¥25.00");
    expect(cancelConfirmText({ refundFen: 2500, forfeitFen: 2500, reason: "cancel_late" })).toBe("取消后将扣除 ¥25.00（迟取消），退还 ¥25.00");
    expect(cancelConfirmText({ refundFen: 0, forfeitFen: 5000, reason: "cancel_late" })).toBe("取消后将扣除 ¥50.00（迟取消），退还 ¥0.00");
    // 未知原因不透出英文
    expect(cancelConfirmText({ refundFen: 0, forfeitFen: 5000, reason: "weird" })).toBe("取消后将扣除 ¥50.00，退还 ¥0.00");
  });
  it("forfeit=0 且 refund>0 → 保证金 ¥x 将原路退回", () => {
    expect(cancelConfirmText({ refundFen: 5000, forfeitFen: 0 })).toBe("保证金 ¥50.00 将原路退回");
  });
  it("都为 0 → 空串（调用方走原确认文案）", () => {
    expect(cancelConfirmText({ refundFen: 0, forfeitFen: 0 })).toBe("");
  });
  it("脏数据安全", () => {
    expect(cancelConfirmText({ refundFen: -1, forfeitFen: NaN })).toBe("");
  });
});

describe("cancelDoneText：取消成功后的提示（过去时）", () => {
  it("扣款：已取消预约，已扣除 ¥x（原因），退还 ¥y；不再出现「将扣除」", () => {
    const t = cancelDoneText({ refundFen: 2500, forfeitFen: 2500, reason: "cancel_late" });
    expect(t).toBe("已取消预约，已扣除 ¥25.00（迟取消），退还 ¥25.00");
    expect(t).not.toContain("将扣除");
  });
  it("全退：已取消预约，保证金 ¥x 将原路退回", () => {
    expect(cancelDoneText({ refundFen: 5000, forfeitFen: 0, reason: "cancel_free" })).toBe("已取消预约，保证金 ¥50.00 将原路退回");
  });
  it("无结算金额 → 已取消预约；脏数据安全", () => {
    expect(cancelDoneText({ refundFen: 0, forfeitFen: 0 })).toBe("已取消预约");
    expect(cancelDoneText({ refundFen: -1, forfeitFen: NaN })).toBe("已取消预约");
  });
});

describe("isDepositActive", () => {
  it("deposit 非 null → true", () => {
    expect(isDepositActive({ deposit: dep({}) })).toBe(true);
    expect(isDepositActive({ deposit: null })).toBe(false);
  });
});
