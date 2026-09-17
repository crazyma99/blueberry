<script setup lang="ts">
// 契约桩：真实 wd-dialog 2.3.2 无 emit、不消费业务 props（仅 selector/root-portal/custom-class），
// 唯一驱动通道＝useDialog() 的 provide/inject（注入键 __MESSAGE_OPTION__：wd-dialog/index.ts:10/36-40）；
// success=confirm 路径 resolve、fail=cancel/modal/close 路径 reject（index.ts:124-137）。桩镜像同一通道。
import { inject } from "vue";
interface DialogState {
  show?: boolean;
  msg?: string;
  title?: string;
  success?: (res: unknown) => void;
  fail?: (res: unknown) => void;
}
const option = inject<import("vue").Ref<DialogState>>("__MESSAGE_OPTION__", { value: { show: false } } as unknown as import("vue").Ref<DialogState>);
</script>
<template>
  <div v-if="option.show" class="stub-wd-dialog">
    <div class="stub-dialog-msg">{{ option.msg }}</div>
    <button class="stub-dialog-confirm" @click="option.success && option.success({ action: 'confirm' })">ok</button>
    <button class="stub-dialog-cancel" @click="option.fail && option.fail({ action: 'cancel' })">no</button>
  </div>
</template>
