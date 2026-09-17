# 迁移开工前置报告（migration-preflight）

> 对应：Phase 0 / T0 / G0 · 分支 `feat/vue3-migration` · 生成时间 2026-09-17
> 口径：本文件全部数据为**本机实测**（命令与返回值可复算），未填估计值；未完成项如实标注 `pending`。

## 0. 基线定位（P0-01/02/03）

| 项 | 实测值 |
|---|---|
| sourceCommit | `95528cd0f33846ebc98d3760d0fc0e857a16b2f5`（＝fork/main，main 工作树 CLEAN） |
| sourceTree | `fb34865cc8acdfa3686a2b3c4f12c06e5d2f0df0` |
| 后端 staging | `f736de4e04ffe6bb99d2f5bf48aa5d497aded4ab`（origin/staging 实测） |
| 后端 prod | `f736de4e04ffe6bb99d2f5bf48aa5d497aded4ab`（**与 staging 同 SHA**，2026-09-16 已部署验证，03 分册 §2.17.65） |
| 旧端版本 | versionName `1.0.0` / versionCode `100`（manifest 实测；线上体验版号另计） |
| 旧端包体 | mp-weixin 产物 **2.6M**（2026-09-17 重新构建 exit 0） |
| 依赖锁 | `package-lock.json` sha256 前20位 `60a176ad37a564a0…`；`package.json` `9f52234985a85b723ed2…` |
| 工作分支 | `feat/vue3-migration` 建于隔离 worktree `/home/majunhi/blueberry-vue3-migration`（主副本仍在 main，互不污染） |
| 起始盘点口径 | **17 路由 / 15 组件 / 20 工具 / 34 API wrapper + 2 队列函数 + 11 导出类型**（逐条实测，见下） |

## 1. 路由清单（P0-04，17 条 + 3 Tab，对外 path 不变）

Tab：`pages/index/index`、`pages/priceHomePage/index`、`pages/mine/index`。

| # | path | onLoad 入参（实测 grep） | 登录要求（实测命中） |
|---|---|---|---|
| 1 | pages/index/index | — | — |
| 2 | pages/brandHub/index | — | — |
| 3 | pages/demoDetail/index | — | ✅ |
| 4 | pages/priceList/index | — | — |
| 5 | pages/targetPhotoDetail/index | — | ✅ |
| 6 | pages/priceHomePage/index | — | — |
| 7 | pages/mine/index | — | ✅ |
| 8 | pages/favorites/index | — | —（菜单侧 needLogin 由 mine 承担） |
| 9 | pages/webview/index | `url` | — |
| 10 | pages/policies/user | — | — |
| 11 | pages/policies/privacy | — | — |
| 12 | pages/aiTryOn/index | `albumId brandId category gender share_from shopId style sub_category subCategory templateId` | ✅ |
| 13 | pages/aiTryOnResult/index | `brandId shareToken` | ✅ |
| 14 | pages/aiTryOnHistory/index | — | — |
| 15 | pages/aiRecommend/index | — | ✅ |
| 16 | pages/aiRecommendLoading/index | — | — |
| 17 | pages/aiRecommendResult/index | — | — |

> ⚠️ 登录要求列＝源码含 `needLogin`／`isLoggedIn` 关键词的**静态命中**，最终以 Phase 1 门面测试逐页确认为准。
> 抖音 Profile 覆盖 11 页（1–11），12–17 不注册（2026-09-17 主人拍板，SPEC §10F）。

## 2. 组件与工具清单（P0-05）

**15 组件**（旧 `src/components/`）：AppFooter / AppInput / AppPhotoPicker / AppSegment / AppSelector / BottomActionBar / BottomActionBarSecondary / CustomNavBar / GenerationProgress / LoadingBlock / LoginPopup / PhotoGrid / ProfilePopup / ServiceContact / SkeletonBlock。

**微信 native tabBar 四文件单独列出**（非 Vue 组件、不算改后缀迁移）：`src/custom-tab-bar/index.{js,json,wxml,wxss}`；`pages.json` 第 74 行 `"custom": true` ＋ 全局（68 行）与品牌馆页（13 行）两处 `navigationStyle: custom`。

**20 工具**（`src/utils/*.uts`）：api / auth / brand / config / faceShareCard / format / haptics / http / imageLoader / legal / loginFlow / navigate / pageConfig / payGuard / photoCheck / profileSubmit / share / tabbar / text / vkFace。

## 3. API wrapper 台账（P0-06/07，854 行 api.uts 实测）

- **34 个业务 wrapper**（`export const` 箭头函数）：getImage getalbum getCategories getAlbumList getalbumDetail wxLogin wxBindPhone wxGetUserInfo wxUpdateUserInfo toggleLike getLikeStatus toggleFavorite getFavoriteStatus getFavoriteList searchAlbums getShops getPackages getPageConfig getAiTemplates getAiStyles getAiTemplateDetail uploadPhoto submitAiTryOn getAiTryOnResult getSharedAiTryOnResult downloadAiTryOnResult getAiTasks deleteAiTask getCreditBalance createCreditRecharge getCreditRechargeStatus redeemCreditCode getAiRecommend getBrands。
- **2 个队列函数**（非业务接口）：`flushPendingUploads`（:32）、`rejectAllPendingUploads`（:64）；**11 个导出类型**（interface/type）。
- **`getalbum` 实测 0 调用者**（全 src grep 除自身外无命中）⇒ 按方案登记**退役**，新端不重实现。
- 每 wrapper 的 method/path/header/业务 code 明细随 Phase 2 迁移时逐条登记（本节先锁名单与数量）。

