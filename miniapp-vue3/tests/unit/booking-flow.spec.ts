// T8 到店预约 MVP：仓储请求形状（契约冻结值）＋应用层用例＋「我的预约」VM（分页/过滤/取消刷新/迟到响应）。
import { describe, expect, it, vi } from "vitest";
import { createBookingRepository, type BookingView } from "../../src/infrastructure/repositories";
import {
  createCancelBookingUseCase,
  createLoadSlotsUseCase,
  createMyBookingsUseCase,
  createSubmitBookingUseCase,
} from "../../src/application/booking-flow";
import { createMyBookingsViewModel } from "../../src/composables/use-my-bookings";
import type { RequestContext } from "../../src/ports/context";
import type { ClientRequestInput } from "../../src/infrastructure/http/client";
import type { Session } from "../../src/infrastructure/http/client";

const ctx: RequestContext = {
  platform: "mp-weixin",
  environment: "develop",
  brandId: null,
  requestId: "r1",
  profileKey: "blueberry",
  appCode: "x",
  scopeRevision: 0,
  authRevision: 0,
};

function fakeClient(respond: (input: ClientRequestInput) => unknown) {
  const calls: ClientRequestInput[] = [];
  return {
    calls,
    client: {
      request: async <T>(input: ClientRequestInput) => {
        calls.push(input);
        return respond(input) as { ok: true; value: T } | { ok: false; error: never };
      },
    },
  };
}

const fail = (message: string) => ({
  ok: false,
  error: { kind: "BUSINESS", businessCode: 500, message, requestId: "r", retryable: false },
});

function booking(id: number, status: BookingView["status"] = "pending"): BookingView {
  return {
    id,
    shopId: 0,
    merchantId: 7,
    shopName: "红河水乡店",
    slotId: 7,
    startTime: "10:00",
    endTime: "11:00",
    date: "2026-11-05",
    customerName: "张三",
    customerPhone: "13800138000",
    guestCount: 2,
    remark: "",
    status,
    channel: "wx",
    createTime: "2026-11-04 10:00:00",
    deposit: null,
  };
}

const fullSession: Session = {
  userId: "1",
  token: "t",
  platform: "mp-weixin",
  profileKey: "blueberry",
  authRevision: 1,
  kind: "full",
};

