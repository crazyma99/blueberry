<script setup lang="ts">
// 商家分类管理（issue #14 · M2）：系列选择 → 一级列表 → 点进二级列表；新增 / 改名改排序 / 删除。
// 分类挂在 shopId（「系列」）下；登录响应 shopList 为空 ⇒ 明确空态；多系列用 BasePicker 选并记住上次选择。
// 删除是**级联**（后端无关联校验）：先统计关联数（失败即拦下），再两次 BaseDialog 确认，明示「将同时删除 N 个子分类 / M 个相册及全部图片」。
// 同名冲突：后端 message 原样展示。写操作串行；失败/成功都刷新对齐服务端。缺 category 权限：不发请求。
// ⭐经验（issue #14 M1 真机缺陷）：首屏骨架屏必须有失败/超时出口——加载经 guardedLoad，骨架屏条件走 shouldShowSkeleton。
import { computed, ref } from "vue";
import { onLoad, onReachBottom, onShow } from "@dcloudio/uni-app";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import PageFooter from "../../components/PageFooter/PageFooter.vue";
import PullRefreshIndicator from "../../components/PullRefreshIndicator/PullRefreshIndicator.vue";
import SkeletonBlock from "../../components/SkeletonBlock/SkeletonBlock.vue";
import BaseDialog from "../../ui/BaseDialog.vue";
import BaseFeedback from "../../ui/BaseFeedback.vue";
import BaseField from "../../ui/BaseField.vue";
import BasePicker from "../../ui/BasePicker.vue";
import BasePopup from "../../ui/BasePopup.vue";
import MerchantNeedLogin from "../components/MerchantNeedLogin.vue";
import { createPullRefresh } from "../../composables/use-pull-refresh";
import { toast as nativeToast } from "../../platform/uni/feedback";
import { hapticTap } from "../../application/haptics";
import { getMerchantRuntime } from "../application/merchant-runtime";
import { createMerchantCategoryRepository } from "../infrastructure/merchant-categories";
import { createMerchantAlbumRepository } from "../infrastructure/merchant-albums";
import { createCategoryUseCases } from "../application/merchant-category-flow";
import { runStrongDelete } from "../application/merchant-strong-delete";
import { guardedLoad, shouldShowSkeleton } from "../composables/load-guard";
import { SEGMENT_STEP, createSegmentLoader } from "../domain/merchant-segment";
import { sliceVisible } from "../domain/merchant-album";
import { useMerchantFooter } from "../composables/use-merchant-footer";
import { useMerchantShop } from "../composables/use-merchant-shop";
import { CATEGORY_NAME_MAX, CATEGORY_SORT_MAX, describeDeleteImpact, describeFinalConfirm, type CascadeImpact, type MerchantCategory } from "../domain/merchant-category";
import { hasPermission, PERM, type MerchantProfile } from "../domain/merchant-auth";

/** 排序号最多位数（与 CATEGORY_SORT_MAX 同源） */
const SORT_DIGITS = String(CATEGORY_SORT_MAX).length;

const rt = getMerchantRuntime();
const footer = useMerchantFooter();
const shop = useMerchantShop();
const uc = createCategoryUseCases({
  categories: createMerchantCategoryRepository({ client: rt.client }),
  albums: createMerchantAlbumRepository({ client: rt.client }),
});

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
const canManage = computed(() => hasPermission(profile.value, PERM.category));
const needLogin = computed(() => !loggedIn.value || authExpired.value);

/** 当前层级：null ＝ 一级列表；非 null ＝ 该一级下的二级列表 */
const parent = ref<MerchantCategory | null>(null);
const list = ref<MerchantCategory[]>([]);
const attempted = ref(false);
const loading = ref(false);
const loadError = ref<string | null>(null);
const working = ref(false);
let reloadSeq = 0;
const showSkeleton = computed(() =>
  shouldShowSkeleton({ itemCount: list.value.length, hasError: loadError.value !== null, loading: loading.value, attempted: attempted.value }),
);
// 分段渲染（客户端）：一次最多渲染 SEGMENT_STEP 条；触底自动加载 + 「显示更多」按钮兜底
const visibleCount = ref(SEGMENT_STEP);
const visible = computed(() => sliceVisible(list.value, visibleCount.value));
const segment = createSegmentLoader({
  step: SEGMENT_STEP,
  getVisible: () => visibleCount.value,
  getTotal: () => list.value.length,
  setVisible: (n) => {
    visibleCount.value = n;
  },
  isBlocked: () => loading.value || working.value || formShow.value || needLogin.value || !canManage.value,
});
function onLoadMore(): void {
  segment.loadMore(false);
}
onReachBottom(() => {
  segment.loadMore(true);
});
const levelTitle = computed(() => (parent.value == null ? "一级分类" : parent.value.name + " · 二级分类"));

