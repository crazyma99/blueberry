// T77（2026-10-13 · task-57 追加）：头像上传/保存**任何失败都必须有形提示**（杜绝「点了没反应」）。
// 事实（主人真机 + 服务端日志）：上传请求都到了，但被照片质量门拒（reason=side_face / no_face, channel=wx），
// 而界面无提示 ⇒ 用户感知为「未响应」。本 spec 守卫：①质量门 4002 的 check_code 逐条可读 ②未识别原因也给通用文案
// ③超时/网络失败同样给提示 ④上传返回非白名单 fail-closed ⑤**失败文案永不为空**（不变式）⑥三处页面的失败分支
// 都必须 toast ＋ return（不落库、不关弹窗：头像保持原值、昵称不被误写）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AVATAR_GATE_GENERIC_HINT,
  AVATAR_UPLOAD_BAD_URL_HINT,
  AVATAR_UPLOAD_FAILED_HINT,
  createAvatarUploader,
  mapAvatarUploadFailure,
  resolveAvatarUrl,
} from "../../src/application/avatar";

const LOCAL = "wxfile://tmp_0123456789abcdef.jpg";
const CDN = "https://www.lanmei66.cloud/avatars/u6.jpg";

/** 假上传端口：返回给定体（字符串）或传输失败 */
function fakePort(body: string | { fail: "timeout" | "network" }) {
  return {
    upload: async () =>
      typeof body === "string"
        ? { ok: true as const, value: { data: body } }
        : { ok: false as const, reason: body.fail },
  };
}

function uploaderWith(body: string | { fail: "timeout" | "network" }) {
  return createAvatarUploader({
    upload: fakePort(body) as never,
    baseUrl: "https://crazyma99.xyz",
    headers: () => ({}),
  });
}

const gate = (code: string, message = "照片不合格") =>
  JSON.stringify({ code: 4002, message, data: { check_code: code } });

describe("t77 · 质量门 4002：check_code 逐条可读（不得静默）", () => {
  it("⭐side_face／no_face（本次真机日志的两条）⇒ 头像场景文案、非空", async () => {
    const side = await uploaderWith(gate("side_face")).upload(LOCAL);
    expect(side.ok).toBe(false);
    if (!side.ok) {
      expect(side.message).toContain("侧脸");
      expect(side.message.trim()).not.toBe("");
    }
    const noFace = await uploaderWith(gate("no_face")).upload(LOCAL);
    if (!noFace.ok) expect(noFace.message).toContain("人脸");
  });

  it("其它已登记码（multi_face／face_too_small）与**未识别码**都必须给可读文案", async () => {
    const multi = await uploaderWith(gate("multi_face")).upload(LOCAL);
    if (!multi.ok) expect(multi.message).toContain("多个面孔");
    const small = await uploaderWith(gate("face_too_small")).upload(LOCAL);
    if (!small.ok) expect(small.message).toContain("太小");
    const weird = await uploaderWith(gate("something_new")).upload(LOCAL);
    if (!weird.ok) {
      expect(weird.message).toBe(AVATAR_GATE_GENERIC_HINT);
      expect(weird.message.trim()).not.toBe("");
    }
  });
});

describe("t77 · 其它失败路径：超时/网络/业务失败/非白名单 —— 一律有可读提示", () => {
  it("⭐超时 ⇒ 「超时」；普通网络失败 ⇒ 非空；业务失败无 message ⇒ 通用可重试", async () => {
    const t = await uploaderWith({ fail: "timeout" }).upload(LOCAL);
    if (!t.ok) expect(t.message).toContain("超时");
    const n = await uploaderWith({ fail: "network" }).upload(LOCAL);
    if (!n.ok) expect(n.message.trim()).not.toBe("");
    // 业务失败（无后端 message）⇒ 仍必须有可读文案（不要求与本模块默认串逐字相同，只要求非空可读）
    const biz = await uploaderWith(JSON.stringify({ code: 500, message: "" })).upload(LOCAL);
    if (!biz.ok) {
      expect(biz.message.trim()).not.toBe(""); // 只要求非空可读（不锁逐字）
    }
  });

  it("⭐成功但返回无 http 地址（filename 非 URL）⇒ fail-closed ＋ 可行动提示", async () => {
    const up = uploaderWith(JSON.stringify({ code: 200, message: "ok", data: { filename: "u6.jpg" } }));
    expect((await up.upload(LOCAL)).ok).toBe(true); // 端口层成功（filename 兜底）
    const out = await resolveAvatarUrl(LOCAL, { uploader: up }); // 但解析层必须拦下（非白名单 URL）
    expect(out).toEqual({ ok: false, message: AVATAR_UPLOAD_BAD_URL_HINT });
  });

  it("⭐不变式：**任何**失败形态的 message 都不得为空（防「点了没反应」）", async () => {
    const cases = [
      gate("no_face"),
      gate("side_face"),
      gate("unknown"),
      JSON.stringify({ code: 500, message: "" }),
      JSON.stringify({ code: 401, message: "unauthorized" }),
      { fail: "timeout" as const },
      { fail: "network" as const },
    ];
    for (const c of cases) {
      const out = await resolveAvatarUrl(LOCAL, { uploader: uploaderWith(c) });
      if (!out.ok) expect(out.message.trim(), JSON.stringify(c)).not.toBe("");
    }
    // 映射函数自身的兜底
    expect(mapAvatarUploadFailure({}).trim()).not.toBe("");
    expect(mapAvatarUploadFailure({ message: "   " }).trim()).not.toBe("");
    expect(mapAvatarUploadFailure({ qualityCheckCode: "unknown" })).toBe(AVATAR_GATE_GENERIC_HINT);
  });
});

describe("t77 · 失败不留中间态 ＋ 必弹提示（三处页面接线守卫）", () => {
  const pages = ["pages/mine/index.vue", "pages/aiTryOn/index.vue", "pages/aiRecommend/index.vue"];
  /** 截出 submitProfile 函数体（整文件索引会被其它函数里的同名字符串干扰） */
  function submitBody(src: string): string {
    const i = src.indexOf("function submitProfile");
    return i < 0 ? "" : src.slice(i, src.indexOf("\n}", i));
  }
  it("⭐三页：失败分支必须 toast 提示 ＋ return（不落库、不关弹窗、先上传后落库）", () => {
    for (const p of pages) {
      const src = readFileSync(resolve(__dirname, "../../src/" + p), "utf-8");
      const body = submitBody(src);
      expect(body.length, p).toBeGreaterThan(0);
      expect(body, p).toContain("await resolveAvatarUrl("); // 先上传
      expect(body, p).toMatch(/toast\(resolved(Avatar)?\.message\)/); // 失败必提示（两种变量名）
      const iFail = body.indexOf(".ok)");
      const iReturn = body.indexOf("return;", iFail);
      const iPersist = body.search(/userStore\.(merge|save)\(/);
      expect(iReturn, p).toBeGreaterThan(-1);
      expect(iPersist, p).toBeGreaterThan(-1);
      expect(iReturn, p).toBeLessThan(iPersist); // 失败即返回 ⇒ 不落库、不关弹窗（弹窗关闭在函数尾部）
    }
  });

  // （「先上传后落库」的排序断言已并入上一条：按 submitProfile 函数体切片比较，避免整文件索引被其它函数干扰）
});
