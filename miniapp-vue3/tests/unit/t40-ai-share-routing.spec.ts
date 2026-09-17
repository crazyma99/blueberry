// T8 P3-13 分享分支测试：入口解析（只读/单页模式）、分享路径与单页模式 query、匿名只读**只拉一次**、契约形状。
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildSharePath,
  buildShareQuery,
  loadSharedTaskOnce,
  resolveShareEntry,
} from "../../src/application/ai-share-routing";
import { createAiRepository } from "../../src/infrastructure/repositories/ai";
import type { RequestContext } from "../../src/ports/context";
import type { RepoResult } from "../../src/infrastructure/repositories/carousels";

const ctx: RequestContext = {
  platform: "mp-weixin",
  environment: "trial",
  brandId: null,
  requestId: "r",
  profileKey: "blueberry",
  appCode: "blueBerry",
  scopeRevision: 1,
  authRevision: 1,
};

beforeEach(() => {
  delete (globalThis as { uni?: unknown }).uni;
});

describe("ai-share-routing · 入口解析（旧 :256-274）", () => {
  it("share_from=tryon_result → 只读；brandId/shareToken 非空才取值；缺省 fields 为空串", () => {
    expect(resolveShareEntry({}, { scene: null })).toEqual({
      taskId: "",
      shopId: "",
      shareToken: "",
      shareReadOnly: false,
      brandId: "",
      isTimelinePage: false,
    });
    expect(
      resolveShareEntry({ taskId: "42", shopId: "7", shareToken: "tk", share_from: "tryon_result", brandId: "lanmei" }, { scene: 1001 }),
    ).toEqual({ taskId: "42", shopId: "7", shareToken: "tk", shareReadOnly: true, brandId: "lanmei", isTimelinePage: false });
  });

  it("⭐scene=1154 → 朋友圈单页模式（禁跳页）；容器无 uni 时按非单页模式（守卫不抛）", () => {
    expect(resolveShareEntry({}, { scene: 1154 }).isTimelinePage).toBe(true);
    expect(resolveShareEntry({}).isTimelinePage).toBe(false); // 无 uni.getEnterOptionsSync
  });
});

describe("ai-share-routing · 分享路径与单页模式 query（旧 :537-560）", () => {
  const base = { templateId: 11, shopId: "7", albumId: "5", brandId: "lanmei" };

  it("好友直达：/pages/aiTryOn/index?share_from=tryon_result＋templateId/shopId/albumId/brandId（顺序逐条）", () => {
    expect(buildSharePath(base)).toBe(
      "/pages/aiTryOn/index?share_from=tryon_result&templateId=11&shopId=7&albumId=5&brandId=lanmei",
    );
    expect(buildSharePath({ templateId: 0, shopId: "", albumId: "", brandId: "" })).toBe(
      "/pages/aiTryOn/index?share_from=tryon_result",
    );
  });

  it("brandId=null（无品牌）不得产出 `brandId=null` 段；视为未设品牌", () => {
    expect(buildSharePath({ templateId: 11, shopId: "7", albumId: "", brandId: null })).toBe(
      "/pages/aiTryOn/index?share_from=tryon_result&templateId=11&shopId=7",
    );
    expect(buildShareQuery({ templateId: 0, shopId: "", albumId: "", brandId: null, taskId: "42", shareToken: "tk" })).toBe(
      "share_from=tryon_result&taskId=42&shareToken=tk",
    );
  });

  it("⭐朋友圈单页模式 query：必须追加 taskId＋shareToken（bug #8 根因修复）", () => {
    expect(buildShareQuery({ ...base, taskId: "42", shareToken: "tk" })).toBe(
      "share_from=tryon_result&templateId=11&shopId=7&albumId=5&brandId=lanmei&taskId=42&shareToken=tk",
    );
    // 无 taskId/shareToken 时不追加空参数
    expect(buildShareQuery({ ...base, taskId: "", shareToken: "" })).toBe(
      "share_from=tryon_result&templateId=11&shopId=7&albumId=5&brandId=lanmei",
    );
  });
});

