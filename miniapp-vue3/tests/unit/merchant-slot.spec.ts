// 商家端档期单测（issue #14 · M1 档期批）：校验 / PUT 载荷 / 排序 / 仓储契约 / 模板「先预览再确认」/ 权限闸 / 串行化 / 不假设 bookedGuests。
// 变异靶点：①validateCapacity 范围 ②buildSlotPatch 去掉「至少一个」③仓储 update 带上时间字段 ④applyTemplate 不传 dryRun
//          ⑤applyTemplate 缺 booking_slot 权限仍放行 ⑥exclusive 去掉串行 ⑦规整里读取 bookedGuests。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SLOT_CAPACITY_MAX,
  SLOT_CAPACITY_MIN,
  buildSlotPatch,
  canConfirmApply,
  describeApplyDone,
  describeApplyPreview,
  isValidHHmm,
  normalizeApplyResult,
  normalizeSlot,
  normalizeTemplate,
  parseCapacity,
  slotChangeConfirmCopy,
  sortSlots,
  validateCapacity,
  validateNewSlot,
} from "../../src/pkg-merchant/domain/merchant-slot";
import { createMerchantSlotRepository } from "../../src/pkg-merchant/infrastructure/merchant-slots";
import { createSlotUseCases, slotPageGates } from "../../src/pkg-merchant/application/merchant-slot-flow";
import { visibleEntries } from "../../src/pkg-merchant/domain/merchant-auth";
import type { ClientRequestInput, ClientResult } from "../../src/infrastructure/http/client";
import type { AppError } from "../../src/infrastructure/http/errors";
import type { RequestContext } from "../../src/ports/context";

const root = resolve(__dirname, "../..");
const ctx = { requestId: "r" } as RequestContext;
const err = (kind: AppError["kind"], message = "", businessCode: number | null = null): AppError => ({ kind, businessCode, message, requestId: null, retryable: false });
function fakeClient(responder: (i: ClientRequestInput) => ClientResult<unknown> | Promise<ClientResult<unknown>>) {
  const seen: ClientRequestInput[] = [];
  return { seen, client: { request: async <T,>(i: ClientRequestInput) => { seen.push(i); return (await responder(i)) as ClientResult<T>; } } };
}
const slot = { id: 1, startTime: "10:00", endTime: "11:00", capacity: 10, status: 1 };