## 4. Profile 与脚本（P0-08）

- Profile 目录：`profiles/blueberry`、`profiles/huahua`（各 `project.env`）。
- 现有字段 14 个：PROJECT_KEY PACKAGE_NAME MANIFEST_NAME DESCRIPTION MP_WEIXIN_APPID NAVIGATION_TITLE BRAND_NAME COPYRIGHT_TEXT CONTACT_PHONE_TEXT CONTACT_QR_SRC PRICE_FALLBACK_TITLE API_BASE_URL APP_CODE MINI_APP_NAME（新端另按 plan §5.2 增平台 appid 与 PAGE_REGISTRY）。
- 10 个 shell 脚本：apply-profile / build-all-profiles / build-miniapp / create-profile / new-miniapp-project / release-miniapp / release-trial / release-trial-douyin / sync-template / verify-miniapp ＋ `scripts/lib/apply-profile.mjs`。
- **风险登记**：旧 `sync-template.sh` 的 `rsync --delete` 可能落到新工程 `src/`；旧发布脚本锁定旧 ROOT——Phase 1 改造为隔离工作目录（plan §5.3）。

## 5. 已知偏差（P0-09，行为修正须写明产品依据与测试）

1. `package.json` 与 lock 的历史差异（以本轮实测哈希为准，见 §0）。
2. AI 推荐结果 `finalScore` 类型声明缺失（运行时有值、类型缺）。
3. 下载 `paid` 与权益到账**竞态**（已由 payGuard.uts 统一门闩缓解，新端保语义）。
4. 品牌馆开关跨生命周期 **30s 节流**（方案 §7 记为有意修正项：新端强制刷新开关，见 deviations.md 待建）。

## 6. 测试与外部前置（P0-10~13）

- **P0-10 旧端基线**：单测 `node scripts/tests/album-card-bugfix.test.mjs` → **55 通过 / 0 失败**（exit 0）；`npm run build:mp-weixin` → **DONE**（exit 0，2.6M）。
- **P0-11 性能基准**：`pending`——需同设备/网络/数据集采集首页、相册首图、任务返回 p50/p95；**依赖主人手机真机**，不填估计值。
- **P0-12 业务口径**：默认品牌/商户开关、跨平台账号/余额/买断共享——**未获新产品确认前按现合同**（plan §7；跨平台共享待 Phase 4 产品批准）。
- **P0-13 账号证据状态**：

| 平台 | AppID | 权限/资格 | 状态 |
|---|---|---|---|
| 微信 | `wxb19ad7426dfb8bd4` | 齐全（现有能力） | ✅ 可开发可验收 |
| 抖音 | `ttd6aba01648cc1bf701` | CLI 已登录、测试设备已绑定、域名 4×3 已配；**类目/主体备案进行中** | ⚠️ 可开发（编译+预览+真机扫码），**提审/发布 blocked** |
| 小红书 | 无 | 未申请 | ⏸ 后置（仅编译目标） |

## 7. 热修账本（P0-14，每笔 main 修复须登记）

| 日期 | main 旧 SHA | 新端等价 SHA | 回归用例 | 备注 |
|---|---|---|---|---|
| 2026-09-17 | —（开工时点，无在途热修） | — | — | 账本建立；此后每笔 main 修复与每 Phase 开始/候选发布前核对增量 |

## 8. 输入文档指纹（P0-15，D1–D5 实测 SHA-256）

| 代号 | 文件 | SHA-256 |
|---|---|---|
| D1 | SPEC.md | `6a9d85bb3a4fcb394a9db6d75c0dde925e26bb2e3c951a484ba4a74f41830d02` |
| D2 | docs/wot-ui-ai-guide.md | `4385cb808d1fff6d09d338f7582cf5c12a74c527ac06ba24a7d3d27c0007102e` |
| D3 | docs/uniapp-vue3-migration-plan.md | `de9241d202a8453944ca50b5edb9960f009ce1c9ad4d62ded224be6582565b30` |
| D4 | docs/uniapp-vue3-migration-phases.md | `4668f953cb360746a0ebcc62a672201072bac02d6d4a398bd1d346a1d2539c4e` |
| D5 | docs/uniapp-x迁移uniapp-vue3_实施细则&流水线参考.txt（仅溯源） | `31d827462c281a23c78daddb06da1a91c4b1e185fd06268174bbb64fad8d9fe7` |

## 9. G0 验收自查

- [x] 基线可定位（§0，SHA/树/锁哈希齐）
- [x] 资产有去向（§1–4 名单与数量逐条实测；`getalbum` 退役登记）
- [x] 风险/外部前置可见（§4 风险、§5 偏差、§6 前置状态表）
- [x] **未捏造「业务回归全绿」**：P0-11 性能基准 pending（真机依赖）、P0-12 业务口径待产品确认、抖音提审 blocked 如实标注
- G0 审阅人：**待主人指定**（本报告先提交，审阅后勾选）。
