// 商家端上传基础单测（issue #14 · M2 第二批）：压缩口径 / 响应判定 / 串行上传 / 单张重试 / 平台适配 / BaseProgress / shopList。
// 变异靶点：①并发上传（去掉串行）②把 code=200 当成功（不核对条数）③压缩失败回退原图 ④压缩常量改回 1080/500KB
//          ⑤Authorization 用错 ⑥name 不是 files ⑦formData 缺 shopId/albumId ⑧failedAt 重试复用/重压逻辑
//          ⑨BaseProgress 不收敛进度 ⑩chooseMedia count 不收敛。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import {
  COMPRESS_FAIL_TEXT,
  MERCHANT_COMPRESS_MAX_BYTES,
  MERCHANT_COMPRESS_MAX_LONG_EDGE,
  MERCHANT_COMPRESS_QUALITIES,
  MERCHANT_PICK_MAX_COUNT,
  MERCHANT_UPLOAD_MAX_QUEUE,
  UPLOAD_NETWORK_TEXT,
  UPLOAD_SILENT_DROP_TEXT,
  UPLOAD_TIMEOUT_TEXT,
  appendToQueue,
  computeMerchantTargetSize,
  describeQueue,
  needsCompress,
  newQueueItem,
  overallPercent,
  parseUploadResponse,
  summarizeQueue,
} from "../../src/pkg-merchant/domain/merchant-upload";
import { createAlbumUploader } from "../../src/pkg-merchant/application/merchant-album-uploader";
import { createWeixinImageCompress, type ImageCompressPort } from "../../src/platform/weixin/image-compress";
import { CHOOSE_MEDIA_MAX, createUniMediaPicker } from "../../src/platform/uni/media-picker";
import { COMPRESS_MAX_LONG_EDGE as COMPRESS_MAX_LONG_EDGE_AI } from "../../src/domain/photo-compress";
import BaseProgress from "../../src/ui/BaseProgress.vue";
import { clampPercent } from "../../src/ui/progress-util";
import StubProgress from "../stubs/wot/wd-progress/wd-progress.vue";
import { normalizeShopList } from "../../src/pkg-merchant/infrastructure/merchant-auth";
import { merchantKeyOf, MERCHANT_LAST_SHOP_KEY } from "../../src/pkg-merchant/infrastructure/merchant-storage";
import type { UploadPort, UploadRequest, UploadResponse } from "../../src/ports/upload";
import type { Result } from "../../src/ports/context";

const root = resolve(__dirname, "../..");
const ok = (count: number, code: number | string = 200) => ({ ok: true as const, value: { statusCode: 200, data: JSON.stringify({ code, message: "上传成功", data: Array.from({ length: count }, (_, i) => ({ id: i + 1 })) }) } as UploadResponse });

