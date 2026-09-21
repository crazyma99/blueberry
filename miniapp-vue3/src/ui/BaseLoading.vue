<script setup lang="ts">
// 门面（P1-24 体例）：加载指示器——**业务视图不得直接使用 `wd-*`**（plan §26/§229：只允许 `ui/` 门面与样页直用 Wot）。
// 事实源：`@wot-ui/ui@2.3.2` `wd-loading`（node_modules/@wot-ui/ui/components/wd-loading/types.ts）——
//   props ＝ type(circular|spinner|dots|wave)／direction(horizontal|vertical)／color／size／text／inheritColor；
//   color 经组件 rootStyle 落根节点 `style.color`，spinner 与文字均取 `currentColor` ⇒ 一处传色两端生效（不依赖页面侧 CSS 变量）。
// 默认值走 **design token 单源**（`src/generated/tokens.ts`，手改源 `tokens/source.json`）：
//   颜色＝语义层 `colorAction`（＝primitive.gold #F1CD91）；尺寸＝组件层 `pullRefreshLoadingSizeRpx`（48rpx，2026-09-21 新增）。
// size 透传口径：wot `addUnit` 只对「纯数字」补 px，字符串（含 `48rpx`）原样透传（node_modules/@wot-ui/ui/common/util.ts:24-26）。
import { tokens } from "../generated/tokens";

withDefaults(
  defineProps<{
    /** 指示器文案（空串＝只出 spinner；文字颜色随 color＝currentColor） */
    text?: string;
    type?: "circular" | "spinner" | "dots" | "wave";
    direction?: "horizontal" | "vertical";
    /** 尺寸：rpx 字符串或 px 数字 */
    size?: string | number;
    /** 颜色：默认品牌金 token */
    color?: string;
    inheritColor?: boolean;
  }>(),
  {
    text: "",
    type: "circular",
    direction: "horizontal",
    size: tokens.component.pullRefreshLoadingSizeRpx + "rpx",
    color: tokens.semantic.colorAction,
    inheritColor: false,
  },
);
</script>

<template>
  <wd-loading
    :type="type"
    :direction="direction"
    :size="size"
    :color="color"
    :text="text"
    :inherit-color="inheritColor"
  />
</template>