describe("bookings 仓储：请求形状（冻结契约）", () => {
  it("getSlots：公开 GET /api/shops/:id/slots?date=，幂等重放，不带 authRequired", async () => {
    const f = fakeClient(() => ({ ok: true, value: { date: "2026-11-05", slots: [] } }));
    await createBookingRepository({ client: f.client }).getSlots(ctx, 12, "2026-11-05");
    expect(f.calls[0]).toMatchObject({
      method: "GET",
      url: "/api/shops/12/slots",
      query: { date: "2026-11-05" },
      replayPolicy: "idempotent",
    });
    expect(f.calls[0].authRequired).toBeUndefined();
  });

  it("getSlots：响应中各 slot 的 reason 经归一化（past/full 原样保留，缺失/未知/非字符串归一为空串，兼容旧后端）", async () => {
    const f = fakeClient(() => ({
      ok: true,
      value: {
        date: "2026-11-05",
        slots: [
          { slotId: 1, startTime: "a", endTime: "b", capacity: 1, used: 0, remaining: 1, bookable: true, reason: "past" },
          { slotId: 2, startTime: "a", endTime: "b", capacity: 1, used: 1, remaining: 0, bookable: false, reason: "full" },
          { slotId: 3, startTime: "a", endTime: "b", capacity: 1, used: 1, remaining: 0, bookable: false }, // 旧后端：无 reason 字段
          { slotId: 4, startTime: "a", endTime: "b", capacity: 1, used: 1, remaining: 0, bookable: false, reason: "unknown-value" },
        ],
      },
    }));
    const r = await createBookingRepository({ client: f.client }).getSlots(ctx, 12, "2026-11-05");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value.slots.map((s) => s.reason)).toEqual(["past", "full", "", ""]);
  });

  it("createBooking：POST /api/bookings，需登录、禁重放；remark 为空不入 body", async () => {
    const f = fakeClient(() => ({ ok: true, value: booking(1) }));
    const repo = createBookingRepository({ client: f.client });
    await repo.createBooking(ctx, {
      slotId: 7, date: "2026-11-05", customerName: "张三", customerPhone: "13800138000", guestCount: 2,
    });
    expect(f.calls[0]).toMatchObject({ method: "POST", url: "/api/bookings", authRequired: true, replayPolicy: "never" });
    expect(f.calls[0].body).not.toHaveProperty("shopId"); // 商家由 X-Brand-Id 解析
    expect(f.calls[0].body).toEqual({
      slotId: 7, date: "2026-11-05", customerName: "张三", customerPhone: "13800138000", guestCount: 2,
    });
    await repo.createBooking(ctx, {
      slotId: 7, date: "2026-11-05", customerName: "张三", customerPhone: "13800138000", guestCount: 2, remark: "靠窗",
    });
    expect((f.calls[1].body as Record<string, unknown>).remark).toBe("靠窗");
  });

  it("listBookings：默认 page=1,pageSize=20；status 有则带、无则不带；需登录、幂等", async () => {
    const f = fakeClient(() => ({ ok: true, value: { list: [], total: 0, page: 1, pageSize: 20 } }));
    const repo = createBookingRepository({ client: f.client });
    await repo.listBookings(ctx);
    expect(f.calls[0]).toMatchObject({ method: "GET", url: "/api/bookings", query: { page: "1", pageSize: "20" }, authRequired: true, replayPolicy: "idempotent" });
    expect(f.calls[0].query).not.toHaveProperty("status");
    await repo.listBookings(ctx, { status: "confirmed", page: 3, pageSize: 5 });
    expect(f.calls[1].query).toEqual({ page: "3", pageSize: "5", status: "confirmed" });
  });

  it("cancelBooking：POST /api/bookings/:id/cancel，需登录、禁重放", async () => {
    const f = fakeClient(() => ({ ok: true, value: booking(9, "cancelled") }));
    await createBookingRepository({ client: f.client }).cancelBooking(ctx, 9);
    expect(f.calls[0]).toMatchObject({ method: "POST", url: "/api/bookings/9/cancel", authRequired: true, replayPolicy: "never" });
  });
});

describe("用例：加载时段", () => {
  it("成功透传 slots；失败透传服务端可读 message，空 message 回落通用文案", async () => {
    const ok = createLoadSlotsUseCase({
      bookings: { getMerchantSlots: async () => ({ ok: true, value: { date: "d", slots: [] } }) } as never,
    });
    expect(await ok.load(ctx, "d")).toEqual({ ok: true, value: { date: "d", slots: [] } });
    const bad = createLoadSlotsUseCase({ bookings: { getMerchantSlots: async () => fail("超出可预约日期") } as never });
    expect(await bad.load(ctx, "d")).toEqual({ ok: false, message: "超出可预约日期" });
    const empty = createLoadSlotsUseCase({ bookings: { getMerchantSlots: async () => fail("") } as never });
    expect(await empty.load(ctx, "d")).toEqual({ ok: false, message: "时段加载失败，请重试" });
  });
});

