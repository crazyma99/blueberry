// 端口层：身份（纯 TS 接口）
import type { Platform, Result } from "./context";

export interface IdentityTicket {
  readonly platform: Platform;
  readonly code: string;
  readonly subject: string | null;
}

export interface IdentityPort {
  /** 平台登录换票；服务端负责 code2session，秘密不进客户端 */
  login(): Promise<Result<IdentityTicket>>;
  /** 手机号授权（平台原生能力，经 ui-bridge 触发） */
  getPhoneNumber(): Promise<Result<string>>;
  logout(): Promise<Result<void>>;
}
