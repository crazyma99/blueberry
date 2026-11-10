// 新建相册「先选照片、可选封面、一次保存」（issue #14 · m2b 真机批次 3）：领域 + 编排。
// 对齐后台 Albums.tsx handleCreateSave：步骤0 全部严格压缩（失败整体中止、零副作用）→ 步骤1 上传封面 → 步骤2 创建相册 → 步骤3 串行传其余；
// 步骤3 失败 ⇒ 相册已创建，明确提示且**不重复创建**，失败项保留可重试。
// 变异靶点：①封面默认不是第一张 ②移除封面后不回退 ③压缩失败仍继续上传/创建 ④压缩全部完成前就上传封面 ⑤创建成功后部分失败时再次创建
//          ⑥取消不中止 ⑦条数核对放宽（0 条也算成功）⑧并发上传（非串行）⑨封面被二次压缩 ⑩空相册也强制要求图片 ⑪校验失败仍压缩/上传。
import { describe, expect, it } from "vitest";
import {
  CREATE_PHOTO_MAX,
  EMPTY_PHOTO_STATE,
  addPhotos,
  describeCreateProgress,
  describePartialFailure,
  effectiveCoverKey,
  orderedForUpload,
  removePhoto,
  setCover,
} from "../../src/pkg-merchant/domain/merchant-album-create";
import { PASS_THROUGH_COMPRESS, createAlbumCreator, type AlbumCreatorDeps } from "../../src/pkg-merchant/application/merchant-album-create-flow";
import { createAlbumUploader } from "../../src/pkg-merchant/application/merchant-album-uploader";
import type { UploadPort, UploadRequest } from "../../src/ports/upload";
import type { ImageCompressPort } from "../../src/platform/weixin/image-compress";

const pick = (n: number, base = 0) => Array.from({ length: n }, (_, i) => ({ path: `p${base + i}.jpg`, size: 1000 + i }));
const form = { title: "海边", childId: 9, price: "199", packageDesc: "" };

