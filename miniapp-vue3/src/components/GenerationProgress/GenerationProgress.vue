<script setup lang="ts">
import BaseCircle from "../../ui/BaseCircle.vue"; // 门面：环形进度（wot wd-circle；业务组件零 wd-* 直用）
// GenerationProgress — 生成等待横向步骤条（组件级重构）
// 旧端源：/home/majunhi/blueberry/src/components/GenerationProgress/GenerationProgress.uvue（192 行）
// 忠实移植：模板 :2-36（横向步骤条 :4-33 ＋ 进度数字 :35）；props :42-62；样式 :67-192 逐值。
// 契约（与旧端同名同义）：
//   steps: string[]       各步骤当前展示文案（父级已按状态算好：已完成＝完毕文案、其余＝进行中文案）
//   iconPaths: string[]   各步骤节点图标（静态 SVG 路径；**已完成节点统一显示白勾**，见 :19）
//   activeIndex: number   当前进行中的步骤下标（0 起）
//   percent: number       伪进度百分比（0-100；父级封顶 99，完成时置 100）
// 纯展示组件：无请求、无 uni/wx 调用、无 emit（父级单向驱动）。
//
// token 映射（旧 App.uvue 全局变量 → 新端 tokens / 字面值）：
//   --color-primary #F1CD91 → tokens.semantic.colorAction（新端金色语义 token；本文件用字面值并注明）
//   --color-primary-deep #B28A56 / --color-surface #1D1105 / --color-bg #160F04 → 按旧值字面值（新端无对应深色 token）
//   --color-primary-70 → rgba(241, 205, 145, 0.7)（派生透明度：新端仅有实色 gold，故写 rgba 字面值）
//   --gradient-btn-primary → linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%)（App.uvue:92 同值）
//   --font-size-body-sm 22rpx → 硬编码 22rpx（**勿映射 fontSizeBody=32rpx**，档位不同）
//   --spacing-2xs 6rpx / --spacing-24 24rpx → 硬编码（旧 App.uvue:112/:116）
withDefaults(
  defineProps<{
    steps?: string[];
    iconPaths?: string[];
    activeIndex?: number;
    percent?: number;
  }>(),
  { steps: () => [], iconPaths: () => [], activeIndex: 0, percent: 0 },
);
</script>

<template>
  <view class="gp">
    <!-- 横向步骤条（2026-09-14 主人定稿：圆形节点 + 语义图标 + 连线只画在节点之间，图标一律 IconPark） -->
    <view class="gp-steps">
      <view v-for="(s, i) in steps" :key="i" class="gp-step">
        <!-- 连线轨道：高度＝节点直径，线在轨道内 flex 垂直居中 ⇒ 严格与圆心同一水平线；
             水平方向左右各让出「节点半径 + 间距」，即只画在两个节点之间；末节点不画 -->
        <view v-if="i < steps.length - 1" class="gp-rail">
          <view
            class="gp-line"
            :class="i < activeIndex - 1 ? 'gp-line-done' : i === activeIndex - 1 ? 'gp-line-half' : 'gp-line-pending'"
          ></view>
        </view>
        <view
          class="gp-node"
          :class="i < activeIndex ? 'gp-node-done' : i === activeIndex ? 'gp-node-active' : 'gp-node-pending'"
        >
          <!-- 已完成：金底白勾（金色勾落在金圆上不可见，故单列 check-white 变体）；当前/未完成：该步语义图标 -->
          <image v-if="i < activeIndex" class="gp-check" src="/static/iconpark/check-white.svg" mode="aspectFit"></image>
          <image
            v-else
            class="gp-step-icon"
            :class="i === activeIndex ? 'gp-step-icon-active' : 'gp-step-icon-pending'"
            :src="iconPaths[i]"
            mode="aspectFit"
          ></image>
        </view>
        <text
          class="gp-label"
          :class="i < activeIndex ? 'gp-label-done' : i === activeIndex ? 'gp-label-active' : 'gp-label-pending'"
          >{{ s }}</text
        >
      </view>
    </view>
    <!-- 进度数字（主人指示：按参考图改版但保留进度数字；伪进度封顶 99%，任务完成时由父级置 100） -->
    <!-- 2026-09-23 主人：「进度文案没有动画」⇒ 环形进度（wot `wd-circle` 经门面 `BaseCircle`，token 绑定）
         ＋ 百分比文案每次变化重播入场动画（`:key="percent"` 强制重挂载） ⇒ 环形平滑 + 文案有动效 -->
    <view class="gp-progress">
      <BaseCircle :model-value="percent" :speed="60">
        <text :key="percent" class="gp-percent">{{ percent }}%</text>
      </BaseCircle>
    </view>
  </view>
</template>

<style scoped lang="scss">
/* 节点尺寸唯一来源：轨道高度、节点宽高均由它推导（改这里即可，连线两处常量需同步）。
   2026-09-19：原 CSS 变量 --gp-node-size 改 scss 编译期变量（抖音 TTSS 不支持 CSS 变量） */
