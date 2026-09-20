// T8 S5-2 repositories · AI 试衣**结果**三端点（旧端 api.uts:575-649 实测冻结）。
// 为什么单独成文（需知悉）：`repositories/ai.ts` 冻结了 templates/styles/tasks(POST/GET)/recommend/shared 端点，
// 本页另需的**任务详情／下载扣费**两点当时未收录，且**不得修改既有文件**，故按同构在这里新增；
// 后续若并回 ai.ts，仅需搬迁函数体（口径与 ai.ts 完全一致：公开接口 replayPolicy=idempotent、失败一律 Result 不抛）。
// 端点（旧端实测）：
//  · GET  /api/aiface/tasks/{taskId}            （旧端无 authRequired：结果页匿名可看）→ 任务详情（含 share_token/shop_id/album_id）
//  · GET  /api/aiface/tasks/{taskId}/download   （**需登录**）→ 下载池扣 1 次并返回 **5 分钟签名下载 URL**
// 分享详情（`GET /api/aiface/tasks/share/{shareToken}`）已由 `repositories/ai.ts` 的 `getSharedTask` 提供，
// 本页经 `application/ai-share-routing.ts` 的 `loadSharedTaskOnce` 消费，故此处**不重复实现**。
// ⚠️ 成功码口径：aiface 接口 code===0 或 200 均为成功（client isBusinessSuccess 已兼容 0/200，旧端 :373/:467/:863 手写双判）。
// ⚠️ 4001＝下载次数不足（HTTP 200 返回）→ client 映射 INSUFFICIENT_CREDITS（errors.ts），页面据此拉起共享支付协调器。
import type { RequestContext } from "../../ports/context";
import type { ClientLike, RepoResult } from "./carousels";

/** 任务详情（旧端 getAiTryOnResult 返回 data；`status` ∈ pending/processing/completed/failed） */
export interface AiResultTask {
  id: number;
  status: string;
  result_image_url: string;
  error_message?: string;
  /** 本人任务详情才返回（组朋友圈分享链接用，2026-09-14） */
  share_token?: string;
  template_id?: number;
  template_image_url?: string;
  style_name?: string;
  /** 分享落地所需：任务所属门店 + 来源相册（2026-09-10） */
  shop_id?: number;
  shop_name?: string;
  album_id?: number;
  category?: string;
  created_at?: string;
}

export function createAiResultRepository(deps: { client: ClientLike }) {
  return {
    /** 旧端 getAiTryOnResult(:575-609)：任务详情。result-flow 的 createResultPoller.getResult 消费本方法 */
    getResult(context: RequestContext, taskId: string): Promise<RepoResult<AiResultTask>> {
      return deps.client.request<AiResultTask>({
        method: "GET",
        url: `/api/aiface/tasks/${taskId}`,
        // ⭐2026-09-20 修复：后端「任务详情仅本人可读」，无 token 一律 401 ⇒ 体验版「付完钱却显示生成失败」的根因。
        // 旧端 http 层「有 token 就带」（http.uts:114-116），迁移时该请求漏标 authRequired ⇒ 从不带 Bearer。
        authRequired: true,
        replayPolicy: "idempotent",
        context,
      });
    },
    /**
     * 旧端 downloadAiTryOnResult(:642-649)：下载池扣费 → { url, taskId }。
     * ⚠️ 旧端为 GET（parseInt(taskId)||0 兜底，空 taskId 会打到 .../tasks/0/download）；
     * **有意偏差（唯一的）**：`replayPolicy: "never"` —— 本请求语义是「扣 1 次并出签名 URL」，
     * 自动重放会造成二次扣费；旧端 request 工具本身无重放，故此处禁重放与旧端行为等价。
     */
    downloadResult(
      context: RequestContext,
      taskId: string,
    ): Promise<RepoResult<{ url: string; taskId: number }>> {
      const id = parseInt(taskId, 10) || 0;
      return deps.client.request<{ url: string; taskId: number }>({
        method: "GET",
        url: `/api/aiface/tasks/${id}/download`,
        authRequired: true,
        replayPolicy: "never",
        context,
      });
    },
  };
}
