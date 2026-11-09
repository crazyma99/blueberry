<script setup lang="ts">
// 门面：options 用业务平面结构 {label,value}（级联时可带 children）；confirm 只回传纯值数组，不透传 Wot 内部对象。
//
// ⭐实现（2026-11 真机批次 1 重做，主人 trial-m2b 反馈：风格不一致 / 确认不生效 / 被 sheet 压住 / 需级联）：
//  · 微信等非抖音端：**BasePopup（底部弹层，层级/根传送/隐藏 Tab 栏由它承担）＋ 门面自绘工具栏（取消/标题/确定）＋ wd-picker-view（滚轮）**。
//    不再用整个 wd-picker：它的确认事件载荷是对象 `{value, selectedItems}`（wd-picker.vue handleConfirm），旧门面按数组解包 ⇒ 永远回传 []（确认不生效的根因）；
//    它还不向内部 wd-popup 透传样式/变量，无法做深色金色主题。改用 wd-picker-view 后，选中值直接经其 expose 的
//    getSelectedValues()/getSelectedLabels() 读取（wd-picker-view.vue 末尾 defineExpose），载荷形状在 tests/unit/wot-contract-guard.spec.ts 里被源码级守卫。
//  · 级联：cascade + 树形 options（节点 children）；**树形判定要求首项含 children 键**（wd-picker-view/useSelection.resetColumns）。
//    modelValue/confirm 值均为「每列一个值」的路径数组（如 [一级id, 二级id]）；空值时门面补全默认路径（wot 对空值只铺第一列）。
//  · 层级：默认 z-index 2100 ＞ 业务 sheet 2000 ＞ BasePopup 默认 1001 ＞ CustomNavBar 998（wd-picker 默认仅 15）。
//  · 抖音端：自绘底部面板（纯 view+fixed，不经 wot 组件链），同合同；级联用左右两列（一级/二级）。
//  对外合同：confirm(values, labels)——第二个参数（label 路径）可选，旧调用方只收第一个参数不受影响；cancel/clear/update:show 语义不变。
import { computed, ref, watch } from "vue";
import { isToutiaoPlatform } from "./ui-platform";
import { hapticTap } from "../application/haptics";
import BasePopup from "./BasePopup.vue";
import { PICKER_VIEW_THEME_STYLE, PICKER_Z_INDEX, childrenOfValue, completeCascadePath, labelsOfPath, type PickerOption } from "./picker-util";

const props = withDefaults(
  defineProps<{
    show?: boolean;
    title?: string;
    options?: PickerOption[];
    modelValue?: (string | number)[];
    clearable?: boolean;
    rootPortal?: boolean;
    /** 级联模式：options 为树形（children），confirm 值为路径数组 */
    cascade?: boolean;
    /** 弹层层级（默认 2100，见文件头层级约定） */
    zIndex?: number;
  }>(),
  { show: false, title: "", options: () => [], modelValue: () => [], clearable: false, rootPortal: true, cascade: false, zIndex: PICKER_Z_INDEX },
);

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "confirm", value: (string | number)[], labels: string[]): void;
  (e: "cancel"): void;
  (e: "clear"): void;
  (e: "update:modelValue", value: (string | number)[]): void;
}>();

interface PickerViewExpose {
  getSelectedValues: () => (string | number)[];
  getSelectedLabels: () => string[];
}

/** 级联首项必须带 children 键（wot 以此判定树形）；传给 wot 的是深拷贝（wot 会就地修补选项对象） */
const columns = computed<PickerOption[]>(() => {
  const list: PickerOption[] = JSON.parse(JSON.stringify(props.options));
  if (props.cascade) for (const o of list) if (o.children === undefined) o.children = [];
  return list;
});

function emitClose() {
  emit("update:show", false);
}
function onCancel() {
  hapticTap(); // 弹层内交互：触感统一（主人 2026-09-23）
  emit("cancel");
  emitClose();
}
/** BasePopup 的遮罩点击/返回键：已由 BasePopup 回写 update:show，这里只补发 cancel（单一出口去重在 BasePopup） */
function onPopupCancel() {
  emit("cancel");
  emitClose();
}
function onClear() {
  hapticTap(); // 弹层内交互：触感统一（主人 2026-09-23）
  emit("clear");
  emit("update:modelValue", []);
}

