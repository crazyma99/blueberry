<script setup lang="ts">
// 门面：show 受控弹层；关闭统一走 cancel（遮罩/关闭按钮/返回键收敛为一个出口）。
// 事实源：wot info Popup（v-model/position/closable/close-on-click-modal…；emits close/click-modal）。

const props = withDefaults(
  defineProps<{
    show?: boolean;
    title?: string;
    position?: "center" | "top" | "right" | "bottom" | "left";
    closable?: boolean;
  }>(),
  { show: false, title: "", position: "center", closable: false },
);

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "cancel"): void;
}>();

// 去重：close 与 update:modelValue 可能在同一动作里都触发，只发一次 cancel
let handled = false;
function onClose() {
  if (handled) return;
  handled = true;
  emit("update:show", false);
  emit("cancel");
  setTimeout(() => {
    handled = false;
  }, 0);
}
</script>

<template>
  <wd-popup
    :model-value="show"
    :position="position"
    :closable="closable"
    @close="onClose"
    @update:model-value="(v: boolean) => { if (!v) onClose(); }"
  >
    <view class="base-popup">
      <text v-if="title" class="base-popup__title">{{ title }}</text>
      <slot />
    </view>
  </wd-popup>
</template>