describe("领域：照片选择 / 封面", () => {
  it("⭐封面默认第一张（变异：默认不是第一张即红）", () => {
    const { state } = addPhotos(EMPTY_PHOTO_STATE, pick(3));
    expect(state.photos.map((p) => p.path)).toEqual(["p0.jpg", "p1.jpg", "p2.jpg"]);
    expect(effectiveCoverKey(state)).toBe(state.photos[0].key);
  });
  it("设为封面：点第 3 张；上传顺序 = 封面在前，其余保持选择顺序", () => {
    let s = addPhotos(EMPTY_PHOTO_STATE, pick(4)).state;
    s = setCover(s, s.photos[2].key);
    expect(effectiveCoverKey(s)).toBe(s.photos[2].key);
    const o = orderedForUpload(s);
    expect(o.cover?.path).toBe("p2.jpg");
    expect(o.others.map((p) => p.path)).toEqual(["p0.jpg", "p1.jpg", "p3.jpg"]);
  });
  it("⭐移除封面 ⇒ 封面回退到剩余第一张（变异：不回退即红）", () => {
    let s = addPhotos(EMPTY_PHOTO_STATE, pick(3)).state;
    s = setCover(s, s.photos[1].key);
    s = removePhoto(s, s.photos[1].key);
    expect(s.photos.map((p) => p.path)).toEqual(["p0.jpg", "p2.jpg"]);
    expect(effectiveCoverKey(s)).toBe(s.photos[0].key);
  });
  it("移除非封面不影响封面；全部移除 ⇒ 无封面（空相册）；setCover 未知 key 忽略", () => {
    let s = addPhotos(EMPTY_PHOTO_STATE, pick(3)).state;
    s = setCover(s, s.photos[2].key);
    s = removePhoto(s, s.photos[0].key);
    expect(effectiveCoverKey(s)).toBe(s.photos[1].key);
    expect(setCover(s, 999)).toBe(s);
    for (const p of [...s.photos]) s = removePhoto(s, p.key);
    expect(effectiveCoverKey(s)).toBeNull();
    expect(orderedForUpload(s)).toEqual({ cover: null, others: [] });
  });
  it("防御：coverKey 悬空（指向已不存在的照片）时 effectiveCoverKey 回退第一张（变异：不校验存在性即红）", () => {
    const s = addPhotos(EMPTY_PHOTO_STATE, pick(3)).state;
    expect(effectiveCoverKey({ ...s, coverKey: 999 })).toBe(s.photos[0].key);
    expect(orderedForUpload({ ...s, coverKey: 999 }).cover?.path).toBe("p0.jpg");
  });
  it("多次追加：总数上限 CREATE_PHOTO_MAX，超出截断并返回被丢弃数；同路径不重复加入", () => {
    let s = addPhotos(EMPTY_PHOTO_STATE, pick(CREATE_PHOTO_MAX - 2)).state;
    const r = addPhotos(s, pick(5, 1000));
    expect(r.state.photos.length).toBe(CREATE_PHOTO_MAX);
    expect(r.dropped).toBe(3);
    s = addPhotos(EMPTY_PHOTO_STATE, pick(2)).state;
    const dup = addPhotos(s, pick(2));
    expect(dup.state.photos.length).toBe(2);
    expect(dup.dropped).toBe(0);
  });
  it("文案：第 N / 共 M 张；部分失败提示点名相册并警告勿重复新建", () => {
    expect(describeCreateProgress("compress", 2, 5)).toBe("处理图片 第 2 / 共 5 张");
    expect(describeCreateProgress("upload", 3, 5)).toBe("上传图片 第 3 / 共 5 张");
    expect(describeCreateProgress("cover", 1, 5)).toBe("上传封面…");
    expect(describeCreateProgress("create", 0, 5)).toBe("创建相册…");
    expect(describeCreateProgress("upload", 9, 5)).toBe("上传图片 第 5 / 共 5 张");
    const m = describePartialFailure("海边", 2, 6);
    expect(m).toContain("相册「海边」已创建");
    expect(m).toContain("2 / 6");
    expect(m).toContain("请勿重复新建");
  });
});

// ───────── 编排 ─────────
const okEnv = (n: number) => ({ ok: true as const, value: { statusCode: 200, data: JSON.stringify({ code: 200, message: "ok", data: Array.from({ length: n }, (_, i) => ({ id: i + 1 })) }) } });

interface Rig {
  log: string[];
  deps: AlbumCreatorDeps;
  uploads: UploadRequest[];
  maxInFlight: () => number;
  creates: () => number;
  compressCalls: string[];
  setUploadBehavior: (fn: (req: UploadRequest, n: number) => Promise<ReturnType<typeof okEnv> | { ok: false; reason: string }>) => void;
  setCompressFail: (idx: number | null) => void;
  setCoverResult: (r: { ok: true; url: string } | { ok: false; kind: "network" | "auth-expired" | "server"; message: string }) => void;
  setCreateResult: (r: { ok: true; albumId: number } | { ok: false; kind: string; message: string }) => void;
  onCreateHook: (fn: () => void) => void;
}