describe("时间/容量校验（与后端同口径）", () => {
  it("HH:mm：00:00-23:59 合法，24:00/9:00/10:60 非法", () => {
    for (const ok of ["00:00", "09:30", "23:59"]) expect(isValidHHmm(ok), ok).toBe(true);
    for (const bad of ["24:00", "9:00", "10:60", "", "10-00", "10:0"]) expect(isValidHHmm(bad), bad).toBe(false);
  });
  it("⭐容量 1..500 整数边界（变异：放宽/收紧范围即红）", () => {
    expect(SLOT_CAPACITY_MIN).toBe(1);
    expect(SLOT_CAPACITY_MAX).toBe(500);
    for (const v of ["1", "500", " 10 ", 7]) expect(validateCapacity(v as never).ok, String(v)).toBe(true);
    for (const v of ["0", "501", "-1", "", "abc", "1.5", "1e2", "0x10", "  ", 5.5, Number.NaN, "1000000"]) expect(validateCapacity(v as never).ok, String(v)).toBe(false);
    expect(parseCapacity("007")).toBe(7);
  });
  it("新增表单：start<end（相等/倒置都拒绝）；字段级错误定位", () => {
    expect(validateNewSlot({ startTime: "10:00", endTime: "11:00", capacity: "5" })).toEqual({ ok: true, body: { startTime: "10:00", endTime: "11:00", capacity: 5 } });
    for (const [s, e] of [["11:00", "10:00"], ["10:00", "10:00"]]) {
      const r = validateNewSlot({ startTime: s, endTime: e, capacity: "5" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.field).toBe("endTime");
    }
    const noStart = validateNewSlot({ startTime: "", endTime: "10:00", capacity: "5" });
    expect(!noStart.ok && noStart.error.field).toBe("startTime");
    const badCap = validateNewSlot({ startTime: "09:00", endTime: "10:00", capacity: "0" });
    expect(!badCap.ok && badCap.error.field).toBe("capacity");
  });
});

describe("⭐PUT 载荷：capacity/status 至少一个且只含变化项", () => {
  it("无变化 ⇒ 拒绝（不发空 PUT；变异：去掉「至少一个」即红）", () => {
    expect(buildSlotPatch(slot, {})).toEqual({ ok: false, message: "没有需要修改的内容" });
    expect(buildSlotPatch(slot, { capacity: "10", status: 1 })).toEqual({ ok: false, message: "没有需要修改的内容" });
  });
  it("只带变化字段；非法容量/状态拒绝", () => {
    expect(buildSlotPatch(slot, { capacity: "20" })).toEqual({ ok: true, patch: { capacity: 20 } });
    expect(buildSlotPatch(slot, { status: 0 })).toEqual({ ok: true, patch: { status: 0 } });
    expect(buildSlotPatch(slot, { capacity: "20", status: 0 })).toEqual({ ok: true, patch: { capacity: 20, status: 0 } });
    expect(buildSlotPatch(slot, { capacity: "501" }).ok).toBe(false);
    expect(buildSlotPatch(slot, { status: 2 }).ok).toBe(false);
  });
  it("调低容量/停用需确认且明示不影响已有预约；启用/调高无需确认", () => {
    expect(slotChangeConfirmCopy(slot, { status: 0 })?.msg).toContain("已有预约不受影响");
    expect(slotChangeConfirmCopy(slot, { capacity: 5 })?.msg).toContain("已有预约不受影响");
    expect(slotChangeConfirmCopy(slot, { capacity: 50 })).toBeNull();
    expect(slotChangeConfirmCopy({ ...slot, status: 0 }, { status: 1 })).toBeNull();
  });
});

describe("排序 / 规整", () => {
  it("按开始时间升序（同起点按结束时间、再按 id），不改入参", () => {
    const list = [
      { id: 3, startTime: "11:00", endTime: "12:00" },
      { id: 1, startTime: "09:00", endTime: "10:00" },
      { id: 2, startTime: "09:00", endTime: "09:30" },
    ];
    const copy = list.slice();
    expect(sortSlots(list).map((s) => s.id)).toEqual([2, 1, 3]);
    expect(list).toEqual(copy);
  });
  it("⭐规整只取 M1 字段，**不假设 bookedGuests 存在**（后端契约未定；变异：读取该字段即红）", () => {
    const v = normalizeSlot({ id: 1, startTime: "10:00", endTime: "11:00", capacity: 8, status: 1, bookedGuests: 99, merchantId: 3 });
    expect(Object.keys(v).sort()).toEqual(["capacity", "endTime", "id", "startTime", "status"]);
    expect(normalizeSlot(null)).toEqual({ id: 0, startTime: "", endTime: "", capacity: 0, status: 0 });
  });
  it("模板规整：ID 是字符串；items 非数组当 []", () => {
    expect(normalizeTemplate({ id: "builtin-default", name: "全天", builtin: true, items: [{ startTime: "09:00", endTime: "10:00", capacity: 10 }] })).toMatchObject({ id: "builtin-default", builtin: true });
    expect(normalizeTemplate({ id: 12, items: "x" }).items).toEqual([]);
  });
});

describe("模板套用结果映射", () => {
  const raw = {
    dryRun: true, templateName: "全天营业",
    created: [{ slotId: null, startTime: "09:00", endTime: "10:00", capacity: 10 }],
    skipped: [{ slotId: 4, startTime: "10:00", endTime: "11:00", reason: "exists" }],
    conflicts: [{ startTime: "10:30", endTime: "11:30", reason: "overlap", with: { slotId: 5, startTime: "11:00", endTime: "12:00" } }],
    summary: { created: 1, skipped: 1, conflicts: 1 },
  };
  it("created/skipped/conflicts + summary；冲突带「与某现有档期」", () => {
    const r = normalizeApplyResult(raw);
    expect(r.summary).toEqual({ created: 1, skipped: 1, conflicts: 1 });
    expect(r.conflicts[0]).toEqual({ startTime: "10:30", endTime: "11:30", withRange: "11:00-12:00" });
    const text = describeApplyPreview(r);
    expect(text).toContain("将新增 1 个档期");
    expect(text).toContain("10:30-11:30 与 11:00-12:00");
  });
  it("summary 缺失回落数组长度；全跳过/全冲突 ⇒ 不可确认", () => {
    expect(normalizeApplyResult({ created: [], skipped: [{}], conflicts: [] }).summary).toEqual({ created: 0, skipped: 1, conflicts: 0 });
    expect(canConfirmApply(normalizeApplyResult({ summary: { created: 0, skipped: 3, conflicts: 2 } }))).toBe(false);
    expect(canConfirmApply(normalizeApplyResult(raw))).toBe(true);
    expect(describeApplyDone(normalizeApplyResult({ summary: { created: 3, skipped: 1, conflicts: 2 } }))).toBe("已新增 3 个档期，跳过 1 个，2 个因冲突未创建");
  });
});

describe("档期仓储契约", () => {
  it("list：GET /booking/slots，authRequired，幂等，**不传 merchantId / date**", async () => {
    const f = fakeClient(() => ({ ok: true, value: [{ id: 1, startTime: "10:00", endTime: "11:00", capacity: 5, status: 1 }] }));
    const r = await createMerchantSlotRepository({ client: f.client }).list(ctx);
    expect(f.seen[0]).toMatchObject({ method: "GET", url: "/booking/slots", authRequired: true, replayPolicy: "idempotent" });
    expect(f.seen[0].query).toBeUndefined();
    expect(r.ok && r.value.length).toBe(1);
    const bad = await createMerchantSlotRepository({ client: fakeClient(() => ({ ok: true, value: { not: "array" } })).client }).list(ctx);
    expect(bad.ok && bad.value).toEqual([]);
  });
  it("create：POST /booking/slots，body 仅 startTime/endTime/capacity，never 重放", async () => {
    const f = fakeClient(() => ({ ok: true, value: { id: 9, startTime: "10:00", endTime: "11:00", capacity: 5, status: 1 } }));
    await createMerchantSlotRepository({ client: f.client }).create(ctx, { startTime: "10:00", endTime: "11:00", capacity: 5 });
    expect(f.seen[0]).toMatchObject({ method: "POST", url: "/booking/slots", authRequired: true, replayPolicy: "never" });
    expect(f.seen[0].body).toEqual({ startTime: "10:00", endTime: "11:00", capacity: 5 });
  });
  it("⭐update：PUT /booking/slots/:id，body 仅 capacity/status（绝不含时间字段、merchantId）（变异：带上时间字段即红）", async () => {
    const f = fakeClient(() => ({ ok: true, value: { id: 1, capacity: 7, status: 0 } }));
    const repo = createMerchantSlotRepository({ client: f.client });
    await repo.update(ctx, 1, { capacity: 7 });
    await repo.update(ctx, 1, { status: 0 });
    await repo.update(ctx, 1, { capacity: 7, status: 1 });
    expect(f.seen.map((s) => s.body)).toEqual([{ capacity: 7 }, { status: 0 }, { capacity: 7, status: 1 }]);
    for (const s of f.seen) {
      expect(s).toMatchObject({ method: "PUT", url: "/booking/slots/1", authRequired: true, replayPolicy: "never" });
      expect(Object.keys(s.body as object).every((k) => k === "capacity" || k === "status")).toBe(true);
    }
  });
  it("listTemplates：GET /booking/slot-templates，幂等", async () => {
    const f = fakeClient(() => ({ ok: true, value: [{ id: "builtin-default", name: "全天营业", builtin: true, items: [] }] }));
    const r = await createMerchantSlotRepository({ client: f.client }).listTemplates(ctx);
    expect(f.seen[0]).toMatchObject({ method: "GET", url: "/booking/slot-templates", replayPolicy: "idempotent" });
    expect(r.ok && r.value[0].id).toBe("builtin-default");
  });
  it("⭐applyTemplate：POST /booking/slot-templates/:id/apply，**dryRun 必传**，id 被 encode，never 重放（变异：不传 dryRun 即红）", async () => {
    const f = fakeClient(() => ({ ok: true, value: { dryRun: true, summary: { created: 0, skipped: 0, conflicts: 0 } } }));
    const repo = createMerchantSlotRepository({ client: f.client });
    await repo.applyTemplate(ctx, "builtin-default", { dryRun: true });
    await repo.applyTemplate(ctx, "a/b c", { dryRun: false, capacity: 8 });
    expect(f.seen[0]).toMatchObject({ method: "POST", url: "/booking/slot-templates/builtin-default/apply", replayPolicy: "never" });
    expect(f.seen[0].body).toEqual({ dryRun: true });
    expect(f.seen[1].url).toBe("/booking/slot-templates/a%2Fb%20c/apply");
    expect(f.seen[1].body).toEqual({ dryRun: false, capacity: 8 });
  });
  it("仓储不暴露模板的增删改（M1 只查看+套用）", () => {
    expect(Object.keys(createMerchantSlotRepository({ client: fakeClient(() => ({ ok: true, value: {} })).client })).sort()).toEqual(["applyTemplate", "create", "list", "listTemplates", "update"]);
  });
});

describe("用例：权限 / 两步套用 / 串行化 / 错误映射", () => {
  const tplPerms = { permissions: ["booking_slot", "booking_slot_template"] };
  const previewRaw = { dryRun: true, summary: { created: 2, skipped: 0, conflicts: 0 }, created: [{}, {}] };
  it("⭐模板套用权限：缺 booking_slot 或缺模板权限 ⇒ 不发请求（变异：放行即红）", async () => {
    const f = fakeClient(() => ({ ok: true, value: previewRaw }));
    const uc = createSlotUseCases({ slots: createMerchantSlotRepository({ client: f.client }) });
    for (const perms of [["booking_slot_template"], ["booking_slot"], [], null]) {
      const r = await uc.previewTemplate(ctx, perms == null ? null : { permissions: perms }, "builtin-default");
      expect(r.ok, JSON.stringify(perms)).toBe(false);
    }
    expect(f.seen).toEqual([]);
  });
  it("⭐两步套用：预览 dryRun=true；确认后 dryRun=false；预览无可新增项 ⇒ 拒绝真实套用", async () => {
    const f = fakeClient((i) => ({ ok: true, value: (i.body as { dryRun: boolean }).dryRun ? previewRaw : { dryRun: false, summary: { created: 2, skipped: 0, conflicts: 0 } } }));
    const uc = createSlotUseCases({ slots: createMerchantSlotRepository({ client: f.client }) });
    const pre = await uc.previewTemplate(ctx, tplPerms, "builtin-default");
    expect(pre.ok).toBe(true);
    if (!pre.ok) return;
    expect((f.seen[0].body as { dryRun: boolean }).dryRun).toBe(true);
    const done = await uc.applyTemplate(ctx, tplPerms, "builtin-default", pre.result);
    expect(done.ok).toBe(true);
    expect((f.seen[1].body as { dryRun: boolean }).dryRun).toBe(false);
    const empty = normalizeApplyResult({ summary: { created: 0, skipped: 5, conflicts: 0 } });
    f.seen.length = 0;
    const refused = await uc.applyTemplate(ctx, tplPerms, "builtin-default", empty);
    expect(refused).toMatchObject({ ok: false, kind: "validation" });
    expect(f.seen).toEqual([]);
  });
  it("套用整体容量覆盖非法 ⇒ validation，不发请求", async () => {
    const f = fakeClient(() => ({ ok: true, value: previewRaw }));
    const uc = createSlotUseCases({ slots: createMerchantSlotRepository({ client: f.client }) });
    expect(await uc.previewTemplate(ctx, tplPerms, "x", "501")).toMatchObject({ ok: false, kind: "validation", field: "capacity" });
    expect(f.seen).toEqual([]);
  });
  it("⭐写操作串行化：进行中再发任何写操作 ⇒ busy，不发第二次请求（变异：去掉串行即红）", async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    const f = fakeClient(async () => { await gate; return { ok: true, value: { id: 1, startTime: "10:00", endTime: "11:00", capacity: 5, status: 1 } }; });
    const uc = createSlotUseCases({ slots: createMerchantSlotRepository({ client: f.client }) });
    const p1 = uc.create(ctx, { startTime: "10:00", endTime: "11:00", capacity: "5" });
    expect(uc.isBusy()).toBe(true);
    expect(await uc.update(ctx, slot, { status: 0 })).toMatchObject({ ok: false, kind: "busy" });
    release();
    expect((await p1).ok).toBe(true);
    expect(f.seen.length).toBe(1);
    expect(uc.isBusy()).toBe(false);
  });
  it("后端冲突/重叠业务错误（HTTP200+code=500）原样展示；401 ⇒ auth-expired；校验失败不发请求", async () => {
    const mk = (e: AppError) => createSlotUseCases({ slots: createMerchantSlotRepository({ client: fakeClient(() => ({ ok: false, error: e })).client }) });
    expect(await mk(err("BUSINESS", "与已有启用档期 10:00-11:00 时间重叠", 500)).create(ctx, { startTime: "10:30", endTime: "11:30", capacity: "5" })).toEqual({
      ok: false, kind: "failed", message: "与已有启用档期 10:00-11:00 时间重叠",
    });
    expect(await mk(err("AUTH_EXPIRED")).load(ctx)).toMatchObject({ ok: false, kind: "auth-expired" });
    const f = fakeClient(() => ({ ok: true, value: {} }));
    const uc = createSlotUseCases({ slots: createMerchantSlotRepository({ client: f.client }) });
    expect(await uc.create(ctx, { startTime: "11:00", endTime: "10:00", capacity: "5" })).toMatchObject({ ok: false, kind: "validation" });
    expect(await uc.update(ctx, slot, {})).toMatchObject({ ok: false, kind: "validation" });
    expect(f.seen).toEqual([]);
  });
  it("load：排序后返回", async () => {
    const f = fakeClient(() => ({ ok: true, value: [{ id: 2, startTime: "11:00", endTime: "12:00", capacity: 1, status: 1 }, { id: 1, startTime: "09:00", endTime: "10:00", capacity: 1, status: 1 }] }));
    const r = await createSlotUseCases({ slots: createMerchantSlotRepository({ client: f.client }) }).load(ctx);
    expect(r.ok && r.slots.map((s) => s.id)).toEqual([1, 2]);
  });
});

