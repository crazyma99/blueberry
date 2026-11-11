<script setup lang="ts">
// 商家档期管理（issue #14 · M1）：档期列表（时间段/容量/状态 + 所选日期的「已占 X / 容量 Y」；响应无 bookedGuests 时**不显示已占**）+
// 新增（时间段 + 容量）+ 改容量 / 启停 + 套用档期模板（先 dryRun 预览，再确认真实套用）。
// 后端口径：容量 1..500；同商家同起止唯一；启用档期之间时间不得重叠（冲突文案原样展示）；PUT 仅 capacity/status；
// 改小容量或停用允许、不影响已有预约（确认框明示）。模板需 booking_slot_template 且需 booking_slot。
// 写操作串行化：任一变更进行中全部入口置灰；失败后刷新列表对齐服务端状态。
import { computed, ref } from "vue";
import { onLoad, onReachBottom, onShow } from "@dcloudio/uni-app";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import PageFooter from "../../components/PageFooter/PageFooter.vue";
import { useMerchantFooter } from "../composables/use-merchant-footer";
import PullRefreshIndicator from "../../components/PullRefreshIndicator/PullRefreshIndicator.vue";
import SkeletonBlock from "../../components/SkeletonBlock/SkeletonBlock.vue";
import { INPUT_PLACEHOLDER_STYLE } from "../../ui/field-theme";
import BaseDialog from "../../ui/BaseDialog.vue";
import BaseFeedback from "../../ui/BaseFeedback.vue";
import BasePicker from "../../ui/BasePicker.vue";
import BasePopup from "../../ui/BasePopup.vue";
import MerchantNeedLogin from "../components/MerchantNeedLogin.vue";
import { createPullRefresh } from "../../composables/use-pull-refresh";
import { toast as nativeToast } from "../../platform/uni/feedback";
import { hapticTap } from "../../application/haptics";
import { getMerchantRuntime } from "../application/merchant-runtime";
import { createMerchantSlotRepository } from "../infrastructure/merchant-slots";
import { createSlotUseCases, slotPageGates } from "../application/merchant-slot-flow";
import { guardedLoad, shouldShowSkeleton } from "../composables/load-guard";
import { SEGMENT_STEP, createSegmentLoader } from "../domain/merchant-segment";
import { sliceVisible } from "../domain/merchant-album";
import {
  SLOT_CAPACITY_MAX,
  SLOT_CAPACITY_MIN,
  SLOT_STATUS_DISABLED,
  SLOT_STATUS_ENABLED,
  buildSlotDateOptions,
  canConfirmApply,
  describeApplyDone,
  describeBooked,
  toDateStr,
  describeApplyPreview,
  describeSlotStatus,
  slotChangeConfirmCopy,
  buildSlotPatch,
  type MerchantSlotView,
  type SlotTemplateView,
} from "../domain/merchant-slot";
import type { MerchantProfile } from "../domain/merchant-auth";

const rt = getMerchantRuntime();
const footer = useMerchantFooter();
const uc = createSlotUseCases({ slots: createMerchantSlotRepository({ client: rt.client }) });

const feedbackRef = ref<InstanceType<typeof BaseFeedback> | null>(null);
const dialogRef = ref<InstanceType<typeof BaseDialog> | null>(null);
function toast(text: string): void {
  const f = feedbackRef.value;
  if (f != null) f.show(text);
  else nativeToast(text);
}

