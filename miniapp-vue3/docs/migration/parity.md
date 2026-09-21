# Parity 台账（17 页 × 15 组件；状态：not_started / ported / verified）

> 规则：逐条「等价实现 或 Wot 组件替换」并在此登记去向；**未迁移页面不生成空壳**。
> 状态口径：`ported`＝代码已迁移且单测/构建绿；`verified`＝另有独立 CR 或真机证据。**本表 2026-09-17（P2-23）首次落真值**。

## 页面（17）

### B0+B1+B2：11 条公开路由（T5/T6/T7 批次，全部已迁）

| # | path | 状态 | 批次 | 证据（提交） | 备注 |
|---|---|---|---|---|---|
| 1 | `pages/index/index` | ported | T6 | `421b07b` | 品牌馆入口开关＝brand-hub-gate 同源闸门；切品牌回首页由 onShow 基线检测重载（P2-20 `12296d1`）；页脚/服务保障 P2-21；**2026-09-21 恢复下拉刷新**（`onPullDownRefresh`＋`enablePullDownRefresh`，deviations #27）；**2026-09-21 补** `onShareAppMessage`/`onShareTimeline`＋`application/share-card.ts` 三层卡片（旧端 `utils/share.uts`），并补 `onLoad` 消费分享落地 `?brandId=`/`scene`（旧端 `:205-232`） |
| 2 | `pages/brandHub/index` | ported | T7 P2-20 | `12296d1` | 自守卫（安全默认 false）＋PLATFORM 过滤＋持久化＋切品牌 scope 隔离；CR 2🔴 全清 |
| 3 | `pages/demoDetail/index` | ported | T6 | `b6ddb7d` | 分类 tabs/搜索/分页/点赞乐观更新；P2-21 补页脚；**2026-09-21 补回下拉刷新**（旧端 `:348-355`）＋**分享卡片** `onShareAppMessage`（旧端 `:292-298`） |
| 4 | `pages/priceList/index` | ported | T7 P2-17 | `f478048` | ⭐默认全量＋搜索才分页（红线 4/4）；CR 0🔴/3🟡 |
| 5 | `pages/targetPhotoDetail/index` | ported | T6 | `c1f12f3` | 渐进加载/价格套餐/点赞；AI 按钮留 T8；**2026-09-21 补**下拉刷新（新增）＋分享卡片 `onShareAppMessage`（旧端 `:164-170`） |
| 6 | `pages/priceHomePage/index` | ported | T7 P2-17 | `13c061c` | PhotoGrid＋品牌切换重载＋tab 同步；ServiceContact/AppFooter 由 P2-21 接入；**2026-09-21 补下拉刷新**（新增） |
| 7 | `pages/mine/index` | ported | T7 P2-18 | `84a24f0` | 登录两态＋头像昵称非空合并＋退出；菜单/文案由 PROFILE.features 驱动（`c9e2d6f`）；CR 1🔴 全清 |
| 21 | （跨页）分享链路 | ported | 2026-09-21 | 本轮 | `application/share-card.ts` 三层卡片（旧端 `utils/share.uts`）＋首页/客片列表/客片详情 handler＋`platform/weixin/face-share-card.ts`（旧端 `faceShareCard.uts`）；详见 `deviations.md` #28 ⑤ 全量盘点 |
| 8 | `pages/favorites/index` | ported | T7 P2-19 | `0906a6c` | ⭐默认全量、搜索才分页（红线 4/4 自动化锁定）；CR 0🔴/6🟡 |
| 9 | `pages/webview/index` | ported | T7 P2-22 | `382aa3c` | ⭐URL 准入加固（白名单 host／反斜杠旁路已修）；CR 1🔴 全清；有意偏差见 deviations #8 |
| 10 | `pages/policies/user` | ported | T5（B0） | P2-08 | 协议内容忠实搬运＋`miniAppName` 由 Profile 注入；仅集成回归，不在 T7 重实现 |
| 11 | `pages/policies/privacy` | ported | T5（B0） | P2-08 | 同上 |

> 说明：上表 11 条与抖音 Profile 的 `pageRegistry`（`scripts/profile-schema.mjs` PAGES_ALL 前 11 项）同集合。

### AI 闭环 6 页（**T8＋T9b 全部 ported**）

