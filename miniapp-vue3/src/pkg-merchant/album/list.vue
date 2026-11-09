<script setup lang="ts">
// 商家相册管理（issue #14 · M2）：系列选择 → 相册列表（按分类筛选 + 关键字；客户端分段渲染每次 +20，后端无分页）→ （图片网格随下一批提供）；
// 新建 / 改名改分类改价改说明 / 换封面 / 删除（级联 ⇒ 先统计图片数 + 两次确认）。
// ⚠️ 后端细节（见 domain/merchant-album.ts）：列表 shop_id、修改 shopId、删除 shop_id；修改是整条 Save ⇒ 用「原值 + 变更」合成全量 body；
//    相册必须挂二级分类；封面经压缩（商家口径 1600/3MB，失败不回退原图）→ POST upload-cover（字段 file）→ 必须拿到 image_url。
// ⭐经验（issue #14 M1 真机缺陷）：首屏骨架屏必须有失败/超时出口——加载经 guardedLoad，骨架屏走 shouldShowSkeleton；
//    模板事件只调具名函数。底部 PageFooter（主行空）。
import { computed, onUnmounted, ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import PageFooter from "../../components/PageFooter/PageFooter.vue";
import PullRefreshIndicator from "../../components/PullRefreshIndicator/PullRefreshIndicator.vue";
import SkeletonBlock from "../../components/SkeletonBlock/SkeletonBlock.vue";
import BaseDialog from "../../ui/BaseDialog.vue";
import BaseFeedback from "../../ui/BaseFeedback.vue";
import BaseField from "../../ui/BaseField.vue";
import BasePicker from "../../ui/BasePicker.vue";
import BasePopup from "../../ui/BasePopup.vue";
import BaseProgress from "../../ui/BaseProgress.vue";
import MerchantNeedLogin from "../components/MerchantNeedLogin.vue";
import { createPullRefresh } from "../../composables/use-pull-refresh";
import { toast as nativeToast } from "../../platform/uni/feedback";
import { hapticTap } from "../../application/haptics";
import { getMerchantRuntime } from "../application/merchant-runtime";
import { createMerchantAlbumRepository } from "../infrastructure/merchant-albums";
import { createMerchantImageRepository } from "../infrastructure/merchant-images";
import { createMerchantCategoryRepository } from "../infrastructure/merchant-categories";
import { createAlbumUseCases } from "../application/merchant-album-flow";
import { createCategoryUseCases } from "../application/merchant-category-flow";
import { createCoverUploader } from "../application/merchant-cover-uploader";
import { createMerchantUploadDeps } from "../application/merchant-upload-deps";
import { runStrongDelete } from "../application/merchant-strong-delete";
import { guardedLoad, shouldShowSkeleton } from "../composables/load-guard";
import { useMerchantFooter } from "../composables/use-merchant-footer";
import { useMerchantShop } from "../composables/use-merchant-shop";
import { ALBUM_PAGE_STEP, albumCoverThumb, describeAlbumDelete, describeAlbumFinalConfirm, nextVisibleCount, sliceVisible, type MerchantAlbum } from "../domain/merchant-album";
import { filterOptions, labelOfSub, subCategoryOptions, type CategoryTreeNode } from "../domain/merchant-category-tree";
import { hasPermission, PERM, type MerchantProfile } from "../domain/merchant-auth";
import { PICK_FAIL_TEXT } from "../domain/merchant-upload";

const rt = getMerchantRuntime();
const footer = useMerchantFooter();
const shop = useMerchantShop();
const upDeps = createMerchantUploadDeps();
const albumUc = createAlbumUseCases({ albums: createMerchantAlbumRepository({ client: rt.client }), images: createMerchantImageRepository({ client: rt.client }) });
const catUc = createCategoryUseCases({ categories: createMerchantCategoryRepository({ client: rt.client }), albums: createMerchantAlbumRepository({ client: rt.client }) });
const cover = createCoverUploader({ upload: upDeps.newUpload(), compress: upDeps.compress, getToken: () => rt.getToken(), uploadUrl: upDeps.coverUploadUrl() });

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
const canManage = computed(() => hasPermission(profile.value, PERM.album));
const needLogin = computed(() => !loggedIn.value || authExpired.value);

const albums = ref<MerchantAlbum[]>([]);
const tree = ref<CategoryTreeNode[]>([]);
const attempted = ref(false);
const loading = ref(false);
const loadError = ref<string | null>(null);
const working = ref(false);
const visibleCount = ref(ALBUM_PAGE_STEP);
let reloadSeq = 0;
const showSkeleton = computed(() =>
  shouldShowSkeleton({ itemCount: albums.value.length, hasError: loadError.value !== null, loading: loading.value, attempted: attempted.value }),
);
const visible = computed(() => sliceVisible(albums.value, visibleCount.value));

// —— 筛选 ——
const filterSub = ref(0); // 0=全部
const keyword = ref("");
const filterPickerShow = ref(false);
const filterOpts = computed(() => filterOptions(tree.value));
const filterLabel = computed(() => (filterSub.value === 0 ? "全部分类" : labelOfSub(tree.value, filterSub.value) || "全部分类"));

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
    const g = await guardedLoad(async () => {
      // 分类树只在为空/换系列后需要；这里每次顺带刷新（量小），失败不阻断相册列表本身
      const t = await catUc.loadTree(rt.nextContext(), shop.shopId.value);
      const a = await albumUc.load(rt.nextContext(), { shopId: shop.shopId.value, childId: filterSub.value > 0 ? filterSub.value : undefined, keyword: keyword.value });
      return { t, a };
    });
    if (mySeq !== reloadSeq) return;
    if (!g.ok) {
      loadError.value = g.message;
      return;
    }
    if (g.value.t.ok) tree.value = g.value.t.tree;
    const r = g.value.a;
    if (!r.ok) {
      if (r.kind === "auth-expired") authExpired.value = true;
      loadError.value = r.message;
      if (albums.value.length > 0 && r.kind !== "auth-expired") toast(r.message);
      return;
    }
    authExpired.value = false;
    loadError.value = null;
    albums.value = r.list;
    visibleCount.value = Math.max(ALBUM_PAGE_STEP, Math.min(visibleCount.value, r.list.length));
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
  void reload(); // 从图片网格返回：封面/数量可能变化
});
onUnmounted(() => cover.cancel());
const { refreshing, indicatorTop } = createPullRefresh({ label: "merchantAlbums", refresh: () => reload(), hasCustomNav: true });