const loggedIn = ref(false);
const authExpired = ref(false);
const profile = ref<MerchantProfile | null>(null);
const gates = computed(() => slotPageGates(profile.value));
const slots = ref<MerchantSlotView[]>([]);
// 日期选择（默认今天）：选中日期带 `?date=` 请求，后端据此返回每个档期的 bookedGuests
const dateOptions = ref(buildSlotDateOptions());
const selectedDate = ref<string[]>([toDateStr(new Date())]);
const datePickerShow = ref(false);
const dateStr = computed(() => String(selectedDate.value[0] ?? ""));
const dateLabel = computed(() => dateOptions.value.find((o) => o.value === dateStr.value)?.label ?? dateStr.value);
function onDateConfirm(v: (string | number)[]): void {
  if (v.length === 0) return;
  selectedDate.value = [String(v[0])];
  void reload();
}
/** 是否已**尝试过**首次加载（成功/失败/超时/异常都置位）。⚠️ 任何「首屏骨架屏」都必须有失败/超时出口（issue #14 M1 真机缺陷） */
const attempted = ref(false);
/** 一次 reload 进行中 */
const loading = ref(false);
const showSkeleton = computed(() =>
  shouldShowSkeleton({ itemCount: slots.value.length, hasError: loadError.value !== null, loading: loading.value, attempted: attempted.value }),
);
const loadError = ref<string | null>(null);
/** 写操作进行中（响应式镜像 uc.isBusy，供模板置灰） */
const working = ref(false);
/** reload 代次：连续触发（onShow/下拉/写后刷新）时迟到的旧响应不得覆盖新结果 */
let reloadSeq = 0;
// 分段渲染（客户端）：触底自动加载 + 「显示更多」按钮兜底
const visibleCount = ref(SEGMENT_STEP);
const visible = computed(() => sliceVisible(slots.value, visibleCount.value));
const segment = createSegmentLoader({
  step: SEGMENT_STEP,
  getVisible: () => visibleCount.value,
  getTotal: () => slots.value.length,
  setVisible: (n) => {
    visibleCount.value = n;
  },
  isBlocked: () => loading.value || working.value || formShow.value || tplShow.value || needLogin.value || !gates.value.canManage,
});
function onLoadMore(): void {
  segment.loadMore(false);
}
onReachBottom(() => {
  segment.loadMore(true);
});

function refreshLoginState(): void {
  const s = rt.getState();
  loggedIn.value = s.loggedIn;
  profile.value = s.profile;
}
const needLogin = computed(() => !loggedIn.value || authExpired.value);

async function reload(): Promise<void> {
  refreshLoginState();
  if (!loggedIn.value || !gates.value.canManage) {
    attempted.value = true;
    return;
  }
  const mySeq = ++reloadSeq;
  loading.value = true;
  try {
    const g = await guardedLoad(() => uc.load(rt.nextContext(), dateStr.value)); // 抛异常/挂起一律收口
    if (mySeq !== reloadSeq) return; // 迟到响应：已被更新的一次 reload 取代（由取代者负责收口）
    if (!g.ok) {
      loadError.value = g.message;
      if (slots.value.length > 0) toast(g.message);
      return;
    }
    const r = g.value;
    if (!r.ok) {
      if (r.kind === "auth-expired") authExpired.value = true;
      loadError.value = r.message;
      if (slots.value.length > 0 && r.kind !== "auth-expired") toast(r.message); // 保留旧列表，另行提示
      return;
    }
    authExpired.value = false;
    loadError.value = null;
    slots.value = r.slots;
    visibleCount.value = Math.max(SEGMENT_STEP, Math.min(visibleCount.value, r.slots.length));
  } finally {
    if (mySeq === reloadSeq) loading.value = false;
    attempted.value = true; // 无论成功/失败/抛异常/被取代都置位——不会再有无限骨架屏
  }
}

onLoad(() => {
  void reload(); // reload 自身永不 reject（内部全收口）
});
let firstShow = true;
onShow(() => {
  if (firstShow) {
    firstShow = false;
    return;
  }
  void reload();
});
const { refreshing, indicatorTop } = createPullRefresh({ label: "merchantSlots", refresh: () => reload(), hasCustomNav: true });

/** 统一收口一次写操作：占位 → 执行 → 提示 → 刷新（成功/失败都刷新，对齐服务端） */
async function guarded<T extends { ok: boolean; kind?: string; message?: string }>(run: () => Promise<T>, doneText: string): Promise<T | null> {
  if (working.value) return null;
  working.value = true;
  try {
    const r = await run();
    if (r.ok) {
      toast(doneText);
    } else if (r.kind === "auth-expired") {
      authExpired.value = true;
      toast(r.message ?? "登录已失效，请重新登录");
      return r;
    } else if (r.kind !== "validation") {
      toast(r.message ?? "操作失败");
    }
    if (r.kind !== "validation") await reload();
    return r;
  } finally {
    working.value = false;
  }
}

// —— 新增 / 改容量 弹层 ——
type FormMode = "create" | "capacity";
const formShow = ref(false);
const formMode = ref<FormMode>("create");
const formStart = ref("");
const formEnd = ref("");
const formCapacity = ref("");
const formError = ref("");
const editing = ref<MerchantSlotView | null>(null);

