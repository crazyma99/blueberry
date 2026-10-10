<script setup lang="ts">
// 平台原生按钮桥 · 抖音来客 IM 客服（2026-10-10 主人转述抖音提审结论后新增）。
//
// 背景：抖音端原「**长按二维码加微信客服**」被判**站外引流**（审核打回）⇒ 抖音端改用官方能力
// 「抖音来客 IM 客服组件」，**不再渲染任何二维码**；微信端**保持现状**（长按二维码加客服）。
//
// 官方契约（主人 2026-10-10 提供的文档：developer.open-douyin.com/.../button-lifeim）：
//   · `open-type="lifeIm"`（必填）；**基础库 3.61.0 起支持**
//   · 可选 `data-order-id` / `data-goods-id` / `data-poi-id`（无对应 ID 时不传）
//   · 事件 `bindlifeim`（成功）/ `binderror`（失败）；错误码 `179791`（框架内部错误）
//
// 纪律（多端 SPEC §结构纪律）：**端差异只落在 `src/platform/**`**；本桥内部按**运行时可判定**
// 平台分流（逻辑层零 `#ifdef`，合 §C3），父组件只提供两个插槽、不自行判端。
// 先例：`platform/ui-bridge/AuthNativeButton.vue`（微信原生授权 / 抖音降级）——本桥是它的镜像。
import { isToutiaoPlatform } from "../../ui/ui-platform";

const props = withDefaults(
  defineProps<{
    /**
     * 客服的**抖音号**：有值 ⇒ 走官方「IM 客服」能力（`open-type="im"` + `data-im-id`，基础库 **2.68.0**，
     * 门槛低）；为空 ⇒ 回落到「抖音来客 IM 客服」（`open-type="lifeIm"`，基础库 3.61.0，需账号开通来客客服能力）。
     * 2026-10-10 实测：`lifeIm` 在账号未开通时返回 `未开通客服能力, code=28005047`。
     */
    imId?: string;
    /** 可选参数：订单 ID（来客 IM 路径使用） */
    orderId?: string;
    /** 可选参数：商品 ID */
    goodsId?: string;
    /** 可选参数：poi ID */
    poiId?: string;
  }>(),
  { imId: "", orderId: "", goodsId: "", poiId: "" },
);

const emit = defineEmits<{
  /** 成功拉起来客 IM 页 */
  (e: "opened", detail: unknown): void;
  /** 失败（未开通来客 / 基础库低于 3.61.0 / 框架错误 179791 等）——由父组件给出用户提示 */
  (e: "failed", detail: { errMsg: string; errorCode: number | null }): void;
}>();

/** 仅抖音端使用官方 IM 能力；其他端渲染 fallback 插槽（行为完全不变） */
const native = isToutiaoPlatform();

/** 空串 ⇒ 不传该 `data-*`（官方三项均为可选，无对应 ID 时不制造空参数） */
const attrOrUndefined = (v: string): string | undefined => (v === "" ? undefined : v);

/** 诊断用能力探测（**不参与渲染决策**，只进日志）：官方能力自基础库 3.61.0 起支持 */
function capabilityProbe(): string {
  const u = (typeof globalThis === "undefined" ? undefined : (globalThis as { uni?: { canIUse?: (s: string) => boolean } }).uni);
  if (u == null || typeof u.canIUse !== "function") return "canIUse 不可用（无法探测基础库能力）";
  for (const s of ["button.open-type.lifeIm", "open-type.lifeIm", "lifeIm"]) {
    try {
      if (u.canIUse(s)) return "canIUse(" + s + ") = true";
    } catch {
      /* 探测本身不抛给业务 */
    }
  }
  return "canIUse 三种写法均 false（疑基础库 < 3.61.0）";
}

function onOpened(ev: unknown): void {
  const detail = (ev as { detail?: unknown } | null)?.detail;
  console.log("[LifeImButton] 抖端拉起来客 IM 客服成功，detail =", detail ?? null);
  emit("opened", detail ?? null);
}

function onFailed(ev: Event): void {
  // 抖音 `binderror` 的载荷走 `detail`（errMsg/errorCode）；DOM 类型只声明 `Event` ⇒ 收窄后取用（禁 any）
  const detail = (ev as unknown as { detail?: { errMsg?: unknown; errorCode?: unknown } }).detail;
  // 诊断留痕（2026-10-10 主人要求）：把**原始 detail 全量**打出，便于区分成因——
  //   ①基础库 < 3.61.0 ②未配置/未关联抖音来客客服 ③**IDE 不支持（该能力常需真机）** ④框架错误 179791
  console.error("[LifeImButton] 抖端拉起来客 IM 客服失败，原始 detail =", detail ?? ev);
  console.error("[LifeImButton] 诊断上下文 =", {
    canIUse: capabilityProbe(),
    orderId: props.orderId,
    goodsId: props.goodsId,
    poiId: props.poiId,
  });
  const raw = detail?.errMsg;
  const errMsg = typeof raw === "string" && raw !== "" ? raw : "lifeIm failed";
  const code = typeof detail?.errorCode === "number" ? detail.errorCode : null;
  emit("failed", { errMsg, errorCode: code });
}
</script>

<template>
  <!-- 抖音 · 路径一（推荐，门槛低）：官方「IM 客服」——需客服的**抖音号**（`data-im-id`） -->
  <button
    v-if="native && props.imId !== ''"
    class="lifeim-btn"
    open-type="im"
    :data-im-id="props.imId"
    @im="onOpened"
    @error="onFailed"
  >
    <slot name="native">联系在线客服</slot>
  </button>
  <!-- 抖音 · 路径二（需账号开通「来客客服能力」）：抖音来客 IM 客服 -->
  <button
    v-else-if="native"
    class="lifeim-btn"
    open-type="lifeIm"
    :data-order-id="attrOrUndefined(props.orderId)"
    :data-goods-id="attrOrUndefined(props.goodsId)"
    :data-poi-id="attrOrUndefined(props.poiId)"
    @lifeim="onOpened"
    @error="onFailed"
  >
    <slot name="native">联系在线客服</slot>
  </button>
  <!-- 其他端（微信等）：保持现状（父组件把二维码区放进 fallback 插槽） -->
  <slot v-else name="fallback" />
</template>

<style lang="scss" scoped>
/* 小程序 button 默认带边框/底色，这里复位后按页面金色卡面风格呈现 */
.lifeim-btn {
  display: block;
  margin: 0 auto 20rpx;
  padding: 0 40rpx;
  line-height: 76rpx;
  font-size: 30rpx;
  font-weight: 400;
  color: #160f04;
  background: linear-gradient(180deg, #f3d9a4 0%, #e6c07c 100%);
  border: 0;
  border-radius: 38rpx;
  text-align: center;
}
.lifeim-btn::after {
  border: 0;
}
</style>
