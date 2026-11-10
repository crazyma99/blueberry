<script setup lang="ts">
// P2-21：纯 props 展示组件（请求已上提 application/page-config-content 用例，组件内**不发请求**）。
// 旧端 AppFooter.uvue（96 行）原本 mounted → loadCopyright() 自取 /api/page-config 的 type==='copyright'；
// 本批按 phases「上提请求到用例/组合函数，再 props 注入」改造：优先级链 props 覆盖 → OPS 下发 →
// Profile 注入（copyrightText）→ 本地兜底，保留在用例内（AppFooter.uvue 的注入锚点字段名不变量）。
// 有意偏差（已声明）：①主题暗→亮——旧端浅底文字用 --color-primary-50（金 50%），白底≈1.3:1，
// 新端取 colorTextSecondary（CR 🟡3 同口径）；文字使用平台系统默认字体。
// 2026-11 商家端 footer（issue #14 M2）：商家页只展示第二行（supportLine），主行传空。
// 主行空且副行非空时挂 `solo` 修饰类，去掉副行的 margin-top（否则空主行之上会多出 8rpx 间距）。
// ⚠️ C 端零变化：C 端 9 页主行恒非空（兜底链终点是 Profile.copyrightText）；两行都空（loading 期）不算 solo。
import { computed } from "vue";
const props = withDefaults(defineProps<{ mainLine?: string; supportLine?: string }>(), { mainLine: "", supportLine: "" });
const solo = computed(() => props.mainLine === "" && props.supportLine !== "");
</script>

<template>
  <view class="app-footer">
    <text class="footer-main">{{ mainLine }}</text>
    <text :class="solo ? 'footer-support footer-support--solo' : 'footer-support'">{{ supportLine }}</text>
  </view>
</template>

<style lang="scss" scoped>
.app-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: $color-text-secondary;
}
.footer-main {
  /* 旧端组件无 font-size 规则：主行**继承页面包裹类**字号（.beian/.copyright/.bottomdesc） */
}
.footer-support.footer-support--solo {
  margin-top: 0;
}
.footer-support {
  margin-top: 8rpx;
  font-size: 14rpx; /* 旧 --font-size-caption=14rpx（App.uvue:132，CR 🟡3） */
  color: $color-text-secondary;
}
</style>
