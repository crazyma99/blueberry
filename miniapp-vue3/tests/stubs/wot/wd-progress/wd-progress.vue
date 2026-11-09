<script setup lang="ts">
// wot `wd-progress` 测试桩（门面 BaseProgress 的契约断言用）：暴露 props，渲染一个带 data 属性的节点
withDefaults(
  defineProps<{
    percentage?: number;
    color?: string | string[];
    hideText?: boolean;
    customStyle?: string;
    status?: string;
  }>(),
  { percentage: 0, color: "", hideText: false, customStyle: "", status: "" },
);
</script>

<template>
  <view class="stub-wd-progress" :data-percentage="percentage" :style="customStyle"></view>
</template>
