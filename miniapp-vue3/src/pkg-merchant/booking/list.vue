<script setup lang="ts">
// 商家预约管理（issue #14 · M1）：卡片列表（PC 表格改造）+ 筛选（状态横滑分段 + 日期/渠道/重置筛选条 + 结果摘要）+ 触底加载 + 下拉刷新 +
// 接单 / 核销完成 / 取消（均二次确认；取消确认框**明示**「有保证金的预约取消后将全额退还客人保证金」）。
// 不做：no-show（未到店仅作筛选/展示、无任何操作入口）、deposit/refund/preview/retry、保证金规则（资金权限）。
// 防重：任一变更进行中全部按钮置灰；失败（含后端「状态已变化」类业务错误，HTTP200+code=500 非幂等）⇒ 展示后端 message 并刷新列表。
// 客人手机号不脱敏，原样展示 + 一键拨打（拨号经 platform/uni/dialer，不直调 uni）。
import { computed, ref } from "vue";
import { onLoad, onReachBottom, onShow } from "@dcloudio/uni-app";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import PageFooter from "../../components/PageFooter/PageFooter.vue";
import { useMerchantFooter } from "../composables/use-merchant-footer";
import PullRefreshIndicator from "../../components/PullRefreshIndicator/PullRefreshIndicator.vue";
import ScrollSegment from "../components/ScrollSegment.vue";
import BasePicker from "../../ui/BasePicker.vue";
import BasePopup from "../../ui/BasePopup.vue";
import SkeletonBlock from "../../components/SkeletonBlock/SkeletonBlock.vue";
import BaseDialog from "../../ui/BaseDialog.vue";
import BaseFeedback from "../../ui/BaseFeedback.vue";
import MerchantNeedLogin from "../components/MerchantNeedLogin.vue";
import { createPullRefresh } from "../../composables/use-pull-refresh";
import { toast as nativeToast } from "../../platform/uni/feedback";
import { createUniDialer } from "../../platform/uni/dialer";
import { hapticTap } from "../../application/haptics";
import { getMerchantRuntime } from "../application/merchant-runtime";
import { createMerchantBookingRepository } from "../infrastructure/merchant-bookings";
import { createBookingActionRunner, createBookingListFetch } from "../application/merchant-booking-flow";
import { createPagedListViewModel } from "../composables/use-merchant-list";
import { guardedLoad, shouldShowSkeleton } from "../composables/load-guard";
import {
  ACTION_DONE_TEXT,
  ACTION_LABEL,
  BOOKING_DEFAULT_PAGE_SIZE,
  CHANNEL_TABS,
  EMPTY_BOOKING_FILTER,
  QUICK_DATE_TABS,
  withQuickDate,
  withSpecificDate,
  actionConfirmCopy,
  availableActions,
  depositLineOf,
  describeMerchantStatus,
  type MerchantBookingAction,
  type MerchantBookingFilter,
  type MerchantBookingView,
} from "../domain/merchant-booking";
import { hasPermission, PERM } from "../domain/merchant-auth";
import {
  activeQuickTab,
  channelButtonLabel,
  dateButtonLabel,
  filterSummary,
  hasActiveFilter,
  isChannelFiltered,
  isDateFiltered,
  orderedStatusTabs,
  resetFilter,
  statusIndexOf,
} from "../domain/merchant-booking-filter-ui";

const rt = getMerchantRuntime();
const footer = useMerchantFooter();
const repo = createMerchantBookingRepository({ client: rt.client });
const vm = createPagedListViewModel<MerchantBookingView, MerchantBookingFilter>(
  { fetch: createBookingListFetch({ bookings: repo }) },
  { pageSize: BOOKING_DEFAULT_PAGE_SIZE, initialFilter: { ...EMPTY_BOOKING_FILTER } },
);
const runner = createBookingActionRunner({ bookings: repo });
const dialer = createUniDialer();

const feedbackRef = ref<InstanceType<typeof BaseFeedback> | null>(null);
const dialogRef = ref<InstanceType<typeof BaseDialog> | null>(null);
function toast(text: string): void {
  const f = feedbackRef.value;
  if (f != null) f.show(text);
  else nativeToast(text);
}

