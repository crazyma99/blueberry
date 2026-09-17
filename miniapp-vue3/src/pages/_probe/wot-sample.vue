<script setup lang="ts">
// Wot 资格样页（P1-25）：Button/Input/Popup/Picker/Toast/Dialog/Cell＋图片失败态＋长标题。
// 仅用于工具链/真机资格验证，不进入最终生产包（P0-08 口径）。
// 方案 A（migration §8.12）：对话框改 useDialog() 函数式驱动——wd-dialog 2.3.2 无任何 emit、
// 不消费业务 props（仅 selector/root-portal/custom-class），v-model/content/@confirm/@cancel 均不存在；
// 页面只挂载 <wd-dialog root-portal :show-close="true" /> 纯挂载点，actions 为作用域插槽
// （形参 confirm/cancel/close，wd-dialog.vue:56）。
import { ref } from "vue";
import BaseButton from "../../ui/BaseButton.vue";
import BaseField from "../../ui/BaseField.vue";
import BasePopup from "../../ui/BasePopup.vue";
import BasePicker from "../../ui/BasePicker.vue";
import BaseFeedback from "../../ui/BaseFeedback.vue";
import { useDialog } from "../../ui/wot-composables";
import { formatAlbumTitle } from "../../domain/album-title";
import { tokens } from "../../generated/tokens";

const phone = ref("");
const popupShow = ref(false);
const pickerShow = ref(false);
const picked = ref<(string | number)[]>([]);
const dialogResult = ref("（未操作）");
const feedback = ref<InstanceType<typeof BaseFeedback> | null>(null);
const busy = ref(false);

// 与页面挂载点 <wd-dialog /> 同页 provide/inject 配对（wd-dialog/index.ts:34 useDialog）
const dialog = useDialog();

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

// 函数式对话框：confirm 路径 resolve；cancel/modal/close 路径 reject（wd-dialog/index.ts:124-137）
async function openDialog() {
  try {
    await dialog.confirm({
      title: "确认操作",
      msg: "这是对话框内容",
      showClose: true,
    });
    dialogResult.value = "已确认";
  } catch (err) {
    dialogResult.value = "已取消/关闭";
  }
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
      <!-- 纯挂载点：状态由 useDialog() provide 驱动；自定义关闭按钮走 #actions 作用域插槽 -->
      <wd-dialog root-portal :show-close="true">
        <template #actions="{ confirm, cancel }">
          <view class="probe-dialog-actions">
            <view class="probe-dialog-btn" @click="cancel()">取消</view>
            <view class="probe-dialog-btn probe-dialog-btn--ok" @click="confirm()">确定</view>
          </view>
        </template>
      </wd-dialog>
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
.probe-dialog-actions {
  display: flex;
  gap: 16rpx;
}
.probe-dialog-btn {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: v-bind("tokens.component.popupRadiusRpx + 'rpx'");
  background: v-bind("tokens.semantic.colorDivider");
  color: v-bind("tokens.semantic.colorTextPrimary");
  font-size: v-bind("tokens.semantic.fontSizeBody");
}
.probe-dialog-btn--ok {
  background: v-bind("tokens.semantic.colorAction");
  color: v-bind("tokens.semantic.colorActionText");
}
</style>
