import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

// 2026-09-19 抖音兼容：TTSS 不支持 CSS 变量（官方文档「变量等特性编译暂不支持」），
// 页面/组件样式里的 v-bind("tokens…") 全部改走 scss 编译期常量。
// 此处把生成的 theme.scss 变量原文注入每个 scss 块（直接读文件内容，避免 @use 的 alias/循环引用坑），
// token 单源仍是 tokens/source.json → generate-tokens.mjs。
const themeVars = readFileSync(resolve(__dirname, "src/generated/theme.scss"), "utf-8");

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: themeVars + "\n",
      },
    },
  },
});
