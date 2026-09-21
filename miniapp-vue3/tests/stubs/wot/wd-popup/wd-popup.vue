<script setup lang="ts">
// 契约桩：真实 wd-popup props＝v-model/modelValue、position、closable、close-on-click-modal（默认 true）、
// modal、root-portal、custom-class、custom-style、hide-when-close、lazy-render…（`npx wot info Popup` 实测）
defineProps<{
  modelValue?: boolean;
  position?: string;
  closable?: boolean;
  closeOnClickModal?: boolean;
  modal?: boolean;
  rootPortal?: boolean;
  customClass?: string;
  customStyle?: string;
  zIndex?: number;
}>();
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void; (e: "close"): void; (e: "click-modal"): void }>();
function onClose() { emit("close"); emit("update:modelValue", false); }
</script>
<template>
  <div class="stub-wd-popup">
    <slot />
    <button class="stub-close" @click="onClose">x</button>
  </div>
</template>