describe("ai-share-routing · 匿名只读落地（旧 :612-660）", () => {
  function shared(result: RepoResult<Record<string, unknown>>) {
    let calls = 0;
    return {
      calls: () => calls,
      repo: {
        getSharedTask: async () => {
          calls += 1;
          return result;
        },
      },
    };
  }

  it("⭐只拉一次：shareToken 为空 → failed 且**零请求**（不空转）", async () => {
    const f = shared({ ok: true, value: {} });
    await expect(loadSharedTaskOnce({ ai: f.repo, context: ctx }, "")).resolves.toEqual({
      kind: "failed",
      errorMessage: "",
    });
    expect(f.calls()).toBe(0);
  });

  it("completed：采纳 id/template_id/style_name/shop_name/shop_id/album_id 与结果图", async () => {
    const f = shared({
      ok: true,
      value: {
        id: 42,
        template_id: 11,
        status: "completed",
        result_image_url: "https://lanmei66.cloud/r.png",
        style_name: "汉服",
        shop_name: "弥勒店",
        shop_id: 7,
        album_id: 5,
      },
    });
    await expect(loadSharedTaskOnce({ ai: f.repo, context: ctx }, "tk")).resolves.toEqual({
      kind: "completed",
      taskId: "42",
      templateId: 11,
      styleName: "汉服",
      shopName: "弥勒店",
      shopId: "7",
      albumId: "5",
      resultImageUrl: "https://lanmei66.cloud/r.png",
    });
    expect(f.calls()).toBe(1);
  });

  it("⭐pending/processing → processing 态（**不轮询、不重试**）；failed → 带 error_message", async () => {
    const pending = shared({ ok: true, value: { id: 42, status: "processing", style_name: "汉服", shop_name: "弥勒店" } });
    await expect(loadSharedTaskOnce({ ai: pending.repo, context: ctx }, "tk")).resolves.toEqual({
      kind: "processing",
      taskId: "42",
      styleName: "汉服",
      shopName: "弥勒店",
    });
    expect(pending.calls()).toBe(1); // ✅ 单次拉取，无第二次

    const failed = shared({ ok: true, value: { id: 42, status: "failed", error_message: "生成失败原因" } });
    await expect(loadSharedTaskOnce({ ai: failed.repo, context: ctx }, "tk")).resolves.toEqual({
      kind: "failed",
      errorMessage: "生成失败原因",
    });
  });

  it("业务失败：优先服务端 message；缺省「作品不存在或已被删除」", async () => {
    const withMsg = shared({ ok: false, error: { kind: "BUSINESS", message: "无权查看" } });
    await expect(loadSharedTaskOnce({ ai: withMsg.repo, context: ctx }, "tk")).resolves.toEqual({
      kind: "failed",
      errorMessage: "无权查看",
    });
    const noMsg = shared({ ok: false, error: { kind: "NETWORK" } });
    await expect(loadSharedTaskOnce({ ai: noMsg.repo, context: ctx }, "tk")).resolves.toEqual({
      kind: "failed",
      errorMessage: "作品不存在或已被删除",
    });
  });
});

describe("ai 契约 · getSharedTask（P3-13）", () => {
  it("GET /api/aiface/tasks/share/{token}（公开、无需登录、idempotent、token 编码）", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const repo = createAiRepository({
      client: {
        request: async <R,>(input: Record<string, unknown>) => {
          seen.push(input);
          return { ok: true, value: {} } as unknown as RepoResult<R>;
        },
      } as never,
    });
    await repo.getSharedTask(ctx, "a/b c");
    expect(seen[0]).toMatchObject({
      method: "GET",
      url: "/api/aiface/tasks/share/a%2Fb%20c",
      replayPolicy: "idempotent",
    });
    expect(seen[0].authRequired).toBeFalsy();
  });
});