const loggedIn = ref(false);
const canManage = ref(false);
/** 是否已**尝试过**首次加载（成功/失败/超时/异常都置位；只用于「还没开始」时的骨架屏判定）。
 *  ⚠️ 经验（issue #14 M1 真机缺陷）：任何「首屏骨架屏」都必须有失败/超时出口——不得再写成 `onLoad(() => reload().then(() => ready = true))` */
const attempted = ref(false);
/** 整次加载被页面级兜底收口的失败文案（抛异常/超时）；与 vm.error（接口失败）并列，任一非空即展示失败态 */
const loadFault = ref<string | null>(null);
const loadFailure = computed(() => vm.error.value ?? loadFault.value);
const showSkeleton = computed(() =>
  shouldShowSkeleton({ itemCount: vm.items.value.length, hasError: loadFailure.value !== null, loading: vm.loading.value, attempted: attempted.value }),
);
/** 处理中的预约 id（响应式镜像 runner.busyId，供模板置灰/「处理中...」） */
const busyId = ref<number | null>(null);

function refreshLoginState(): void {
  const s = rt.getState();
  loggedIn.value = s.loggedIn;
  canManage.value = hasPermission(s.profile, PERM.booking);
}

const needLogin = computed(() => !loggedIn.value || vm.authExpired.value);

async function reload(): Promise<void> {
  try {
    refreshLoginState();
    if (!loggedIn.value || !canManage.value) return;
    const g = await guardedLoad(() => vm.loadFirst(rt.nextContext()));
    if (!g.ok) {
      loadFault.value = g.message; // 抛异常/超时：失败态可见、可重试
      return;
    }
    loadFault.value = null;
    const r = g.value;
    if (!r.ok && vm.items.value.length > 0 && !vm.authExpired.value) toast(r.message); // 列表非空时失败只保留旧列表 ⇒ 另行提示
  } finally {
    attempted.value = true; // 无论成功/失败/抛异常都置位——不会再有无限骨架屏
  }
}

onLoad(() => {
  void reload(); // reload 自身永不 reject（内部全收口），这里无需 .then
});
let firstShow = true;
onShow(() => {
  if (firstShow) {
    firstShow = false;
    return;
  }
  void reload();
});
function onRetryLoadMore(): void {
  if (needLogin.value || !canManage.value) return;
  void vm.loadMore(rt.nextContext());
}
onReachBottom(() => {
  if (needLogin.value || !canManage.value) return;
  void vm.loadMore(rt.nextContext());
});
const { refreshing, indicatorTop } = createPullRefresh({ label: "merchantBookings", refresh: () => reload(), hasCustomNav: true });

// —— 筛选（分层：状态分段 → 日期/渠道/重置筛选条 → 结果摘要）——
// 数据结构与查询参数不变（MerchantBookingFilter / buildBookingQuery）；这里只改交互：所有处理函数都是具名方法，不在模板里写带参内联表达式。
const statusTabs = orderedStatusTabs();
const statusLabels = statusTabs.map((t) => t.label);
const statusIndex = computed(() => statusIndexOf(vm.filter.value.status));
const dateFilter = computed(() => vm.filter.value.date);
const quickActive = computed(() => activeQuickTab(vm.filter.value));
const dateLabel = computed(() => dateButtonLabel(vm.filter.value));
const channelLabel = computed(() => channelButtonLabel(vm.filter.value));
const dateOn = computed(() => isDateFiltered(vm.filter.value));
const channelOn = computed(() => isChannelFiltered(vm.filter.value));
const showReset = computed(() => hasActiveFilter(vm.filter.value));
/** 结果摘要：加载成功后才有真实 total；加载中/失败不显示假数字 */
const summary = computed(() => (attempted.value && loadFailure.value === null ? filterSummary(vm.filter.value, vm.total.value) : ""));

function submitFilter(next: MerchantBookingFilter): void {
  if (needLogin.value) return;
  hapticTap();
  void vm.loadFirst(rt.nextContext(), next); // 回到第 1 页；迟到响应由列表壳丢弃
}
function onStatusChange(index: number): void {
  const t = statusTabs[index];
  if (t == null || t.value === vm.filter.value.status) return;
  submitFilter({ ...vm.filter.value, status: t.value });
}

