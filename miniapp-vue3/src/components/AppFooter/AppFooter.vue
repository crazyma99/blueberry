<script setup lang="ts">
// P2-21：纯 props 展示组件（请求已上提 application/page-config-content 用例，组件内**不发请求**）。
// 旧端 AppFooter.uvue（96 行）原本 mounted → loadCopyright() 自取 /api/page-config 的 type==='copyright'；
// 本批按 phases「上提请求到用例/组合函数，再 props 注入」改造：优先级链 props 覆盖 → OPS 下发 →
// Profile 注入（copyrightText）→ 本地兜底，保留在用例内（AppFooter.uvue 的注入锚点字段名不变量）。
// 有意偏差（已声明）：①主题暗→亮——旧端浅底文字用 --color-primary-50（金 50%），白底≈1.3:1，
// 新端取 colorTextSecondary（CR 🟡3 同口径）；②font-noto-serif/harmony 全局类未定义（仅引用）。
withDefaults(defineProps<{ mainLine?: string; supportLine?: string }>(), { mainLine: "", supportLine: "" });
</script>

<template>
  <view class="app-footer">
    <text class="footer-main">{{ mainLine }}</text>
    <text class="footer-support">{{ supportLine }}</text>
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
.footer-support {
  margin-top: 8rpx;
  font-size: 14rpx; /* 旧 --font-size-caption=14rpx（App.uvue:132，CR 🟡3） */
  color: $color-text-secondary;
}
</style>