function onLoadMore(): void {
  visibleCount.value = nextVisibleCount(visibleCount.value, albums.value.length);
}

// —— 系列 / 分类筛选 / 搜索 ——
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
  filterSub.value = 0;
  keyword.value = "";
  albums.value = [];
  tree.value = [];
  attempted.value = false;
  void reload();
}
function openFilterPicker(): void {
  if (working.value) return;
  hapticTap();
  filterPickerShow.value = true;
}
function onFilterConfirm(v: (string | number)[]): void {
  const id = Number(v[0]);
  filterSub.value = Number.isFinite(id) && id > 0 ? id : 0;
  visibleCount.value = ALBUM_PAGE_STEP;
  void reload();
}
function onSearch(): void {
  hapticTap();
  visibleCount.value = ALBUM_PAGE_STEP;
  void reload();
}

// —— 新建 / 编辑 ——
const formShow = ref(false);
const formMode = ref<"create" | "edit">("create");
const editing = ref<MerchantAlbum | null>(null);
const fTitle = ref("");
const fPrice = ref("0");
const fPackageDesc = ref("");
const fChildId = ref(0);
const fCover = ref("");
const fCoverPercent = ref(0);
const fCoverBusy = ref(false);
const fError = ref("");
const childPickerShow = ref(false);
const childOpts = computed(() => subCategoryOptions(tree.value));
const childPicked = computed(() => [fChildId.value]);
const childLabel = computed(() => labelOfSub(tree.value, fChildId.value) || "请选择");

function openCreate(): void {
  if (working.value) return;
  hapticTap();
  if (childOpts.value.length === 0) {
    toast("请先在「分类管理」里创建二级分类");
    return;
  }
  formMode.value = "create";
  editing.value = null;
  fTitle.value = "";
  fPrice.value = "0";
  fPackageDesc.value = "";
  fChildId.value = filterSub.value > 0 ? filterSub.value : 0;
  fCover.value = "";
  fError.value = "";
  formShow.value = true;
}
function onEditTap(a: MerchantAlbum): void {
  if (working.value) return;
  hapticTap();
  formMode.value = "edit";
  editing.value = a;
  fTitle.value = a.title;
  fPrice.value = a.price;
  fPackageDesc.value = a.packageDesc;
  fChildId.value = a.childId;
  fCover.value = a.coverImageUrl;
  fError.value = "";
  formShow.value = true;
}
function closeForm(): void {
  if (fCoverBusy.value) cover.cancel();
  formShow.value = false;
}
function openChildPicker(): void {
  hapticTap();
  childPickerShow.value = true;
}
function onChildConfirm(v: (string | number)[]): void {
  const id = Number(v[0]);
  if (Number.isFinite(id) && id > 0) fChildId.value = id;
}