function rig(): Rig {
  const log: string[] = [];
  const uploads: UploadRequest[] = [];
  let inFlight = 0;
  let maxIn = 0;
  let createCount = 0;
  const compressCalls: string[] = [];
  let compressFailIdx: number | null = null;
  let uploadFn: (req: UploadRequest, n: number) => Promise<ReturnType<typeof okEnv> | { ok: false; reason: string }> = async () => okEnv(1);
  let coverRes: Parameters<Rig["setCoverResult"]>[0] = { ok: true, url: "https://cdn/cover.jpg" };
  let createRes: Parameters<Rig["setCreateResult"]>[0] = { ok: true, albumId: 77 };
  let createHook: () => void = () => undefined;
  let compressN = 0;
  const compress: ImageCompressPort = {
    compress: async (p, size) => {
      compressCalls.push(p);
      log.push("compress:" + p);
      const idx = compressN++;
      if (compressFailIdx === idx) return null;
      return { path: "c-" + p, size: size || 1, width: 1, height: 1, reused: false };
    },
  };
  let upN = 0;
  const mkUpload = (): UploadPort => ({
    upload: async (req) => {
      inFlight++;
      maxIn = Math.max(maxIn, inFlight);
      uploads.push(req);
      log.push("upload:" + req.filePath);
      try {
        return (await uploadFn(req, upN++)) as never;
      } finally {
        inFlight--;
      }
    },
    cancel: () => log.push("upload-cancel"),
  });
  const deps: AlbumCreatorDeps = {
    compress,
    uploadCover: async (input) => {
      log.push("cover:" + input.path);
      return coverRes;
    },
    createAlbum: async (f) => {
      createCount++;
      log.push("create:" + f.coverImageUrl);
      createHook();
      return createRes;
    },
    newUploader: (albumId, hooks) =>
      createAlbumUploader({ upload: mkUpload(), compress: PASS_THROUGH_COMPRESS, getToken: () => "T", uploadUrl: "u", shopId: 3, albumId, onChange: hooks.onChange, onFinished: hooks.onFinished, onAuthExpired: hooks.onAuthExpired }),
    cancelCoverUpload: () => log.push("cover-cancel"),
  };
  return {
    log, deps, uploads,
    maxInFlight: () => maxIn,
    creates: () => createCount,
    compressCalls,
    setUploadBehavior: (fn) => { uploadFn = fn; },
    setCompressFail: (i) => { compressFailIdx = i; },
    setCoverResult: (r) => { coverRes = r; },
    setCreateResult: (r) => { createRes = r; },
    onCreateHook: (fn) => { createHook = fn; },
  };
}
const photos = (n: number) => addPhotos(EMPTY_PHOTO_STATE, pick(n)).state;

