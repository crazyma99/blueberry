// 下拉刷新共享内核（2026-09-21 主人：首页之外再给「客片列表／客片详情／AI试衣记录／价目表」加下拉刷新）。
// 口径（与首页同一份实现；旧端 `index.uvue:252-263` 同序、旧端 `demoDetail.uvue:348-355` 同收口）：
//  ① 成功与意外异常**都收口**（`finally` → `uni.stopPullDownRefresh()`）；异常另留 `console.error("[<label>] …")` 痕
//     （仓储/client 只回 Result 不抛 ⇒ catch 只兜「意外异常」，同 HANDOFF §5-2）
//  ② 连拉守卫：一次未收口不重入（在飞那次收口时自会 stop，不提前收指示器）
//  ③ 指示器位置：`(微信端 ? statusBarHeight : 0) + max(原生下拉指示带 40px, 自绘导航栏 44px) + token spaceSm(16rpx=8px)`
//     · `hasCustomNav` 的两端含义不同（独立 CR 🟡11 注明）：微信端＝避开**自绘标题栏**；抖音端无自绘栏（deviations #17 系统栏页面），
//       该 44px 实为避开 `CustomNavBar` **内联 slot**（如客片列表的搜索框）⇒ 抖音端 52px 是否与 slot 重叠待真机（checklist §6.5）
//     · 微信端页面坐标原点＝屏幕顶部（含状态栏）⇒ 叠加 statusBarHeight
//     · 抖音端页面坐标原点已在系统栏之下（`CustomNavBar` 抖音分支只内联 slot、不占位）⇒ 不叠加
//     · 自绘标题栏页面取 44px（避开导航栏内容），沉浸式页面（首页）取 40px（让出原生三点）
// 指示器本体＝`components/PullRefreshIndicator`（玄墨胶囊＋门面 `BaseLoading`）；页面只消费 `refreshing` / `indicatorTop`。
import { onPullDownRefresh } from "@dcloudio/uni-app";
import { ref, type Ref } from "vue";
import { detectUiPlatform } from "../ui/ui-platform";
import { isPlatform } from "../ports/context";

/** 原生下拉指示带（微信三点绘制在状态栏下方约 40px 内，自绘指示器须让出该带） */
export const NATIVE_PULL_BAND_PX = 40;
/** 自绘标题栏内容高（与 `components/CustomNavBar` 同口径：状态栏之外 44px） */
export const CUSTOM_NAV_HEIGHT_PX = 44;
/** 指示器与上面那条带/导航栏的间距（= design token `spaceSm` 16rpx ≈ 8px */
export const PULL_GAP_PX = 8;

export interface PullRefreshOptions {
  /** 日志前缀（页名，如 "demoDetail"） */
  label: string;
  /** 页面重载动作（不需要自己收指示器/自己 try-catch）；返回值只需可 await（如 `Promise.all([...])`） */
  refresh: () => Promise<unknown> | unknown;
  /** 自绘标题栏页面传 true（指示器落在导航栏下沿之下） */
  hasCustomNav?: boolean;
}

export interface PullRefreshHandle {
  refreshing: Ref<boolean>;
  /** 指示器 `top` 值（px 字符串，已按平台/状态栏/导航栏算好） */
  indicatorTop: string;
}

export function createPullRefresh(options: PullRefreshOptions): PullRefreshHandle {
  // 平台判定：非闭集值回落微信（与各页 `isPlatform(detected) ? detected : "mp-weixin"` 同口径）
  const detected = detectUiPlatform();
  const isMpWeixin = isPlatform(detected) ? detected === "mp-weixin" : true;

  let statusBarHeight = 20;
  try {
    if (typeof uni !== "undefined" && typeof uni.getSystemInfoSync === "function") {
      const info = uni.getSystemInfoSync() as { statusBarHeight?: number };
      if (info.statusBarHeight != null) statusBarHeight = info.statusBarHeight;
    }
  } catch {
    // 容器异常保持默认（同各页 statusBarHeight 取值口径）
  }
  const reservedPx = Math.max(NATIVE_PULL_BAND_PX, options.hasCustomNav === true ? CUSTOM_NAV_HEIGHT_PX : 0);
  const indicatorTop = (isMpWeixin ? statusBarHeight : 0) + reservedPx + PULL_GAP_PX + "px";

  const refreshing = ref(false);

  function stopPullDownRefresh(): void {
    // 容器守卫（vitest/H5 无该 API）：同旧端 uni.stopPullDownRefresh 语义
    if (typeof uni !== "undefined" && typeof uni.stopPullDownRefresh === "function") uni.stopPullDownRefresh();
  }

  async function run(): Promise<void> {
    if (refreshing.value) return;
    refreshing.value = true;
    try {
      await options.refresh();
    } catch (err) {
      console.error(`[${options.label}] 下拉刷新失败`, err);
    } finally {
      refreshing.value = false;
      stopPullDownRefresh();
    }
  }

  onPullDownRefresh(() => {
    void run();
  });

  return { refreshing, indicatorTop };
}
