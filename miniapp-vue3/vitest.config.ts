import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

// 门面/样页走 uni easycom（pages.json）解析 wd-*；vitest 环境无 easycom，
// 测试内以 global.components 注册契约桩（见 tests/components/ui-contract.spec.ts）。
// uni 内置模板标签（scroll-view 等）在纯 @vitejs/plugin-vue 下无宿主组件，标记为原生元素消除误告警。
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => ["view", "text", "image", "scroll-view"].includes(tag),
        },
      },
    }),
  ],
  test: {
    include: ["tests/**/*.spec.ts"],
    environment: "happy-dom",
  },
});