function refreshLoginState(): void {
  const s = rt.getState();
  loggedIn.value = s.loggedIn;
  profile.value = s.profile;
  shop.refresh();
}

async function reload(): Promise<void> {
  refreshLoginState();
  if (!loggedIn.value || !canManage.value || !shop.hasShop.value) {
    attempted.value = true;
    return;
  }
  const mySeq = ++reloadSeq;
  loading.value = true;
  try {
    const g = await guardedLoad(() => (parent.value == null ? uc.loadParents(rt.nextContext(), shop.shopId.value) : uc.loadSubs(rt.nextContext(), parent.value.id)));
    if (mySeq !== reloadSeq) return;
    if (!g.ok) {
      loadError.value = g.message;
      return;
    }
    const r = g.value;
    if (!r.ok) {
      if (r.kind === "auth-expired") authExpired.value = true;
      loadError.value = r.message;
      if (list.value.length > 0 && r.kind !== "auth-expired") toast(r.message);
      return;
    }
    authExpired.value = false;
    loadError.value = null;
    list.value = r.list;
    visibleCount.value = Math.max(SEGMENT_STEP, Math.min(visibleCount.value, r.list.length));
  } finally {
    if (mySeq === reloadSeq) loading.value = false;
    attempted.value = true;
  }
}

onLoad(() => {
  void reload();
});
let firstShow = true;
onShow(() => {
  if (firstShow) {
    firstShow = false;
    return;
  }
  void reload();
});
const { refreshing, indicatorTop } = createPullRefresh({ label: "merchantCategory", refresh: () => reload(), hasCustomNav: true });

// —— 系列选择 ——
const shopPickerShow = ref(false);
const shopPicked = computed(() => [shop.shopId.value]);
function openShopPicker(): void {
  if (working.value) return;
  hapticTap();
  shopPickerShow.value = true;
}
function onShopConfirm(v: (string | number)[]): void {
  const id = Number(v[0]);
  if (!Number.isFinite(id) || id === shop.shopId.value) return;
  shop.select(id);
  parent.value = null;
  list.value = [];
  visibleCount.value = SEGMENT_STEP;
  loadError.value = null;
  void reload();
}

// —— 层级切换 ——
function onEnterParent(c: MerchantCategory): void {
  if (working.value || c.depth !== 1) return;
  hapticTap();
  parent.value = c;
  list.value = [];
  visibleCount.value = SEGMENT_STEP;
  loadError.value = null;
  attempted.value = false;
  void reload();
}
function onBackToParents(): void {
  if (working.value) return;
  hapticTap();
  parent.value = null;
  list.value = [];
  visibleCount.value = SEGMENT_STEP;
  loadError.value = null;
  attempted.value = false;
  void reload();
}

// —— 新增 / 编辑 弹层 ——
const formShow = ref(false);
const formMode = ref<"create" | "edit">("create");
const formName = ref("");
const formSort = ref("0");
const formError = ref("");
const editing = ref<MerchantCategory | null>(null);

function openCreate(): void {
  if (working.value) return;
  hapticTap();
  formMode.value = "create";
  formName.value = "";
  formSort.value = "0";
  formError.value = "";
  editing.value = null;
  formShow.value = true;
}
function onEditTap(c: MerchantCategory): void {
  if (working.value) return;
  hapticTap();
  formMode.value = "edit";
  formName.value = c.name;
  formSort.value = String(c.sortOrder);
  formError.value = "";
  editing.value = c;
  formShow.value = true;
}
function closeForm(): void {
  formShow.value = false;
}

