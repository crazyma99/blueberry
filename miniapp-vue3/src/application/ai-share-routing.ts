// T8 S5 / P3-13：分享落地规则（旧端 aiTryOnResult:255-275 / 530-650 的**纯逻辑内核**）。
// 规则逐条（旧端实测）：
//  · `share_from === 'tryon_result'` ⇒ **只读模式**（分享落地看他人作品）
//  · `scene === 1154`（朋友圈单页模式）⇒ `isTimelinePage`，**禁跳页**，仅内容展示
//  · 好友直达试衣：`/pages/aiTryOn/index?share_from=tryon_result&templateId&shopId&albumId&brandId`
//  · 朋友圈单页模式打开的是**结果页本身** ⇒ query **必须带 `taskId`＋`shareToken`**（旧 bug #8 根因修复）
//  · 匿名只读落地：凭 `shareToken` **只拉一次**（不轮询、不重试、不要求登录）
import type { RequestContext } from "../ports/context";
import type { RepoResult } from "../infrastructure/repositories/carousels";

export interface ShareEntry {
  taskId: string;
  shopId: string;
  shareToken: string;
  shareReadOnly: boolean;
  brandId: string;
  /** scene 1154：朋友圈单页模式（禁跳页） */
  isTimelinePage: boolean;
}

/** 分享落地入口解析（旧 :256-274）。deps.scene 供测试注入；缺省读 uni.getEnterOptionsSync（守卫） */
export function resolveShareEntry(
  options: Record<string, unknown> | undefined,
  deps?: { scene?: number | null },
): ShareEntry {
  const opts = options ?? {};
  const scene = deps?.scene !== undefined ? deps.scene : readEnterScene();
  return {
    taskId: opts.taskId != null ? String(opts.taskId) : "",
    shopId: opts.shopId != null ? String(opts.shopId) : "",
    shareToken: opts.shareToken != null && String(opts.shareToken) !== "" ? String(opts.shareToken) : "",
    shareReadOnly: opts.share_from === "tryon_result",
    brandId: opts.brandId != null ? String(opts.brandId) : "",
    isTimelinePage: scene === 1154,
  };
}

function readEnterScene(): number | null {
  try {
    if (typeof uni === "undefined" || typeof uni.getEnterOptionsSync !== "function") return null;
    const enter = uni.getEnterOptionsSync() as { scene?: unknown } | null;
    return enter != null && typeof enter.scene === "number" ? enter.scene : null;
  } catch {
    return null; // 容器异常 → 非单页模式（旧端 try/catch 同口径）
  }
}

export interface ShareContextInput {
  templateId: number;
  shopId: string;
  albumId: string;
  /** 品牌上下文：`versioned.loadBrandId()` 在无品牌时返回 null ⇒ 本模块容忍 null 并视为「未设品牌」 */
  brandId: string | null;
}

/** 好友直达试衣的分享路径（旧 :552-560 逐条顺序） */
export function buildSharePath(input: ShareContextInput): string {
  let path = "/pages/aiTryOn/index?share_from=tryon_result";
  if (input.templateId > 0) path += `&templateId=${input.templateId}`;
  if (input.shopId !== "") path += `&shopId=${input.shopId}`;
  if (input.albumId !== "") path += `&albumId=${input.albumId}`;
  if (input.brandId != null && input.brandId !== "") path += `&brandId=${input.brandId}`;
  return path;
}

/** 朋友圈单页模式 query（旧 :537-549）：在试衣页参数基础上**追加 taskId＋shareToken** */
export function buildShareQuery(input: ShareContextInput & { taskId: string; shareToken: string }): string {
  const path = buildSharePath(input);
  const qIndex = path.indexOf("?");
  let q = qIndex >= 0 ? path.slice(qIndex + 1) : "";
  if (input.taskId !== "") q = q + (q === "" ? "" : "&") + `taskId=${input.taskId}`;
  if (input.shareToken !== "") q = q + (q === "" ? "" : "&") + `shareToken=${input.shareToken}`;
  return q;
}

export type SharedTaskOutcome =
  | {
      kind: "completed";
      taskId: string;
      templateId: number;
      styleName: string;
      shopName: string;
      shopId: string;
      albumId: string;
      resultImageUrl: string;
    }
  | { kind: "processing"; taskId: string; styleName: string; shopName: string }
  | { kind: "failed"; errorMessage: string };

interface SharedTaskSnapshot {
  id?: unknown;
  template_id?: unknown;
  status?: unknown;
  result_image_url?: unknown;
  style_name?: unknown;
  shop_name?: unknown;
  shop_id?: unknown;
  album_id?: unknown;
  error_message?: unknown;
}

/**
 * 匿名只读落地（旧 :612-660）：**只拉一次**——不轮询、不重试、不要求登录。
 * shareToken 为空 → failed（不空转）；pending/processing → `processing`（仅展示进度态，**不轮询**）。
 */
export async function loadSharedTaskOnce(
  deps: {
    ai: {
      getSharedTask(context: RequestContext, shareToken: string): Promise<RepoResult<Record<string, unknown>>>;
    };
    context: RequestContext;
  },
  shareToken: string,
): Promise<SharedTaskOutcome> {
  if (shareToken === "") return { kind: "failed", errorMessage: "" };
  const res = await deps.ai.getSharedTask(deps.context, shareToken);
  if (!res.ok || res.value == null) {
    const message = !res.ok && typeof res.error.message === "string" && res.error.message !== "" ? res.error.message : "作品不存在或已被删除";
    return { kind: "failed", errorMessage: message };
  }
  const data = res.value as SharedTaskSnapshot;
  const taskId = data.id != null ? String(data.id) : "";
  const templateId = typeof data.template_id === "number" ? data.template_id : 0;
  const styleName = typeof data.style_name === "string" ? data.style_name : "";
  const shopName = typeof data.shop_name === "string" ? data.shop_name : "";
  const shopId = typeof data.shop_id === "number" && data.shop_id > 0 ? String(data.shop_id) : "";
  const albumId = typeof data.album_id === "number" && data.album_id > 0 ? String(data.album_id) : "";
  const status = typeof data.status === "string" ? data.status : "";
  const resultImageUrl = typeof data.result_image_url === "string" ? data.result_image_url : "";

  if (status === "completed" && resultImageUrl !== "") {
    return { kind: "completed", taskId, templateId, styleName, shopName, shopId, albumId, resultImageUrl };
  }
  if (status === "failed") {
    return { kind: "failed", errorMessage: typeof data.error_message === "string" ? data.error_message : "" };
  }
  // pending / processing：只读展示进度态，**不轮询、不重试**（旧 :655-657）
  return { kind: "processing", taskId, styleName, shopName };
}