describe("权限闸 / 入口 / 页面接线（源码级）", () => {
  it("slotPageGates：管理需 booking_slot；模板需两权限；缺失 fail-closed", () => {
    expect(slotPageGates({ permissions: ["booking_slot"] })).toEqual({ canManage: true, canTemplate: false });
    expect(slotPageGates({ permissions: ["booking_slot", "booking_slot_template"] })).toEqual({ canManage: true, canTemplate: true });
    expect(slotPageGates({ permissions: ["booking_slot_template"] })).toEqual({ canManage: false, canTemplate: false });
    expect(slotPageGates(null)).toEqual({ canManage: false, canTemplate: false });
  });
  it("工作台：档期入口按 booking_slot 显隐；与预约入口互不依赖", () => {
    expect(visibleEntries({ permissions: ["booking_slot"] }).map((e) => e.key)).toEqual(["slot"]);
    expect(visibleEntries({ permissions: ["booking", "booking_slot"] }).map((e) => e.key)).toEqual(["booking", "slot"]);
  });
  const page = readFileSync(resolve(root, "src/pkg-merchant/slot/list.vue"), "utf-8");
  const code = page.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  it("页面：时间选择/确认框走既有门面；不直调 wx/uni 平台 API；**不显示/不读取 bookedGuests、不做已占**", () => {
    expect(code).toContain("dialogRef.value?.confirm");
    expect(code).not.toMatch(/\bwx\./);
    expect(code).not.toContain("bookedGuests");
    expect(code).not.toContain("已占");
  });
  it("页面注册：slot/list 位于商家分包内且启用下拉刷新", () => {
    const pj = readFileSync(resolve(root, "src/pages.json"), "utf-8");
    const at = pj.indexOf('"path": "slot/list"');
    expect(at).toBeGreaterThan(pj.indexOf('"root": "pkg-merchant"'));
    expect(pj.slice(at, at + 220)).toContain('"enablePullDownRefresh": true');
  });
});
