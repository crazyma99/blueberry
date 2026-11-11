<script setup lang="ts">
// 商家相册详情 / 图片网格（issue #14 · M2）：三列缩略图（cosThumb）、批量上传（串行、逐张进度、失败单张重试）、
// 上/下移排序（对整个相册重新连号提交，刷新后核对顺序）、单张/批量删除（刷新为准）、单图 AI 试衣开关。
// ⚠️ 后端静默成功陷阱：排序对无效项静默跳过、删除对不存在/无权静默成功 ⇒ 每次提交后都重新拉取，以刷新结果为准。
// ⚠️ 上传：1 请求 1 张，必须串行（后端每请求先读 maxSort 再连号，并发会重复）；成功判定核对响应条数===1；全部结束统一刷新。
//    上传期间离开页面 / 退出登录 / 登录失效：安全中止（cancel 上传任务，剩余项标失败）。
// ⚠️ 新图 aiTryonStatus 初始 0（上传后异步打标）：试衣开关容忍「刚上传显示未启用、稍后变可用」，下拉刷新可见最新状态。
// ⭐经验（issue #14 M1 真机缺陷）：首屏骨架屏必须有失败/超时出口——加载经 guardedLoad，骨架屏走 shouldShowSkeleton；模板事件只调具名函数。
import { computed, onUnmounted, ref } from "vue";
import { onHide, onLoad, onReachBottom, onShow } from "@dcloudio/uni-app";
import CustomNavBar from "../../components/CustomNavBar/CustomNavBar.vue";
import PageFooter from "../../components/PageFooter/PageFooter.vue";
import PullRefreshIndicator from "../../components/PullRefreshIndicator/PullRefreshIndicator.vue";
import SkeletonBlock from "../../components/SkeletonBlock/SkeletonBlock.vue";
import BaseDialog from "../../ui/BaseDialog.vue";
import BaseFeedback from "../../ui/BaseFeedback.vue";
import BaseProgress from "../../ui/BaseProgress.vue";
import MerchantNeedLogin from "../components/MerchantNeedLogin.vue";
import { createPullRefresh } from "../../composables/use-pull-refresh";
import { toast as nativeToast } from "../../platform/uni/feedback";
import { hapticTap } from "../../application/haptics";
import { getMerchantRuntime } from "../application/merchant-runtime";
import { createMerchantImageRepository } from "../infrastructure/merchant-images";
import { createImageUseCases } from "../application/merchant-image-flow";
import { createAlbumUploader, type AlbumUploader } from "../application/merchant-album-uploader";
import { createMerchantUploadDeps } from "../application/merchant-upload-deps";
import { guardedLoad, shouldShowSkeleton } from "../composables/load-guard";
import { useMerchantFooter } from "../composables/use-merchant-footer";
import { ALBUM_PAGE_STEP, sliceVisible } from "../domain/merchant-album";
import { createSegmentLoader } from "../domain/merchant-segment";
import { createUniImagePreview } from "../../platform/uni/image-preview";
import { buildPreview, canMove, describeImageDelete, describeTryon, imageThumb, pruneSelected, toggleSelected, type MerchantImage } from "../domain/merchant-image";
import { MERCHANT_PICK_MAX_COUNT, PICK_FAIL_TEXT, describeQueue, overallPercent, summarizeQueue, type UploadQueueItem } from "../domain/merchant-upload";
import { hasPermission, PERM, type MerchantProfile } from "../domain/merchant-auth";
import { isPositiveId } from "../domain/merchant-http";

const rt = getMerchantRuntime();
const footer = useMerchantFooter();
const upDeps = createMerchantUploadDeps();
const uc = createImageUseCases({ images: createMerchantImageRepository({ client: rt.client }) });

const feedbackRef = ref<InstanceType<typeof BaseFeedback> | null>(null);
const dialogRef = ref<InstanceType<typeof BaseDialog> | null>(null);
function toast(text: string): void {
  const f = feedbackRef.value;
  if (f != null) f.show(text);
  else nativeToast(text);
}

// —— 路由参数（由相册列表带入；缺失/非法 ⇒ 参数错误空态）——
const albumId = ref(0);
const shopId = ref(0);
const albumTitle = ref("相册");

const loggedIn = ref(false);
const authExpired = ref(false);
const profile = ref<MerchantProfile | null>(null);
const canManage = computed(() => hasPermission(profile.value, PERM.album));
const needLogin = computed(() => !loggedIn.value || authExpired.value);
const paramsOk = computed(() => isPositiveId(albumId.value) && isPositiveId(shopId.value));