describe("⭐编排：后台同款顺序（压缩全部 → 封面 → 创建 → 串行其余）", () => {
  it("5 张：先压缩全部 5 张，再传封面(第一张)，再创建相册(带封面 URL)，最后串行传其余 4 张（变异：顺序错/封面不先传即红）", async () => {
    const r = rig();
    const out = await createAlbumCreator(r.deps).run({ form, photos: photos(5) });
    expect(out).toEqual({ status: "created", albumId: 77, title: "海边" });
    expect(r.log).toEqual([
      "compress:p0.jpg", "compress:p1.jpg", "compress:p2.jpg", "compress:p3.jpg", "compress:p4.jpg",
      "cover:c-p0.jpg",
      "create:https://cdn/cover.jpg",
      "upload:c-p1.jpg", "upload:c-p2.jpg", "upload:c-p3.jpg", "upload:c-p4.jpg",
    ]);
    expect(r.creates()).toBe(1);
  });
  it("⭐串行：任意时刻最多 1 个上传在飞（变异：并发即红）；表单带 shopId/albumId、字段名 files", async () => {
    const r = rig();
    r.setUploadBehavior(async () => { await new Promise((x) => setTimeout(x, 3)); return okEnv(1); });
    await createAlbumCreator(r.deps).run({ form, photos: photos(5) });
    expect(r.maxInFlight()).toBe(1);
    expect(r.uploads.every((u) => u.name === "files" && u.formData?.albumId === "77" && u.formData?.shopId === "3")).toBe(true);
  });
  it("⭐封面不被二次压缩：压缩调用恰好 N 次（变异：封面再压一遍即红）；上传的是已压缩产物", async () => {
    const r = rig();
    await createAlbumCreator(r.deps).run({ form, photos: photos(4) });
    expect(r.compressCalls).toEqual(["p0.jpg", "p1.jpg", "p2.jpg", "p3.jpg"]);
    expect(r.uploads.map((u) => u.filePath)).toEqual(["c-p1.jpg", "c-p2.jpg", "c-p3.jpg"]);
  });
  it("设为封面的那张先传、先压缩，其余按选择顺序", async () => {
    const r = rig();
    let s = photos(3);
    s = setCover(s, s.photos[2].key);
    await createAlbumCreator(r.deps).run({ form, photos: s });
    expect(r.log.filter((l) => l.startsWith("cover:") || l.startsWith("upload:"))).toEqual(["cover:c-p2.jpg", "upload:c-p0.jpg", "upload:c-p1.jpg"]);
  });
  it("⭐不选封面也不选照片：允许建空相册（不压缩/不上传，创建时封面为空）（变异：强制要求图片即红）", async () => {
    const r = rig();
    const out = await createAlbumCreator(r.deps).run({ form, photos: EMPTY_PHOTO_STATE });
    expect(out).toEqual({ status: "created", albumId: 77, title: "海边" });
    expect(r.log).toEqual(["create:"]);
  });
  it("只有 1 张照片：它就是封面，创建后没有其余图片要传", async () => {
    const r = rig();
    const out = await createAlbumCreator(r.deps).run({ form, photos: photos(1) });
    expect(out.status).toBe("created");
    expect(r.log).toEqual(["compress:p0.jpg", "cover:c-p0.jpg", "create:https://cdn/cover.jpg"]);
  });
  it("进度回调：处理图片 第 N / 共 M 张 → 上传封面 → 创建相册 → 上传图片 第 N / 共 M 张；百分比单调不减且 ≤100", async () => {
    const r = rig();
    const seen: Array<{ text: string; percent: number }> = [];
    await createAlbumCreator({ ...r.deps, onProgress: (p) => seen.push({ text: p.text, percent: p.percent }) }).run({ form, photos: photos(3) });
    const texts = seen.map((s) => s.text);
    expect(texts[0]).toBe("处理图片 第 1 / 共 3 张");
    expect(texts).toContain("处理图片 第 3 / 共 3 张");
    expect(texts).toContain("上传封面…");
    expect(texts).toContain("创建相册…");
    expect(texts.some((t) => t.startsWith("上传图片 第 2 / 共 3 张"))).toBe(true);
    for (let i = 1; i < seen.length; i++) expect(seen[i].percent).toBeGreaterThanOrEqual(seen[i - 1].percent);
    expect(Math.max(...seen.map((s) => s.percent))).toBeLessThanOrEqual(100);
  });
});