// 日期弹层：快捷项（全部/今天/明天）+ 具体日期；快捷与具体日期互斥（点一个清另一个）
const datePopupShow = ref(false);
function openDatePopup(): void {
  hapticTap();
  datePopupShow.value = true;
}
function closeDatePopup(): void {
  datePopupShow.value = false;
}
function onQuickTap(value: "" | "today" | "tomorrow"): void {
  datePopupShow.value = false;
  submitFilter(withQuickDate(vm.filter.value, value));
}
function onDateChange(e: { detail?: { value?: string } }): void {
  datePopupShow.value = false;
  submitFilter(withSpecificDate(vm.filter.value, e?.detail?.value ?? ""));
}

// 渠道选择器
const channelPickerShow = ref(false);
const channelOptions = CHANNEL_TABS.map((c) => ({ label: c.label, value: c.value }));
const channelPicked = computed(() => [vm.filter.value.channel]);
function openChannelPicker(): void {
  hapticTap();
  channelPickerShow.value = true;
}
function onChannelConfirm(v: (string | number)[]): void {
  const picked = String(v[0] ?? "");
  const hit = CHANNEL_TABS.find((c) => c.value === picked);
  if (hit == null || hit.value === vm.filter.value.channel) return;
  submitFilter({ ...vm.filter.value, channel: hit.value });
}

function onResetFilter(): void {
  submitFilter(resetFilter());
}

// —— 操作 ——
function actionsOf(b: MerchantBookingView): MerchantBookingAction[] {
  return canManage.value ? availableActions(b) : [];
}
async function onActionTap(b: MerchantBookingView, action: MerchantBookingAction): Promise<void> {
  if (busyId.value != null) return; // 页面级防重：任一变更进行中直接忽略（确认框打开期间同样占位见下）
  hapticTap();
  const copy = actionConfirmCopy(action, b);
  busyId.value = b.id; // 先占位再弹框：确认框打开期间不能再点别的卡片
  try {
    const choice = await dialogRef.value?.confirm({ title: copy.title, msg: copy.msg });
    if (choice !== "confirm") return;
    const r = await runner.run(rt.nextContext(), b.id, action);
    if (r.ok) {
      toast(ACTION_DONE_TEXT[action]);
    } else if (r.kind === "auth-expired") {
      vm.authExpired.value = true;
      toast(r.message);
      return;
    } else {
      toast(r.message); // 后端文案原样（含「当前状态不可执行该操作」「预约状态已变化，请刷新后重试」）
    }
    await reload(); // 成功/失败都刷新：对齐服务端状态，避免卡片停在旧状态
  } finally {
    busyId.value = null;
  }
}

async function onCallTap(b: MerchantBookingView): Promise<void> {
  hapticTap();
  const ok = await dialer.call(b.customerPhone);
  if (!ok) toast("无法拨号，客人手机号：" + b.customerPhone);
}

function statusMeta(status: string) {
  return describeMerchantStatus(status);
}
function actionBtnClass(a: MerchantBookingAction): string {
  return a === "cancel" ? "act-btn act-btn--cancel" : "act-btn act-btn--primary";
}
</script>

