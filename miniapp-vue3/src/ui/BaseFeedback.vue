<script setup lang="ts">
// 门面：受控 toast（方案 A 重写，migration §8.12）。
// 事实源：wd-toast 2.3.2 没有 show prop（wd-toast/types.ts toastProps 无该字段），仅能 useToast()
// 函数式驱动（provide 方 wd-toast/index.ts:22-33；注入方 wd-toast.vue:82-94）；旧版传 :show 属 API 误用。
// 抖音分支：wot 弹层链在抖音端无脱离文档流机制（root-portal 编译为普通 view），toast 的内联 fixed
// 同样裸露在宿主节点内 → 改 uni.showToast 原生兜底（@dcloudio/types uni.d.ts:11178/11228；
// 抖音运行时 uni 为 Proxy 转发 tt.showToast，见调查报告 3a 节）。
// 平台分支为运行时判定（ui-platform.ts），不使用构建期 #ifdef 承载唯一逻辑。
import type { ToastIconType } from "@wot-ui/ui/components/wd-toast/types";
import { useToast } from "./wot-composables";
import { isToutiaoPlatform } from "./ui-platform";

const toast = useToast();

// uni.showToast icon 值域（@dcloudio/types 4609-4629）：success/loading/none/error/fail
function nativeIcon(iconName?: ToastIconType): "success" | "loading" | "none" {
  if (iconName === "success") return "success";
  if (iconName === "loading") return "loading";
  return "none";
}

function show(text: string, iconName?: ToastIconType) {
  if (isToutiaoPlatform()) {
    uni.showToast({ title: text, icon: nativeIcon(iconName), duration: 1500 });
    return;
  }
  toast.show({ msg: text, iconName, duration: 1500 });
}
function hide() {
  if (isToutiaoPlatform()) {
    uni.hideToast();
    return;
  }
  toast.close();
}

defineExpose<{ show: (text: string, iconName?: ToastIconType) => void; hide: () => void }>({ show, hide });
</script>

<template>
  <!-- 挂载点：provide 由 useToast() 在本组件 setup 内完成，注入方 wd-toast 是其子组件（抖音分支不渲染也无副作用） -->
  <wd-toast />
</template>
