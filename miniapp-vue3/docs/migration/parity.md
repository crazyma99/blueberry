# Parity 台账（17 页 × 15 组件；状态：not_started / ported / verified）

> 规则：逐条「等价实现 或 Wot 组件替换」并在此登记去向；**未迁移页面不生成空壳**。
> 状态口径：`ported`＝代码已迁移且单测/构建绿；`verified`＝另有独立 CR 或真机证据。**本表 2026-09-17（P2-23）首次落真值**。

## 页面（17）

### B0+B1+B2：11 条公开路由（T5/T6/T7 批次，全部已迁）

| # | path | 状态 | 批次 | 证据（提交） | 备注 |
|---|---|---|---|---|---|
| 1 | `pages/index/index` | ported | T6 | `421b07b` | 品牌馆入口开关＝brand-hub-gate 同源闸门；切品牌回首页由 onShow 基线检测重载（P2-20 `12296d1`）；页脚/服务保障 P2-21 |
| 2 | `pages/brandHub/index` | ported | T7 P2-20 | `12296d1` | 自守卫（安全默认 false）＋PLATFORM 过滤＋持久化＋切品牌 scope 隔离；CR 2🔴 全清 |
| 3 | `pages/demoDetail/index` | ported | T6 | `b6ddb7d` | 分类 tabs/搜索/分页/点赞乐观更新；P2-21 补页脚 |
| 4 | `pages/priceList/index` | ported | T7 P2-17 | `f478048` | ⭐默认全量＋搜索才分页（红线 4/4）；CR 0🔴/3🟡 |
| 5 | `pages/targetPhotoDetail/index` | ported | T6 | `c1f12f3` | 渐进加载/价格套餐/点赞；AI 按钮留 T8 |
| 6 | `pages/priceHomePage/index` | ported | T7 P2-17 | `13c061c` | PhotoGrid＋品牌切换重载＋tab 同步；ServiceContact/AppFooter 由 P2-21 接入 |
| 7 | `pages/mine/index` | ported | T7 P2-18 | `84a24f0` | 登录两态＋头像昵称非空合并＋退出；菜单/文案由 PROFILE.features 驱动（`c9e2d6f`）；CR 1🔴 全清 |
| 8 | `pages/favorites/index` | ported | T7 P2-19 | `0906a6c` | ⭐默认全量、搜索才分页（红线 4/4 自动化锁定）；CR 0🔴/6🟡 |
| 9 | `pages/webview/index` | ported | T7 P2-22 | `382aa3c` | ⭐URL 准入加固（白名单 host／反斜杠旁路已修）；CR 1🔴 全清；有意偏差见 deviations #8 |
| 10 | `pages/policies/user` | ported | T5（B0） | P2-08 | 协议内容忠实搬运＋`miniAppName` 由 Profile 注入；仅集成回归，不在 T7 重实现 |
| 11 | `pages/policies/privacy` | ported | T5（B0） | P2-08 | 同上 |

> 说明：上表 11 条与抖音 Profile 的 `pageRegistry`（`scripts/profile-schema.mjs` PAGES_ALL 前 11 项）同集合。

### AI 闭环 6 页（T8/T9 批次，未开始）

| # | path | 状态 | 备注 |
|---|---|---|---|
| 12 | `pages/aiTryOnHistory` | ported | T8 首片（2026-09-17）：记录页＋AI 仓储 getTasks；`pages.json` 以 `#ifdef MP-WEIXIN` 注册（产物实证：微信 13 页含本页／抖音 12 页不含）；t30 四例 |
| 13–14 | `pages/aiTryOn`、`aiTryOnResult` | not_started | T8 后续片（模板选择/上传/提交/结果轮询/下载买断）；抖音侧**不注册** |
| 15–17 | `pages/aiRecommend`、`aiRecommendLoading`、`aiRecommendResult` | not_started | Phase 3；抖音侧**不注册** |

## 组件（15）

| 组件 | 状态 | 去向 / 证据 |
|---|---|---|
| CustomNavBar | ported | 等价实现（P2-12；抖音端渲染空、原生栏接管） |
| PhotoGrid | ported | 等价实现（P2-13 布局基线） |
| SkeletonBlock | ported | 等价实现（共享骨架块；sk-animate 闪烁动画属全局样式批次） |
| LoginPopup | ported | 等价实现（P2-18，props/emits 与旧端逐字） |
| ProfilePopup | ported | 等价实现（P2-18；内联 AppInput 偏差已声明） |
| BottomActionBarSecondary | ported | 等价实现（P2-18；默认插槽） |
| AppFooter | ported | **等价实现＋请求上提**（P2-21；纯 props，组件禁请求） |
| ServiceContact | ported | **等价实现＋请求上提**（P2-21；纯 props；本地兜底 8 条与旧端一致） |
| LoadingBlock | ported | 等价实现（T5/T6 期间） |
| AppInput | not_started | AI 批次；ProfilePopup 已就地内联其结构（待替换回组件） |
| AppPhotoPicker | ported | 等价实现（T8 S2，纯展示：只转发 click，选图/登录/上传留页面 handler） |
| AppSegment | ported | 等价实现（T8 S2；`change` 载荷＝纯下标 number，与旧端逐字） |
| AppSelector | ported | 等价实现（T8 S2；原生 `picker` 保真，未走 wot 统一口径——待对齐批次；`change`＝`e.detail.value`） |
| BottomActionBar | ported | 等价实现（T8 S2；⚠️ 唯一偏差：新增 `footerMainLine`/`footerSupportLine` 透传 props——新端 AppFooter 已 props 化；渐变底沿用旧 `#160F04`） |
| GenerationProgress | not_started | AI 批次 |

## native tabBar

微信 `custom-tab-bar` 四文件：新端按平台独立适配（微信保留 native 结构/桥接；抖音走原生 tabBar），**不算普通组件改后缀**。
产物实证：`dist/build/mp-weixin/app.json`（custom:true＋四文件）／`mp-toutiao/app.json`（原生 tabBar list 三 tab）。
