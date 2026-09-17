// 构建期桥接（P1-24 踩坑延伸）：wot 2.3.2 以 .ts 源码分发、无独立 .d.ts，
// 直接 import useToast/useDialog 会把包内 .ts（common/util.ts 等）拉进 vue-tsc 程序触发 TS7053；
// 本文件为 .js（vue-tsc 不纳入程序），由 .d.ts 提供结构化类型声明，运行时仍复用 wot 真实实现。
export { useToast } from "@wot-ui/ui/components/wd-toast/index";
export { useDialog } from "@wot-ui/ui/components/wd-dialog/index";
