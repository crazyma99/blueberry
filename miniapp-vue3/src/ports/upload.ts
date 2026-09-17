// upload 端口（T8 S1）：新端 http client 只覆盖 uni.request（业务信封），**不覆盖 uni.uploadFile**；
// 旧端上传在 utils/api.uts:6/42/502 手工注入品牌头（不走统一 client）⇒ 新端显式抽出端口＋平台适配，
// 保证「品牌头注入 / 失败可重试 / 容器安全」三件套有单一事实源与测试。
import type { Result } from "./context";

export interface UploadRequest {
  /** 绝对地址（调用方拼 baseUrl，同 transport 口径） */
  url: string;
  /** 本地文件路径（chooseImage/chooseMedia 返回） */
  filePath: string;
  /** 表单字段名（旧端约定 name） */
  name: string;
  /** 手工注入的头（X-App-Code 恒带、X-Brand-Id 品牌作用域时带） */
  headers?: Readonly<Record<string, string>>;
  /** 额外表单字段 */
  formData?: Readonly<Record<string, string>>;
  timeoutMs?: number;
}

export interface UploadResponse {
  statusCode: number;
  /** 原始响应体文本（解析交调用方，避免端口层绑定业务形状） */
  data: string;
}

export interface UploadPort {
  upload(req: UploadRequest): Promise<Result<UploadResponse>>;
  cancel(): void;
}
