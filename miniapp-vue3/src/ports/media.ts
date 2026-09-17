// 端口层：媒体（纯 TS 接口：选图/上传/下载保存）
import type { Result } from "./context";

export interface PickedImage {
  readonly tempPath: string;
  readonly sizeBytes: number;
}

export interface UploadResult {
  readonly url: string;
}

export interface MediaPort {
  pickImage(maxCount: number): Promise<Result<PickedImage[]>>;
  upload(path: string, requestId: string): Promise<Result<UploadResult>>;
  saveToAlbum(url: string): Promise<Result<void>>;
}