$gp-node-size: 64rpx;
.gp {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: visible;
  margin: 6rpx 0 8rpx; /* 旧 var(--spacing-2xs)=6rpx + 8rpx */
}
/* 步骤条：四等分格子；上下各 24rpx 给当前节点的辉光绘制空间（辉光 blur 20rpx，实测绘制外扩约 18rpx） */
.gp-steps {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  overflow: visible;
  padding: 24rpx 0; /* 旧 var(--spacing-24)=24rpx */
}
.gp-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  overflow: visible;
}
/* 连线轨道：与节点等高的横条，靠 align-items:center 把线放在圆心高度（不再手算 top，杜绝不齐） */
.gp-rail {
  position: absolute;
  left: 50%;
  top: 0;
  width: 100%;
  height: $gp-node-size;
  display: flex;
  flex-direction: row;
  align-items: center;
}
.gp-line {
  height: 6rpx;
  /* 与 --gp-node-size 强耦合：38rpx = 节点半径 32rpx + 间距 6rpx；改节点尺寸必须同步改这两个常量 */
  margin-left: 38rpx;
  width: calc(100% - 76rpx);
  border-radius: 999rpx; /* 旧 var(--radius-full) */
}
.gp-line-done {
  /* 旧 var(--color-primary) → var(--color-primary-deep) */
  background: linear-gradient(to right, #f1cd91, #b28a56);
}
/* 进入当前节点的那一段：金 → 暗，与设计图一致 */
.gp-line-half {
  background: linear-gradient(to right, #b28a56 0%, rgba(255, 255, 255, 0.1) 100%);
}
.gp-line-pending {
  background: rgba(255, 255, 255, 0.1);
}
.gp-node {
  width: $gp-node-size;
  height: $gp-node-size;
  border-radius: 50%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
}
.gp-node-done {
  /* 旧 var(--gradient-btn-primary)（App.uvue:92 同值；tokens 无该渐变档） */
  background: linear-gradient(135deg, #ffdf9f 0%, #f1cd91 45%, #d9a75c 100%);
}
.gp-check {
  width: 32rpx;
  height: 32rpx;
}
/* 当前节点：暗底 + 金环 + 辉光（设计图同款）。
   辉光保持静态：不再叠加 transform 动画——transform 会生成合成层，
   部分机型/开发者工具会把 box-shadow 裁到元素矩形内，导致辉光被切 */
.gp-node-active {
  background: #160f04; /* 旧 var(--color-bg) */
  border: 4rpx solid #f1cd91; /* 旧 var(--color-primary) */
  /* 辉光：WXSS 无 color-mix，此处写死 --color-primary #F1CD91 的 rgba；改主色需同步 */
  box-shadow: 0 0 20rpx rgba(241, 205, 145, 0.55);
}
.gp-node-pending {
  /* 不透明底色：与页面底色区分，同时避免连线透出 */
  background: #1d1105; /* 旧 var(--color-surface) */
  border: 2rpx solid rgba(255, 255, 255, 0.12);
}
/* 节点内的语义图标（IconPark 金色 SVG）：当前步高亮、未到步骤压暗 */
.gp-step-icon {
  width: 34rpx;
  height: 34rpx;
}
.gp-step-icon-active {
  opacity: 1;
}
.gp-step-icon-pending {
  opacity: 0.32;
}
/* 步骤文案：预留两行高度，避免步骤「进行中 → 完毕」换文案时整块跳动 */
.gp-label {
  width: 100%;
  margin-top: 16rpx;
  padding: 0 6rpx; /* 旧 var(--spacing-2xs) */
  box-sizing: border-box;
  min-height: 62rpx;
  text-align: center;
  font-size: 22rpx; /* 旧 var(--font-size-body-sm)=22rpx */
  line-height: 1.35;
}
.gp-label-done {
  color: rgba(241, 205, 145, 0.7); /* 旧 var(--color-primary-70)，金色 70% 派生 */
}
.gp-label-active {
  color: #f1cd91; /* 旧 var(--color-primary) → tokens.semantic.colorAction */
  font-weight: 500;

  /* 2026-09-23 主人：当前步骤**文案**加动效（脉动），三段式步骤条结构不变（增量） */
  animation: gpLabelPulse 1.6s ease-in-out infinite;}
.gp-label-pending {
  color: rgba(255, 255, 255, 0.35);
}
.gp-progress {
  display: flex;
  justify-content: center;
  margin-top: 20rpx;
}
.gp-percent {
  font-size: 22rpx; /* 旧 var(--font-size-body-sm)=22rpx（token 无该档，保留并注释） */
  color: $color-action; /* token：品牌金 */
  animation: gpPercentIn 0.45s ease-out; /* 数值变化时重播（配合模板 :key） */
}
@keyframes gpPercentIn {
  from {
    transform: scale(0.86);
    opacity: 0.35;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
@keyframes gpLabelPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
</style>