function openCreate(): void {
  if (working.value) return;
  hapticTap();
  formMode.value = "create";
  formStart.value = "";
  formEnd.value = "";
  formCapacity.value = "10";
  formError.value = "";
  editing.value = null;
  formShow.value = true;
}
function openCapacity(s: MerchantSlotView): void {
  if (working.value) return;
  hapticTap();
  formMode.value = "capacity";
  formCapacity.value = String(s.capacity);
  formError.value = "";
  editing.value = s;
  formShow.value = true;
}
function closeForm(): void {
  formShow.value = false;
}
function onPickStart(e: { detail?: { value?: string } }): void {
  formStart.value = e?.detail?.value ?? "";
}
function onPickEnd(e: { detail?: { value?: string } }): void {
  formEnd.value = e?.detail?.value ?? "";
}

async function submitForm(): Promise<void> {
  if (working.value) return;
  hapticTap();
  formError.value = "";
  if (formMode.value === "create") {
    const r = await guarded(
      () => uc.create(rt.nextContext(), { startTime: formStart.value, endTime: formEnd.value, capacity: formCapacity.value }),
      "已新增档期",
    );
    if (r == null) return;
    if (r.ok) closeForm();
    else if (r.kind === "validation" || r.kind === "failed") formError.value = r.message ?? ""; // 冲突/重叠文案留在弹层内便于修改
    else if (r.kind === "auth-expired") closeForm();
    return;
  }
  const target = editing.value;
  if (target == null) return;
  // 调低容量需二次确认（明示不影响已有预约）；先本地算 patch，无变化直接提示
  const p = buildSlotPatch(target, { capacity: formCapacity.value });
  if (!p.ok) {
    formError.value = p.message;
    return;
  }
  const copy = slotChangeConfirmCopy(target, p.patch);
  if (copy != null) {
    working.value = true; // 确认框打开期间占位
    let choice: "confirm" | "cancel" | undefined;
    try {
      choice = await dialogRef.value?.confirm(copy);
    } finally {
      working.value = false;
    }
    if (choice !== "confirm") return;
  }
  const r = await guarded(() => uc.update(rt.nextContext(), target, { capacity: formCapacity.value }), "已更新容量");
  if (r == null) return;
  if (r.ok || r.kind === "auth-expired") closeForm();
  else formError.value = r.message ?? "";
}

// —— 启停 ——
async function onToggle(s: MerchantSlotView): Promise<void> {
  if (working.value) return;
  hapticTap();
  const next = s.status === SLOT_STATUS_ENABLED ? SLOT_STATUS_DISABLED : SLOT_STATUS_ENABLED;
  const p = buildSlotPatch(s, { status: next });
  if (!p.ok) return;
  const copy = slotChangeConfirmCopy(s, p.patch);
  if (copy != null) {
    working.value = true;
    let choice: "confirm" | "cancel" | undefined;
    try {
      choice = await dialogRef.value?.confirm(copy);
    } finally {
      working.value = false;
    }
    if (choice !== "confirm") return;
  }
  await guarded(() => uc.update(rt.nextContext(), s, { status: next }), next === SLOT_STATUS_ENABLED ? "已启用" : "已停用");
}

// —— 套用模板：选择 → dryRun 预览 → 确认 → 真实套用 ——
const tplShow = ref(false);
const templates = ref<SlotTemplateView[]>([]);
const tplLoading = ref(false);
const tplError = ref("");

async function openTemplates(): Promise<void> {
  if (working.value) return;
  hapticTap();
  tplShow.value = true;
  tplError.value = "";
  tplLoading.value = true;
  const r = await uc.loadTemplates(rt.nextContext());
  tplLoading.value = false;
  if (!r.ok) {
    tplError.value = r.message;
    if (r.kind === "auth-expired") authExpired.value = true;
    return;
  }
  templates.value = r.templates;
}
function closeTemplates(): void {
  tplShow.value = false;
}

