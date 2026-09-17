<script setup lang="ts">
// 原生授权按钮桥（plan §4 ui-bridge：手机号/头像授权必须借平台原生 UI，不能纯 TS 适配器代替）。
// 微信：button open-type=getPhoneNumber / chooseAvatar；抖音：无对应原生授权能力 ⇒
// 降级渲染 fallback 插槽，点击发 unsupported（不假装成功，不静默失败）。
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
