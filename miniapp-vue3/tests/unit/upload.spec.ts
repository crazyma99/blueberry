// P2-04 上传：multipart 字段 photo/JSON 字符串解码/非法JSON/业务码/401挂起重登重试/二次401失败。
// 旧端事实：uploadPhoto → /api/aiface/upload，name='photo'，响应 {code,message,data:{file_url,filename}}，
// 401 → clearToken 后挂起等待登录重试；重试仍 401 → 失败（api.uts:499-515）。
import { describe, expect, it } from "vitest";
import { createUploadClient } from "../../src/infrastructure/http/upload";
import type { RequestContext, Result } from "../../src/ports/context";
import type { Session } from "../../src/infrastructure/http/client";

const ctx: RequestContext = {
  platform: "mp-weixin", environment: "trial", brandId: null, requestId: "u-1",
  profileKey: "blueberry", appCode: "blueBerry", scopeRevision: 1, authRevision: 1,
};
const okSession = (rev: number): Result<Session> => ({
  ok: true,
  value: { userId: "u", token: "tok-" + rev, platform: "mp-weixin", profileKey: "blueberry", authRevision: rev },
});

function makeTransport(responses: Array<{ statusCode: number; bodyText: string }>) {
  const seen: Array<{ url: string; filePath: string; name: string; headers: Record<string, string> }> = [];
  let i = 0;
  return {
    seen,
    port: {
      upload: async (req: { url: string; filePath: string; name: string; headers: Record<string, string> }) => {
        seen.push(req);
        return responses[Math.min(i++, responses.length - 1)];
      },
    },
  };
}
const okAuth = { waitForLogin: async () => okSession(1) };

describe("createUploadClient（P2-04）", () => {
  it("成功：multipart 字段 photo、URL /api/aiface/upload、Bearer 注入、JSON 解码返回 file_url", async () => {
    const t = makeTransport([{ statusCode: 200, bodyText: JSON.stringify({ code: 0, message: "ok", data: { file_url: "https://c/x.jpg", filename: "x.jpg" } }) }]);
    const c = createUploadClient({ transport: t.port, authCoordinator: okAuth, baseUrl: "https://lanmei66.cloud/" });
    const r = await c.uploadPhoto({ filePath: "/tmp/a.jpg", context: ctx });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.file_url).toBe("https://c/x.jpg");
    expect(t.seen[0].name).toBe("photo");
    expect(t.seen[0].url).toBe("https://lanmei66.cloud//api/aiface/upload");
    expect(t.seen[0].headers.Authorization).toBe("Bearer tok-1");
    expect(t.seen[0].headers["X-App-Code"]).toBe("blueBerry");
  });
  it("code 200 亦成功（两种信封兼容）；非法 JSON → 失败不抛；业务码 5001 → BUSINESS", async () => {
    const t1 = makeTransport([{ statusCode: 200, bodyText: JSON.stringify({ code: 200, data: { file_url: "u", filename: "f" } }) }]);
    const r1 = await createUploadClient({ transport: t1.port, authCoordinator: okAuth, baseUrl: "https://x/" }).uploadPhoto({ filePath: "/p", context: ctx });
    expect(r1.ok).toBe(true);
    const t2 = makeTransport([{ statusCode: 200, bodyText: "<html>not json" }]);
    const r2 = await createUploadClient({ transport: t2.port, authCoordinator: okAuth, baseUrl: "https://x/" }).uploadPhoto({ filePath: "/p", context: ctx });
    expect(r2.ok).toBe(false);
    const t3 = makeTransport([{ statusCode: 200, bodyText: JSON.stringify({ code: 5001, message: "存储失败" }) }]);
    const r3 = await createUploadClient({ transport: t3.port, authCoordinator: okAuth, baseUrl: "https://x/" }).uploadPhoto({ filePath: "/p", context: ctx });
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error.kind).toBe("BUSINESS");
  });
  it("401 挂起重登后重试一次成功；二次 401 失败不再重试", async () => {
    const t1 = makeTransport([
      { statusCode: 401, bodyText: "" },
      { statusCode: 200, bodyText: JSON.stringify({ code: 0, data: { file_url: "u", filename: "f" } }) },
    ]);
    let logins = 0;
    const auth1 = { waitForLogin: async () => { logins++; return okSession(logins + 1); } };
    const r1 = await createUploadClient({ transport: t1.port, authCoordinator: auth1, baseUrl: "https://x/" }).uploadPhoto({ filePath: "/p", context: ctx });
    expect(r1.ok).toBe(true);
    expect(t1.seen.length).toBe(2); // 首次 401 + 重试
    expect(logins).toBe(2); // 初始登录 + 401 后重登
    const t2 = makeTransport([{ statusCode: 401, bodyText: "" }]);
    const r2 = await createUploadClient({ transport: t2.port, authCoordinator: okAuth, baseUrl: "https://x/" }).uploadPhoto({ filePath: "/p", context: ctx });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.kind).toBe("AUTH_EXPIRED");
    expect(t2.seen.length).toBe(2); // 401→重试→仍401→止（不无限重试）
  });
});