async function submitForm(): Promise<void> {
  if (working.value) return;
  hapticTap();
  formError.value = "";
  working.value = true;
  try {
    let r;
    if (formMode.value === "create") {
      r = parent.value == null
        ? await uc.createParent(rt.nextContext(), { shopId: shop.shopId.value, name: formName.value, sortOrder: formSort.value })
        : await uc.createSub(rt.nextContext(), { parentId: parent.value.id, name: formName.value, sortOrder: formSort.value });
    } else if (editing.value != null) {
      r = await uc.edit(rt.nextContext(), editing.value, { name: formName.value, sortOrder: formSort.value });
    } else {
      return;
    }
    if (r.ok) {
      toast(formMode.value === "create" ? "已新增" : "已保存");
      closeForm();
      await reload();
      return;
    }
    if (r.kind === "auth-expired") {
      authExpired.value = true;
      closeForm();
      return;
    }
    formError.value = r.message; // 同名冲突等后端文案留在弹层内便于修改
  } finally {
    working.value = false;
  }
}

// —— 删除（强确认）——
let lastImpact: CascadeImpact = { subCount: 0, albumCount: 0 };
async function onDeleteTap(c: MerchantCategory): Promise<void> {
  if (working.value) return;
  hapticTap();
  working.value = true;
  try {
    const kind = c.depth === 2 ? "sub" : "parent";
    const outcome = await runStrongDelete({
      measure: async () => {
        const m = await uc.measureImpact(rt.nextContext(), c, shop.shopId.value);
        if (!m.ok) return { ok: false, message: m.message };
        lastImpact = m.impact;
        return { ok: true };
      },
      firstCopy: () => describeDeleteImpact(kind, c.name, lastImpact),
      finalCopy: () => describeFinalConfirm(c.name, lastImpact),
      confirm: async (copy) => (await dialogRef.value?.confirm(copy)) ?? "cancel",
      execute: async () => {
        const r = await uc.remove(rt.nextContext(), profile.value, c, shop.shopId.value);
        if (r.ok) return { ok: true };
        return { ok: false, message: r.message, authExpired: r.kind === "auth-expired" };
      },
    });
    if (outcome.status === "deleted") toast("已删除");
    else if (outcome.status === "blocked") toast(outcome.message);
    else if (outcome.status === "failed") {
      if (outcome.authExpired) authExpired.value = true;
      toast(outcome.message);
    }
    if (outcome.status === "deleted" || outcome.status === "failed") await reload(); // 以刷新结果为准
  } finally {
    working.value = false;
  }
}
</script>

