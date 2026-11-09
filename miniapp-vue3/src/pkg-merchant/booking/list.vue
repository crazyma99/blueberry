<script setup lang="ts">
// 商家预约管理（issue #14 · M1）：卡片列表（PC 表格改造）+ 状态/日期/渠道筛选 + 触底加载 + 下拉刷新 +
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
import {
  ACTION_DONE_TEXT,
  ACTION_LABEL,
  BOOKING_DEFAULT_PAGE_SIZE,
  CHANNEL_TABS,
  EMPTY_BOOKING_FILTER,
  QUICK_DATE_TABS,
  activeQuickTab,
  withQuickDate,
  withSpecificDate,
  STATUS_TABS,
  actionConfirmCopy,
  availableActions,
  depositLineOf,
  describeMerchantStatus,
  type MerchantBookingAction,
  type MerchantBookingFilter,
  type MerchantBookingView,
} from "../domain/merchant-booking";
import { hasPermission, PERM } from "../domain/merchant-auth";

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
const ready = ref(false);
/** 处理中的预约 id（响应式镜像 runner.busyId，供模板置灰/「处理中...」） */
const busyId = ref<number | null>(null);

function refreshLoginState(): void {
  const s = rt.getState();
  loggedIn.value = s.loggedIn;
  canManage.value = hasPermission(s.profile, PERM.booking);
}

const needLogin = computed(() => !loggedIn.value || vm.authExpired.value);

async function reload(): Promise<void> {
  refreshLoginState();
  if (!loggedIn.value || !canManage.value) return;
  const r = await vm.loadFirst(rt.nextContext());
  if (!r.ok && vm.items.value.length > 0 && !vm.authExpired.value) toast(r.message); // 列表非空时失败只保留旧列表 ⇒ 另行提示
}

onLoad(() => {
  void reload().then(() => {
    ready.value = true;
  });
});
let firstShow = true;
onShow(() => {
  if (firstShow) {
    firstShow = false;
    return;
  }
  void reload();
});
onReachBottom(() => {
  if (needLogin.value || !canManage.value) return;
  void vm.loadMore(rt.nextContext());
});
const { refreshing, indicatorTop } = createPullRefresh({ label: "merchantBookings", refresh: () => reload(), hasCustomNav: true });

// —— 筛选 ——
const statusFilter = computed(() => vm.filter.value.status);
const channelFilter = computed(() => vm.filter.value.channel);
const dateFilter = computed(() => vm.filter.value.date);
const quickActive = computed(() => activeQuickTab(vm.filter.value));
function applyFilter(next: Partial<MerchantBookingFilter>): void {
  if (needLogin.value) return;
  hapticTap();
  void vm.loadFirst(rt.nextContext(), { ...vm.filter.value, ...next });
}
// 快捷日期（全部/今天/明天）：filter 只记意图，真实日期在每次请求时按设备本地时间现算（见 domain 的 resolveFilterDate）
function applyQuick(q: "" | "today" | "tomorrow"): void {
  if (needLogin.value) return;
  hapticTap();
  void vm.loadFirst(rt.nextContext(), withQuickDate(vm.filter.value, q));
}
function onDateChange(e: { detail?: { value?: string } }): void {
  if (needLogin.value) return;
  hapticTap();
  void vm.loadFirst(rt.nextContext(), withSpecificDate(vm.filter.value, e?.detail?.value ?? ""));
}
function clearDate(): void {
  if (needLogin.value) return;
  hapticTap();
  void vm.loadFirst(rt.nextContext(), withSpecificDate(vm.filter.value, ""));
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
      <view class="filter-row">
        <view
          v-for="t in STATUS_TABS"
          :key="t.value"
          :class="t.value === statusFilter ? 'chip is-active' : 'chip'"
          hover-class="press-dim"
          @click="applyFilter({ status: t.value })"
        >
          <text class="chip-text">{{ t.label }}</text>
        </view>
      </view>
      <view class="filter-row filter-row--sub">
        <view
          v-for="q in QUICK_DATE_TABS"
          :key="'q' + q.value"
          :class="q.value === quickActive ? 'chip is-active' : 'chip'"
          hover-class="press-dim"
          @click="applyQuick(q.value)"
        >
          <text class="chip-text">{{ q.label }}</text>
        </view>
        <picker mode="date" :value="dateFilter" @change="onDateChange">
          <view :class="dateFilter !== '' ? 'chip is-active' : 'chip'" hover-class="press-dim">
            <text class="chip-text">{{ dateFilter !== "" ? "日期 " + dateFilter : "选择日期" }}</text>
          </view>
        </picker>
        <view v-if="dateFilter !== ''" class="chip" hover-class="press-dim" @click="clearDate">
          <text class="chip-text">清除日期</text>
        </view>
        <view
          v-for="c in CHANNEL_TABS"
          :key="'c' + c.value"
          :class="c.value === channelFilter ? 'chip is-active' : 'chip'"
          hover-class="press-dim"
          @click="applyFilter({ channel: c.value })"
        >
          <text class="chip-text">{{ c.label }}</text>
        </view>
      </view>

      <view v-if="!ready" class="sk-wrap">
        <SkeletonBlock v-for="i in 3" :key="i" width="100%" height="200rpx" radius="16rpx" />
      </view>
      <view v-else-if="vm.error.value !== null && vm.items.value.length === 0" class="empty-state">
        <text class="empty-title">加载失败</text>
        <text class="empty-desc">{{ vm.error.value }}</text>
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
        <view v-else-if="vm.loadMoreError.value !== null" class="load-more" hover-class="press-dim" @click="vm.loadMore(rt.nextContext())">
          <text class="load-more-text">加载失败，点击重试</text>
        </view>
        <view v-else-if="vm.noMore.value" class="load-more"><text class="load-more-text">已经到底了</text></view>
      </view>
    </template>

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
.filter-row {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 12rpx;
  padding: $space-sm $space-md 0;
}
.filter-row--sub {
  padding-bottom: $space-sm;
}
.chip {
  padding: 10rpx 24rpx;
  border-radius: 999rpx;
  background: rgba(241, 205, 145, 0.06);
  border: 2rpx solid rgba(241, 205, 145, 0.12);
}
.chip.is-active {
  background: rgba(241, 205, 145, 0.18);
  border-color: $color-action;
}
.chip-text {
  font-size: $font-size-caption;
  color: $color-text-secondary;
}
.chip.is-active .chip-text {
  color: $color-action;
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