async function onPickTemplate(t: SlotTemplateView): Promise<void> {
  if (working.value) return;
  hapticTap();
  working.value = true;
  try {
    const pre = await uc.previewTemplate(rt.nextContext(), profile.value, t.id);
    if (!pre.ok) {
      if (pre.kind === "auth-expired") authExpired.value = true;
      toast(pre.message);
      return;
    }
    const preview = pre.result;
    if (!canConfirmApply(preview)) {
      await dialogRef.value?.confirm({ title: "无法套用", msg: describeApplyPreview(preview) + "\n没有可新增的档期。", showCancel: false });
      return;
    }
    const choice = await dialogRef.value?.confirm({ title: "套用「" + t.name + "」", msg: describeApplyPreview(preview) });
    if (choice !== "confirm") return;
    const done = await uc.applyTemplate(rt.nextContext(), profile.value, t.id, preview);
    if (!done.ok) {
      if (done.kind === "auth-expired") authExpired.value = true;
      toast(done.message);
    } else {
      toast(describeApplyDone(done.result));
      closeTemplates();
    }
    await reload();
  } finally {
    working.value = false;
  }
}

function statusMeta(status: number) {
  return describeSlotStatus(status);
}
</script>

<template>
  <view class="container">
    <PullRefreshIndicator :show="refreshing" :top="indicatorTop" />
    <CustomNavBar title="档期管理" />

    <MerchantNeedLogin v-if="needLogin" :expired="loggedIn" />
    <view v-else-if="!gates.canManage" class="empty-state">
      <text class="empty-title">暂无权限</text>
      <text class="empty-desc">当前账号没有档期管理权限，请联系管理员</text>
    </view>
    <template v-else>
      <view class="date-row" hover-class="press-dim" @click="datePickerShow = true">
        <text class="date-label">日期</text>
        <text class="date-value">{{ dateLabel }}</text>
        <text class="date-arrow">›</text>
      </view>
      <view class="toolbar">
        <view :class="working ? 'tool-btn tool-btn--primary is-disabled' : 'tool-btn tool-btn--primary'" hover-class="press-dim" @click="openCreate">
          <text class="tool-text tool-text--primary">新增档期</text>
        </view>
        <view
          v-if="gates.canTemplate"
          :class="working ? 'tool-btn is-disabled' : 'tool-btn'"
          hover-class="press-dim"
          @click="openTemplates"
        >
          <text class="tool-text">套用模板</text>
        </view>
      </view>

      <view v-if="showSkeleton" class="sk-wrap">
        <SkeletonBlock v-for="i in 3" :key="i" width="100%" height="140rpx" radius="16rpx" />
      </view>
      <view v-else-if="loadError !== null && slots.length === 0" class="empty-state">
        <text class="empty-title">加载失败</text>
        <text class="empty-desc">{{ loadError }}</text>
        <view class="retry" hover-class="press-dim" @click="reload"><text class="retry-text">重试</text></view>
      </view>
      <view v-else-if="slots.length === 0" class="empty-state">
        <text class="empty-title">还没有档期</text>
        <text class="empty-desc">新增一个时间段，或套用模板一键生成</text>
        <view :class="working ? 'empty-cta is-disabled' : 'empty-cta'" hover-class="press-dim" @click="openCreate"><text class="empty-cta-text">新增档期</text></view>
      </view>
      <view v-else class="list">
        <view v-for="s in visible.items" :key="s.id" class="card">
          <view class="card-main">
            <text class="card-time">{{ s.startTime }} - {{ s.endTime }}</text>
            <text class="card-cap">{{ describeBooked(s) || "容量 " + s.capacity }}</text>
          </view>
          <view class="card-side">
            <text :class="'card-status card-status-' + statusMeta(s.status).tone">{{ statusMeta(s.status).label }}</text>
            <view class="card-ops">
              <view :class="working ? 'op is-disabled' : 'op'" hover-class="press-dim" @click="openCapacity(s)"><text class="op-text">改容量</text></view>
              <view :class="working ? 'op is-disabled' : 'op'" hover-class="press-dim" @click="onToggle(s)">
                <text class="op-text">{{ s.status === SLOT_STATUS_ENABLED ? "停用" : "启用" }}</text>
              </view>
            </view>
          </view>
        </view>
        <view v-if="visible.hasMore" class="more" hover-class="press-dim" @click="onLoadMore"><text class="more-text">显示更多（{{ slots.length - visible.items.length }}）</text></view>
      </view>
    </template>

    <BasePicker v-model:show="datePickerShow" :model-value="selectedDate" title="选择日期" :options="dateOptions" @confirm="onDateConfirm" />

    <!-- 新增 / 改容量 -->
    <BasePopup :show="formShow" position="bottom" :root-portal="false" :z-index="2000" @cancel="closeForm">
      <view class="sheet">
        <text class="sheet-title">{{ formMode === "create" ? "新增档期" : "修改容量" }}</text>
        <template v-if="formMode === 'create'">
          <view class="form-row">
            <text class="form-label">开始时间</text>
            <picker mode="time" :value="formStart" @change="onPickStart">
              <text :class="formStart ? 'form-value' : 'form-value form-value--ph'">{{ formStart || "请选择" }}</text>
            </picker>
          </view>
          <view class="form-row">
            <text class="form-label">结束时间</text>
            <picker mode="time" :value="formEnd" @change="onPickEnd">
              <text :class="formEnd ? 'form-value' : 'form-value form-value--ph'">{{ formEnd || "请选择" }}</text>
            </picker>
          </view>
        </template>
        <view v-else class="form-row">
          <text class="form-label">时间段</text>
          <text class="form-value">{{ editing ? editing.startTime + " - " + editing.endTime : "" }}</text>
        </view>
        <view class="form-row">
          <text class="form-label">容量</text>
          <input class="form-input" v-model="formCapacity" type="number" maxlength="3" :placeholder="SLOT_CAPACITY_MIN + '-' + SLOT_CAPACITY_MAX" :placeholder-style="INPUT_PLACEHOLDER_STYLE" />
        </view>
        <text v-if="formMode === 'create'" class="hint">时间创建后不可修改；启用档期之间时间不能重叠</text>
        <text v-if="formError" class="form-error">{{ formError }}</text>
        <view :class="working ? 'sheet-btn is-disabled' : 'sheet-btn'" hover-class="press-dim" @click="submitForm">
          <text class="sheet-btn-text">{{ working ? "提交中..." : "确定" }}</text>
        </view>
      </view>
    </BasePopup>

    <!-- 模板 -->
    <BasePopup :show="tplShow" position="bottom" :root-portal="false" :z-index="2000" @cancel="closeTemplates">
      <view class="sheet">
        <text class="sheet-title">套用档期模板</text>
        <text class="hint">选择模板后会先预览将新增/跳过/冲突的档期，确认后才会生成</text>
        <text v-if="tplLoading" class="hint">加载中...</text>
        <text v-else-if="tplError" class="form-error">{{ tplError }}</text>
        <view v-for="t in templates" :key="t.id" :class="working ? 'tpl is-disabled' : 'tpl'" hover-class="press-dim" @click="onPickTemplate(t)">
          <view class="tpl-main">
            <text class="tpl-name">{{ t.name }}{{ t.builtin ? "（内置）" : "" }}</text>
            <text class="tpl-desc">{{ t.items.length }} 个时段</text>
          </view>
          <text class="tpl-arrow">›</text>
        </view>
      </view>
    </BasePopup>

    <PageFooter main-line="" :support-line="footer.supportLine.value" variant="bottomdesc" />
    <BaseFeedback ref="feedbackRef" />
    <BaseDialog ref="dialogRef" />
  </view>
