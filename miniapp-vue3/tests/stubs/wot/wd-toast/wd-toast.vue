<script setup lang="ts">
// 契约桩：真实 wd-toast 无 show prop（types.ts toastProps 事实），仅由 useToast() provide/inject 驱动
// （注入键 __TOAST_OPTION__：wd-toast/index.ts:7、wd-toast.vue:82-83）。桩镜像同一注入链。
import { inject } from "vue";
interface ToastState {
  show?: boolean;
  msg?: string;
}
const option = inject<import("vue").Ref<ToastState>>("__TOAST_OPTION__", { value: { show: false } } as unknown as import("vue").Ref<ToastState>);
</script>
<template>
  <div v-if="option.show" class="stub-wd-toast">{{ option.msg }}</div>
</template>