| # | path | 状态 | 备注 |
|---|---|---|---|
| 12 | `pages/aiTryOn` | ported | T8 装配完成（`698fd09`）：模板双入口（travel/album＋相册空回退）／选图·质量检测·上传／提交守卫与 4001→共享协调器／防截屏 onShow-onHide-onUnload；`#ifdef MP-WEIXIN` 注册；t38 三例 |
| 13 | `pages/aiTryOnResult` | ported | T8 末片（**1409 行**，`cf83763`）：结果轮询（自适应间隔/180s/抖动容忍＋**代次守卫停旧回调**）／24 片水印**仅覆盖预览**／付费原图／**买断以服务端 `taskBought` 为准**／匿名只读 `shareReadOnly` **无付费下载入口**；`#ifdef MP-WEIXIN` 注册 |
| 14 | `pages/aiTryOnHistory` | ported | T8 首片（`d002d7c`）：记录页（**一次取全量、无分页**）＋AI 仓储 `getTasks`；t30 四例；**2026-09-21 补下拉刷新**（新增；AI 页仅微信注册 ⇒ 微信侧生效） |
| 15 | `pages/aiRecommend` | ported | T9b 末片（**737 行**）：入口页（上传/权益/付费按钮/登录资料弹窗）；**P3-16** 单次 POST、**P3-17** 充值走共享 coordinator、**P3-20** 一次性标记 `resumeAnalyzeAfterCredit`（**onUnload／onHide 双清**）＋协调器**同 op 在飞复用**；⚠️ **本页无代次守卫**（`runGeneration` 仅存在于等待页，T9b CR 更正）；`#ifdef MP-WEIXIN` 注册（产物实证微信 18 页／抖音 12 页） |
| 16 | `pages/aiRecommendLoading` | ported | T9b 次片（**584 行**，`204add7`）：**P3-16** 单次 POST（内核 `inFlight` 同 op 复用）＋**绝不用重复 POST 当轮询**＋180s 只切 failed 不自动重发；**P3-17** 充值走共享 `payment-coordinator`（**旧端自建 2.5s×48 次轮询整段删除**）＋`resumeAfterCredit` 先清后调只续跑一次＋失败给「重试/返回」入口 |
| 17 | `pages/aiRecommendResult` | ported | T9b 首片（**518 行**，`1351a13`）：**P3-18** 只渲染 `shouldShowScore` 为真的 `finalScore`（经 `normalizeFinalScore`；并指出旧类型 `AiRecommendation` **漏 `finalScore` 字段**，按现行 DTO 显式收、兼容 `final_score`） |

> **产物页数口径**（易过期，故只记「当时实证」）：`aiTryOnHistory` 落地时微信 13 页；`aiTryOn` 14 页；`aiTryOnResult` 15 页；`aiRecommendResult` 16 页；`aiRecommendLoading` 17 页；**抖音侧恒 12 页且不含任何 AI 页**。当前值请以 `dist/build/mp-*/app.json` 实测为准。

## 组件（15）

> ⚠️ 口径说明：本表为**旧端 15 个组件**台账；新端另有本批**新增**组件 `AiTemplatePicker`（T8 S2 拆出的模板与身形/年龄选择块，`39f6d32`），**不属旧端 15 件**，故不占本表行位。

| 组件 | 状态 | 去向 / 证据 |
|---|---|---|
| CustomNavBar | ported | 等价实现（P2-12；2026-09-19 起抖音同微信：navigationStyle custom 全平台、组件全平台渲染） |
| PhotoGrid | ported | 等价实现（P2-13 布局基线） |
| SkeletonBlock | ported | 等价实现（共享骨架块；sk-animate 闪烁动画属全局样式批次） |
| LoginPopup | ported | 等价实现（P2-18，props/emits 与旧端逐字） |
| ProfilePopup | ported | 等价实现（P2-18；内联 AppInput 偏差已声明） |
| BottomActionBarSecondary | ported | 等价实现（P2-18；默认插槽） |
| AppFooter | ported | **等价实现＋请求上提**（P2-21；纯 props，组件禁请求） |
| ServiceContact | ported | **等价实现＋请求上提**（P2-21；纯 props；本地兜底 8 条与旧端一致） |
| LoadingBlock | ported | 等价实现（T5/T6 期间）；**2026-09-21 起应用内不再引用**（分享准备 loading 改用公共组件 `ui/BaseLoadingPopup`，见 deviations #29），组件按台账保留 |
| AppInput | not_started | AI 批次；ProfilePopup 已就地内联其结构（待替换回组件） |
| AppPhotoPicker | ported | 等价实现（T8 S2，纯展示：只转发 click，选图/登录/上传留页面 handler） |
| AppSegment | ported | 等价实现（T8 S2；`change` 载荷＝纯下标 number，与旧端逐字） |
| AppSelector | ported | 等价实现（T8 S2；原生 `picker` 保真，未走 wot 统一口径——待对齐批次；`change`＝`e.detail.value`） |
| BottomActionBar | ported | 等价实现（T8 S2；⚠️ 唯一偏差：新增 `footerMainLine`/`footerSupportLine` 透传 props——新端 AppFooter 已 props 化；渐变底沿用旧 `#160F04`） |
| GenerationProgress | ported | 等价实现（T8 S5-2，196 行；纯展示无 emit，父级单向驱动 steps/iconPaths/activeIndex/percent；白勾仅已完成节点，t41 四例） |

## native tabBar

微信 `custom-tab-bar` 四文件：新端按平台独立适配（微信保留 native 结构/桥接；抖音走原生 tabBar），**不算普通组件改后缀**。
产物实证：`dist/build/mp-weixin/app.json`（custom:true＋四文件）／`mp-toutiao/app.json`（原生 tabBar list 三 tab）。
