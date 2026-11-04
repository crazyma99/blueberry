// AI 试衣模板加载失败文案（对齐旧端 main 2876ec5：`res.message || '模板加载失败，请重试'`）。
// 纪律：仅 BUSINESS（服务端中文可读原因）透传 message；NETWORK/TIMEOUT/AUTH_EXPIRED/UNKNOWN 等
// http 层英文技术串（如 "transport failure: network"）一律不得展示，回落固定中文。

export const TEMPLATE_LOAD_FAIL_TEXT = "模板加载失败，请重试";
export const TEMPLATE_DATA_INVALID_TEXT = "模板数据异常，请重试";

export function templateLoadErrorMessage(err: { kind: string; message: string } | null | undefined): string {
  if (err != null && err.kind === "BUSINESS" && typeof err.message === "string" && err.message.trim() !== "") {
    return err.message;
  }
  return TEMPLATE_LOAD_FAIL_TEXT;
}