const images = ref<MerchantImage[]>([]);
const attempted = ref(false);
const loading = ref(false);
const loadError = ref<string | null>(null);
const working = ref(false);
const visibleCount = ref(ALBUM_PAGE_STEP * 3); // 三列网格每次多显示 60 张
let reloadSeq = 0;
const showSkeleton = computed(() =>
  shouldShowSkeleton({ itemCount: images.value.length, hasError: loadError.value !== null, loading: loading.value, attempted: attempted.value }),
);
const visible = computed(() => sliceVisible(images.value, visibleCount.value));

function refreshLoginState(): void {
  const s = rt.getState();
  loggedIn.value = s.loggedIn;
  profile.value = s.profile;
}

async function reload(): Promise<void> {
  refreshLoginState();
  if (!loggedIn.value || !canManage.value || !paramsOk.value) {
    attempted.value = true;
    return;
  }
  const mySeq = ++reloadSeq;
  loading.value = true;
  try {
    const g = await guardedLoad(() => uc.load(rt.nextContext(), shopId.value, albumId.value));
    if (mySeq !== reloadSeq) return;
    if (!g.ok) {
      loadError.value = g.message;
      return;
    }
    const r = g.value;
    if (!r.ok) {
      if (r.kind === "auth-expired") {
        authExpired.value = true;
        abortUpload();
      }
      loadError.value = r.message;
      if (images.value.length > 0 && r.kind !== "auth-expired") toast(r.message);
      return;
    }
    authExpired.value = false;
    loadError.value = null;
    images.value = r.images;
    selected.value = pruneSelected(selected.value, r.images);
  } finally {
    if (mySeq === reloadSeq) loading.value = false;
    attempted.value = true;
  }
}

