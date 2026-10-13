// 2026-10-13（CR ②）：让 tests/** 也能被 vue-tsc 检查。
// pipeline 用例会直接 import 构建脚本（scripts/*.mjs，CommonJS/ESM 混写、无 .d.ts）⇒ 这里做最小环境声明。
declare module "*.mjs";
