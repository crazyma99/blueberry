<script setup lang="ts">
// Wot 资格样页（P1-25）：Button/Input/Popup/Picker/Toast/Dialog/Cell＋图片失败态＋长标题。
// 仅用于工具链/真机资格验证，不进入最终生产包（P1-08 口径）。
import { ref } from "vue";
import BaseButton from "../../ui/BaseButton.vue";
import BaseField from "../../ui/BaseField.vue";
import BasePopup from "../../ui/BasePopup.vue";
import BasePicker from "../../ui/BasePicker.vue";
import BaseFeedback from "../../ui/BaseFeedback.vue";
import { formatAlbumTitle } from "../../domain/album-title";
import { tokens } from "../../generated/tokens";

const phone = ref("");
const popupShow = ref(false);
const pickerShow = ref(false);
const picked = ref<(string | number)[]>([]);
const dialogShow = ref(false);
const feedback = ref<InstanceType<typeof BaseFeedback> | null>(null);
const busy = ref(false);

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
        <BaseButton label="对话框" @click="dialogShow = true" />
      </view>
      <wd-cell title="单元格标题" value="右侧内容" border />
      <wd-dialog v-model="dialogShow" title="确认操作" content="这是对话框内容" @confirm="dialogShow = false" @cancel="dialogShow = false" />
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

<style scoped>
.probe-page {
  padding: 24rpx;
  background: v-bind("tokens.semantic.colorPage");
}
.probe-section {
  margin-bottom: 32rpx;
}
.probe-title {
  font-size: 26rpx;
  color: v-bind("tokens.semantic.colorTextMuted");
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
  color: v-bind("tokens.semantic.colorTextSecondary");
}
.probe-popup-body {
  padding: 48rpx;
}
.probe-img {
  width: 200rpx;
  height: 200rpx;
  background: v-bind("tokens.semantic.colorDivider");
}
.probe-longtitle {
  display: block;
  margin-top: 16rpx;
  font-size: v-bind("tokens.semantic.fontSizeBody");
  color: v-bind("tokens.semantic.colorTextPrimary");
}
.probe-token-chip {
  display: inline-block;
  padding: 16rpx 24rpx;
  border-radius: v-bind("tokens.component.popupRadiusRpx + 'rpx'");
  font-size: 26rpx;
}
</style>
