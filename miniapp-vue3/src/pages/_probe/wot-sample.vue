<script setup lang="ts">
// Wot 资格样页（P1-25）：Button/Input/Popup/Picker/Toast/Dialog/Cell＋图片失败态＋长标题。
// 仅用于工具链/真机资格验证，不进入最终生产包（P0-08 口径）。
// 方案 A 收尾（migration §8.13）：对话框改 BaseDialog 双平台门面（抖音自绘／非抖音 useDialog），
// 根因＝wd-dialog 内部包裹 wd-popup（wd-dialog.vue:1-12），按钮在抖音失效 fixed 链内；
// 对外合同 confirm(options): Promise<confirm|cancel>，两平台一致。
import { ref } from "vue";
import BaseButton from "../../ui/BaseButton.vue";
import BaseField from "../../ui/BaseField.vue";
import BasePopup from "../../ui/BasePopup.vue";
import BasePicker from "../../ui/BasePicker.vue";
import BaseFeedback from "../../ui/BaseFeedback.vue";
import BaseDialog from "../../ui/BaseDialog.vue";
import { formatAlbumTitle } from "../../domain/album-title";
import { tokens } from "../../generated/tokens";

const phone = ref("");
const popupShow = ref(false);
const pickerShow = ref(false);
const picked = ref<(string | number)[]>([]);
const dialogResult = ref("（未操作）");
const feedback = ref<InstanceType<typeof BaseFeedback> | null>(null);
const busy = ref(false);

const dialogRef = ref<InstanceType<typeof BaseDialog> | null>(null);

// 长标题（8 码点，含 emoji）→ 码点截断展示
const longTitle = formatAlbumTitle("😀红河水乡旗袍汉服民族服客片合集第八季");

const shopOptions = [
  { label: "红河水乡店", value: 1 },
  { label: "昆明店", value: 2 },
];

function onSubmit() {
  busy.value = true;
  setTimeout(() => {
    busy.value = false;
    feedback.value?.show("提交成功", "success");
  }, 800);
}

function onImageError() {
  feedback.value?.show("图片加载失败", "error");
}

// BaseDialog 门面（方案A收尾）：抖音自绘／非抖音 useDialog，合同统一 confirm(): Promise<confirm|cancel>
async function openDialog() {
  const r = await dialogRef.value?.confirm({ title: "确认操作", msg: "这是对话框内容", showCancel: true });
  dialogResult.value = r === "confirm" ? "已确认" : "已取消/关闭";
}
</script>

<template>
  <view class="probe-page">
    <view class="probe-section">
      <text class="probe-title">Button（禁用/忙态/块状/圆角）</text>
      <view class="probe-row">
        <BaseButton label="提交" @click="onSubmit" />
        <BaseButton label="提交中" :busy="busy" />
        <BaseButton label="禁用" disabled />
      </view>
      <BaseButton label="块状圆角按钮" block round />
    </view>

    <view class="probe-section">
      <text class="probe-title">Field（v-model/清空）</text>
      <BaseField v-model="phone" label="手机号" placeholder="请输入手机号" clearable />
      <text class="probe-value">值：{{ phone || "（空）" }}</text>
    </view>

    <view class="probe-section">
      <text class="probe-title">Popup / Picker</text>
      <view class="probe-row">
        <BaseButton label="打开弹层" @click="popupShow = true" />
        <BaseButton label="打开选择器" @click="pickerShow = true" />
      </view>
      <BasePopup v-model:show="popupShow" title="弹层标题" closable>
        <view class="probe-popup-body"><text>弹层内容（取消走统一 cancel 出口）</text></view>
      </BasePopup>
      <BasePicker
        v-model:show="pickerShow"
        v-model="picked"
        title="选择门店"
        :options="shopOptions"
        clearable
        @confirm="(v) => feedback?.show('选中 ' + v.join(','))"
        @clear="feedback?.show('已清空')"
      />
      <text class="probe-value">选中：{{ picked.join(",") || "（空）" }}</text>
    </view>

    <view class="probe-section">
      <text class="probe-title">Toast / Dialog / Cell</text>
      <view class="probe-row">
        <BaseButton label="轻提示" @click="feedback?.show('轻提示文案', 'success')" />
        <BaseButton label="对话框" @click="openDialog" />
      </view>
      <wd-cell title="单元格标题" value="右侧内容" border />
      <text class="probe-value">对话框结果：{{ dialogResult }}</text>
      <BaseDialog ref="dialogRef" />
    </view>

    <view class="probe-section">
      <text class="probe-title">图片失败态 ＋ 长标题（码点截断）</text>
      <image class="probe-img" src="/static/logo-missing.png" mode="aspectFill" @error="onImageError" />
      <text class="probe-longtitle">{{ longTitle }}</text>
    </view>

    <view class="probe-section">
      <text class="probe-title">Token 映射（generate-tokens 产物）</text>
      <view class="probe-token-chip" :style="{ background: tokens.semantic.colorAction, color: tokens.semantic.colorActionText }">
        <text>colorAction={{ tokens.semantic.colorAction }}</text>
      </view>
    </view>

    <BaseFeedback ref="feedback" />
  </view>
</template>

<style lang="scss" scoped>
.probe-page {
  padding: 24rpx;
  background: $color-page;
}
.probe-section {
  margin-bottom: 32rpx;
}
.probe-title {
  font-size: 26rpx;
  color: $color-text-muted;
  margin-bottom: 16rpx;
  display: block;
}
.probe-row {
  display: flex;
  gap: 16rpx;
  flex-wrap: wrap;
  margin-bottom: 16rpx;
}
.probe-value {
  font-size: 26rpx;
  color: $color-text-secondary;
}
.probe-popup-body {
  padding: 48rpx;
}
.probe-img {
  width: 200rpx;
  height: 200rpx;
  background: $color-divider;
}
.probe-longtitle {
  display: block;
  margin-top: 16rpx;
  font-size: $font-size-body;
  color: $color-text-primary;
}
.probe-token-chip {
  display: inline-block;
  padding: 16rpx 24rpx;
  border-radius: #{$popup-radius-rpx}rpx;
  font-size: 26rpx;
}
.probe-dialog-actions {
  display: flex;
  gap: 16rpx;
}
.probe-dialog-btn {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: #{$popup-radius-rpx}rpx;
  background: $color-divider;
  color: $color-text-primary;
  font-size: $font-size-body;
}
.probe-dialog-btn--ok {
  background: $color-action;
  color: $color-action-text;
}
</style>