onLoad((q) => {
  const o = (q ?? {}) as Record<string, unknown>;
  albumId.value = Number(o.albumId) || 0;
  shopId.value = Number(o.shopId) || 0;
  const t = typeof o.title === "string" ? o.title : "";
  try {
    albumTitle.value = t !== "" ? decodeURIComponent(t) : "相册";
  } catch {
    albumTitle.value = t !== "" ? t : "相册";
  }
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
// 离开页面（含返回、跳转、退出）：安全中止上传，避免后台继续占用网络/写入
onHide(() => abortUpload());
onUnmounted(() => abortUpload());
const { refreshing, indicatorTop } = createPullRefresh({ label: "merchantImages", refresh: () => reload(), hasCustomNav: true });

// 分段渲染（客户端）：触底自动加载 + 「显示更多」按钮兜底；防重复：加载中/忙碌/未授权忽略，触底带冷却
const segment = createSegmentLoader({
  step: ALBUM_PAGE_STEP * 3,
  getVisible: () => visibleCount.value,
  getTotal: () => images.value.length,
  setVisible: (n) => {
    visibleCount.value = n;
  },
  isBlocked: () => loading.value || working.value || needLogin.value || !canManage.value,
});
function onLoadMore(): void {
  segment.loadMore(false);
}
onReachBottom(() => {
  segment.loadMore(true);
});

// —— 上传 ——
const queue = ref<UploadQueueItem[]>([]);
const uploading = computed(() => queue.value.some((q) => q.status === "queued" || q.status === "compressing" || q.status === "uploading"));
const queueSummary = computed(() => summarizeQueue(queue.value));
const queueText = computed(() => describeQueue(queue.value));
const queuePercent = computed(() => overallPercent(queue.value));
const hasFailed = computed(() => queueSummary.value.failed > 0);
let uploader: AlbumUploader | null = null;

function ensureUploader(): AlbumUploader {
  if (uploader != null) return uploader;
  uploader = createAlbumUploader({
    upload: upDeps.newUpload(),
    compress: upDeps.compress,
    getToken: () => rt.getToken(),
    uploadUrl: upDeps.albumUploadUrl(),
    shopId: shopId.value,
    albumId: albumId.value,
    onChange: (items) => {
      queue.value = items.slice();
    },
    onFinished: () => {
      void reload(); // 全部结束（含失败）统一刷新网格，以服务端为准
    },
    onAuthExpired: () => {
      authExpired.value = true;
    },
    // 401 精确作废商家会话：否则「前往登录」页 onShow 看到会话还在会直接弹回工作台（循环）
    expireSession: (usedToken) => {
      rt.expireSessionByToken(usedToken);
    },
  });
  return uploader;
}
function abortUpload(): void {
  if (uploader != null && uploader.isRunning()) uploader.cancel();
}

async function onPickTap(): Promise<void> {
  if (working.value || !paramsOk.value) return;
  hapticTap();
  const p = await upDeps.picker.pick(MERCHANT_PICK_MAX_COUNT);
  if (!p.ok) {
    if (p.reason !== "cancel") toast(PICK_FAIL_TEXT);
    return;
  }
  const r = ensureUploader().enqueue(p.files);
  if (r.dropped > 0) toast("一次最多排队 30 张，已忽略多出的 " + r.dropped + " 张，请分批上传");
}
function onRetryAll(): void {
  hapticTap();
  ensureUploader().retryAllFailed();
}
function onRetryOne(key: number): void {
  hapticTap();
  ensureUploader().retry(key);
}
function onClearQueue(): void {
  hapticTap();
  uploader?.clearFinished();
}

// —— 排序 ——
async function onMove(img: MerchantImage, dir: "up" | "down"): Promise<void> {
  if (working.value || uploading.value) return;
  hapticTap();
  working.value = true;
  try {
    const r = await uc.move(rt.nextContext(), profile.value, shopId.value, albumId.value, images.value, img.id, dir);
    if (r.ok) {
      images.value = r.images;
      if (!r.applied) toast("排序未完全生效，已按服务器最新顺序刷新");
      return;
    }
    if (r.kind === "auth-expired") authExpired.value = true;
    toast(r.message);
    if (r.kind !== "validation") await reload();
  } finally {
    working.value = false;
  }
}

/** 三列网格：每行第 3 个去右边距（idx 从 0 起） */
function gridCellClass(idx: number): string {
  return (idx + 1) % 3 === 0 ? "cell is-end" : "cell";
}

// —— 试衣开关 ——
async function onToggleTryon(img: MerchantImage): Promise<void> {
  if (working.value) return;
  hapticTap();
  working.value = true;
  try {
    const r = await uc.setTryon(rt.nextContext(), profile.value, shopId.value, img);
    if (r.ok) {
      images.value = images.value.map((x) => (x.id === img.id ? r.image : x));
      return;
    }
    if (r.kind === "auth-expired") authExpired.value = true;
    toast(r.message);
  } finally {
    working.value = false;
  }
}

// —— 选择 / 删除 ——
const selectMode = ref(false);
const selected = ref<number[]>([]);
function onToggleSelectMode(): void {
  if (working.value) return;
  hapticTap();
  selectMode.value = !selectMode.value;
  if (!selectMode.value) selected.value = [];
}
const previewer = createUniImagePreview();
/** 点图：选择模式 ⇒ 勾选；否则打开大图预览（左右滑翻整个相册，长按用微信自带菜单保存）。失败给可读提示，不抛 */
async function onTapImage(img: MerchantImage): Promise<void> {
  hapticTap();
  if (selectMode.value) {
    selected.value = toggleSelected(selected.value, img.id);
    return;
  }
  const p = buildPreview(images.value, img.id);
  if (p.index < 0) return;
  const ok = await previewer.preview(p.urls, p.index);
  if (!ok) toast("图片预览失败，请稍后重试");
}
async function deleteIds(ids: readonly number[]): Promise<void> {
  if (working.value || uploading.value || ids.length === 0) return;
  working.value = true;
  try {
    const choice = await dialogRef.value?.confirm(describeImageDelete(ids.length));
    if (choice !== "confirm") return;
    const r = await uc.remove(rt.nextContext(), profile.value, shopId.value, albumId.value, ids);
    if (!r.ok) {
      if (r.kind === "auth-expired") authExpired.value = true;
      toast(r.message);
      await reload();
      return;
    }
    images.value = r.images;
    selected.value = pruneSelected(selected.value, r.images);
    if (r.remaining.length > 0) toast("有 " + r.remaining.length + " 张未删除成功" + (r.failedMessage !== "" ? "：" + r.failedMessage : "，请重试"));
    else toast("已删除 " + r.deleted + " 张");
    if (r.images.length === 0) selectMode.value = false;
  } finally {
    working.value = false;
  }
}
function onDeleteSelected(): void {
  hapticTap();
  void deleteIds(selected.value);
}
function onDeleteOne(img: MerchantImage): void {
  hapticTap();
  void deleteIds([img.id]);
}
function isSelected(id: number): boolean {
  return selected.value.includes(id);
}
function tryonMeta(img: MerchantImage) {
  return describeTryon(img);
}
function statusText(it: UploadQueueItem): string {
  if (it.status === "queued") return "排队中";
  if (it.status === "compressing") return "压缩中";
  if (it.status === "uploading") return "上传中 " + it.percent + "%";
  if (it.status === "done") return "已完成";
  return it.error;
}
</script>

<template>
  <view class="container">
    <PullRefreshIndicator :show="refreshing" :top="indicatorTop" />
    <CustomNavBar :title="albumTitle" transparent />

    <MerchantNeedLogin v-if="needLogin" :expired="loggedIn" />
    <view v-else-if="!canManage" class="empty-state">
      <text class="empty-title">暂无权限</text>
      <text class="empty-desc">当前账号没有相册管理权限，请联系管理员</text>
    </view>
    <view v-else-if="!paramsOk" class="empty-state">
      <text class="empty-title">参数错误</text>
      <text class="empty-desc">请从「相册管理」列表进入</text>
    </view>
    <template v-else>
      <view class="tool-row">
        <view :class="working || selectMode ? 'btn btn--primary is-disabled' : 'btn btn--primary'" hover-class="press-dim" @click="onPickTap"><text class="btn-text btn-text--primary">上传图片</text></view>
        <view :class="working ? 'btn is-disabled' : 'btn'" hover-class="press-dim" @click="onToggleSelectMode"><text class="btn-text">{{ selectMode ? "取消选择" : "批量选择" }}</text></view>
        <view v-if="selectMode" :class="selected.length === 0 || working ? 'btn btn--danger is-disabled' : 'btn btn--danger'" hover-class="press-dim" @click="onDeleteSelected">
          <text class="btn-text btn-text--danger">删除({{ selected.length }})</text>
        </view>
      </view>

      <view v-if="queue.length > 0" class="queue">
        <view class="queue-head">
          <text class="queue-title">{{ queueText }}</text>
          <view v-if="!uploading" class="queue-close" hover-class="press-dim" @click="onClearQueue"><text class="queue-close-text">收起</text></view>
        </view>
        <BaseProgress :percentage="queuePercent" />
        <view v-for="it in queue" :key="it.key" class="queue-item">
          <text :class="it.status === 'failed' ? 'queue-name queue-name--bad' : 'queue-name'">第 {{ it.key }} 张 · {{ statusText(it) }}</text>
          <view v-if="it.status === 'failed'" class="queue-retry" hover-class="press-dim" @click="onRetryOne(it.key)"><text class="queue-retry-text">重试</text></view>
        </view>
        <view v-if="hasFailed && !uploading" class="queue-retry-all" hover-class="press-dim" @click="onRetryAll"><text class="queue-retry-text">全部失败项重试</text></view>
      </view>

      <view v-if="showSkeleton" class="sk-grid">
        <SkeletonBlock v-for="i in 6" :key="i" width="32%" height="220rpx" radius="12rpx" />
      </view>
      <view v-else-if="loadError !== null && images.length === 0" class="empty-state">
        <text class="empty-title">加载失败</text>
        <text class="empty-desc">{{ loadError }}</text>
        <view class="retry" hover-class="press-dim" @click="reload"><text class="retry-text">重试</text></view>
      </view>
      <view v-else-if="images.length === 0" class="empty-state">
        <text class="empty-title">还没有图片</text>
        <text class="empty-desc">点「上传图片」从相册或相机添加（单张自动压缩）</text>
      </view>
      <view v-else class="grid-wrap">
        <view class="grid">
          <view v-for="(img, idx) in visible.items" :key="img.id" :class="gridCellClass(idx)">
            <view class="thumb-box" hover-class="press-dim" @click="onTapImage(img)">
              <image class="thumb" :src="imageThumb(img.imageUrl)" mode="aspectFill" lazy-load />
              <view v-if="selectMode" :class="isSelected(img.id) ? 'check is-on' : 'check'"><text class="check-text">{{ isSelected(img.id) ? "✓" : "" }}</text></view>
              <view class="order"><text class="order-text">{{ idx + 1 }}</text></view>
            </view>
            <view v-if="!selectMode" class="cell-ops">
              <view :class="working || uploading || !canMove(images, img.id, 'up') ? 'mini is-disabled' : 'mini'" hover-class="press-dim" @click="onMove(img, 'up')"><text class="mini-text">↑</text></view>
              <view :class="working || uploading || !canMove(images, img.id, 'down') ? 'mini is-disabled' : 'mini'" hover-class="press-dim" @click="onMove(img, 'down')"><text class="mini-text">↓</text></view>
              <view :class="working ? 'mini mini--danger is-disabled' : 'mini mini--danger'" hover-class="press-dim" @click="onDeleteOne(img)"><text class="mini-text mini-text--danger">删</text></view>
            </view>
            <view v-if="!selectMode" :class="working ? 'tryon is-disabled' : 'tryon'" hover-class="press-dim" @click="onToggleTryon(img)">
              <text :class="tryonMeta(img).on ? 'tryon-text tryon-text--on' : 'tryon-text'">{{ tryonMeta(img).label }}</text>
            </view>
          </view>
        </view>
        <view v-if="visible.hasMore" class="more" hover-class="press-dim" @click="onLoadMore"><text class="more-text">显示更多（{{ images.length - visible.items.length }}）</text></view>
        <view v-else class="more"><text class="more-text">共 {{ images.length }} 张</text></view>
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
.tool-row {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 12rpx;
  padding: $space-md $space-md $space-sm;
}
.btn {
  padding: 14rpx 32rpx;
  border-radius: 999rpx;
  border: 2rpx solid $color-border;
}
.btn--primary {
  border: 0;
  background: linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%);
}
.btn--danger {
  border-color: rgba(255, 107, 107, 0.6);
}
.btn-text {
  font-size: $font-size-caption;
  color: $color-action;
}
.btn-text--primary {
  color: $color-action-text;
}
.btn-text--danger {
  color: #ff6b6b;
}
.is-disabled {
  opacity: 0.4;
}
.queue {
  margin: 0 $space-md $space-sm;
  padding: $space-md;
  border-radius: 20rpx;
  background: rgba(241, 205, 145, 0.06);
  border: 2rpx solid rgba(241, 205, 145, 0.12);
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.queue-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.queue-title {
  font-size: $font-size-body;
  color: $color-action;
}
.queue-close {
  padding: 6rpx 20rpx;
  border-radius: 999rpx;
  border: 2rpx solid $color-border;
}
.queue-close-text {
  font-size: $font-size-caption;
  color: $color-text-secondary;
}
.queue-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.queue-name {
  flex: 1;
  font-size: $font-size-caption;
  color: $color-text-secondary;
}
.queue-name--bad {
  color: #ff6b6b;
}
.queue-retry,
.queue-retry-all {
  padding: 6rpx 24rpx;
  border-radius: 999rpx;
  border: 2rpx solid $color-border;
}
.queue-retry-all {
  align-self: flex-start;
}
.queue-retry-text {
  font-size: $font-size-caption;
  color: $color-action;
}
.sk-grid {
  padding: 0 $space-md;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 2%;
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
.grid-wrap {
  padding: 0 $space-md $space-lg;
}
/* 固定三列（不用 space-between：末行不足 3 个时会被撑到左右两端、中间留空——5 张图第二行 2 张左右分居即此缺陷）。
   列宽 = (100% - 2×列间距) / 3；列间距靠 margin-right，每行第 3 个（class is-end，不用 :nth-child——WXSS 只保证 class 选择器）清零；不足一行靠左。 */
.grid {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: flex-start;
}
.cell {
  box-sizing: border-box;
  width: calc((100% - 32rpx) / 3);
  margin-right: 16rpx;
  margin-bottom: 20rpx;
  display: flex;
  flex-direction: column;
}
.cell.is-end {
  margin-right: 0;
}
.thumb-box {
  position: relative;
  width: 100%;
  height: 220rpx;
}
.thumb {
  width: 100%;
  height: 220rpx;
  border-radius: 12rpx;
  background: rgba(255, 255, 255, 0.06);
}
.order {
  position: absolute;
  left: 8rpx;
  top: 8rpx;
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
  background: rgba(0, 0, 0, 0.55);
}
.order-text {
  font-size: 20rpx;
  color: $color-action;
}
.check {
  position: absolute;
  right: 8rpx;
  top: 8rpx;
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  border: 2rpx solid $color-action;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}
.check.is-on {
  background: $color-action;
}
.check-text {
  font-size: 26rpx;
  color: $color-action-text;
}
.cell-ops {
  margin-top: 8rpx;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
}
.mini {
  flex: 1;
  margin: 0 4rpx;
  padding: 6rpx 0;
  border-radius: 999rpx;
  border: 2rpx solid $color-border;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mini--danger {
  border-color: rgba(255, 107, 107, 0.6);
}
.mini-text {
  font-size: 24rpx;
  color: $color-action;
}
.mini-text--danger {
  color: #ff6b6b;
}
.tryon {
  margin-top: 8rpx;
  padding: 6rpx 0;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
}
.tryon-text {
  font-size: 22rpx;
  color: $color-text-secondary;
}
.tryon-text--on {
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
</style>
