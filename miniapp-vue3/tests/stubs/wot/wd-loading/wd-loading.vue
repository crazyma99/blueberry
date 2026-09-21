<script setup lang="ts">
// 契约桩：真实 wd-loading props＝type/color/size/direction/text/inheritColor
// （源码 grep 事实：node_modules/@wot-ui/ui/components/wd-loading/types.ts ＋ wd-loading.vue 的
//  rootStyle 把 color 落到根节点 style.color ⇒ 组件内 spinner 与 text 均走 `currentColor`）。
// 桩只回显 text，其余 prop 供规格以 findComponent(...).props() 断言。
defineProps<{
  type?: string;
  color?: string;
  size?: string | number;
  direction?: string;
  text?: string;
  inheritColor?: boolean;
}>();
</script>
<template>
  <div class="stub-wd-loading">
    <span class="stub-wd-loading-text">{{ text }}</span>
  </div>
</template>
