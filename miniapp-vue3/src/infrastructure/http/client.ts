// T5（P2-01/02/05）：HTTP 客户端。职责——发起时捕获 RequestContext 快照、注入
// Bearer / X-App-Code / X-Brand-Id（旧端 http.uts:122 口径：有品牌上下文即恒带，空则不带）、
// 业务信封解码（0/200 兼容）、业务码与传输失败统一映射为 AppError、重放策略透传。
// 合同（phases P2）：createHttpClient({transport, authCoordinator}) -> {request(input)}
import type { Environment, Platform, RequestContext, Result } from "../../ports/context";
import type { HttpMethod, HttpPort, HttpResponse } from "../../ports/http";
import { isBusinessSuccess, mapBusinessFailure, mapTransportFailure, type AppError } from "./errors";

/** 新端内部会话模型（P2-03 AuthCoordinator 将实现；非后端响应字段的伪造） */
export interface Session {
  userId: string;
  token: string;
  platform: Platform;
  profileKey: string;
  authRevision: number;
}

/** client 消费的认证端口最小面（waitForLogin 语义见 P2-03：队列唤醒/取消全 reject） */
export interface AuthCoordinatorLike {
  waitForLogin(context: RequestContext): Promise<Result<Session>>;
}

export interface ClientRequestInput {
  method: HttpMethod;
  url: string;
  query?: Readonly<Record<string, string>>;
  body?: unknown;
  /** 需要登录：注入 Bearer；登录失败/取消即返回 AUTH_EXPIRED/CANCELLED，不发请求 */
  authRequired?: boolean;
  timeoutMs?: number;
  replayPolicy?: "never" | "idempotent";
  context: RequestContext;
}

export type ClientResult<T> = { ok: true; value: T } | { ok: false; error: AppError };

const DEFAULT_TIMEOUT_MS = 10000;

/** 传输层失败 reason 约定（T2 Result.reason 字符串 → AppError 维度） */
function reasonToTransport(reason: string): "network" | "timeout" | "cancelled" {
  if (reason === "timeout") return "timeout";
  if (reason === "cancelled") return "cancelled";
  return "network";
}

export function createHttpClient(deps: {
  transport: HttpPort;
  authCoordinator: AuthCoordinatorLike;
}): { request: <T>(input: ClientRequestInput) => Promise<ClientResult<T>> } {
  const { transport, authCoordinator } = deps;

  async function request<T>(input: ClientRequestInput): Promise<ClientResult<T>> {
    // 1) 发起时捕获快照：后续切品牌/登出不影响在飞请求的上下文
    const ctx: RequestContext = Object.freeze({ ...input.context });
    const headers: Record<string, string> = {};

    // 2) 认证：authRequired 时先取会话；失败/取消不发请求
    if (input.authRequired) {
      const session = await authCoordinator.waitForLogin(ctx);
      if (!session.ok) {
        const cancelled = session.reason === "cancelled";
        return {
          ok: false,
          error: {
            kind: cancelled ? "CANCELLED" : "AUTH_EXPIRED",
            businessCode: null,
            message: "login required: " + session.reason,
            requestId: ctx.requestId,
            retryable: false,
          },
        };
      }
      // 会话代次落后于请求代次＝会话已被登出/轮换，按作废处理（新登录代次大于请求代次属正常排队唤醒）
      if (session.value.authRevision < ctx.authRevision) {
        return {
          ok: false,
          error: {
            kind: "AUTH_EXPIRED",
            businessCode: null,
            message: "stale session: authRevision mismatch",
            requestId: ctx.requestId,
            retryable: false,
          },
        };
      }
      headers.Authorization = "Bearer " + session.value.token;
    }

    // 3) 头注入：X-App-Code 恒带；X-Brand-Id 有品牌上下文（非空）即恒带——
    //    旧端 http.uts:122 全请求口径（扫品牌码/品牌馆切牌后所有业务请求都带，空串＝无品牌上下文走后端旧逻辑）。
    //    2026-09-19 纠偏：初版「brandScoped 标记才带」无任何仓储使用 ⇒ 实际从不携带、品牌馆切牌后数据不切换
    //    （主人拍板对齐旧端，deviations #23）
    headers["X-App-Code"] = ctx.appCode;
    if (ctx.brandId != null && ctx.brandId !== "") {
      headers["X-Brand-Id"] = ctx.brandId;
    }

    // 4) 传输：透传 replayPolicy 与快照
    const res: Result<HttpResponse<T>> = await transport.request<T>({
      method: input.method,
      url: input.url,
      query: input.query,
      body: input.body,
      headers,
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      context: ctx,
      replayPolicy: input.replayPolicy ?? "never",
    });
    if (!res.ok) {
      return { ok: false, error: mapTransportFailure(reasonToTransport(res.reason), ctx.requestId) };
    }

    // 5) 响应映射：HTTP 401 → AUTH_EXPIRED；业务信封 0/200 成功；其余业务码 → AppError
    const http = res.value;
    if (http.status === 401) {
      return {
        ok: false,
        error: {
          kind: "AUTH_EXPIRED",
          businessCode: http.businessCode,
          message: "unauthorized",
          requestId: http.requestId ?? ctx.requestId,
          retryable: false,
        },
      };
    }
    if (isBusinessSuccess(http.businessCode)) {
      return { ok: true, value: http.data };
    }
    return {
      ok: false,
      error: mapBusinessFailure(http.businessCode, http.message ?? "", http.requestId ?? ctx.requestId, http.data), // 2026-09-23：失败也要保留 data（4002 的 check_code）
    };
  }

  return { request };
}