describe("压缩口径（商家端独立常量，不碰 AI 试衣 1080/500KB）", () => {
  it("⭐常量：长边 1600 / 3MB / 质量 0.85→0.7（变异：改回 1080/500KB 即红）", () => {
    expect(MERCHANT_COMPRESS_MAX_LONG_EDGE).toBe(1600);
    expect(MERCHANT_COMPRESS_MAX_BYTES).toBe(3 * 1024 * 1024);
    expect([...MERCHANT_COMPRESS_QUALITIES]).toEqual([0.85, 0.7]);
    expect(MERCHANT_PICK_MAX_COUNT).toBe(9);
  });
  it("AI 试衣的压缩常量未被改动（1080 / 500KB）", () => {
    const src = readFileSync(resolve(root, "src/domain/photo-compress.ts"), "utf-8");
    expect(src).toMatch(/COMPRESS_MAX_LONG_EDGE\s*=\s*1080/);
    expect(src).toMatch(/COMPRESS_TARGET_BYTES\s*=\s*500\s*\*\s*1024/);
    expect(COMPRESS_MAX_LONG_EDGE_AI).toBe(1080);
  });
  it("computeMerchantTargetSize：等比、不放大、不裁剪；横竖图；非法尺寸收敛", () => {
    expect(computeMerchantTargetSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(computeMerchantTargetSize(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(computeMerchantTargetSize(1600, 900)).toEqual({ width: 1600, height: 900 });
    expect(computeMerchantTargetSize(800, 600)).toEqual({ width: 800, height: 600 }); // 小图不放大
    expect(computeMerchantTargetSize(0, 0)).toEqual({ width: 1, height: 1 });
    expect(computeMerchantTargetSize(Number.NaN, 100).width).toBe(1);
    const t = computeMerchantTargetSize(5000, 1000);
    expect(t.width).toBe(1600);
    expect(t.height).toBe(320);
  });
  it("needsCompress：预算内复用原图；超体积/超长边/体积未知 ⇒ 需要压缩（体积未知保守）", () => {
    expect(needsCompress({ size: 2 * 1024 * 1024, width: 1600, height: 1200 })).toBe(false);
    expect(needsCompress({ size: 3 * 1024 * 1024, width: 1600, height: 1600 })).toBe(false); // 边界恰好等于
    expect(needsCompress({ size: 3 * 1024 * 1024 + 1, width: 800, height: 600 })).toBe(true);
    expect(needsCompress({ size: 1024, width: 1601, height: 100 })).toBe(true);
    expect(needsCompress({ size: 0, width: 800, height: 600 })).toBe(true);
    expect(needsCompress({ size: Number.NaN, width: 800, height: 600 })).toBe(true);
  });
});

describe("⭐parseUploadResponse：不能把 code=200 当成功，必须核对 data 条数", () => {
  it("2xx + code 200/0 + data 数组 ⇒ ok，count 为真实条数（含 0）", () => {
    expect(parseUploadResponse(200, JSON.stringify({ code: 200, data: [{ id: 5 }] }))).toEqual({ ok: true, count: 1, ids: [5] });
    expect(parseUploadResponse(200, JSON.stringify({ code: 0, data: [] }))).toEqual({ ok: true, count: 0, ids: [] });
  });
  it("code=500 业务失败 ⇒ 后端文案原样；401/403 专用文案；HTTP 非 2xx 分类", () => {
    expect(parseUploadResponse(200, JSON.stringify({ code: 500, message: "相册不存在或无权限" }))).toEqual({ ok: false, message: "相册不存在或无权限" });
    expect(parseUploadResponse(200, JSON.stringify({ code: 500, message: " " }))).toMatchObject({ ok: false });
    expect(parseUploadResponse(200, JSON.stringify({ code: 401 }))).toEqual({ ok: false, message: "登录已失效，请重新登录" });
    expect(parseUploadResponse(401, "x")).toEqual({ ok: false, message: "登录已失效，请重新登录" });
    expect(parseUploadResponse(413, "x")).toMatchObject({ ok: false, message: expect.stringContaining("过大") });
    expect(parseUploadResponse(500, "x")).toMatchObject({ ok: false, message: expect.stringContaining("HTTP 500") });
  });
  it("畸形：非 JSON / 非对象 / data 不是数组 ⇒ 失败，不当成功", () => {
    for (const body of ["<html>502</html>", "", "null", "[]", JSON.stringify({ code: 200 }), JSON.stringify({ code: 200, data: "ok" }), JSON.stringify({ code: 200, data: null })]) {
      expect(parseUploadResponse(200, body).ok, body).toBe(false);
    }
  });
});

describe("队列纯函数", () => {
  it("overallPercent / summarize / describe：等权；失败也计入处理完毕；空队列 0", () => {
    expect(overallPercent([])).toBe(0);
    expect(overallPercent([{ status: "done", percent: 100 }, { status: "uploading", percent: 50 }])).toBe(75);
    expect(overallPercent([{ status: "queued", percent: 0 }, { status: "queued", percent: 0 }])).toBe(0);
    expect(overallPercent([{ status: "failed", percent: 0 }, { status: "done", percent: 100 }])).toBe(100);
    expect(describeQueue([{ status: "done" }, { status: "uploading" }, { status: "queued" }])).toBe("上传中 1/3");
    expect(describeQueue([{ status: "done" }, { status: "failed" }])).toBe("完成 1/2，1 张失败");
    expect(describeQueue([{ status: "done" }, { status: "done" }])).toBe("已完成 2/2");
    expect(summarizeQueue([{ status: "failed" }, { status: "queued" }])).toEqual({ total: 2, done: 0, failed: 1, pending: 1 });
  });
  it("appendToQueue：超过队列上限截断并返回丢弃数", () => {
    const first = appendToQueue([], Array.from({ length: MERCHANT_UPLOAD_MAX_QUEUE - 1 }, (_, i) => ({ path: "p" + i, size: 1 })), 1);
    expect(first.dropped).toBe(0);
    const second = appendToQueue(first.queue, [{ path: "a", size: 1 }, { path: "b", size: 1 }, { path: "c", size: 1 }], first.nextKey);
    expect(second.queue.length).toBe(MERCHANT_UPLOAD_MAX_QUEUE);
    expect(second.dropped).toBe(2);
    expect(new Set(second.queue.map((q) => q.key)).size).toBe(second.queue.length); // key 唯一
  });
});

// —— 上传编排 ——
function fakeUpload(responder: (req: UploadRequest, n: number) => Promise<Result<UploadResponse>> | Result<UploadResponse>) {
  const reqs: UploadRequest[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const port: UploadPort = {
    upload: async (req) => {
      reqs.push(req);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        return await responder(req, reqs.length);
      } finally {
        inFlight--;
      }
    },
    cancel: () => {},
  };
  return { port, reqs, maxInFlight: () => maxInFlight };
}
const goodCompress: ImageCompressPort = { compress: async (p) => ({ path: "c-" + p, size: 1000, width: 100, height: 100, reused: false }) };
function mk(upload: UploadPort, compress: ImageCompressPort = goodCompress, extra: Partial<Parameters<typeof createAlbumUploader>[0]> = {}) {
  const finished: number[] = [];
  const u = createAlbumUploader({ upload, compress, getToken: () => "M-TOKEN", uploadUrl: "https://x/photo-albums/albums/upload", shopId: 7, albumId: 9, onFinished: () => finished.push(1), ...extra });
  return { u, finished };
}
const settle = async (u: ReturnType<typeof createAlbumUploader>) => {
  for (let i = 0; i < 200 && u.isRunning(); i++) await new Promise((r) => setTimeout(r, 0));
};

describe("⭐串行上传编排", () => {
  it("请求形态：name=files、formData 带 shopId/albumId、Authorization 用商家 token、超时有界", async () => {
    const f = fakeUpload(() => ok(1));
    const { u } = mk(f.port);
    u.enqueue([{ path: "a.jpg", size: 100 }]);
    await settle(u);
    expect(f.reqs[0]).toMatchObject({
      url: "https://x/photo-albums/albums/upload",
      filePath: "c-a.jpg",
      name: "files",
      headers: { Authorization: "Bearer M-TOKEN" },
      formData: { shopId: "7", albumId: "9" },
    });
    expect(f.reqs[0].timeoutMs).toBeGreaterThan(0);
  });
  it("⭐并发恒为 1：多张逐个上传，任一时刻在飞请求 ≤1（变异：并发化即红）", async () => {
    const f = fakeUpload(async () => { await new Promise((r) => setTimeout(r, 5)); return ok(1); });
    const { u } = mk(f.port);
    u.enqueue(Array.from({ length: 5 }, (_, i) => ({ path: "p" + i, size: 100 })));
    await settle(u);
    expect(f.reqs.length).toBe(5);
    expect(f.maxInFlight()).toBe(1);
    expect(f.reqs.map((r) => r.filePath)).toEqual(["c-p0", "c-p1", "c-p2", "c-p3", "c-p4"]); // 保持选图顺序（后端按到达顺序连号）
    expect(u.items().every((i) => i.status === "done")).toBe(true);
  });
  it("⭐条数核对：HTTP200+code=200 但 data 为空数组（后端静默丢弃）⇒ 判失败 + 专用文案（变异：只看 code 即红）", async () => {
    const f = fakeUpload(() => ok(0));
    const { u } = mk(f.port);
    u.enqueue([{ path: "a.jpg", size: 100 }]);
    await settle(u);
    expect(u.items()[0]).toMatchObject({ status: "failed", error: UPLOAD_SILENT_DROP_TEXT, failedAt: "upload" });
  });
  it("条数异常（>1）也判失败并提示刷新核对", async () => {
    const { u } = mk(fakeUpload(() => ok(2)).port);
    u.enqueue([{ path: "a.jpg", size: 100 }]);
    await settle(u);
    expect(u.items()[0].status).toBe("failed");
    expect(u.items()[0].error).toContain("刷新核对");
  });
  it("网络失败/超时 ⇒ 对应文案；单张失败不影响其它张，结束后统一 onFinished 一次", async () => {
    const f = fakeUpload((_r, n) => (n === 1 ? { ok: false, reason: "network" } : n === 2 ? { ok: false, reason: "timeout" } : ok(1)));
    const { u, finished } = mk(f.port);
    u.enqueue([{ path: "a", size: 1 }, { path: "b", size: 1 }, { path: "c", size: 1 }]);
    await settle(u);
    const items = u.items();
    expect(items[0]).toMatchObject({ status: "failed", error: UPLOAD_NETWORK_TEXT });
    expect(items[1]).toMatchObject({ status: "failed", error: UPLOAD_TIMEOUT_TEXT });
    expect(items[2].status).toBe("done");
    expect(finished.length).toBe(1);
  });
  it("⭐压缩失败 ⇒ 该张失败且**绝不上传原图**（0 次上传请求；变异：回退原图即红）", async () => {
    const f = fakeUpload(() => ok(1));
    const { u } = mk(f.port, { compress: async () => null });
    u.enqueue([{ path: "huge.jpg", size: 30 * 1024 * 1024 }]);
    await settle(u);
    expect(f.reqs.length).toBe(0);
    expect(u.items()[0]).toMatchObject({ status: "failed", error: COMPRESS_FAIL_TEXT, failedAt: "compress" });
  });
  it("⭐单张重试：上传阶段失败复用已压缩产物（不重复压缩）；压缩阶段失败重试会重新压缩", async () => {
    let compressCalls = 0;
    const compress: ImageCompressPort = { compress: async (p) => { compressCalls++; return compressCalls === 1 ? null : { path: "c-" + p, size: 1, width: 1, height: 1, reused: false }; } };
    let uploads = 0;
    const f = fakeUpload(() => (++uploads === 1 ? { ok: false, reason: "network" } : ok(1)));
    const { u } = mk(f.port, compress);
    u.enqueue([{ path: "a", size: 1 }, { path: "b", size: 1 }]);
    await settle(u);
    // a：压缩失败；b：压缩成功但第 1 次上传网络失败
    let items = u.items();
    expect(items[0]).toMatchObject({ status: "failed", failedAt: "compress" });
    expect(items[1]).toMatchObject({ status: "failed", failedAt: "upload", compressedPath: "c-b" });
    u.retry(items[1].key); // 上传失败 ⇒ 复用产物
    await settle(u);
    expect(compressCalls).toBe(2); // 没有为 b 重新压缩
    u.retry(items[0].key); // 压缩失败 ⇒ 重新压缩
    await settle(u);
    expect(compressCalls).toBe(3);
    items = u.items();
    expect(items.map((i) => i.status)).toEqual(["done", "done"]);
  });
  it("retry 只对 failed 项生效；retryAllFailed 重排全部失败项", async () => {
    let n = 0;
    const f = fakeUpload(() => (++n <= 2 ? { ok: false, reason: "network" } : ok(1)));
    const { u } = mk(f.port);
    u.enqueue([{ path: "a", size: 1 }, { path: "b", size: 1 }]);
    await settle(u);
    expect(u.items().map((i) => i.status)).toEqual(["failed", "failed"]);
    u.retry(9999); // 不存在 ⇒ 忽略
    u.retryAllFailed();
    await settle(u);
    expect(u.items().map((i) => i.status)).toEqual(["done", "done"]);
  });
  it("登录失效（无 token / code=401）⇒ 停止后续上传、剩余项标失败、通知页面", async () => {
    let expired = 0;
    const f = fakeUpload(() => ({ ok: true, value: { statusCode: 200, data: JSON.stringify({ code: 401 }) } }));
    const { u } = mk(f.port, goodCompress, { onAuthExpired: () => expired++ });
    u.enqueue([{ path: "a", size: 1 }, { path: "b", size: 1 }, { path: "c", size: 1 }]);
    await settle(u);
    expect(f.reqs.length).toBe(1); // 第 1 张 401 后不再发后面的
    expect(u.items().every((i) => i.status === "failed")).toBe(true);
    expect(expired).toBe(1);
    const noToken = mk(fakeUpload(() => ok(1)).port, goodCompress, { getToken: () => "" });
    noToken.u.enqueue([{ path: "a", size: 1 }]);
    await settle(noToken.u);
    expect(noToken.u.items()[0]).toMatchObject({ status: "failed", error: "登录已失效，请重新登录" });
  });
  it("进度回调写入该张 percent；cancel 把进行中/排队项标失败并中止", async () => {
    let aborted = 0;
    const port: UploadPort = { upload: async (req) => { req.onProgress?.(42); await new Promise((r) => setTimeout(r, 20)); return ok(1); }, cancel: () => { aborted++; } };
    const seen: number[] = [];
    const { u } = mk(port, goodCompress, { onChange: (items) => { const up = items.find((i) => i.status === "uploading"); if (up) seen.push(up.percent); } });
    u.enqueue([{ path: "a", size: 1 }, { path: "b", size: 1 }]);
    await new Promise((r) => setTimeout(r, 5));
    u.cancel();
    expect(aborted).toBe(1);
    expect(seen).toContain(42);
    expect(u.items().every((i) => i.status === "failed")).toBe(true);
  });
  it("页面回调抛异常不影响上传", async () => {
    const { u } = mk(fakeUpload(() => ok(1)).port, goodCompress, { onChange: () => { throw new Error("ui boom"); }, onFinished: () => { throw new Error("ui boom"); } });
    u.enqueue([{ path: "a", size: 1 }]);
    await settle(u);
    expect(u.items()[0].status).toBe("done");
  });
});

describe("平台适配：压缩 / 多选", () => {
  const g = globalThis as { wx?: unknown; uni?: unknown };
  afterEach(() => { delete g.wx; delete g.uni; });
  const opts = {
    maxLongEdge: MERCHANT_COMPRESS_MAX_LONG_EDGE,
    maxBytes: MERCHANT_COMPRESS_MAX_BYTES,
    qualities: MERCHANT_COMPRESS_QUALITIES,
    timeoutMs: 200,
    needsCompress,
    computeSize: computeMerchantTargetSize,
  };
  function stubWx(over: { w?: number; h?: number; sizes?: Record<string, number>; canvasFail?: boolean; hang?: boolean } = {}) {
    const calls: Array<{ quality: number; w: number; h: number }> = [];
    let drawArgs: number[] = [];
    g.wx = {
      getImageInfo: (o: { success: (r: { width: number; height: number }) => void }) => { if (!over.hang) o.success({ width: over.w ?? 4000, height: over.h ?? 3000 }); },
      createOffscreenCanvas: () => ({
        getContext: () => ({ drawImage: (_i: unknown, ...a: number[]) => { drawArgs = a; } }),
        createImage: () => { const img: { onload: () => void; onerror: () => void; src: string } = { onload: () => {}, onerror: () => {}, set src(_v: string) { setTimeout(() => img.onload(), 0); } } as never; return img; },
      }),
      canvasToTempFilePath: (o: { quality: number; destWidth: number; destHeight: number; success: (r: { tempFilePath: string }) => void; fail: () => void }) => {
        calls.push({ quality: o.quality, w: o.destWidth, h: o.destHeight });
        if (over.canvasFail) o.fail();
        else o.success({ tempFilePath: "tmp-q" + o.quality });
      },
      getFileSystemManager: () => ({ getFileInfo: (o: { filePath: string; success: (r: { size: number }) => void }) => o.success({ size: over.sizes?.[o.filePath] ?? 0 }) }),
    };
    return { calls, drawArgs: () => drawArgs };
  }
  it("⭐大图缩放到长边 1600（等比），5 参 drawImage（不裁剪），质量 0.85 达标即停", async () => {
    const s = stubWx({ w: 4000, h: 3000, sizes: { "tmp-q0.85": 2 * 1024 * 1024 } });
    const r = await createWeixinImageCompress(opts).compress("big.jpg", 20 * 1024 * 1024);
    expect(r).toMatchObject({ path: "tmp-q0.85", width: 1600, height: 1200, reused: false });
    expect(s.calls).toEqual([{ quality: 0.85, w: 1600, h: 1200 }]);
    expect(s.drawArgs()).toEqual([0, 0, 1600, 1200]);
  });
  it("0.85 仍超 3MB ⇒ 降到 0.7；0.7 仍超 ⇒ 失败 null，**不回退原图**", async () => {
    stubWx({ sizes: { "tmp-q0.85": 4 * 1024 * 1024, "tmp-q0.7": 3.5 * 1024 * 1024 } });
    expect(await createWeixinImageCompress(opts).compress("big.jpg", 20 * 1024 * 1024)).toBeNull();
    stubWx({ sizes: { "tmp-q0.85": 4 * 1024 * 1024, "tmp-q0.7": 2 * 1024 * 1024 } });
    expect(await createWeixinImageCompress(opts).compress("big.jpg", 20 * 1024 * 1024)).toMatchObject({ path: "tmp-q0.7" });
  });
  it("⭐体积未知（getFileInfo 给 0）不当成达标：走完阶梯仍未知 ⇒ null（fail-closed）", async () => {
    stubWx({ sizes: {} });
    expect(await createWeixinImageCompress(opts).compress("big.jpg", 20 * 1024 * 1024)).toBeNull();
  });
  it("预算内原图复用（不重编码）；选图没给体积时自己量", async () => {
    const s = stubWx({ w: 1200, h: 800, sizes: { "small.jpg": 500 * 1024 } });
    const r = await createWeixinImageCompress(opts).compress("small.jpg", 0);
    expect(r).toMatchObject({ path: "small.jpg", reused: true });
    expect(s.calls).toEqual([]);
  });
  it("能力缺失 / canvas 失败 / 超时 ⇒ null（不抛）", async () => {
    expect(await createWeixinImageCompress(opts).compress("a.jpg", 9e6)).toBeNull(); // 无 wx
    stubWx({ canvasFail: true });
    expect(await createWeixinImageCompress(opts).compress("a.jpg", 9e6)).toBeNull();
    stubWx({ hang: true });
    expect(await createWeixinImageCompress(opts).compress("a.jpg", 9e6)).toBeNull(); // 超时 200ms
  });
  it("⭐多选：count 收敛到 1..9、mediaType image、原图；成功返回路径+体积；取消静默；无 API ⇒ unsupported", async () => {
    let got: Record<string, unknown> = {};
    g.uni = { chooseMedia: (o: Record<string, unknown> & { success: (r: unknown) => void }) => { got = o; o.success({ tempFiles: [{ tempFilePath: "a", size: 10 }, { tempFilePath: "", size: 1 }, { tempFilePath: "b" }] }); } };
    const r = await createUniMediaPicker().pick(99);
    expect(got.count).toBe(CHOOSE_MEDIA_MAX);
    expect(got.mediaType).toEqual(["image"]);
    expect(got.sizeType).toEqual(["original"]);
    expect(r).toEqual({ ok: true, files: [{ path: "a", size: 10 }, { path: "b", size: 0 }] });
    await createUniMediaPicker().pick(0);
    expect(got.count).toBe(1);
    await createUniMediaPicker().pick(Number.NaN);
    expect(got.count).toBe(1);
    g.uni = { chooseMedia: (o: { fail: (e: unknown) => void }) => o.fail({ errMsg: "chooseMedia:fail cancel" }) };
    expect(await createUniMediaPicker().pick(3)).toMatchObject({ ok: false, reason: "cancel" });
    g.uni = { chooseMedia: (o: { fail: (e: unknown) => void }) => o.fail({ errMsg: "chooseMedia:fail auth deny" }) };
    expect(await createUniMediaPicker().pick(3)).toMatchObject({ ok: false, reason: "failed" });
    g.uni = {};
    expect(await createUniMediaPicker().pick(3)).toMatchObject({ ok: false, reason: "unsupported" });
    g.uni = { chooseMedia: () => { throw new Error("boom"); } };
    expect(await createUniMediaPicker().pick(3)).toMatchObject({ ok: false, reason: "failed" });
  });
});

describe("BaseProgress（wot wd-progress 门面 · token 绑定）", () => {
  const global = { components: { "wd-progress": StubProgress } };
  it("⭐进度收敛：NaN/负数/超 100/小数 ⇒ [0,100] 整数（变异：不收敛即红）", () => {
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(Infinity)).toBe(0);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(250)).toBe(100);
    expect(clampPercent(33.6)).toBe(34);
    expect(clampPercent("50")).toBe(0);
    const w = mount(BaseProgress, { props: { percentage: 250 }, global });
    expect(w.findComponent(StubProgress).props("percentage")).toBe(100);
    expect(mount(BaseProgress, { props: { percentage: Number.NaN }, global }).findComponent(StubProgress).props("percentage")).toBe(0);
  });
  it("token 绑定：进度色=colorAction、轨道色=colorBorder、条高=progressBarHeightRpx；默认隐藏 wot 自带百分比文字", () => {
    const w = mount(BaseProgress, { props: { percentage: 40 }, global });
    const st = w.findComponent(StubProgress);
    expect(st.props("color")).toBe("#F1CD91");
    expect(st.props("hideText")).toBe(true);
    const style = String(st.props("customStyle"));
    expect(style).toContain("--wot-progress-bg: rgba(241, 205, 145, 0.3)");
    expect(style).toContain("--wot-progress-bar-height: 8px"); // 16rpx，无 upx2px 时按 2:1 折算
    expect(mount(BaseProgress, { props: { showText: true }, global }).findComponent(StubProgress).props("hideText")).toBe(false);
    expect(mount(BaseProgress, { props: { color: "#ff0000", trackColor: "#000", height: 20 }, global }).findComponent(StubProgress).props("color")).toBe("#ff0000");
  });
  it("门面纪律：业务代码零直用 wd-progress；token 在 source.json 与生成物里都有", () => {
    const tokensTs = readFileSync(resolve(root, "src/generated/tokens.ts"), "utf-8");
    const srcJson = JSON.parse(readFileSync(resolve(root, "tokens/source.json"), "utf-8"));
    expect(srcJson.component.progressBarHeightRpx).toBe(16);
    expect(tokensTs).toContain('"progressBarHeightRpx": 16');
    const facade = readFileSync(resolve(root, "src/ui/BaseProgress.vue"), "utf-8");
    expect(facade).toContain("tokens.component.progressBarHeightRpx");
    expect(facade).toContain("tokens.semantic.colorAction");
    expect(facade).toContain("tokens.semantic.colorBorder");
  });
});

describe("shopList 规整 / 商家命名空间键", () => {
  it("normalizeShopList：displayName 优先、其次 shopName；id≤0/畸形丢弃；非数组 ⇒ []", () => {
    expect(normalizeShopList([
      { id: 3, shopName: "内部名", displayName: "展示名", merchantName: "商家A", status: 1 },
      { id: 4, shopName: "只有内部名" },
      { id: 0, shopName: "无效" },
      { id: -1 },
      null,
      "x",
      { id: 5, shopName: " ", displayName: "" },
    ])).toEqual([
      { id: 3, name: "展示名", merchantName: "商家A", status: 1 },
      { id: 4, name: "只有内部名", merchantName: "", status: 1 },
      { id: 5, name: "系列 5", merchantName: "", status: 1 },
    ]);
    expect(normalizeShopList(undefined)).toEqual([]);
    expect(normalizeShopList({})).toEqual([]);
  });
  it("上次选择的 shop 键落在商家命名空间（lm.merchant.*），与 C 端键零交集", () => {
    expect(MERCHANT_LAST_SHOP_KEY.startsWith("lm.merchant.")).toBe(true);
    expect(merchantKeyOf(MERCHANT_LAST_SHOP_KEY)).toBe(MERCHANT_LAST_SHOP_KEY);
  });
});

void newQueueItem;
void vi;