async function onPickCover(): Promise<void> {
  if (fCoverBusy.value || working.value) return;
  hapticTap();
  const p = await upDeps.picker.pick(1);
  if (!p.ok) {
    if (p.reason !== "cancel") toast(PICK_FAIL_TEXT);
    return;
  }
  fCoverBusy.value = true;
  fCoverPercent.value = 0;
  fError.value = "";
  try {
    const r = await cover.upload({ shopId: shop.shopId.value, path: p.files[0].path, size: p.files[0].size }, (pct) => {
      fCoverPercent.value = pct;
    });
    if (r.ok) fCover.value = r.url;
    else {
      if (r.kind === "auth-expired") authExpired.value = true;
      fError.value = r.message;
    }
  } finally {
    fCoverBusy.value = false;
  }
}

async function submitForm(): Promise<void> {
  if (working.value || fCoverBusy.value) return;
  hapticTap();
  fError.value = "";
  working.value = true;
  try {
    const r =
      formMode.value === "create"
        ? await albumUc.create(rt.nextContext(), profile.value, shop.shopId.value, {
            title: fTitle.value, childId: fChildId.value, coverImageUrl: fCover.value, price: fPrice.value, packageDesc: fPackageDesc.value, aiDesc: "", sortOrder: 0,
          })
        : editing.value != null
          ? await albumUc.update(rt.nextContext(), profile.value, shop.shopId.value, editing.value, {
              title: fTitle.value, childId: fChildId.value, coverImageUrl: fCover.value, price: fPrice.value, packageDesc: fPackageDesc.value,
            })
          : null;
    if (r == null) return;
    if (r.ok) {
      toast(formMode.value === "create" ? "已新建相册" : "已保存");
      formShow.value = false;
      await reload();
      return;
    }
    if (r.kind === "auth-expired") {
      authExpired.value = true;
      formShow.value = false;
      return;
    }
    fError.value = r.message;
  } finally {
    working.value = false;
  }
}