</template>

<style lang="scss" scoped>
.container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: $color-page;
}
.date-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin: $space-md $space-md 0;
  padding: 20rpx $space-md;
  border-radius: 20rpx;
  border: 2rpx solid rgba(241, 205, 145, 0.12);
  background: rgba(241, 205, 145, 0.06);
}
.date-label {
  font-size: $font-size-caption;
  color: $color-text-secondary;
  margin-right: $space-md;
}
.date-value {
  flex: 1;
  font-size: $font-size-body;
  color: $color-action;
}
.date-arrow {
  font-size: $font-size-title;
  color: $color-text-secondary;
}
.toolbar {
  display: flex;
  flex-direction: row;
  gap: 16rpx;
  padding: $space-md $space-md $space-sm;
}
.tool-btn {
  flex: 1;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  border: 2rpx solid $color-border;
}
.tool-btn--primary {
  border: 0;
  background: linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%);
}
.tool-text {
  font-size: $font-size-body;
  color: $color-action;
}
.tool-text--primary {
  color: $color-action-text;
}
.is-disabled {
  opacity: 0.4;
}
.sk-wrap {
  padding: 0 $space-md;
  display: flex;
  flex-direction: column;
  gap: $space-sm;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 200rpx $space-lg;
}
.empty-title {
  font-size: $font-size-sub-title;
  color: $color-text-secondary;
  margin-bottom: $space-sm;
}
.empty-desc {
  font-size: $font-size-caption;
  color: $color-text-muted;
  text-align: center;
}
.empty-cta {
  margin-top: $space-md;
  padding: 16rpx 56rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%);
}
.empty-cta-text {
  font-size: $font-size-body;
  color: $color-action-text;
}
.retry {
  margin-top: $space-md;
  padding: 16rpx 48rpx;
  border-radius: 999rpx;
  border: 2rpx solid $color-border;
}
.retry-text {
  font-size: $font-size-body;
  color: $color-action;
}
.more {
  display: flex;
  justify-content: center;
  padding: $space-md 0;
}
.more-text {
  font-size: $font-size-caption;
  color: $color-text-muted;
}
.list {
  padding: 0 $space-md $space-lg;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.card {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  border-radius: 20rpx;
  background: rgba(241, 205, 145, 0.06);
  border: 2rpx solid rgba(241, 205, 145, 0.12);
  padding: $space-md;
}
.card-main {
  display: flex;
  flex-direction: column;
}
.card-time {
  font-size: $font-size-sub-title;
  color: $color-action;
}
.card-cap {
  margin-top: 8rpx;
  font-size: $font-size-caption;
  color: $color-text-secondary;
}
.card-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.card-status {
  font-size: $font-size-caption;
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
}
.card-status-action {
  color: $color-action;
  background: rgba(241, 205, 145, 0.15);
}
.card-status-muted {
  color: $color-text-secondary;
  background: rgba(255, 255, 255, 0.06);
}
.card-ops {
  margin-top: 16rpx;
  display: flex;
  flex-direction: row;
  gap: 12rpx;
}
.op {
  padding: 8rpx 24rpx;
  border-radius: 999rpx;
  border: 2rpx solid $color-border;
}
.op-text {
  font-size: $font-size-caption;
  color: $color-action;
}
.sheet {
  box-sizing: border-box;
  width: 100%;
  background: $color-popup-card;
  border-radius: #{$popup-radius-rpx * 2}rpx #{$popup-radius-rpx * 2}rpx 0 0;
  padding: $space-lg;
  padding-bottom: calc(#{$space-lg} + constant(safe-area-inset-bottom));
  padding-bottom: calc(#{$space-lg} + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
}
.sheet-title {
  font-size: $font-size-sub-title;
  color: $color-action;
  margin-bottom: $space-md;
}
.form-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 24rpx 0;
  border-bottom: 2rpx solid $color-divider;
}
.form-label {
  width: 180rpx;
  flex-shrink: 0;
  font-size: $font-size-body;
  color: $color-text-secondary;
}
.form-value {
  font-size: $font-size-body;
  color: $color-text-primary;
}
.form-value--ph {
  color: $color-text-muted;
}
.form-input {
  flex: 1;
  font-size: $font-size-body;
  color: $color-text-primary;
}
.hint {
  margin-top: $space-sm;
  font-size: $font-size-caption;
  color: $color-text-muted;
}
.form-error {
  margin-top: $space-sm;
  font-size: $font-size-caption;
  color: #ff6b6b;
}
.sheet-btn {
  margin-top: $space-lg;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%);
}
.sheet-btn-text {
  font-size: $font-size-body;
  color: $color-action-text;
}
.tpl {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-top: $space-sm;
  padding: $space-md;
  border-radius: 20rpx;
  border: 2rpx solid rgba(241, 205, 145, 0.12);
  background: rgba(241, 205, 145, 0.06);
}
.tpl-main {
  display: flex;
  flex-direction: column;
}
.tpl-name {
  font-size: $font-size-body;
  color: $color-action;
}
.tpl-desc {
  margin-top: 6rpx;
  font-size: $font-size-caption;
  color: $color-text-secondary;
}
.tpl-arrow {
  font-size: $font-size-title;
  color: $color-text-secondary;
}
</style>
