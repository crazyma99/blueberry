// 请求上下文工厂（T6 页面装配）：RequestContext 的代次（scopeRevision/authRevision）与
// requestId 序号在此统一治理；brandId 每次取最新（切品牌后新请求即带新值，在飞请求持旧快照）。
import type { Environment, Platform, RequestContext } from "../ports/context";

export function createContextFactory(deps: {
  platform: Platform;
  environment: Environment;
  profileKey: string;
  appCode: string;
  getBrandId: () => string | null;
}) {
  let scopeRevision = 0;
  let authRevision = 0;
  let requestSeq = 0;
  return {
    next(): RequestContext {
      requestSeq += 1;
      return {
        platform: deps.platform,
        environment: deps.environment,
        brandId: deps.getBrandId(),
        requestId: "req-" + requestSeq,
        profileKey: deps.profileKey,
        appCode: deps.appCode,
        scopeRevision,
        authRevision,
      };
    },
    /** 切品牌：递增作用域代次（旧响应按 scope 治理丢弃，P2-07） */
    bumpScope(): void {
      scopeRevision += 1;
    },
    /** 登出/重登：递增登录代次（旧会话请求作废，P2-03/P1-30） */
    bumpAuth(): void {
      authRevision += 1;
    },
  };
}
