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

---

## 6. 【2026-09-17 更新】主人反馈：**「构建的时候卡死，完全无响应」** ⇒ 定位到编译/工具链，不在运行期

### 6.1 新增审计结论
- **运行期重算：已排除**（§1：无界循环 0、无 `watch` 自改写、最大 `v-for` 24、最重运算仅在选图后）
- **产物构成（微信）**：2.4MB／**322 文件**——**不属病态**（工具可轻松处理数千文件）；顶层：`static 776K`、`pages 448K`、
  **`node-modules 356K（55 文件）`**、`components 304K`、`ui 96K`、`common 96K`…
- ⭐**关键点**：产物含 **`node-modules/@wot-ui/ui`**（uni 为小程序内联的 npm 依赖）。微信开发者工具对该目录需要执行
  **「工具 → 构建 npm」**，**这是最常见的长时间卡死/无响应环节**（尤其被反复触发时）
- 另：`project.config.json.setting` 为 uni 默认（`urlCheck:false, es6:true, postcss:false, minified:false, bigPackageSizeSupport:true`）

### 6.2 新增修复（第 5 项，本轮）
| # | 位置 | 问题 | 修法 |
|---|---|---|---|
| 5 | `platform/uni/login.ts` | `uni.login` **无内建超时** ⇒ 容器不回调时 `waitForLogin` 排队者长期悬挂（`waitForLogin` 的超时是**可选**的，页面调用未传） | 新增 `LOGIN_CODE_TIMEOUT_MS=10000` 兜底：超时按 **fail-closed 返回 null**＋`console.warn`（保持 P2-03「可选超时」契约不变） |

### 6.3 已就绪的**干净产物**（避免干扰主人卡住的目录）
- `dist/trial-lazy/mp-weixin`（**`app.json.lazyCodeLoading = "requiredComponents"` 已生效**，18 页，2.4MB）
- 构建命令：`UNI_OUTPUT_DIR=dist/trial-lazy/mp-weixin npx uni build -p mp-weixin`（**未触碰** `dist/build/mp-weixin`）

### 6.4 建议的恢复步骤（按序，每步只做一次、勿连点）
1. **强制退出**开发者工具（释放对 `dist/build/mp-weixin` 的占用；必要时 `killall wechatwebdevtools`）
2. 工具内**清缓存 → 全部清除**；或删除项目目录下的 `project.private.config.json`
3. 打开**新目录** `dist/trial-lazy/mp-weixin`（带 `lazyCodeLoading`，按需注入可显著减少首开编译量）
4. 打开后**只点一次「编译」**；若提示缺 npm 组件，**只点一次「构建 npm」**，中途不要重复点击
5. 若仍卡在「构建 npm」：请把**卡住的那一步名称与进度**告诉我——备选方案是**把 Wot 组件从产物中彻底去掉**（改为本地组件，影响 7 个页面，工作量中等），
   即可完全消除 npm 构建环节

### 6.5 仍需主人确认（一刀切开「工具/机器」vs「本仓产物」）
1. 卡的**具体步骤**：(a) 打开项目时的「编译」 (b) 「工具 → 构建 npm」 (c) 我的命令行 `uni build` (d) 其他
2. **旧端产物**（`~/blueberry/dist/build/mp-weixin`）在同一台机器同一工具打开，**是否同样卡**？（同卡 ⇒ 工具/机器侧）
3. 卡住时工具的**进度百分比**与**内存占用**（是否 OOM）
