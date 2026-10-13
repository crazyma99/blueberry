// T79（2026-10-13 · task-58 落地切口）：**头像上传必须走专用口** POST /api/wx/avatar/upload。
// 背景：旧实现复用 /api/aiface/upload（带试衣照片质量门 4002 ＋ 新端恒带 X-Channel ⇒ 门生效）⇒ 正脸以外的头像被拦
// （主人真机 21:12 side_face／21:13 no_face）。task-58 专用口**不走人脸门**，且契约字段名 photo、JWT 必需、取 data.file_url。
import { describe, expect, it } from "vitest";
import { AVATAR_UPLOAD_PATH, createAvatarUploader } from "../../src/application/avatar";

const CDN = "https://www.lanmei66.cloud/aiface/staging/6/uploads/ddf3a559-1.jpg";

function capturingPort(body: string) {
  const seen: Array<{ url: string; name: string; filePath: string; headers?: Record<string, string> }> = [];
  return {
    seen,
    port: {
      upload: async (req: { url: string; name: string; filePath: string; headers?: Record<string, string> }) => {
        seen.push(req);
        return { ok: true as const, value: { data: body } };
      },
    },
  };
}

describe("t79 · 头像上传口＝专用口（task-58）", () => {
  it("⭐路径常量＝/api/wx/avatar/upload（唯一替换点）", () => {
    expect(AVATAR_UPLOAD_PATH).toBe("/api/wx/avatar/upload");
  });

  it("⭐实际上传请求：URL＝baseUrl＋AVATAR_UPLOAD_PATH、multipart 字段名 photo、带 Authorization", async () => {
    const f = capturingPort(JSON.stringify({ code: 200, message: "ok", data: { filename: "u6.jpg", file_url: CDN } }));
    const up = createAvatarUploader({
      upload: f.port as never,
      baseUrl: "https://crazyma99.xyz/",
      headers: () => ({ Authorization: "Bearer TK", "X-App-Code": "blueBerry" }),
    });
    const out = await up.upload("wxfile://tmp_a.jpg");
    expect(out).toEqual({ ok: true, fileUrl: CDN, filename: "u6.jpg" });
    expect(f.seen.length).toBe(1);
    expect(f.seen[0].url).toBe("https://crazyma99.xyz" + AVATAR_UPLOAD_PATH); // 尾斜杠归一 + 专用口
    expect(f.seen[0].name).toBe("photo"); // 契约字段名
    expect(f.seen[0].headers?.Authorization).toBe("Bearer TK"); // JWT 必需
  });

  it("⭐不再经过质量门：即便响应体是 4002 也不是本口语义（本口不返回 4002）——此处锁「不再引用旧口」", () => {
    expect(AVATAR_UPLOAD_PATH).not.toContain("/api/aiface/upload");
  });
});
