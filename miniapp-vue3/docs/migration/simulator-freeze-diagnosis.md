# 「模拟器卡死」排查记录 — 2026-09-17

> 触发：主人反馈微信开发者工具**模拟器卡死**，要求确认「是否有复杂运算」。
> 性质：**静态审计＋已修的脆弱点**；最终定位仍待主人提供「卡在哪一步／控制台输出／是模拟器还是工具卡」。

## 1. 静态审计（全仓实测，结论：**无「启动即重算」的复杂运算**）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 无界同步循环 | **0** | 唯一 `for(;;)` 在 `application/payment-coordinator.ts:109`，是 **async 轮询**（含 `await sleep` 与截止时间，不占死主线程） |
| 页面内 `for` 循环 | 小基数 | 店铺列表／4 步进度／模板与推荐条数（`aiTryOn:267`、`aiRecommendLoading:205`、`aiRecommendResult:147` 等） |
| `watch(` 自改写 | **0** | `grep watch(` over `src/pages/**`、`src/components/**` 无命中 |
| 最大 `v-for` 基数 | **24** | `aiTryOnResult/index.vue:884`（水印切片）；骨架类 4 |
| 最重运算 | **照片质量检测** | `domain/photo-check.ts` 拉普拉斯方差（≈6.5 万像素）＋离屏 canvas＋VK 人脸；**仅在选图后触发**，不在启动路径 |
| 包体 | **2.4 MB** | `du -sh dist/build/mp-weixin`（老端 baseline 记 2.6M，量级相当） |
| `App.vue` 启动钩子 | 空实现 | onLaunch/onShow/onHide 无网络/重活 |

## 2. 已修的三处脆弱点（会把「慢/等」放大成「卡死」观感）

| # | 位置 | 问题 | 修法 |
|---|---|---|---|
| 1 | `platform/weixin/photo-check.ts` | 检测链路**无超时**；模拟器 offscreen canvas 不回调 ⇒ 永久停在「照片检测中…」 | **6s 超时**，超时 **fail-open 放行**（前端检查仅为体验拦截）＋`console.warn` 留痕 |
| 2 | `platform/uni/upload.ts` ＋`application/ai-photo-upload.ts` | `uni.uploadFile` 未传 `timeout` 可无限挂起 ⇒ 永久「上传中…」 | **60s 默认超时**（显式优先）；`fail(含 timeout)` → 「上传超时，请重试」（HTTP 侧本有 10s 默认） |
| 3 | `src/manifest.json`（mp-weixin） | 产物 `app.json` **无 `lazyCodeLoading`** ⇒ 微信把 **18 页＋全部自定义组件（含 `@wot-ui/ui` 门面）一次性编译**，首开/切页长时间「编译中」 | 加 **`"lazyCodeLoading": "requiredComponents"`**（官方按需注入） |

> ⚠️ 第 3 条为**源码改动，尚未重新构建**——主人正在模拟器上测试，我已**暂停一切构建/写产物**以免工具反复热重载。

## 3. 环境侧可疑点（不在本仓代码内）
- **我今天多次执行 `uni build`**：若开发者工具同时打开 `dist/build/mp-weixin`，产物反复变更会触发**连续重编译/热重载**，表现即卡死 ⇒ 已暂停构建。
- 微信开发者工具首次打开大工程、或**未勾「不校验合法域名」**造成的域名校验阻塞。
- 模拟器对 **VK（人脸）/离屏 canvas** 支持差（已 fail-open＋超时兜底）。

## 4. 待主人提供（定位所需）
1. **卡在哪一步/哪一页**（启动／首页／切 tab／选图／检测／上传／生成／结果）
2. **控制台输出**（`[photoCheck] …` 反复刷？`Compiling…` 卡住？报错？）
3. 是**模拟器**卡还是**整个开发者工具**卡（工具栏能否点）＋卡住时的页面文案

## 5. 备选快诊（我可在 1 笔内加）
- `PROFILE.debugSkipPhotoCheck`（临时开关）：整段跳过检测链路，一键判定是否由 canvas/VK 引起
- 快速二分：先只走「首页→我的→收藏→价目」等**不选图**路径；若均正常，则锁定在**选图后的检测/上传**（即 #1/#2 修复处）
