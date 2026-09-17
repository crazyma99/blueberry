<script setup lang="ts">
// 门面：受控 toast；show/hide 由门面管理（wd-toast 为受控 show prop、无内部 emit——types.ts 事实）。
import { ref } from "vue";
// 事实源纪律（SPEC §6.4）：直接复用包内真实类型，不自造并集
// （wd-toast/types.ts: ToastIconType = 'success'|'error'|'warning'|'loading'|'info'，不含空串）
import type { ToastIconType } from "@wot-ui/ui/components/wd-toast/types";

const visible = ref(false);
const msg = ref("");
const icon = ref<ToastIconType | undefined>(undefined);

function show(text: string, iconName?: ToastIconType) {
  msg.value = text;
  icon.value = iconName;
  visible.value = true;
}
function hide() {
  visible.value = false;
}

defineExpose<{ show: (text: string, iconName?: ToastIconType) => void; hide: () => void }>({ show, hide });
</script>

<template>
  <wd-toast :show="visible" :msg="msg" :icon-name="icon" />
</template>
