<script setup lang="ts">
// 原生授权按钮桥（plan §4 ui-bridge：手机号/头像授权必须借平台原生 UI，不能纯 TS 适配器代替）。
// 微信：button open-type=getPhoneNumber / chooseAvatar。
// ⚠️ 2026-10-13 平台结论订正（CR ⑤，与 LoginPopup 口径同步）：抖音**已支持** getPhoneNumber（基础库 ≥3.51.0，
//   手机号新方式动态令牌，回调 e.detail.code；契约见后端仓 .project-wiki/docs/modules/login-frontend-integration.md §3）
//   ⇒ 原注释「抖音无对应原生授权能力」**已过期**。
//   **本批不改其运行行为**（`native = !isToutiaoPlatform()` 仍是「抖音走 fallback＋unsupported」）——理由：
//   ①该桥当前**全仓 0 业务引用**（仅 tests/p2-08 引用）；②真实登录链路已由 `components/LoginPopup` 承担，
//   抖音端在那里也用同一 `getPhoneNumber` 按钮。**若将来启用本桥的 phone 分支，必须先改这里的判端与 emit 语义。**
import { isToutiaoPlatform } from "../../ui/ui-platform";

withDefaults(
  defineProps<{
    kind?: "phone" | "avatar";
  }>(),
  { kind: "phone" },
);

const emit = defineEmits<{
  (e: "authorized", value: string): void;
  (e: "denied"): void;
  (e: "unsupported"): void;
}>();

// ⚠️ 见文件头 2026-10-13 订正：抖音现已支持 getPhoneNumber，此判端属**待收口的历史口径**（0 业务引用，本批不改行为）。
const native = !isToutiaoPlatform();

function onPhone(ev: { detail?: { code?: string } }) {
  const code = ev.detail && ev.detail.code;
  if (typeof code === "string" && code.length > 0) emit("authorized", code);
  else emit("denied");
}
function onAvatar(ev: { detail?: { avatarUrl?: string } }) {
  const url = ev.detail && ev.detail.avatarUrl;
  if (typeof url === "string" && url.length > 0) emit("authorized", url);
  else emit("denied");
}
function onFallback() {
  emit("unsupported");
}
</script>

<template>
  <button v-if="!native" class="auth-bridge auth-bridge--unsupported" @click="onFallback">
    <slot name="fallback">当前平台暂不支持该授权</slot>
  </button>
  <button
    v-else-if="kind === 'phone'"
    class="auth-bridge"
    open-type="getPhoneNumber"
    @getphonenumber="onPhone"
  >
    <slot />
  </button>
  <button v-else class="auth-bridge" open-type="chooseAvatar" @chooseavatar="onAvatar">
    <slot />
  </button>
</template>
