// wot-composables.js 的类型门面：结构化声明，避免 vue-tsc 跟进 wot 包内 .ts 源文件。
// ToastIconType 直接复用包内真实类型（wd-toast/types.ts 为纯类型文件，vue-tsc 程序内已验证可纳入）。
import type { ToastIconType } from "@wot-ui/ui/components/wd-toast/types";

export interface WotToastApi {
  show(option: { msg?: string; iconName?: ToastIconType; duration?: number } | string): void;
  close(): void;
  loading(option: { msg?: string } | string): void;
  success(option: { msg?: string } | string): void;
  error(option: { msg?: string } | string): void;
}
export declare function useToast(selector?: string): WotToastApi;

export interface WotDialogConfirmOptions {
  title?: string;
  msg?: string;
  showClose?: boolean;
  closeOnClickModal?: boolean;
}
export interface WotDialogApi {
  confirm(options: WotDialogConfirmOptions | string): Promise<unknown>;
  alert(options: WotDialogConfirmOptions | string): Promise<unknown>;
  close(): void;
}
export declare function useDialog(selector?: string): WotDialogApi;