// 运行时平台分支（抖音自绘；测试可经 setUiPlatformOverride 显式覆盖两条分支）
const useNative = isToutiaoPlatform();

// 抖音自绘分支的选中草稿：打开时从受控值出发，确认才提交（与「选中→确认」语义一致）。⚠️ 须在下面带 immediate 的 watch 之前声明（TDZ）
const draft = ref<(string | number)[]>([]);

// ───────── 非抖音端：wd-picker-view ─────────
const viewRef = ref<PickerViewExpose | null>(null);
const pickerValue = ref<(string | number)[]>([]);
const picking = ref(false);
let pendingConfirm = false;

function initialValue(): (string | number)[] {
  return props.cascade ? completeCascadePath(props.options, props.modelValue) : [...props.modelValue];
}
watch(
  () => props.show,
  (visible) => {
    if (!visible) return;
    picking.value = false;
    pendingConfirm = false;
    if (useNative) draft.value = initialValue();
    else pickerValue.value = initialValue();
  },
  { immediate: true },
);

function doConfirm(values: (string | number)[], labels: string[]) {
  emit("confirm", values, labels);
  emitClose();
}
function onConfirm() {
  hapticTap(); // 弹层内交互：触感统一（主人 2026-09-23）
  // 滚轮还在滚动：先挂起，等 pickend 再确认，避免读到未更新的值（同 wd-picker.onConfirm 的做法）
  if (picking.value) {
    pendingConfirm = true;
    return;
  }
  const v = viewRef.value;
  const values = v != null ? v.getSelectedValues() : pickerValue.value;
  const labels = v != null ? v.getSelectedLabels() : labelsOfPath(props.options, values);
  doConfirm([...values], [...labels]);
}
function onPickStart() {
  picking.value = true;
}
function onPickEnd() {
  picking.value = false;
  if (pendingConfirm) {
    pendingConfirm = false;
    onConfirm();
  }
}

// ───────── 抖音自绘分支 ─────────
function onSelect(level: number, value: string | number) {
  hapticTap(); // 弹层内交互：触感统一（主人 2026-09-23）
  if (!props.cascade) {
    draft.value = [value];
    return;
  }
  // 级联：改一级 ⇒ 二级重置为该一级的第一个孩子；改二级 ⇒ 只替换第二项
  draft.value = level === 0 ? completeCascadePath(props.options, [value]) : [draft.value[0] ?? props.options[0]?.value, value].filter((x): x is string | number => x !== undefined);
}
function onNativeConfirm() {
  hapticTap(); // 弹层内交互：触感统一（主人 2026-09-23）
  const values = [...draft.value];
  doConfirm(values, labelsOfPath(props.options, values));
}
const nativeLeft = computed(() => props.options);
const nativeRight = computed(() => (props.cascade ? childrenOfValue(props.options, draft.value[0]) : []));
</script>

