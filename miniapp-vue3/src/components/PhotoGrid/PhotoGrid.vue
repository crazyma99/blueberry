<script setup lang="ts">
// 店铺/客片网格（旧端 PhotoGrid.uvue 忠实移植，P2-13 布局基线）：
// flex-wrap gap 8rpx；单店整行铺满；多店每行 2 个；奇数(>1)补「敬请期待」占位卡（不可点）；
// 空列表回退 2 张 demo 图；点击经事件透传（页面跳转目标不同）。
// 派生色：--color-primary-50/-70 为金色 50%/70% 透明度派生（gold=rgb(241,205,145)）；
// --radius-card 旧值未盘点，按现有 token popupRadiusRpx 映射（视觉差异待 P2-13 样页核对）。
import { computed } from "vue";
export interface PhotoGridShop {
  id?: number;
  homeImage?: string;
  displayName?: string;
  displayNameEn?: string;
}

const props = defineProps<{
  shopList: PhotoGridShop[];
}>();

const emit = defineEmits<{
  (e: "shop-click", shop: PhotoGridShop): void;
  (e: "demo-click", idx: number): void;
}>();

// 占位卡开关：JS 预计算，避免真机模板表达式求值差异（旧端注释保留）
const showPlaceholder = computed(() => {
  const n = props.shopList != null ? props.shopList.length : 0;
  return n > 1 && n % 2 === 1;
});
</script>

<template>
  <view class="demoPhotoContaner">
    <view
      v-for="(shop, index) in shopList"
      :key="index"
      :class="shopList.length === 1 ? 'shopCard full-width' : 'shopCard'"
      @click="emit('shop-click', shop)"
    >
      <!-- 2026-09-17 性能偏差（见 deviations #12）：旧端此处无 lazy-load，但首页会一次性渲染全部店铺封面，
           模拟器/低端机首屏易卡顿 ⇒ 追加 lazy-load（仅改变**加载时机**，不影响布局、尺寸与交互） -->
      <image
        :class="shopList.length === 1 ? 'demoPhoto full-width' : 'demoPhoto'"
        :src="shop.homeImage"
        mode="aspectFill"
        lazy-load
      />
      <view class="shopName">
        <view class="font-noto-serif">{{ shop.displayName }}</view>
        <view class="enName">{{ shop.displayNameEn }}</view>
      </view>
    </view>
    <view v-if="showPlaceholder" class="shopCard shopCard-placeholder">
      <view class="placeholderContent">
        <view class="placeholderTitle font-noto-serif">敬请期待</view>
        <view class="placeholderSub">COMING SOON</view>
      </view>
    </view>
    <view v-if="shopList.length === 0" class="shopCard" @click="emit('demo-click', 1)">
      <image class="demoPhoto" src="/static/demo1.png" mode="aspectFill" />
    </view>
    <view v-if="shopList.length === 0" class="shopCard" @click="emit('demo-click', 2)">
      <image class="demoPhoto" src="/static/demo2.png" mode="aspectFill" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.demoPhotoContaner {
  margin: 40rpx 0;
  padding: 0 8rpx;
  width: 100%;
  /* 旧端 uvue 默认 border-box；vue3 mp 端默认 content-box ⇒ width:100%+padding 会右溢 16rpx，
     右列店铺卡贴紧/溢出右屏边（2026-09-19 抖音价目表实测，微信同机制仅 4px 不易察觉） */
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8rpx;
}
.shopCard {
  position: relative;
  width: calc((100% - 8rpx) / 2);
  /* uvue 默认 border-box；vue3 mp 端须显式声明，否则占位卡 2rpx 描边外扩溢出换行（抖音实测） */
  box-sizing: border-box;
}
.full-width,
.shopCard.full-width {
  width: 100%;
}
.shopCard-placeholder {
  /* 宽度与 .shopCard 显式对齐：抖音端描边盒模型差异下不依赖选择器叠加 */
  width: calc((100% - 8rpx) / 2);
  box-sizing: border-box;
  height: 226rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx dashed rgba(243, 217, 172, 0.35);
  border-radius: #{$popup-radius-rpx}rpx;
  background: rgba(255, 255, 255, 0.02);
}
.shopCard-placeholder .placeholderContent {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.shopCard-placeholder .placeholderTitle {
  font-size: $font-size-title;
  font-weight: 400;
  color: rgba(241, 205, 145, 0.5);
  letter-spacing: 2rpx;
}
.shopCard-placeholder .placeholderSub {
  margin-top: 4rpx;
  font-size: 16rpx;
  color: rgba(241, 205, 145, 0.3);
  letter-spacing: 2rpx;
}
.demoPhoto {
  width: 100%;
  height: 226rpx;
}
.shopName {
  position: absolute;
  /* 旧端 uvue absolute 默认吸附父顶点；vue3 mp 端 top:auto 会落在静态位（图片之后）⇒ 蒙层/店名丢失，须显式 top/bottom */
  top: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: $font-size-title;
  color: $color-action;
  font-weight: 400;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3));
}
.shopName .enName {
  margin-top: 4rpx;
  font-size: 16rpx;
  font-weight: 400;
  color: rgba(241, 205, 145, 0.7);
  letter-spacing: 2rpx;
}
</style>
