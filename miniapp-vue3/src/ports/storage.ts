// 端口层：存储（纯 TS 接口：本地 KV，跨平台语义一致）
export interface StoragePort {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}
