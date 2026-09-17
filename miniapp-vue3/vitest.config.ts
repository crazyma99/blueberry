import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

// 门面/样页走 uni easycom（pages.json）解析 wd-*；vitest 环境无 easycom，
// 测试内以 global.components 注册契约桩（见 tests/components/ui-contract.spec.ts）。
export default defineConfig({
  plugins: [vue()],
  test: {
    include: ["tests/**/*.spec.ts"],
    environment: "happy-dom",
  },
});