<template>
  <view class="container">
    <PullRefreshIndicator :show="refreshing" :top="indicatorTop" />
    <CustomNavBar title="分类管理" />

    <MerchantNeedLogin v-if="needLogin" :expired="loggedIn" />
    <view v-else-if="!canManage" class="empty-state">
      <text class="empty-title">暂无权限</text>
      <text class="empty-desc">当前账号没有分类管理权限，请联系管理员</text>
    </view>
    <view v-else-if="!shop.hasShop.value" class="empty-state">
      <text class="empty-title">暂无可管理的系列</text>
      <text class="empty-desc">当前账号下没有系列，请联系管理员</text>
    </view>
    <template v-else>
      <view v-if="shop.multiple.value" class="shop-row" hover-class="press-dim" @click="openShopPicker">
        <text class="shop-label">系列</text>
        <text class="shop-value">{{ shop.currentName.value }}</text>
        <text class="shop-arrow">›</text>
      </view>

      <view class="level-row">
        <view v-if="parent !== null" class="back" hover-class="press-dim" @click="onBackToParents"><text class="back-text">‹ 返回一级</text></view>
        <text class="level-title">{{ levelTitle }}</text>
        <view :class="working ? 'add is-disabled' : 'add'" hover-class="press-dim" @click="openCreate"><text class="add-text">新增</text></view>
      </view>

      <view v-if="showSkeleton" class="sk-wrap">
        <SkeletonBlock v-for="i in 3" :key="i" width="100%" height="120rpx" radius="16rpx" />
      </view>
      <view v-else-if="loadError !== null && list.length === 0" class="empty-state">
        <text class="empty-title">加载失败</text>
        <text class="empty-desc">{{ loadError }}</text>
        <view class="retry" hover-class="press-dim" @click="reload"><text class="retry-text">重试</text></view>
      </view>
      <view v-else-if="list.length === 0" class="empty-state">
        <text class="empty-title">{{ parent === null ? "还没有一级分类" : "还没有二级分类" }}</text>
        <text class="empty-desc">点右上角「新增」创建</text>
        <view :class="working ? 'empty-cta is-disabled' : 'empty-cta'" hover-class="press-dim" @click="openCreate"><text class="empty-cta-text">新建分类</text></view>
      </view>
      <view v-else class="list">
        <view v-for="c in visible.items" :key="c.id" class="card">
          <view class="card-main" hover-class="press-dim" @click="onEnterParent(c)">
            <text class="card-name">{{ c.name }}</text>
            <text class="card-meta">排序 {{ c.sortOrder }}{{ c.depth === 1 ? " · 点击查看二级" : "" }}</text>
          </view>
          <view class="card-ops">
            <view :class="working ? 'op is-disabled' : 'op'" hover-class="press-dim" @click="onEditTap(c)"><text class="op-text">编辑</text></view>
            <view :class="working ? 'op op--danger is-disabled' : 'op op--danger'" hover-class="press-dim" @click="onDeleteTap(c)"><text class="op-text op-text--danger">删除</text></view>
          </view>
        </view>
        <view v-if="visible.hasMore" class="more" hover-class="press-dim" @click="onLoadMore"><text class="more-text">显示更多（{{ list.length - visible.items.length }}）</text></view>
      </view>
    </template>

    <BasePicker v-model:show="shopPickerShow" :model-value="shopPicked" title="选择系列" :options="shop.options.value" @confirm="onShopConfirm" />

    <BasePopup :show="formShow" position="bottom" :root-portal="false" :z-index="2000" @cancel="closeForm">
      <view class="sheet">
        <text class="sheet-title">{{ formMode === "create" ? (parent === null ? "新增一级分类" : "新增二级分类") : "编辑分类" }}</text>
        <BaseField v-model="formName" label="名称" placeholder="请输入分类名称" :maxlength="CATEGORY_NAME_MAX" show-count />
        <BaseField v-model="formSort" label="排序号" placeholder="0-9999，越小越靠前" type="number" :maxlength="SORT_DIGITS" />
        <text v-if="formError" class="form-error">{{ formError }}</text>
        <view :class="working ? 'sheet-btn is-disabled' : 'sheet-btn'" hover-class="press-dim" @click="submitForm">
          <text class="sheet-btn-text">{{ working ? "提交中..." : "确定" }}</text>
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
.shop-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin: $space-md $space-md 0;
  padding: 20rpx $space-md;
  border-radius: 20rpx;
  border: 2rpx solid rgba(241, 205, 145, 0.12);
  background: rgba(241, 205, 145, 0.06);
}
.shop-label {
  font-size: $font-size-caption;
  color: $color-text-secondary;
  margin-right: $space-md;
}
.shop-value {
  flex: 1;
  font-size: $font-size-body;
  color: $color-action;
}
.shop-arrow {
  font-size: $font-size-title;
  color: $color-text-secondary;
}
.level-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: $space-md $space-md $space-sm;
}
.back {
  margin-right: $space-sm;
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  border: 2rpx solid $color-border;
}
.back-text {
  font-size: $font-size-caption;
  color: $color-action;
}
.level-title {
  flex: 1;
  font-size: $font-size-sub-title;
  color: $color-action;
}
.add {
  padding: 10rpx 32rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%);
}
.add-text {
  font-size: $font-size-caption;
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
  align-items: center;
  justify-content: space-between;
  border-radius: 20rpx;
  background: rgba(241, 205, 145, 0.06);
  border: 2rpx solid rgba(241, 205, 145, 0.12);
  padding: $space-md;
}
.card-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.card-name {
  font-size: $font-size-sub-title;
  color: $color-action;
}
.card-meta {
  margin-top: 8rpx;
  font-size: $font-size-caption;
  color: $color-text-secondary;
}
.card-ops {
  display: flex;
  flex-direction: row;
  gap: 12rpx;
}
.op {
  padding: 8rpx 24rpx;
  border-radius: 999rpx;
  border: 2rpx solid $color-border;
}
.op--danger {
  border-color: rgba(255, 107, 107, 0.6);
}
.op-text {
  font-size: $font-size-caption;
  color: $color-action;
}
.op-text--danger {
  color: #ff6b6b;
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
</style>
