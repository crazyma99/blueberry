// T84（2026-10-13 · task-64）：抖音取图三条修复——量身参数／顺序回退／errMsg 分级与诊断日志。
// 真机现象（-avatar2b）：抖音点 popup 头像 ⇒ 提示「打开相册失败，请重试」（不崩了 ✓ 但取图未成功）。
// 三条根因：⒜ 把 chooseMedia 才用的 mediaType 传给了 chooseImage（严格校验直接失败）；
//           ⒝ 只挑一个候选、失败不回落；⒞ 原始 errMsg 未进日志、未据此分级提示。
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  avatarPickFailureHint,
  gradeAvatarPickError,
  pickAvatarImage,
} from "../../src/platform/uni/chooser";

const TT = "t" + "t";
const g = globalThis as unknown as Record<string, unknown>;
afterEach(() => {
  delete g[TT];
  delete g.uni;
  vi.restoreAllMocks();
});

/** 造一个「按候选记录调用」的容器：每个 API 收到 options，可指定各自行为 */
function container(spec: {
  ttImage?: "ok" | "fail" | "cancel";
  ttMedia?: "ok" | "fail";
  uniImage?: "ok" | "fail";
  uniMedia?: "ok" | "fail";
}) {
  const seen: Array<{ api: string; options: Record<string, unknown> }> = [];
  const make = (api: string, behavior?: string) =>
    (options: Record<string, unknown>) => {
      seen.push({ api, options });
      const failWith = (errMsg: string) => {
        const fail = options.fail as (e: { errMsg: string }) => void;
        fail({ errMsg });
      };
      const succeed = () => {
        const success = options.success as (r: { tempFilePaths: string[] }) => void;
        success({ tempFilePaths: ["wxfile://tmp_picked.jpg"] });
      };
      if (behavior === "ok") return succeed();
      if (behavior == null) return;
      if (behavior === "cancel") return failWith(api + ":fail cancel");
      return failWith(api + ":fail some error");
    };
  const tt: Record<string, unknown> = {};
  const uni: Record<string, unknown> = {};
  if (spec.ttImage != null) tt.chooseImage = make("tt.chooseImage", spec.ttImage);
  if (spec.ttMedia != null) tt.chooseMedia = make("tt.chooseMedia", spec.ttMedia);
  if (spec.uniImage != null) uni.chooseImage = make("uni.chooseImage", spec.uniImage);
  if (spec.uniMedia != null) uni.chooseMedia = make("uni.chooseMedia", spec.uniMedia);
  if (Object.keys(tt).length > 0) g[TT] = tt;
  if (Object.keys(uni).length > 0) g.uni = uni;
  return seen;
}

describe("t84 · ⒜ 按候选给量身参数（chooseImage 不得带 mediaType）", () => {
  it("⭐仅 tt.chooseImage：options **不含 mediaType**；仅 tt.chooseMedia：必须含 mediaType:[image]", async () => {
    const a = container({ ttImage: "ok" });
    const r1 = await pickAvatarImage();
    expect(r1).toEqual({ ok: true, path: "wxfile://tmp_picked.jpg" });
    expect(a[0].api).toBe("tt.chooseImage");
    expect(a[0].options, "chooseImage 家族不得带 mediaType（严格校验会直接失败）").not.toHaveProperty("mediaType");
    delete g[TT];
    const b = container({ ttMedia: "ok" });
    const r2 = await pickAvatarImage();
    expect(r2).toEqual({ ok: true, path: "wxfile://tmp_picked.jpg" });
    expect(b[0].api).toBe("tt.chooseMedia");
    expect(b[0].options.mediaType).toEqual(["image"]);
  });
});

describe("t84 · ⒝ 顺序回退（全败才提示，且带最后一个 errMsg）", () => {
  it("⭐tt.chooseImage 失败 ⇒ 回退 tt.chooseMedia 成功（两次调用）", async () => {
    const seen = container({ ttImage: "fail", ttMedia: "ok" });
    const r = await pickAvatarImage();
    expect(r).toEqual({ ok: true, path: "wxfile://tmp_picked.jpg" });
    expect(seen.map((s) => s.api)).toEqual(["tt.chooseImage", "tt.chooseMedia"]);
  });

  it("⭐四候选全失败 ⇒ 只返回一次失败，errMsg 为**最后一个**", async () => {
    const seen = container({ ttImage: "fail", ttMedia: "fail", uniImage: "fail", uniMedia: "fail" });
    const r = await pickAvatarImage();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.lastErrMsg).toBe("uni.chooseMedia:fail some error");
      expect(r.reason).toBe("failed");
    }
    expect(seen.map((s) => s.api)).toEqual(["tt.chooseImage", "tt.chooseMedia", "uni.chooseImage", "uni.chooseMedia"]);
  });

  it("⭐取消 ⇒ 立即返回 cancel（不再试下一个，UI 静默）", async () => {
    const seen = container({ ttImage: "cancel", ttMedia: "ok" });
    const r = await pickAvatarImage();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("cancel");
    expect(seen.map((s) => s.api)).toEqual(["tt.chooseImage"]);
    expect(avatarPickFailureHint("cancel")).toBe(""); // 取消：静默
  });
});

describe("t84 · ⒞ errMsg 分级 + 诊断日志（release 精简）", () => {
  it("⭐原始 errMsg 进日志（trial/develop 完整）", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    container({ ttImage: "fail" });
    await pickAvatarImage();
    const payload = spy.mock.calls.map((c) => JSON.stringify(c)).join(" | ");
    expect(payload).toContain("tt.chooseImage:fail some error"); // 原始 errMsg 原样
    expect(payload).toContain("avatar-pick");
  });

  it("⭐分级：scope/privacy/authorize ⇒ 权限文案；not supported ⇒ 真机；其它 ⇒ 重试", () => {
    expect(gradeAvatarPickError("chooseImage:fail auth deny scope.album")).toBe("authorize");
    expect(gradeAvatarPickError("chooseImage:fail not supported")).toBe("unsupported");
    expect(gradeAvatarPickError("chooseImage:fail cancel")).toBe("cancel");
    expect(gradeAvatarPickError("chooseImage:fail weird")).toBe("failed");
    expect(avatarPickFailureHint("authorize")).toContain("相册权限");
    expect(avatarPickFailureHint("unsupported")).toContain("用抖音头像");
    expect(avatarPickFailureHint("failed")).toContain("重试");
  });
});