// —— 删除（强确认）——
let lastImageCount: number | null = null;
async function onDeleteTap(a: MerchantAlbum): Promise<void> {
  if (working.value) return;
  hapticTap();
  working.value = true;
  try {
    const outcome = await runStrongDelete({
      measure: async () => {
        const m = await albumUc.measureImages(rt.nextContext(), shop.shopId.value, a.id);
        if (!m.ok) return { ok: false, message: m.message };
        lastImageCount = m.count;
        return { ok: true };
      },
      firstCopy: () => describeAlbumDelete(a.title, lastImageCount),
      finalCopy: () => describeAlbumFinalConfirm(a.title),
      confirm: async (copy) => (await dialogRef.value?.confirm(copy)) ?? "cancel",
      execute: async () => {
        const r = await albumUc.remove(rt.nextContext(), profile.value, shop.shopId.value, a.id);
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
    if (outcome.status === "deleted" || outcome.status === "failed") await reload();
  } finally {
    working.value = false;
  }
}
</script>

<template>
  <view class="container">
    <PullRefreshIndicator :show="refreshing" :top="indicatorTop" />
    <CustomNavBar title="相册管理" transparent />

    <MerchantNeedLogin v-if="needLogin" :expired="loggedIn" />
    <view v-else-if="!canManage" class="empty-state">
      <text class="empty-title">暂无权限</text>
      <text class="empty-desc">当前账号没有相册管理权限，请联系管理员</text>
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

      <view class="tool-row">
        <view class="filter" hover-class="press-dim" @click="openFilterPicker"><text class="filter-text">{{ filterLabel }} ▾</text></view>
        <input class="search" v-model="keyword" placeholder="搜索相册名称" confirm-type="search" @confirm="onSearch" />
        <view :class="working ? 'add is-disabled' : 'add'" hover-class="press-dim" @click="openCreate"><text class="add-text">新建</text></view>
      </view>

      <view v-if="showSkeleton" class="sk-wrap">
        <SkeletonBlock v-for="i in 3" :key="i" width="100%" height="180rpx" radius="16rpx" />
      </view>
      <view v-else-if="loadError !== null && albums.length === 0" class="empty-state">
        <text class="empty-title">加载失败</text>
        <text class="empty-desc">{{ loadError }}</text>
        <view class="retry" hover-class="press-dim" @click="reload"><text class="retry-text">重试</text></view>
      </view>
      <view v-else-if="albums.length === 0" class="empty-state">
        <text class="empty-title">还没有相册</text>
        <text class="empty-desc">点右上角「新建」创建第一个相册</text>
      </view>
      <view v-else class="list">
        <view v-for="a in visible.items" :key="a.id" class="card">
          <view class="card-main">
            <image v-if="a.coverImageUrl" class="cover" :src="albumCoverThumb(a.coverImageUrl)" mode="aspectFill" lazy-load />
            <view v-else class="cover cover--empty"><text class="cover-empty-text">无封面</text></view>
            <view class="info">
              <text class="name">{{ a.title }}</text>
              <text class="meta">{{ a.childName || "未分类" }} · ¥{{ a.price }}</text>
            </view>
          </view>
          <view class="card-ops">
            <view :class="working ? 'op is-disabled' : 'op'" hover-class="press-dim" @click="onEditTap(a)"><text class="op-text">编辑</text></view>
            <view :class="working ? 'op op--danger is-disabled' : 'op op--danger'" hover-class="press-dim" @click="onDeleteTap(a)"><text class="op-text op-text--danger">删除</text></view>
          </view>
        </view>
        <view v-if="visible.hasMore" class="more" hover-class="press-dim" @click="onLoadMore"><text class="more-text">显示更多（{{ albums.length - visible.items.length }}）</text></view>
        <view v-else class="more"><text class="more-text">已经到底了</text></view>
      </view>
    </template>

    <BasePicker v-model:show="shopPickerShow" :model-value="shopPicked" title="选择系列" :options="shop.options.value" @confirm="onShopConfirm" />
    <BasePicker v-model:show="filterPickerShow" :model-value="[filterSub]" title="按分类筛选" :options="filterOpts" @confirm="onFilterConfirm" />
    <BasePicker v-model:show="childPickerShow" :model-value="childPicked" title="所属分类" :options="childOpts" @confirm="onChildConfirm" />

    <BasePopup :show="formShow" position="bottom" :root-portal="false" :z-index="2000" @cancel="closeForm">
      <view class="sheet">
        <text class="sheet-title">{{ formMode === "create" ? "新建相册" : "编辑相册" }}</text>
        <BaseField v-model="fTitle" label="相册名称" placeholder="请输入相册名称" />
        <view class="pick-row" hover-class="press-dim" @click="openChildPicker">
          <text class="pick-label">所属分类</text>
          <text :class="fChildId > 0 ? 'pick-value' : 'pick-value pick-value--ph'">{{ childLabel }}</text>
        </view>
        <BaseField v-model="fPrice" label="价格(元)" placeholder="0" type="digit" />
        <BaseField v-model="fPackageDesc" label="套餐说明" placeholder="选填" />
        <view class="cover-row">
          <text class="pick-label">封面</text>
          <image v-if="fCover" class="cover-sm" :src="albumCoverThumb(fCover, 200)" mode="aspectFill" />
          <view :class="fCoverBusy ? 'cover-btn is-disabled' : 'cover-btn'" hover-class="press-dim" @click="onPickCover">
            <text class="cover-btn-text">{{ fCoverBusy ? "上传中..." : fCover ? "更换封面" : "选择封面" }}</text>
          </view>
        </view>
        <view v-if="fCoverBusy" class="progress"><BaseProgress :percentage="fCoverPercent" /></view>
        <text v-if="fError" class="form-error">{{ fError }}</text>
        <view :class="working || fCoverBusy ? 'sheet-btn is-disabled' : 'sheet-btn'" hover-class="press-dim" @click="submitForm">
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
.tool-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
  padding: $space-md $space-md $space-sm;
}
.filter {
  padding: 12rpx 24rpx;
  border-radius: 999rpx;
  border: 2rpx solid $color-border;
}
.filter-text {
  font-size: $font-size-caption;
  color: $color-action;
}
.search {
  flex: 1;
  min-width: 0;
  height: 64rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background: rgba(241, 205, 145, 0.08);
  font-size: $font-size-caption;
  color: $color-text-primary;
}
.add {
  padding: 12rpx 32rpx;
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
.card-main {
  display: flex;
  flex-direction: row;
  align-items: center;
}
.cover {
  width: 160rpx;
  height: 160rpx;
  border-radius: 16rpx;
  flex-shrink: 0;
}
.cover--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
}
.cover-empty-text {
  font-size: $font-size-caption;
  color: $color-text-muted;
}
.info {
  flex: 1;
  margin-left: $space-md;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.name {
  font-size: $font-size-sub-title;
  color: $color-action;
}
.meta {
  margin-top: 8rpx;
  font-size: $font-size-caption;
  color: $color-text-secondary;
}
.card-ops {
  margin-top: $space-sm;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
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
.more {
  display: flex;
  justify-content: center;
  padding: $space-md 0;
}
.more-text {
  font-size: $font-size-caption;
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
.pick-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 24rpx 0;
  border-bottom: 2rpx solid $color-divider;
}
.pick-label {
  width: 180rpx;
  flex-shrink: 0;
  font-size: $font-size-body;
  color: $color-text-secondary;
}
.pick-value {
  flex: 1;
  font-size: $font-size-body;
  color: $color-text-primary;
}
.pick-value--ph {
  color: $color-text-muted;
}
.cover-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 24rpx 0;
}
.cover-sm {
  width: 96rpx;
  height: 96rpx;
  border-radius: 12rpx;
  margin-right: $space-sm;
}
.cover-btn {
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  border: 2rpx solid $color-border;
}
.cover-btn-text {
  font-size: $font-size-caption;
  color: $color-action;
}
.progress {
  margin-bottom: $space-sm;
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
