// T8/T9b repositories · AI 试衣与推荐（旧端 api.uts:440-664/800-820 实测冻结）。
// ⚠️ 成功码口径：aiface 接口 **code===0 或 200 均为成功**（client isBusinessSuccess 已兼容 0/200）。
// 端点：
//  · GET  /api/aiface/templates  （公开）模板列表，可选 style/keyword/category/package_type/sub_category/shop_id/album_id/gender
//  · GET  /api/aiface/styles     （公开）风格分组 → [{style_name,count,cover_url}]
//  · POST /api/aiface/tasks      （**需登录**）创建试衣任务 → {task_id}（code!==0 为业务失败，message 即提示）
//  · GET  /api/aiface/tasks      （**需登录**）历史记录（openid 入参）→ [{id,status,result_image_url,template_image_url,style_name,created_at}]
//  · POST /api/aiface/recommend  （**需登录**）AI 推荐：**同步扣费接口**（每次调用扣 1 次推荐余额，耗时 1~3 分钟）
//    ⇒ 超时 180s、replayPolicy=never、**调用方严禁轮询/并发重发**（重发会再次扣费）；4001＝推荐次数不足 → 充值路径
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "./carousels";

export interface AiTemplateBrief {
  [key: string]: unknown;
}

export interface AiStyleGroup {
  style_name: string;
  count: number;
  cover_url: string;
}

export interface AiTaskListItem {
  id: number;
  status: string;
  result_image_url: string;
  template_image_url: string;
  style_name: string;
  created_at: string;
}

export function createAiRepository(deps: { client: ClientLike }) {
  return {
    /** 旧端 getAiTemplates：GET /api/aiface/templates（公开；空值参数不传） */
    getTemplates(
      context: RequestContext,
      params?: {
        style?: string;
        keyword?: string;
        category?: string;
        package_type?: string;
        sub_category?: string;
        shop_id?: string;
        album_id?: string;
        gender?: string;
      },
    ): Promise<RepoResult<AiTemplateBrief[]>> {
      const query: Record<string, string> = {};
      for (const [k, v] of Object.entries(params ?? {})) {
        if (typeof v === "string" && v !== "") query[k] = v;
      }
      return deps.client.request<AiTemplateBrief[]>({
        method: "GET",
        url: "/api/aiface/templates",
        query,
        replayPolicy: "idempotent",
        context,
      });
    },
    /** 旧端 getAiStyles：GET /api/aiface/styles（公开） */
    getStyles(
      context: RequestContext,
      params?: { category?: string; package_type?: string; sub_category?: string; shop_id?: number },
    ): Promise<RepoResult<AiStyleGroup[]>> {
      const query: Record<string, string> = {};
      if (params?.category != null && params.category !== "") query.category = params.category;
      if (params?.package_type != null && params.package_type !== "") query.package_type = params.package_type;
      if (params?.sub_category != null && params.sub_category !== "") query.sub_category = params.sub_category;
      if (params?.shop_id != null) query.shop_id = String(params.shop_id);
      return deps.client.request<AiStyleGroup[]>({
        method: "GET",
        url: "/api/aiface/styles",
        query,
        replayPolicy: "idempotent",
        context,
      });
    },
    /** 旧端 submitAiTryOn：POST /api/aiface/tasks（需登录）→ {task_id}；提交为扣费动作，禁自动重放 */
    submitTryOnTask(
      context: RequestContext,
      params: {
        templateId: number;
        userPhotoFilename: string;
        shopId: number;
        userOpenid?: string;
        category?: string;
        bodyType?: string;
        ageRange?: string;
      },
    ): Promise<RepoResult<{ task_id: number }>> {
      const body: Record<string, unknown> = {
        templateId: params.templateId,
        userPhotoFilename: params.userPhotoFilename,
        shopId: params.shopId,
      };
      if (params.userOpenid != null && params.userOpenid !== "") body.userOpenid = params.userOpenid;
      if (params.category != null && params.category !== "") body.category = params.category;
      if (params.bodyType != null && params.bodyType !== "") body.bodyType = params.bodyType;
      if (params.ageRange != null && params.ageRange !== "") body.ageRange = params.ageRange;
      return deps.client.request<{ task_id: number }>({
        method: "POST",
        url: "/api/aiface/tasks",
        body,
        authRequired: true,
        replayPolicy: "never",
        context,
      });
    },
    /** 旧端 getAiTasks：GET /api/aiface/tasks?openid（需登录）历史记录 */
    getTasks(context: RequestContext, openid: string): Promise<RepoResult<AiTaskListItem[]>> {
      return deps.client.request<AiTaskListItem[]>({
        method: "GET",
        url: "/api/aiface/tasks",
        query: { openid },
        authRequired: true,
        replayPolicy: "idempotent",
        context,
      });
    },
    /** 旧端 getSharedAiTryOnResult（api.uts:611-…）：GET /api/aiface/tasks/share/{shareToken}
     * ⭐ 匿名只读落地：**公开端点（无需登录）**、调用方**只拉一次**（不轮询、不重试）。 */
    getSharedTask(context: RequestContext, shareToken: string): Promise<RepoResult<Record<string, unknown>>> {
      return deps.client.request<Record<string, unknown>>({
        method: "GET",
        url: `/api/aiface/tasks/share/${encodeURIComponent(shareToken)}`,
        replayPolicy: "idempotent",
        context,
      });
    },
    /** 旧端 getAiRecommend：POST /api/aiface/recommend（需登录；**同步扣费·180s·禁重发**） */
    getRecommend(
      context: RequestContext,
      params: { user_photo_filename: string; shop_id: number },
    ): Promise<RepoResult<Record<string, unknown>>> {
      return deps.client.request<Record<string, unknown>>({
        method: "POST",
        url: "/api/aiface/recommend",
        body: params,
        authRequired: true,
        replayPolicy: "never",
        timeoutMs: 180000,
        context,
      });
    },
  };
}