describe("⭐压缩失败：零副作用（尚未上传任何东西、没有创建相册）", () => {
  for (const failAt of [0, 2, 4]) {
    it(`第 ${failAt + 1} 张压缩失败 ⇒ 不上传封面、不创建、不上传其余（变异：失败仍继续即红）`, async () => {
      const r = rig();
      r.setCompressFail(failAt);
      const out = await createAlbumCreator(r.deps).run({ form, photos: photos(5) });
      expect(out).toMatchObject({ status: "compress-failed", index: failAt + 1 });
      expect(r.log.filter((l) => l.startsWith("cover:") || l.startsWith("create:") || l.startsWith("upload:"))).toEqual([]);
      expect(r.creates()).toBe(0);
      expect((out as { message: string }).message).toContain("未创建相册");
    });
  }
  it("压缩阶段全部完成前不得发出任何上传/创建（含封面）", async () => {
    const r = rig();
    await createAlbumCreator(r.deps).run({ form, photos: photos(4) });
    const firstCover = r.log.findIndex((l) => l.startsWith("cover:"));
    const lastCompress = r.log.map((l, i) => (l.startsWith("compress:") ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    expect(firstCover).toBeGreaterThan(lastCompress);
  });
});

describe("⭐校验失败：零副作用", () => {
  it("缺名称/未选分类 ⇒ invalid，且不压缩、不上传、不创建（变异：校验后置即红）", async () => {
    for (const bad of [{ ...form, title: "  " }, { ...form, childId: 0 }, { ...form, price: "abc" }]) {
      const r = rig();
      const out = await createAlbumCreator(r.deps).run({ form: bad, photos: photos(3) });
      expect(out.status).toBe("invalid");
      expect(r.log).toEqual([]);
    }
  });
});

describe("⭐封面上传 / 创建失败：相册未创建", () => {
  it("封面上传失败 ⇒ failed(stage=cover)，不创建、不传其余", async () => {
    const r = rig();
    r.setCoverResult({ ok: false, kind: "network", message: "网络不稳定，上传失败，可点击重试" });
    const out = await createAlbumCreator(r.deps).run({ form, photos: photos(3) });
    expect(out).toMatchObject({ status: "failed", stage: "cover", authExpired: false });
    expect(r.creates()).toBe(0);
    expect(r.uploads.length).toBe(0);
  });
  it("封面 401 ⇒ authExpired=true", async () => {
    const r = rig();
    r.setCoverResult({ ok: false, kind: "auth-expired", message: "登录已失效，请重新登录" });
    const out = await createAlbumCreator(r.deps).run({ form, photos: photos(2) });
    expect(out).toMatchObject({ status: "failed", stage: "cover", authExpired: true });
  });
  it("创建相册失败（如同名/校验）⇒ failed(stage=create)，不传其余图片", async () => {
    const r = rig();
    r.setCreateResult({ ok: false, kind: "failed", message: "相册名称已存在" });
    const out = await createAlbumCreator(r.deps).run({ form, photos: photos(3) });
    expect(out).toMatchObject({ status: "failed", stage: "create", message: "相册名称已存在" });
    expect(r.uploads.length).toBe(0);
  });
});

describe("⭐步骤3 部分失败：相册已创建，提示补传，绝不重复创建，失败项可重试", () => {
  it("第 2 张上传失败 ⇒ partial(failed=1,total=3)；创建只发生 1 次；提示含「请勿重复新建」（变异：失败后再次创建即红）", async () => {
    const r = rig();
    r.setUploadBehavior(async (req) => (req.filePath === "c-p2.jpg" ? { ok: false, reason: "network" } : okEnv(1)));
    const creator = createAlbumCreator(r.deps);
    const out = await creator.run({ form, photos: photos(4) });
    expect(out).toMatchObject({ status: "partial", albumId: 77, failed: 1, total: 3, authExpired: false });
    expect((out as { message: string }).message).toContain("请勿重复新建");
    expect(r.creates()).toBe(1);
    expect(creator.queue().filter((q) => q.status === "failed").map((q) => q.path)).toEqual(["c-p2.jpg"]);
  });
  it("⭐重试失败项：只重传失败的（复用已压缩产物，不重压、不重建相册），成功后 failed=0", async () => {
    const r = rig();
    let failOnce = true;
    r.setUploadBehavior(async (req) => {
      if (req.filePath === "c-p2.jpg" && failOnce) {
        failOnce = false;
        return { ok: false, reason: "timeout" };
      }
      return okEnv(1);
    });
    const creator = createAlbumCreator(r.deps);
    await creator.run({ form, photos: photos(4) });
    const compressBefore = r.compressCalls.length;
    const res = await creator.retryFailed();
    expect(res).toEqual({ failed: 0, total: 3, authExpired: false });
    expect(r.creates()).toBe(1);
    expect(r.compressCalls.length).toBe(compressBefore);
    expect(r.uploads.filter((u) => u.filePath === "c-p2.jpg").length).toBe(2);
  });
  it("⭐条数核对：响应 data 为 0 条（后端静默丢弃）算失败（变异：放宽即红）；2 条（异常）也算失败", async () => {
    for (const n of [0, 2]) {
      const r = rig();
      r.setUploadBehavior(async () => okEnv(n));
      const out = await createAlbumCreator(r.deps).run({ form, photos: photos(3) });
      expect(out, "n=" + n).toMatchObject({ status: "partial", failed: 2, total: 2 });
    }
  });
  it("登录失效(401)：相册已创建，剩余项标失败，authExpired=true，提示含重新登录/补传/勿重复新建", async () => {
    const r = rig();
    r.setUploadBehavior(async () => ({ ok: true, value: { statusCode: 401, data: "x" } }) as never);
    const out = await createAlbumCreator(r.deps).run({ form, photos: photos(4) });
    expect(out).toMatchObject({ status: "partial", albumId: 77, authExpired: true });
    expect((out as { message: string }).message).toContain("重新登录");
    expect((out as { message: string }).message).toContain("请勿重复新建");
    expect(r.creates()).toBe(1);
  });
  it("相册创建成功但没拿到编号：不崩，提示刷新后进入相册补传", async () => {
    const r = rig();
    r.setCreateResult({ ok: true, albumId: 0 });
    const out = await createAlbumCreator(r.deps).run({ form, photos: photos(3) });
    expect(out).toMatchObject({ status: "partial", albumId: 0 });
    expect(r.uploads.length).toBe(0);
  });
});

describe("⭐取消：安全中止", () => {
  it("压缩阶段取消 ⇒ cancelled，零副作用（未上传、未创建）（变异：取消不中止即红）", async () => {
    const r = rig();
    const creator = createAlbumCreator(r.deps);
    const origCompress = r.deps.compress.compress;
    let n = 0;
    r.deps.compress.compress = async (p, s) => {
      const res = await origCompress(p, s);
      if (++n === 2) creator.cancel();
      return res;
    };
    const out = await creator.run({ form, photos: photos(5) });
    expect(out).toEqual({ status: "cancelled", albumId: null });
    expect(r.creates()).toBe(0);
    expect(r.uploads.length).toBe(0);
    expect(r.log.some((l) => l.startsWith("cover:"))).toBe(false);
  });
  it("封面上传在途时取消 ⇒ cancelled，不创建相册、不上传其余（封面成云端孤儿文件，同后台行为）；取消会中止封面请求", async () => {
    const r = rig();
    const creator = createAlbumCreator(r.deps);
    const origCover = r.deps.uploadCover;
    r.deps.uploadCover = async (i, o) => {
      const res = await origCover(i, o);
      creator.cancel();
      return res;
    };
    const out = await creator.run({ form, photos: photos(3) });
    expect(out).toEqual({ status: "cancelled", albumId: null, coverOrphan: true });
    expect(r.creates()).toBe(0);
    expect(r.uploads.length).toBe(0);
    expect(r.log).toContain("cover-cancel");
  });
  it("取消导致的压缩失败/封面失败，结果是 cancelled 而不是 compress-failed/failed（用户看到的应是「已取消」，不是报错）", async () => {
    const r1 = rig();
    const c1 = createAlbumCreator(r1.deps);
    r1.deps.compress.compress = async () => { c1.cancel(); return null; };
    expect(await c1.run({ form, photos: photos(2) })).toEqual({ status: "cancelled", albumId: null });
    const r2 = rig();
    const c2 = createAlbumCreator(r2.deps);
    r2.deps.uploadCover = async () => { c2.cancel(); return { ok: false, kind: "network", message: "已取消" }; };
    expect(await c2.run({ form, photos: photos(2) })).toEqual({ status: "cancelled", albumId: null, coverOrphan: false });
    expect(r2.creates()).toBe(0);
  });
  it("创建请求在途时取消 ⇒ 相册已存在，不再上传其余图片，返回 partial 引导补传（不重复创建）", async () => {
    const r = rig();
    const creator = createAlbumCreator(r.deps);
    r.onCreateHook(() => creator.cancel());
    const out = await creator.run({ form, photos: photos(4) });
    expect(out).toMatchObject({ status: "partial", albumId: 77, failed: 3, total: 3 });
    expect((out as { message: string }).message).toContain("已取消");
    expect(r.uploads.length).toBe(0);
    expect(r.creates()).toBe(1);
  });
  it("上传阶段取消 ⇒ 中止进行中的上传，剩余项标失败，相册保留（partial）", async () => {
    const r = rig();
    const creator = createAlbumCreator(r.deps);
    r.setUploadBehavior(async (req) => {
      if (req.filePath === "c-p1.jpg") creator.cancel();
      await new Promise((x) => setTimeout(x, 2));
      return okEnv(1);
    });
    const out = await creator.run({ form, photos: photos(5) });
    expect(out).toMatchObject({ status: "partial", albumId: 77 });
    expect(r.log).toContain("upload-cancel");
    expect(r.uploads.length).toBeLessThan(4);
    expect(r.creates()).toBe(1);
  });
  it("运行中再次 run ⇒ 拒绝（防重复提交 ⇒ 防重复建相册）", async () => {
    const r = rig();
    r.setUploadBehavior(async () => { await new Promise((x) => setTimeout(x, 5)); return okEnv(1); });
    const creator = createAlbumCreator(r.deps);
    const first = creator.run({ form, photos: photos(3) });
    const second = await creator.run({ form, photos: photos(3) });
    expect(second.status).toBe("invalid");
    await first;
    expect(r.creates()).toBe(1);
  });
});

describe("PASS_THROUGH_COMPRESS：直通（创建流程已压缩，上传器不得再压）", () => {
  it("原样返回路径与体积", async () => {
    expect(await PASS_THROUGH_COMPRESS.compress("c-a.jpg", 123)).toMatchObject({ path: "c-a.jpg", size: 123, reused: true });
  });
});

describe("⭐封面孤儿文件提示（m2c CR）：封面已上传但相册未建 ⇒ coverOrphan=true", () => {
  it("创建相册失败 ⇒ failed(stage=create, coverOrphan=true)；封面上传前就失败 ⇒ 无该标记（变异：不标记即红）", async () => {
    const r = rig();
    r.setCreateResult({ ok: false, kind: "failed", message: "相册名称已存在" });
    const out = await createAlbumCreator(r.deps).run({ form, photos: photos(2) });
    expect(out).toMatchObject({ status: "failed", stage: "create", coverOrphan: true });
    const r2 = rig();
    r2.setCoverResult({ ok: false, kind: "network", message: "x" });
    const out2 = await createAlbumCreator(r2.deps).run({ form, photos: photos(2) });
    expect((out2 as { coverOrphan?: boolean }).coverOrphan).toBeUndefined();
  });
  it("没选照片（无封面）创建失败 ⇒ coverOrphan=false（没有上传过封面）", async () => {
    const r = rig();
    r.setCreateResult({ ok: false, kind: "failed", message: "x" });
    const out = await createAlbumCreator(r.deps).run({ form, photos: EMPTY_PHOTO_STATE });
    expect(out).toMatchObject({ status: "failed", stage: "create", coverOrphan: false });
  });
  it("封面传完后被取消 ⇒ cancelled(coverOrphan=true)；封面失败时取消 ⇒ coverOrphan=false", async () => {
    const r = rig();
    const creator = createAlbumCreator(r.deps);
    const origCover = r.deps.uploadCover;
    r.deps.uploadCover = async (i, o) => {
      const res = await origCover(i, o);
      creator.cancel();
      return res;
    };
    // 封面返回后立即取消：run 在「封面后检查」处返回 cancelled，此时封面已传成功 ⇒ 孤儿封面
    const out = await creator.run({ form, photos: photos(3) });
    expect(out).toEqual({ status: "cancelled", albumId: null, coverOrphan: true });
    expect(r.creates()).toBe(0);
    // 封面上传本身失败/被取消（r.ok=false）⇒ 没有孤儿
    const r2 = rig();
    const c2 = createAlbumCreator(r2.deps);
    r2.deps.uploadCover = async () => { c2.cancel(); return { ok: false, kind: "network", message: "已取消" }; };
    expect(await c2.run({ form, photos: photos(3) })).toEqual({ status: "cancelled", albumId: null, coverOrphan: false });
  });
  it("文案常量：明示「封面未使用，不影响使用」", async () => {
    const { COVER_ORPHAN_NOTE } = await import("../../src/pkg-merchant/domain/merchant-album-create");
    expect(COVER_ORPHAN_NOTE).toBe("已上传的封面未使用，不影响使用。");
  });
});
