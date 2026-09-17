import { defineConfig } from "vitest/config";

// 独立 vitest 配置：不加载 vite.config.ts 的 uni 插件（工具链测试为纯 Node 侧校验）。
export default defineConfig({
  test: {
    include: ["tests/**/*.spec.ts"],
  },
});
