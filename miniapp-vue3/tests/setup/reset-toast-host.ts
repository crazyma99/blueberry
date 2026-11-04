// 全局测试隔离：每个用例前清空轻提示宿主栈（ui/toast-host.ts）。
// 原因：测试里 mount 的页面/BaseFeedback 常不 unmount，残留宿主会截获后续用例的 toast()。
import { beforeEach } from "vitest";
import { resetToastHostsForTest } from "../../src/ui/toast-host";

beforeEach(() => {
  resetToastHostsForTest();
});