describe("用例：提交预约（校验→登录前置→提交）", () => {
  const input = {
    slotId: 7, date: "2026-11-05", customerName: " 张三 ", customerPhone: "13800138000", guestCount: 2, remark: " 靠窗 ",
  };

  it("表单不合法：零请求，返回 validation 与字段", async () => {
    const create = vi.fn();
    const uc = createSubmitBookingUseCase({ bookings: { createBooking: create } as never, loadSession: () => fullSession, context: () => ctx });
    const r = await uc.submit({ ...input, customerPhone: "123" });
    expect(r).toMatchObject({ ok: false, kind: "validation", error: { field: "customerPhone" } });
    expect(create).not.toHaveBeenCalled();
  });

  it("未登录（无会话/仅 silent 会话）：零请求，返回 login-required", async () => {
    const create = vi.fn();
    for (const sess of [null, { ...fullSession, kind: "silent" as const }]) {
      const uc = createSubmitBookingUseCase({ bookings: { createBooking: create } as never, loadSession: () => sess, context: () => ctx });
      expect(await uc.submit(input)).toEqual({ ok: false, kind: "login-required" });
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("已登录：提交裁剪后的姓名/手机/备注，成功返回 booking", async () => {
    const create = vi.fn(async () => ({ ok: true, value: booking(5) }));
    const uc = createSubmitBookingUseCase({ bookings: { createBooking: create } as never, loadSession: () => fullSession, context: () => ctx });
    const r = await uc.submit(input);
    expect(r).toMatchObject({ ok: true, value: { id: 5 } });
    expect(create).toHaveBeenCalledWith(ctx, {
      slotId: 7, date: "2026-11-05", customerName: "张三", customerPhone: "13800138000", guestCount: 2, remark: "靠窗",
    });
  });

  it("服务端业务失败（已约满等）：message 原样透传给用户", async () => {
    const uc = createSubmitBookingUseCase({
      bookings: { createBooking: async () => fail("该时段已约满") } as never,
      loadSession: () => fullSession,
      context: () => ctx,
    });
    expect(await uc.submit(input)).toEqual({ ok: false, kind: "business", message: "该时段已约满" });
  });

  it("空白备注不入请求", async () => {
    const create = vi.fn(async () => ({ ok: true, value: booking(5) }));
    const uc = createSubmitBookingUseCase({ bookings: { createBooking: create } as never, loadSession: () => fullSession, context: () => ctx });
    await uc.submit({ ...input, remark: "   " });
    expect((create.mock.calls[0] as unknown[])[1]).toMatchObject({ remark: undefined });
  });
});

describe("我的预约 VM：分页/过滤/取消刷新", () => {
  function makeVm(pages: Record<string, { list: BookingView[]; total: number }>, cancel?: (id: number) => Promise<unknown>) {
    const calls: Array<{ status?: string; page?: number }> = [];
    const list = createMyBookingsUseCase({
      bookings: {
        listBookings: async (_c: unknown, p: { status?: string; page?: number }) => {
          calls.push({ status: p.status, page: p.page });
          const key = (p.status ?? "all") + ":" + p.page;
          const hit = pages[key];
          return hit ? { ok: true, value: { ...hit, page: p.page, pageSize: 2 } } : fail("加载失败");
        },
      } as never,
    });
    const cancelUc = createCancelBookingUseCase({
      bookings: { cancelBooking: async (_c: unknown, id: number) => (cancel ? cancel(id) : { ok: true, value: booking(id, "cancelled") }) } as never,
    });
    return { vm: createMyBookingsViewModel({ list, cancel: cancelUc }, { pageSize: 2 }), calls };
  }

  it("loadFirst 填充；total 未到则可继续 loadMore，累计后 noMore=true", async () => {
    const { vm, calls } = makeVm({
      "all:1": { list: [booking(1), booking(2)], total: 3 },
      "all:2": { list: [booking(3)], total: 3 },
    });
    await vm.loadFirst(ctx);
    expect(vm.items.value.map((b) => b.id)).toEqual([1, 2]);
    expect(vm.noMore.value).toBe(false);
    await vm.loadMore(ctx);
    expect(vm.items.value.map((b) => b.id)).toEqual([1, 2, 3]);
    expect(vm.noMore.value).toBe(true);
    await vm.loadMore(ctx); // noMore 后不再请求
    expect(calls.length).toBe(2);
  });

  it("切换状态筛选：重置到第 1 页并带 status；清空筛选回到全部", async () => {
    const { vm, calls } = makeVm({
      "all:1": { list: [booking(1)], total: 1 },
      "pending:1": { list: [booking(8)], total: 1 },
    });
    await vm.loadFirst(ctx, "pending");
    expect(calls[0]).toEqual({ status: "pending", page: 1 });
    expect(vm.items.value[0].id).toBe(8);
    await vm.loadFirst(ctx, "");
    expect(calls[1]).toEqual({ status: undefined, page: 1 });
    expect(vm.items.value[0].id).toBe(1);
  });

  it("失败：清空列表、noMore、error 带服务端 message；不抛", async () => {
    const { vm } = makeVm({});
    await vm.loadFirst(ctx);
    expect(vm.items.value).toEqual([]);
    expect(vm.error.value).toBe("加载失败");
    expect(vm.noMore.value).toBe(true);
  });

  it("迟到响应不覆盖新结果（连切筛选）", async () => {
    let releaseFirst: (v: unknown) => void = () => undefined;
    const slow = new Promise((r) => (releaseFirst = r));
    const list = {
      load: async (_c: unknown, p: { status?: string }) => {
        if (p.status === "pending") {
          await slow;
          return { ok: true as const, value: { list: [booking(1)], total: 1, page: 1, pageSize: 2 } };
        }
        return { ok: true as const, value: { list: [booking(2, "confirmed")], total: 1, page: 1, pageSize: 2 } };
      },
    };
    const vm = createMyBookingsViewModel({ list: list as never, cancel: {} as never }, { pageSize: 2 });
    const p1 = vm.loadFirst(ctx, "pending");
    await vm.loadFirst(ctx, "confirmed");
    releaseFirst(null);
    await p1;
    expect(vm.items.value.map((b) => b.id)).toEqual([2]);
    expect(vm.status.value).toBe("confirmed");
    expect(vm.loading.value).toBe(false);
  });

  it("取消成功：重拉第一页（保持筛选），返回 ok；取消失败：不刷新、透传 message", async () => {
    let n = 0;
    const lists = [
      { list: [booking(1), booking(2)], total: 2 },
      { list: [booking(1, "cancelled"), booking(2)], total: 2 },
    ];
    const calls: string[] = [];
    const cancelUc = createCancelBookingUseCase({ bookings: { cancelBooking: async (_c: unknown, id: number) => (id === 1 ? { ok: true, value: booking(1, "cancelled") } : fail("仅待确认或已确认的预约可取消")) } as never });
    const listUc = createMyBookingsUseCase({
      bookings: { listBookings: async (_c: unknown, p: { status?: string }) => { calls.push(p.status ?? "all"); return { ok: true, value: { ...lists[Math.min(n++, 1)], page: 1, pageSize: 2 } }; } } as never,
    });
    const vm = createMyBookingsViewModel({ list: listUc, cancel: cancelUc }, { pageSize: 2 });
    await vm.loadFirst(ctx, "pending");
    const okRes = await vm.cancelBooking(ctx, 1);
    expect(okRes).toEqual({ ok: true });
    expect(calls).toEqual(["pending", "pending"]); // 重拉并保持筛选
    expect(vm.items.value[0].status).toBe("cancelled");
    const badRes = await vm.cancelBooking(ctx, 2);
    expect(badRes).toEqual({ ok: false, message: "仅待确认或已确认的预约可取消" });
    expect(calls.length).toBe(2); // 失败不重拉
    expect(vm.cancellingId.value).toBeNull();
  });
});

// —— 错误文案中文化（CR 建议 1/2）——
const failKind = (kind: string, message: string) => ({
  ok: false,
  error: { kind, businessCode: null, message, requestId: "r", retryable: false },
});

describe("用例：非业务失败不透出英文技术串", () => {
  const input = { slotId: 7, date: "2026-11-05", customerName: "张三", customerPhone: "13800138000", guestCount: 2 };
  const submitWith = (res: unknown) =>
    createSubmitBookingUseCase({ bookings: { createBooking: async () => res } as never, loadSession: () => fullSession, context: () => ctx }).submit(input);

  it("提交预约 401／登录失效：返回 auth-expired 与中文文案（页面据此拉起登录弹窗）", async () => {
    expect(await submitWith(failKind("AUTH_EXPIRED", "unauthorized"))).toEqual({ ok: false, kind: "auth-expired", message: "登录已失效，请重新登录" });
    expect(await submitWith(failKind("AUTH_EXPIRED", "login required: no-session"))).toEqual({ ok: false, kind: "auth-expired", message: "登录已失效，请重新登录" });
  });

  it("提交预约 网络/超时：专属文案（可能已提交，请先去‘我的预约’核对，勿重复提交）", async () => {
    const want = { ok: false, kind: "business", message: "网络不太稳定。若稍后在「我的预约」里看到该预约，说明已提交成功，请勿重复提交" };
    expect(await submitWith(failKind("NETWORK", "transport failure: network"))).toEqual(want);
    expect(await submitWith(failKind("TIMEOUT", "transport failure: timeout"))).toEqual(want);
  });

  it("提交预约 其它未知：‘操作失败，请稍后重试’；业务失败仍原样透传", async () => {
    expect(await submitWith(failKind("UNKNOWN", "weird"))).toEqual({ ok: false, kind: "business", message: "操作失败，请稍后重试" });
    expect(await submitWith(failKind("CANCELLED", "login required: cancelled"))).toEqual({ ok: false, kind: "business", message: "操作失败，请稍后重试" });
    expect(await submitWith(fail("该时段已约满"))).toEqual({ ok: false, kind: "business", message: "该时段已约满" });
  });

  it("‘网络专属文案’只对 create 生效：加载时段/列表/取消遇网络失败用通用‘网络不太稳定，请稍后重试’", async () => {
    const net = failKind("TIMEOUT", "transport failure: timeout");
    expect(await createLoadSlotsUseCase({ bookings: { getMerchantSlots: async () => net } as never }).load(ctx, "d")).toEqual({ ok: false, message: "网络不太稳定，请稍后重试" });
    expect(await createMyBookingsUseCase({ bookings: { listBookings: async () => net } as never }).load(ctx)).toEqual({ ok: false, message: "网络不太稳定，请稍后重试" });
    expect(await createCancelBookingUseCase({ bookings: { cancelBooking: async () => net } as never }).cancel(ctx, 1)).toEqual({ ok: false, message: "网络不太稳定，请稍后重试" });
  });

  it("列表/取消 401：中文文案＋authExpired 标记（页面回到‘请先登录’）", async () => {
    const auth = failKind("AUTH_EXPIRED", "unauthorized");
    expect(await createMyBookingsUseCase({ bookings: { listBookings: async () => auth } as never }).load(ctx)).toEqual({
      ok: false, message: "登录已失效，请重新登录", authExpired: true,
    });
    expect(await createCancelBookingUseCase({ bookings: { cancelBooking: async () => auth } as never }).cancel(ctx, 1)).toEqual({
      ok: false, message: "登录已失效，请重新登录", authExpired: true,
    });
  });

  it("replayPolicy 不变：createBooking／cancelBooking 仍为 never", async () => {
    const f = fakeClient(() => ({ ok: true, value: booking(1) }));
    const repo = createBookingRepository({ client: f.client });
    await repo.createBooking(ctx, { slotId: 1, date: "2026-11-05", customerName: "a", customerPhone: "13800138000", guestCount: 1 });
    await repo.cancelBooking(ctx, 1);
    expect(f.calls.map((c) => c.replayPolicy)).toEqual(["never", "never"]);
  });
});

describe("我的预约 VM：失败保留策略（CR 建议 5）", () => {
  type Resp = { ok: true; value: { list: BookingView[]; total: number; page: number; pageSize: number } } | ReturnType<typeof fail>;
  function scripted(responses: Array<(p: { status?: string; page?: number }) => Resp>, cancel?: () => unknown) {
    let i = 0;
    const list = createMyBookingsUseCase({
      bookings: { listBookings: async (_c: unknown, p: { status?: string; page?: number }) => responses[Math.min(i++, responses.length - 1)](p) } as never,
    });
    const cancelUc = createCancelBookingUseCase({
      bookings: { cancelBooking: async (_c: unknown, id: number) => (cancel ? cancel() : { ok: true, value: booking(id, "cancelled") }) } as never,
    });
    return createMyBookingsViewModel({ list, cancel: cancelUc }, { pageSize: 2 });
  }
  const okPage = (ids: number[], total: number, status: BookingView["status"] = "pending"): ((p: { page?: number }) => Resp) =>
    (p) => ({ ok: true, value: { list: ids.map((id) => booking(id, status)), total, page: p.page ?? 1, pageSize: 2 } });
  const bad = (m = "加载失败"): (() => Resp) => () => fail(m) as Resp;

  it("(b) 下拉刷新（非首次）失败：保留已有列表与分页状态；返回失败结果供页面 toast", async () => {
    const vm = scripted([okPage([1, 2], 3), bad("网络不太稳定，请稍后重试")]);
    await vm.loadFirst(ctx);
    const r = await vm.loadFirst(ctx);
    expect(r).toEqual({ ok: false, message: "网络不太稳定，请稍后重试" });
    expect(vm.items.value.map((b) => b.id)).toEqual([1, 2]); // 列表未清空
    expect(vm.noMore.value).toBe(false);
    expect(vm.page.value).toBe(1);
    expect(vm.total.value).toBe(3);
    expect(vm.loading.value).toBe(false);
  });

  it("(b) 首次加载（列表本来为空）失败：空列表＋error，供页面展示‘加载失败 / 重试’；重试成功后恢复", async () => {
    const vm = scripted([bad("加载失败"), okPage([1], 1)]);
    await vm.loadFirst(ctx);
    expect(vm.items.value).toEqual([]);
    expect(vm.error.value).toBe("加载失败");
    await vm.loadFirst(ctx); // 重试
    expect(vm.error.value).toBeNull();
    expect(vm.items.value.map((b) => b.id)).toEqual([1]);
  });

  it("(b) 切换筛选失败：旧筛选的列表不得留着误导 ⇒ 清空并出‘加载失败’", async () => {
    const vm = scripted([okPage([1, 2], 2), bad("加载失败")]);
    await vm.loadFirst(ctx);
    await vm.loadFirst(ctx, "confirmed");
    expect(vm.items.value).toEqual([]);
    expect(vm.error.value).toBe("加载失败");
    expect(vm.status.value).toBe("confirmed"); // 状态保留 ⇒ 重试带同一筛选
  });

  it("(a) loadMore 失败：记 loadMoreError、不动 noMore/page，列表保留；再次触底可重试成功", async () => {
    const vm = scripted([okPage([1, 2], 3), bad("网络不太稳定，请稍后重试"), okPage([3], 3)]);
    await vm.loadFirst(ctx);
    await vm.loadMore(ctx);
    expect(vm.loadMoreError.value).toBe("网络不太稳定，请稍后重试");
    expect(vm.items.value.map((b) => b.id)).toEqual([1, 2]);
    expect(vm.noMore.value).toBe(false);
    expect(vm.page.value).toBe(1);
    expect(vm.loadingMore.value).toBe(false);
    await vm.loadMore(ctx); // 再次触底
    expect(vm.loadMoreError.value).toBeNull();
    expect(vm.items.value.map((b) => b.id)).toEqual([1, 2, 3]);
  });

  it("(c) 取消成功但重拉失败：返回 ok、列表不清空、该条本地标记为已取消", async () => {
    const vm = scripted([okPage([1, 2], 2), bad("网络不太稳定，请稍后重试")]);
    await vm.loadFirst(ctx);
    const r = await vm.cancelBooking(ctx, 1);
    expect(r).toEqual({ ok: true });
    expect(vm.items.value.map((b) => [b.id, b.status])).toEqual([[1, "cancelled"], [2, "pending"]]);
    expect(vm.cancellingId.value).toBeNull();
  });

  it("(c) 取消成功但重拉失败 + 当前筛选为‘待确认’：该条从当前筛选摘除，其余保留，total 同步减 1", async () => {
    const vm = scripted([okPage([1, 2], 2), bad()]);
    await vm.loadFirst(ctx, "pending");
    const r = await vm.cancelBooking(ctx, 1);
    expect(r).toEqual({ ok: true });
    expect(vm.items.value.map((b) => b.id)).toEqual([2]);
    expect(vm.total.value).toBe(1);
  });

  it("401：authExpired 置位；重新加载成功后复位", async () => {
    const authFail = (): Resp => failKind("AUTH_EXPIRED", "unauthorized") as unknown as Resp;
    const vm = scripted([authFail, okPage([1], 1)]);
    await vm.loadFirst(ctx);
    expect(vm.authExpired.value).toBe(true);
    await vm.loadFirst(ctx);
    expect(vm.authExpired.value).toBe(false);
  });
});
