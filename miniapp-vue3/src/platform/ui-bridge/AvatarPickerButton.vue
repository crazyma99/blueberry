<script setup lang="ts">
// 头像选择桥（2026-10-13 · task-57 ①-2/①-3）：**平台差异只落本文件**（platform/**，不新建 platform/<端> 目录）。
//
// 三条路径（全部**运行时判定**，逻辑层零 #ifdef ⇒ 合 SPEC §C3）：
//   · 抖音：`button open-type="getUserInfo"` ＋ `bindgetuserinfo`（官方能力，**基础库 ≥2.87.0**）。
//     选型依据（含官方链接与 2.87.0 门槛）见 docs/migration/deviations.md 第 44 条⑦：**不用 `tt.getUserInfo`**（官方页为小游戏口径）。
//     低版本/用户拒绝 ⇒ **可读 toast 提示**（绝不静默），用户可改用「从相册选择」。
//   · 微信：`button open-type="chooseAvatar"` ＋ `bindchooseavatar` **保持原行为、不削弱**（该按钮仍由 ProfilePopup 渲染；
//     本桥在微信端只补「从相册选择」入口）。
//   · 两端通用：**从相册选择**——经 `platform/uni/chooser.ts`（内部 `uni.chooseImage`，平台 API 落 platform/** ⇒ 合 C1），
//     拿到的是**本地路径**，交页面既有 `resolveAvatarUrl` 上传（先上传后落库，task-56）。
//
// 事件：`@picked` 透传 `{ detail: { avatarUrl } }`——与既有页面 `onChooseAvatar` 的取值口径（`detail.avatarUrl`）一致，
// 页面无需新增接线；值可能是 http URL（抖音授权头像）或本地路径（相册/微信临时路径），由页面统一上传。
import { isToutiaoPlatform } from "../../ui/ui-platform";


const isToutiao = isToutiaoPlatform();

const emit = defineEmits<{ (e: "picked", event: { detail: { avatarUrl: string } }): void }>();

/** 可读提示（fail-soft：容器无 showToast 时静默，不影响业务） */
function toast(text: string): void {
  try {
    (uni as unknown as { showToast?: (o: { title: string; icon: string }) => void }).showToast?.({ title: text, icon: "none" });
  } catch {
    /* 容器差异：提示失败不影响主流程 */
  }
}

function emitPicked(url: string): void {
  if (url !== "") emit("picked", { detail: { avatarUrl: url } });
}

/** 抖音 getUserInfo 回调：成功 ⇒ 授权后的头像 URL；拒绝/低版本 ⇒ 可读提示（不静默、不假装成功） */
function onToutiaoUserInfo(e: Event): void {
  const detail = (e as unknown as { detail?: { errMsg?: string; userInfo?: { avatarUrl?: string } } }).detail;
  const avatar = detail?.userInfo?.avatarUrl;
  if (typeof avatar === "string" && avatar !== "") {
    emitPicked(avatar);
    return;
  }
  toast("未获取到抖音头像，请改用「从相册选择」");
}

// （2026-10-13 task-62：自建相册入口已撤——微信端交给原生 chooseAvatar 自带相册；抖音端交给大头像按钮直连 `tt.chooseImage`）
</script>

<template>
  <view class="avatar-picker">
    <!-- 抖音：官方用户信息授权（基础库 ≥2.87.0；低版本不回调 ⇒ 有提示 + 可改用相册） -->
    <button
      v-if="isToutiao"
      class="avatar-picker-btn"
      hover-class="press-dim"
      open-type="getUserInfo"
      @getuserinfo="onToutiaoUserInfo"
    >用抖音头像</button>
    <!-- 2026-10-13 task-62：**撤掉自建的「从相册选择」按钮**——微信端由原生 `chooseAvatar` 自带相册（主人明确不要重复入口），
         抖音端由大头像按钮直接拉起选择器（见 ProfilePopup 的 `onPickToutiaoAvatar`） ⇒ 本桥只保留官方用户信息授权。 -->
  </view>
</template>

<style lang="scss" scoped>
.avatar-picker { display: flex; flex-direction: row; gap: 16rpx; margin-top: 12rpx; }
.avatar-picker-btn {
  height: 56rpx; line-height: 56rpx; padding: 0 24rpx; font-size: 22rpx;
  color: #f1cd91; background: rgba(241, 205, 145, 0.08); border: 1rpx solid rgba(241, 205, 145, 0.3);
  border-radius: 28rpx;
}
.avatar-picker-btn::after { border: none; }
</style>
