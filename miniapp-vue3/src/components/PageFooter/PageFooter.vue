<script setup lang="ts">
// PageFooter：9 个页面重复的「页脚模板块 + 配套样式」收敛（纯去重重构，零行为变化）。
// 溯源（收敛前各页本地实现，行号为收敛时快照）：
//  · favorites :319-325 / aiTryOnHistory :220-225——page-footer > divide + copyright（亮页居中）
//  · priceList :169-173——divide + bottomdesc（无外层 page-footer 包裹，随文档流）
//  · demoDetail :293-298 / aiRecommendResult :325-328——page-footer > divide + bottomdesc
//  · aiRecommendLoading :481-487 / aiTryOnResult :923-930——page-footer（多 safe-area 底部内边距）> divide + bottomdesc
//  · index :249-253——page-footer > beian（无 divide）；priceHomePage :205-207——裸 beian（无包裹无 divide）
// 页间差异（全部以 props/变体保留，未为统一而改动任何一页渲染）：
//  ①内层文案包裹：亮页 .bottomdesc 与 .copyright 逐值一致（18rpx／400／居中，类名不同）；
//    深色 AI 页 .bottomdesc-dark（金色 50%、**无 text-align**）；tab 首页 .beian。
//    2026-09-19 主人指示：底部文案距底给 20px——四变体下边距由收敛时 32rpx 统一抬至 40rpx；
//    同日主人实测抖音仍贴底 tab ⇒ beian 下间距 margin 改 padding-bottom（小程序页面尾部 margin 被吞，见 .beian 注释）。
//  ②分隔线 .divide：index/priceHomePage 原本没有，其余 7 页逐值一致。
//    2026-09-19 主人指示：底部文案就绪前不渲染分隔线（客片列表 loading 时 divide 先于文案出现，
//    微信/抖音双端可见「loading 下方一条横线」）⇒ 以 mainLine/supportLine 任一行非空为闸
//    （loadFooter 兜底链＝override→OPS→Profile→默认，就绪后必非空）。
//  ③外层 .page-footer（margin-top:auto 吸底）：priceList/priceHomePage 原本无包裹；
//    aiRecommendLoading/aiTryOnResult 另有 padding-bottom: env(safe-area-inset-bottom)。
// ⚠️ virtualHost：宿主透明化——组件根节点直接作为页面 flex 子项参与布局，
//    .page-footer 的 margin-top:auto 吸底行为才与各页原本地 view 实现一致
//    （否则宿主 <page-footer> 节点才是 flex 子项，内层 margin-top:auto 不生效）。
import { computed } from "vue";
import AppFooter from "../AppFooter/AppFooter.vue";

defineOptions({
  options: { virtualHost: true },
});

const props = withDefaults(
  defineProps<{
    /** 版权主行（透传 AppFooter） */
    mainLine?: string;
    /** 技术支持行（透传 AppFooter） */
    supportLine?: string;
    /** 内层文案包裹变体（逐页原样式，见文件头溯源①） */
    variant?: "bottomdesc" | "copyright" | "bottomdesc-dark" | "beian";
    /** 是否渲染分隔线 .divide（index/priceHomePage 原本无分隔线，溯源②） */
    withDivide?: boolean;
    /** 是否带外层 .page-footer 包裹（priceList/priceHomePage 原本无包裹，溯源③） */
    wrapped?: boolean;
    /** 外层叠加 env(safe-area-inset-bottom)（aiRecommendLoading/aiTryOnResult，溯源③） */
    safeArea?: boolean;
  }>(),
  { mainLine: "", supportLine: "", variant: "bottomdesc", withDivide: true, wrapped: true, safeArea: false },
);

const rootClass = computed<string>(() => {
  if (!props.wrapped) return "";
  return props.safeArea ? "page-footer page-footer-safe" : "page-footer";
});

// 分隔线闸门（2026-09-19 主人指示）：底部文案就绪（任一行非空）才渲染 divide，loading 期不出横线
const hasText = computed(() => props.mainLine !== "" || props.supportLine !== "");
</script>

<template>
  <view :class="rootClass">
    <view v-if="withDivide && hasText" class="divide"></view>
    <view :class="variant">
      <AppFooter :main-line="mainLine" :support-line="supportLine" />
    </view>
  </view>
</template>

<style scoped>
/* 外层包裹（7 页原 .page-footer 逐值一致：margin-top auto） */
.page-footer {
  margin-top: auto;
}
/* 外层变体（aiRecommendLoading/aiTryOnResult 原 .page-footer 附加安全区内边距——
   aiTryOnResult CR 🟡：按钮改文档流后，底部仍需避让手机 Home Indicator，原固定条自带 safe-area） */
.page-footer-safe {
  padding-bottom: env(safe-area-inset-bottom);
}
/* 分隔线（7 页原 .divide 逐值一致） */
.divide {
  height: 2rpx;
  width: 100%;
  background: rgba(255, 255, 255, 0.15);
}
/* 文案包裹·亮页（priceList/demoDetail 原 .bottomdesc；AppFooter 主行字号继承自此包裹类） */
/* 2026-09-19 主人指示：底部文案距底（底 tab/屏底）给 20px——四变体下边距统一 32rpx→40rpx(=20px) */
.bottomdesc {
  margin: 32rpx auto 40rpx;
  font-size: 18rpx; /* 旧 --font-size-caption-md=18rpx */
  font-weight: 400;
  text-align: center;
}
/* 文案包裹·亮页（favorites/aiTryOnHistory 原 .copyright——与 .bottomdesc 逐值一致，仅类名不同，按忠实优先保留） */
.copyright {
  margin: 32rpx auto 40rpx;
  font-size: 18rpx;
  font-weight: 400;
  text-align: center;
}
/* 文案包裹·深色 AI 页（aiRecommendResult/aiRecommendLoading/aiTryOnResult 原 .bottomdesc：金色 50%、无 text-align） */
.bottomdesc-dark {
  margin: 32rpx auto 40rpx;
  font-size: 18rpx;
  color: rgba(241, 205, 145, 0.5); /* 旧 --color-primary-50 */
  font-weight: 400;
}
/* 文案包裹·tab 首页（index/priceHomePage 原 .beian：上 40rpx 下 40rpx）
   2026-09-19 主人实测：抖音端页面尾部 margin 被吞（小程序页面滚动高度不计最后一个元素的 margin-bottom，
   #17 把下边距抬到 40rpx 仍贴底 tab）⇒ 下间距改 padding-bottom（计入盒高、必计入页面高度）；
   微信端视觉不变（.beian 无背景，padding 与 margin 等价，其后 tabbar-safe-spacer 衔接不变） */
.beian {
  margin: 40rpx auto 0;
  padding-bottom: 40rpx;
  font-size: 18rpx;
  font-weight: 400;
  text-align: center;
}
</style>