<template>
  <view class="container">
    <PullRefreshIndicator :show="refreshing" :top="indicatorTop" />
    <CustomNavBar title="预约管理" transparent />

    <MerchantNeedLogin v-if="needLogin" :expired="loggedIn" />
    <view v-else-if="!canManage" class="empty-state">
      <text class="empty-title">暂无权限</text>
      <text class="empty-desc">当前账号没有预约管理权限，请联系管理员</text>
    </view>
    <template v-else>
      <view class="status-wrap">
        <ScrollSegment :options="statusLabels" :current-index="statusIndex" @change="onStatusChange" />
      </view>
      <view class="filter-bar">
        <view :class="dateOn ? 'fb-item is-on' : 'fb-item'" hover-class="press-dim" @click="openDatePopup">
          <text class="fb-text">{{ dateLabel }} ▾</text>
        </view>
        <view :class="channelOn ? 'fb-item is-on' : 'fb-item'" hover-class="press-dim" @click="openChannelPicker">
          <text class="fb-text">{{ channelLabel }} ▾</text>
        </view>
        <view v-if="showReset" class="fb-reset" hover-class="press-dim" @click="onResetFilter">
          <text class="fb-reset-text">重置</text>
        </view>
      </view>
      <view v-if="summary !== ''" class="summary"><text class="summary-text">{{ summary }}</text></view>

      <view v-if="showSkeleton" class="sk-wrap">
        <SkeletonBlock v-for="i in 3" :key="i" width="100%" height="200rpx" radius="16rpx" />
      </view>
      <view v-else-if="loadFailure !== null && vm.items.value.length === 0" class="empty-state">
        <text class="empty-title">加载失败</text>
        <text class="empty-desc">{{ loadFailure }}</text>
        <view class="retry" hover-class="press-dim" @click="reload"><text class="retry-text">重试</text></view>
      </view>
      <view v-else-if="vm.items.value.length === 0" class="empty-state">
        <text class="empty-title">暂无预约</text>
        <text class="empty-desc">换个筛选条件试试</text>
      </view>
      <view v-else class="list">
        <view v-for="b in vm.items.value" :key="b.id" class="card">
          <view class="card-top">
            <text class="card-time">{{ b.date }} {{ b.startTime }}-{{ b.endTime }}</text>
            <text :class="'card-status card-status-' + statusMeta(b.status).tone">{{ statusMeta(b.status).label }}</text>
          </view>
          <view class="card-row">
            <text class="card-label">客人</text>
            <text class="card-value">{{ b.customerName }} · {{ b.guestCount }} 人</text>
          </view>
          <view class="card-row">
            <text class="card-label">手机号</text>
            <text class="card-value">{{ b.customerPhone }}</text>
            <view v-if="b.customerPhone" class="call" hover-class="press-dim" @click="onCallTap(b)"><text class="call-text">拨打</text></view>
          </view>
          <view v-if="b.channelLabel" class="card-row">
            <text class="card-label">渠道</text>
            <text class="card-value">{{ b.channelLabel }}</text>
          </view>
          <view v-if="b.remark" class="card-row">
            <text class="card-label">备注</text>
            <text class="card-value">{{ b.remark }}</text>
          </view>
          <view v-if="b.deposit" class="card-row">
            <text class="card-value deposit">{{ depositLineOf(b) }}</text>
          </view>
          <view v-if="actionsOf(b).length > 0" class="card-actions">
            <view
              v-for="a in actionsOf(b)"
              :key="a"
              :class="busyId !== null ? actionBtnClass(a) + ' is-disabled' : actionBtnClass(a)"
              hover-class="press-dim"
              @click="onActionTap(b, a)"
            >
              <text class="act-text">{{ busyId === b.id ? "处理中..." : ACTION_LABEL[a] }}</text>
            </view>
          </view>
        </view>

        <view v-if="vm.loadingMore.value" class="load-more"><text class="load-more-text">加载中...</text></view>
        <view v-else-if="vm.loadMoreError.value !== null" class="load-more" hover-class="press-dim" @click="onRetryLoadMore">
          <text class="load-more-text">加载失败，点击重试</text>
        </view>
        <view v-else-if="vm.noMore.value" class="load-more"><text class="load-more-text">已经到底了</text></view>
      </view>
    </template>

    <BasePopup :show="datePopupShow" position="bottom" :root-portal="false" :z-index="2000" @cancel="closeDatePopup">
      <view class="sheet">
        <text class="sheet-title">按日期筛选</text>
        <view class="sheet-row">
          <view
            v-for="q in QUICK_DATE_TABS"
            :key="'q' + q.value"
            :class="q.value === quickActive ? 'sheet-chip is-active' : 'sheet-chip'"
            hover-class="press-dim"
            @click="onQuickTap(q.value)"
          >
            <text :class="q.value === quickActive ? 'sheet-chip-text is-active' : 'sheet-chip-text'">{{ q.label }}</text>
          </view>
        </view>
        <picker mode="date" :value="dateFilter" @change="onDateChange">
          <view :class="dateFilter !== '' ? 'sheet-date is-active' : 'sheet-date'" hover-class="press-dim">
            <text class="sheet-date-text">{{ dateFilter !== "" ? "已选日期 " + dateFilter + "（点击更换）" : "选择具体日期" }}</text>
          </view>
        </picker>
      </view>
    </BasePopup>
    <BasePicker v-model:show="channelPickerShow" :model-value="channelPicked" title="按渠道筛选" :options="channelOptions" @confirm="onChannelConfirm" />

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
.status-wrap {
  padding: $space-md $space-md $space-sm;
}
.filter-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  padding: 0 $space-md $space-sm;
}
.fb-item {
  padding: 12rpx 28rpx;
  border-radius: 12rpx;
  border: 2rpx solid $color-border;
  background: rgba(241, 205, 145, 0.04);
}
.fb-item.is-on {
  border-color: $color-action;
  background: rgba(241, 205, 145, 0.14);
}
.fb-text {
  font-size: $font-size-caption;
  color: $color-text-secondary;
}
.fb-item.is-on .fb-text {
  color: $color-action;
}
.fb-reset {
  margin-left: auto;
  padding: 12rpx 12rpx;
}
.fb-reset-text {
  font-size: $font-size-caption;
  color: $color-action;
}
.summary {
  padding: 0 $space-md $space-sm;
}
.summary-text {
  font-size: 24rpx;
  color: $color-text-muted;
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
.sheet-row {
  display: flex;
  flex-direction: row;
  gap: 16rpx;
  margin-bottom: $space-md;
}
.sheet-chip {
  flex: 1;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  border: 2rpx solid $color-border;
}
.sheet-chip.is-active {
  border: 0;
  background: linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%);
}
.sheet-chip-text {
  font-size: $font-size-body;
  color: $color-action;
}
.sheet-chip-text.is-active {
  color: $color-action-text;
}
.sheet-date {
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12rpx;
  border: 2rpx dashed $color-border;
}
.sheet-date.is-active {
  border-style: solid;
  border-color: $color-action;
}
.sheet-date-text {
  font-size: $font-size-body;
  color: $color-text-primary;
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
.list {
  padding: 0 $space-md $space-lg;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.card {
  border-radius: 20rpx;
  background: rgba(241, 205, 145, 0.06);
  border: 2rpx solid rgba(241, 205, 145, 0.12);
  padding: $space-md;
}
.card-top {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $space-sm;
}
.card-time {
  font-size: $font-size-body;
  color: $color-action;
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
.card-status-danger {
  color: #ff6b6b;
  background: rgba(255, 107, 107, 0.12);
}
.card-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 8rpx;
}
.card-label {
  width: 120rpx;
  flex-shrink: 0;
  font-size: $font-size-caption;
  color: $color-text-secondary;
}
.card-value {
  flex: 1;
  font-size: $font-size-caption;
  color: $color-text-primary;
}
.deposit {
  color: $color-text-secondary;
}
.call {
  margin-left: 16rpx;
  padding: 6rpx 24rpx;
  border-radius: 999rpx;
  border: 2rpx solid $color-border;
}
.call-text {
  font-size: $font-size-caption;
  color: $color-action;
}
.card-actions {
  margin-top: 20rpx;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  gap: 16rpx;
}
.act-btn {
  padding: 12rpx 36rpx;
  border-radius: 999rpx;
}
.act-btn--primary {
  background: linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%);
}
.act-btn--cancel {
  border: 2rpx solid rgba(255, 107, 107, 0.6);
}
.act-btn.is-disabled {
  opacity: 0.4;
}
.act-btn--primary .act-text {
  font-size: $font-size-caption;
  color: $color-action-text;
}
.act-btn--cancel .act-text {
  font-size: $font-size-caption;
  color: #ff6b6b;
}
.load-more {
  display: flex;
  justify-content: center;
  padding: $space-md 0;
}
.load-more-text {
  font-size: $font-size-caption;
  color: $color-text-muted;
}
</style>