<template>
  <view class="base-picker">
    <BasePopup v-if="!useNative" :show="show" position="bottom" :z-index="zIndex" :root-portal="rootPortal" @cancel="onPopupCancel">
      <view class="base-picker-sheet">
        <view class="base-picker-sheet__bar">
          <view class="base-picker-sheet__btn" hover-class="press-dim" @click="onCancel"><text class="base-picker-sheet__btn-text">取消</text></view>
          <text class="base-picker-sheet__title">{{ title }}</text>
          <view class="base-picker-sheet__btn" hover-class="press-dim" @click="onConfirm"><text class="base-picker-sheet__btn-text base-picker-sheet__btn-text--ok">确定</text></view>
        </view>
        <wd-picker-view
          ref="viewRef"
          v-model="pickerValue"
          :columns="columns"
          :cascade="cascade"
          :custom-style="PICKER_VIEW_THEME_STYLE"
          @pickstart="onPickStart"
          @pickend="onPickEnd"
        />
      </view>
    </BasePopup>
    <view v-else-if="show" class="base-picker-native" :style="{ zIndex }">
      <view class="base-picker-native__mask" @click="onCancel" />
      <view class="base-picker-native__panel">
        <view class="base-picker-native__bar">
          <text class="base-picker-native__btn" @click="onCancel">取消</text>
          <text class="base-picker-native__title">{{ title }}</text>
          <text class="base-picker-native__btn base-picker-native__btn--ok" @click="onNativeConfirm">确定</text>
        </view>
        <view class="base-picker-native__cols">
          <scroll-view scroll-y class="base-picker-native__list">
            <view
              v-for="opt in nativeLeft"
              :key="String(opt.value)"
              class="base-picker-native__item"
              :class="{ 'base-picker-native__item--active': draft.includes(opt.value) }"
              hover-class="press-dim"
              @click="onSelect(0, opt.value)"
            >
              <text>{{ opt.label }}</text>
            </view>
          </scroll-view>
          <scroll-view v-if="cascade" scroll-y class="base-picker-native__list base-picker-native__list--right">
            <view
              v-for="opt in nativeRight"
              :key="String(opt.value)"
              class="base-picker-native__item base-picker-native__item--sub"
              :class="{ 'base-picker-native__item--active': draft[1] === opt.value }"
              hover-class="press-dim"
              @click="onSelect(1, opt.value)"
            >
              <text>{{ opt.label }}</text>
            </view>
          </scroll-view>
        </view>
      </view>
    </view>
    <view
      v-if="clearable && modelValue.length > 0"
      class="base-picker__clear"
      hover-class="press-dim"
      @click="onClear"
    >
      清空
    </view>
  </view>
</template>

<style lang="scss" scoped>
/* 非抖音端：底部卡片（面色/圆角/安全区同 QualityRejectSheet、LoginPopup 等：BasePopup 把 wot 弹层面置透明，内容自带面） */
.base-picker-sheet {
  box-sizing: border-box;
  width: 100%;
  background: $color-popup-card;
  border-radius: #{$popup-radius-rpx * 2}rpx #{$popup-radius-rpx * 2}rpx 0 0;
  overflow: hidden;
  padding-bottom: 0;
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}
.base-picker-sheet__bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: $size-hit-area;
  padding: 0 $space-sm;
  border-bottom: 1rpx solid $color-divider;
}
.base-picker-sheet__btn {
  min-width: 120rpx;
  height: $size-hit-area;
  display: flex;
  align-items: center;
  justify-content: center;
}
.base-picker-sheet__btn-text {
  font-size: $font-size-body;
  color: $color-text-secondary;
}
.base-picker-sheet__btn-text--ok {
  color: $color-action;
  font-weight: 600;
}
.base-picker-sheet__title {
  flex: 1;
  text-align: center;
  font-size: $font-size-sub-title;
  color: $color-text-strong;
}

/* 抖音自绘分支：页面级节点 + fixed 底部面板，不经 wd-popup/wd-picker 组件链 */
.base-picker-native {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  animation: base-picker-fade-in $duration-modal ease;
}
.base-picker-native__mask {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.5);
}
.base-picker-native__panel {
  position: relative;
  background: $color-popup-card;
  border-radius: #{$popup-radius-rpx * 2}rpx
    #{$popup-radius-rpx * 2}rpx
    0 0;
  padding-bottom: $size-tab-bar-avoid;
}
.base-picker-native__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: $size-hit-area;
  padding: 0 $space-md;
  border-bottom: 1rpx solid $color-divider;
}
.base-picker-native__btn {
  font-size: $font-size-body;
  color: $color-text-secondary;
}
.base-picker-native__btn--ok {
  /* 此前误用 $color-action-text（墨色）⇒ 深色面板上「确定」不可见；与微信分支统一为金色 */
  color: $color-action;
  font-weight: 600;
}
.base-picker-native__title {
  font-size: $font-size-sub-title;
  color: $color-text-strong;
}
.base-picker-native__cols {
  display: flex;
  flex-direction: row;
}
.base-picker-native__list {
  flex: 1;
  max-height: 480rpx;
}
.base-picker-native__list--right {
  border-left: 1rpx solid $color-divider;
}
.base-picker-native__item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: $size-hit-area;
  font-size: $font-size-body;
  color: $color-text-primary;
}
.base-picker-native__item--active {
  color: $color-action;
  background: rgba(241, 205, 145, 0.14);
}
@keyframes base-picker-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
