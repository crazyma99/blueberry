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

## 8.5 工具链冻结记录（P1-01，2026-09-17 实测）

| 项 | 冻结值 | 来源 |
|---|---|---|
| 官方模板 | `dcloudio/uni-preset-vue` 分支 **`vite-ts`** | `git ls-remote --heads` 实测 |
| 模板固定 commit | `6fb81ac3c5736b8b0a83e667b3ed90223d458dd8` | 分支 HEAD；committer date 2026-08-17T02:14:47Z，msg「chore: v3.0.0-5020420260813003」 |
| DCloud 发行线 | `3.0.0-5020420260813003`（uni-app／uni-components／uni-h5／uni-mp-weixin／uni-mp-toutiao／uni-mp-xhs／vite-plugin-uni 等同线） | 模板 package.json 实测 |
| Vue | `^3.4.21` | 模板 package.json |
| Vite | `5.2.8`（钉死；安装实测解析 5.2.8） | 模板 package.json＋pnpm 安装输出 |
| TypeScript | `^4.9.4`（**不把旧端 TS5 覆盖官方配套**） | 模板 package.json |
| vue-tsc | 声明 `^1.0.24`，安装解析 **1.8.27** | pnpm 安装输出实测 |
| Node | `v24.14.0` | `node -v` |
| pnpm | `11.7.0` | `pnpm -v` |
| degit | `3.10.0`（`npx --yes degit` 实测输出） | 命令输出 |
| Sass | 模板未含；Wot v2 要求 **>1.78**（官方推荐 1.98+）⇒ T4 装 Wot 时**锁版安装并实编译验证** | plan §6.1 |

> ⚠️ pnpm 11 默认**拦截依赖 postinstall 脚本**（首装报 `ERR_PNPM_IGNORED_BUILDS`：esbuild/core-js/core-js-pure，exit 1）。**踩坑与修正**：先写 `package.json` 的 `pnpm.onlyBuiltDependencies` → pnpm 11 明确警告「package.json 的 pnpm 字段已不读取」⇒ 最终落点＝**`pnpm-workspace.yaml` 的 `allowBuilds`**（三者置 true）＋删除 package.json 内失效字段，重装后 postinstall 全部执行（esbuild 0.20.2 二进制就位）。该决定**写入工程可复现**，未改全局配置。


## 8.6 T1 执行记录（P1-01~08，2026-09-17）

| 步骤 | 动作 | 结果 |
|---|---|---|
| P1-01 | 冻结模板/工具链组合（见 §8.5 表） | ✅ `vite-ts@6fb81ac3`、DCloud `3.0.0-5020420260813003`、Vite 5.2.8、TS ^4.9.4、vue-tsc 解析 1.8.27 |
| P1-02 | `npx degit dcloudio/uni-preset-vue#6fb81ac3… miniapp-vue3`（degit 3.10.0） | ✅ DEGIT_OK；目标目录事前不存在校验通过；**未复制旧 mp-vue3/、未批量改后缀** |
| P1-02b | `pnpm install` 首装 | ⚠️ 报 `ERR_PNPM_IGNORED_BUILDS` exit 1 → 按 §8.5 尾注修正（`pnpm-workspace.yaml` allowBuilds）→ 重装 **Done in 969ms**、esbuild postinstall Done |
| P1-04 | 保留模板最小入口；补 `typecheck` 脚本（`vue-tsc --noEmit`） | ✅ typecheck **exit 0**（无输出即零错误） |
| P1-06 | 三平台最小样例构建 | ✅ `build:mp-weixin`／`build:mp-toutiao`／`build:mp-xhs` **各 exit 0（DONE）** |
| P1-06b | 产物健全性 | ✅ 三端各 **11 文件**，且 **`app.json`+`app.js` 均存在**（抖音硬规则满足） |
| P1-07 | lockfile 来源 | ✅ 首装生成 `pnpm-lock.yaml`（非复制旧锁）；`--frozen-lockfile` 复装验证见下 |

**探针页边界**：模板自带首页仅用于工具链资格验证，**不进入最终生产包**（P1-08 口径）；路由总表以旧端 17 条为准（§1），未迁移页面**不生成空壳**。

**T1 已全部收口**（原「待补」三项完成，记录如下）。
**T1 收口补记（2026-09-17 第二批实测）**：
- **P1-05 工具链测试 ✅**：新增 `tests/pipeline/toolchain-rules.ts`（校验器：DCloud 同发行线且等于冻结值／vue 与 @vue/runtime-core 一致／批准平台闭集 mp-weixin·mp-toutiao·mp-xhs 各有 dev/build 脚本／lockfile 含全部钉版依赖）＋ `tests/pipeline/toolchain.spec.ts`（真实工程 4 用例 ＋ **6 条负向 fixture**：跨发行线混装、发行线漂移、vue 不一致、闭集外平台（mp-kuaishou/mp-douyin）、缺脚本、lock 缺失/漏钉版）。**首跑抓出并修复校验器自身 2 个 bug**（精确版正则语义写反、`@dcloudio/types@^3.4.8` 独立版本线被误判跨线）⇒ 修正后 **10/10 通过、exit 0**（负向 fixture 先红后绿纪律达成）。
- **⚠️ vitest 版本适配决策（留痕）**：首装 `vitest@5.0.1` 启动即报 `ERR_PACKAGE_PATH_NOT_EXPORTED`（需 vite `./module-runner`，vite 6+ 才有）——**冻结组合是 vite 5.2.8，不为测试框架盲升** ⇒ 查 npm 元数据后**降级锁 `vitest@3.2.4`**（`dependencies.vite`＝`^5.0.0`），与冻结线兼容。
- **P1-07 `--frozen-lockfile` 复装 ✅**：移走 `node_modules` → `pnpm install --frozen-lockfile` **exit 0（714ms）** → 复验 typecheck exit 0 ＋ vitest 10/10 exit 0 ＋ `build:mp-weixin` DONE exit 0 ⇒ **锁文件可重建性证明**。
- **P1-03 R 目录文档集 ✅**：`miniapp-vue3/docs/migration/` 六件齐——`baseline.json`（机器可读基线：sourceCommit/旧端版本与哈希/后端双环境 SHA/模板 commit/工具链冻结值/账号证据/D1–D5 SHA-256，JSON 校验通过）、`inventory.md`（17 路由含抖音 Profile 列、15 组件、20 工具、34 wrapper、getalbum 退役）、`contracts.md`（4001→INSUFFICIENT_CREDITS 等已冻结规则＋wrapper 台账占位随 T5–T9 补实）、`parity.md`（17 页×15 组件 not_started）、`hotfix-sync.md`（账本建立）、`deviations.md`（6 条偏差含本轮 vitest 决策与测试 bug 修复留痕）。**基线转换只搬文档事实，未搬旧 Vue3 骨架**。
- **T1 状态：P1-01~08 全部完成**；下一轮进入 **T2 领域规则与抽象端口**（P1-09~13）。


## 8.7 T2 执行记录（P1-09~13，2026-09-17）

| 步骤 | 动作 | 结果 |
|---|---|---|
| P1-09 错误码冻结 | `payment-state.ts`：`mapBusinessCode` **4001→INSUFFICIENT_CREDITS**（保留 businessCode/message/requestId）、其余数字码→BUSINESS、缺失→UNKNOWN；`mayTriggerRecharge` **仅 INSUFFICIENT_CREDITS 放行** | ✅ 测试锁定 |
| P1-10 先红后绿 | 4 个 spec 先落（品牌馆严格 boolean 14 用例／标题 6·7 码点＋emoji 代理对 6 用例／PayGuard 状态机 5 用例／错误码 3 用例）→ **无实现时 RED_EXIT=1（3 处 Failed to resolve import）** → 补实现后绿 | ✅ 纪律达成 |
| P1-11 纯 TS | `src/domain/`（brand-hub／album-title／payment-state）＋`src/ports/`（context／http／identity／payments／media／storage／clock 七端口）；**grep 禁导核查 PURITY_OK**（无 Vue/Pinia/Wot/uni/平台 SDK） | ✅ |
| P1-12 闭集测试 | engine（legacy/vue3 2 值）／platform（mp-weixin·mp-toutiao·mp-xhs 3 值）／env（develop·trial·release 3 值）未知即拒；必需能力 unsupported/unknown 阻断；可选降级**空/空白批准文案拒绝** | ✅ |
| P1-13 汇总验证 | vitest **50/50 exit 0**（5 文件：4 unit＋1 pipeline）；typecheck **exit 0** | ✅ |

**移植忠实性**：brand-hub 移植旧 `pageConfig.uts`（code===200＋数组＋type===brand_hub＋config 非空＋JSON 严格 enabled===true）；album-title 移植旧 `text.uts`（码点计数、代理对算一字符、>6 截 6＋...）；PayGuard 移植旧 `payGuard.uts`（idle→paying→confirming、800ms 防抖、可注入时钟）。**未迁移页面/组件**，本阶段只有领域规则与端口合同。

**测试自身留痕**：首跑抓出 spec 一处字符串笔误（`{'"enabled"':true}"` 多余引号致 esbuild transform 失败）→ 修正后 50/50。

**T2 状态：P1-09~13 全部完成**；下一轮进入 **T3a Profile 生成前置（P1-14~19）**。


## 8.8 T3a 执行记录（P1-14~19，2026-09-17）

| 步骤 | 动作 | 结果 |
|---|---|---|
| P1-14 旧字段对齐 | `scripts/profile-schema.mjs`：14 个 legacy 字段全量必需；平台 appid **按目标构建必填、不回落微信**（mp-weixin 校验 `wx`16hex／mp-toutiao 必填校验 `tt`16alnum／mp-xhs 必填） | ✅ 测试锁定 |
| P1-15 env 语义 | `API_BASE_URL`＝**release 地址**；trial/develop 受控映射 `https://crazyma99.xyz/`；**未知 environment 拒绝**（production/prod 实测拒绝，不落生产也不默认 trial） | ✅ |
| P1-16 失败用例 | 缺 APP_CODE／缺目标 appid／非法 host（evil.example.com 拒）／路径穿越 PROJECT_KEY（`../evil` 拒，`^[a-z][a-z0-9-]*$`）／注入表达式（`` ` ``／`$(`／`${` 三形态拒）——parseProfileText 与 validateProfile 双层拦截 | ✅ |
| P1-17 幂等与隔离 | `scripts/generate-profile.mjs`：**A→B→A 字节一致＋digest 稳定**（sha256 规范化 JSON）；**只写 projectRoot/generated/**、sourceRoot sentinel 实测未动；合成 AppID 仅 fixtures（`wx0000…000a`/`tt0000…000a`）不入真实上传 | ✅ |
| P1-18 结构化生成 | 生成 `generated/profile.json`＋`generated/profile.config.ts`（含 digest 注释）；**无宽正则改源码**；`docs/migration/profile-map.json` 17 字段（14 legacy＋3 平台 appid）逐条登记消费者与测试归属 | ✅ |
| P1-19 汇总 | vitest **62/62 exit 0**（6 文件）＋ typecheck **exit 0** ＋ `build:mp-weixin` DONE ＋ `node --check` 两 mjs SYNTAX_OK | ✅ |

**NormalizedProfile 字段（含 2026-09-17 拍板新增）**：14 legacy ＋ platform/environment/appid ＋ `apiBases`（三环境）＋ **`pageRegistry`**（微信 17／抖音 11）＋ **`features`**（mineMenu 微信 2 项·抖音仅 favorites；mineHintText；navStyle 微信 custom·抖音 default；tabBarCustom）。抖音侧注册表与功能开关自此**由 Profile 生成器产出**，业务代码不写平台判断。

**T3a 状态：P1-14~19 全部完成**；**Phase 1 剩余：T4 Token 与 UI 门面（P1-20 起）＋ T3b 完整构建集成**。T4 需装 Wot UI 2.3.2＋Sass 锁版实编译（SPEC §6.4 纪律），属下一轮。


## 8.9 T4 执行记录（P1-20~22＋P1-27 部分，2026-09-17）

| 步骤 | 动作 | 结果 |
|---|---|---|
| P1-20 Token 单源 | `tokens/source.json` 三层（primitive 24 项/semantic 21 项/component 8 项）——**全部来自旧端实测盘点**：颜色词频（#F1CD91 金/#160F04 墨/#FF3B30 错误红等）、尺寸（88rpx 11 处·96rpx·140rpx 相册避让·100/120rpx）、动效（220/300/350ms）、字号（32rpx 主体 18 处/26/36/40rpx）；**不套用旧文档 4/8/6 档数字** | ✅ |
| P1-21 生成器＋失败用例 | `scripts/generate-tokens.mjs`（`generateTokens({sourceFile,outputDir})`）；测试 7 条＝真实源解析（semantic 引用解析到 primitive 实值）＋幂等（两次字节一致/digest 64hex）＋只写 outputDir（sentinel 未动）＋**循环引用/未知引用/错误单位（px 拒）/缺层 四类必须报错** | ✅ 先红后绿；**首版抓出真 bug**＝内部解析函数命名 `resolve` 遮蔽 `node:path` 的 `resolve` 触发 TDZ（Cannot access "memo" before initialization），改名 `resolveRef` 后 7/7 绿 |
| P1-20b 产物生成 | `src/generated/{tokens.ts,theme.css,theme.scss}` 实际生成，digest `55a65558fc17d811…` | ✅ |
| P1-22 锁版配套 | `@wot-ui/ui@2.3.2`＋`@wot-ui/cli@1.1.0`＋`sass@1.104.1`（>1.78 满足 Wot v2 要求）全 `--save-exact`；**踩坑留痕**＝pnpm 11 给新依赖自动写入 `allowBuilds` 占位行（`set this to true or false`），须手工改 true 才能跑 postinstall（`@parcel/watcher`）——与 T1 esbuild 同类坑第二例 | ✅ |
| P1-23 起步·事实源 | `pnpm exec wot info Button --version 2.3.2` **exit 0**（props：type/variant/size/round/disabled/hairline/block/loading/text/icon…）——按 SPEC §6.4「禁凭记忆写 API」纪律，门面实现前逐组件查事实源 | ✅ Button 已查 |
| P1-27 辅助证据 | `wot doctor` **exit 0**：wot-ui-installed 2.3.2／vue ^3.4.21／uni-app 3.0.0-5020420260813003／typescript ^4.9.4／node_modules 五项 PASS | ✅ |
| 装依赖后回归 | 三平台构建 **WX/TT/XHS 各 exit 0**＋vitest **69/69**＋typecheck 0 | ✅ |

**T4 剩余（下一轮）**：P1-23 门面五件（BaseButton/BaseField/BasePopup/BasePicker/BaseFeedback，写前逐个 `wot info` 查事实源）、P1-24 门面测试（按钮忙态不重复提交/弹层取消/picker 选中清空/图片失败/长标题+token 映射）、P1-25 微信/抖音工具与真机样页证据（**真机部分需主人手机扫码，如实 pending**）、P1-28 审阅提交。


## 8.10 T4 门面执行记录（P1-23/24/25 工具侧＋P1-27，2026-09-17 第二批）

| 步骤 | 动作 | 结果 |
|---|---|---|
| P1-23 事实源纪律 | 写门面前逐个查事实：`wot info Input/Popup/Picker/Toast --version 2.3.2` 各 exit 0 ＋ 从**已装包源码 grep emit 名**（wd-input: input/blur/clear/confirm/focus；wd-popup: close/click-modal；wd-picker: confirm/cancel/update:visible；wd-toast: **无内部 emit、受控 show prop**（types.ts 事实））＋ `ToastIconType` **直接 import 包内真实类型**（`wd-toast/types.ts`：success/error/warning/loading/info，**不含空串**） | ✅ |
| P1-23 门面五件 | `src/ui/{BaseButton,BaseField,BasePopup,BasePicker,BaseFeedback}.vue`——统一 label/disabled/busy/value 与标准事件；**业务层不接触 Wot 内部对象**（Picker confirm 只回纯值数组；options 用业务平面结构） | ✅ |
| P1-24 门面测试 12 条 | 按钮**禁用/忙态不放行**（桩触发也不透传——门面守卫）＋忙态连点两次零放行（防重复提交）；弹层 cancel **单一出口去重**（close 与 update:modelValue 同动作只发一次）；picker confirm/cancel/**clearable 清空**（有值才出现清空入口）；反馈受控 show/hide（图片失败态用法） | ✅ 12/12 |
| P1-25 工具侧 | 探针样页 `src/pages/_probe/wot-sample.vue`（Button/Field/Popup/Picker/Toast/Dialog/Cell＋**图片失败态**＋**长标题码点截断**＋token 映射 chip）已注册 pages.json；**三平台编译产物落地**（mp-weixin wxml/wxss ＋ mp-toutiao ttml/ttss 实测存在） | ✅ 工具侧；**真机扫码 pending（需主人手机）** |
| ⭐ 接入方式修正（真实踩坑） | 首版门面**显式 import wd-*** → vue-tsc 把 wot 内部 .ts 源码纳入检查，报 **TS1371**（importsNotUsedAsValues）＋**TS7053×3**（node_modules/@wot-ui/ui/common/util.ts 索引 {}）——wot 以 .ts 源码分发、无独立 .d.ts，skipLibCheck 只盖 .d.ts ⇒ **改为 easycom**（uni 官方接入方式，plan §6.1 明确允许）：pages.json 配 `"easycom": {"custom": {"^wd-(.*)": "@wot-ui/ui/components/wd-$1/wd-$1.vue"}}`，门面去显式 import；vitest 无 easycom ⇒ 测试以 `global.components` 注册契约桩（语义等价） | ✅ 切换后 TC=0 |
| 附带修复 | BaseFeedback 首版自造 `FeedbackIcon` 并集（含空串）≠ 包内 `ToastIconType`（不含空串）致 TS2322 ⇒ 改为 **import type 包内真实类型**（SPEC §6.4 事实源纪律的直接收益） | ✅ |
| P1-27 | `wot doctor` 5 项 PASS（前批已记） | ✅ |
| 汇总回归 | vitest **81/81 exit 0**（8 文件）＋typecheck **exit 0**＋三平台构建 **各 exit 0** | ✅ |

**T4 剩余**：P1-25 **真机部分**（微信/抖音真机扫码同一 Wot 样页——**需主人手机**，工具侧已就绪）、P1-26 失败处置（若真机关键场景失败）、P1-28 审阅提交（本轮先提交工具侧证据）。


## 8.11 T3b 执行记录（P1-29~35，2026-09-17）

| 步骤 | 动作 | 结果 |
|---|---|---|
| P1-29 BuildRequest 闭集＋realpath | `build-target.mjs`：新端**只认 engine=vue3**（legacy 拒绝，走旧脚本）；platform/env 闭集；runId/profileKey 字符集（防路径穿越）；**sourceRoot/profilePath 须在 repoRoot 内、projectRoot 须在 `.work/` 内**（realpath 比对）；不以调用者 cwd 猜目标 | ✅ 7 条校验用例 |
| P1-30 隔离 run 目录 | `.work/build/<engine>/<profile>/<platform>/<sha12>/<digest12>/<runId>/`；**runId 唯一、目录非空即拒**（同 run 并发必失败）；profileDigest 与 profilePath 实际内容比对（来源验证） | ✅ |
| P1-31 流水线 | 白名单复制（10 项；node_modules/dist/tests 不进）→ **结构化应用 Profile**（JSONC 感知编辑 manifest.json name/description/平台 appid＋pages.json 导航标题，无宽正则）→ 生成 profile 配置 → 生成 Token（**请求携带的 tokenDigest 与实际生成比对**）→ `pnpm install --frozen-lockfile` → 构建 → verify → 写 `release-manifest.json` | ✅ 真实双 Profile 跑通 |
| P1-32 产物 verify 七查 | app.json／app.js／**路由集合**／appid（project.config.json）／导航标题／**引擎指纹**（vendor.js 含 createApp，防旧产物冒充）／**品牌残留全文扫**——全部命中产物文件；**⭐修正一处循环校验**：expectedRoutes 原从产物 app.json 自读自证（恒过），改从**源码 pages.json** 取阶段期望集合；appCode/apiBase 产物命中如实标注 pending-http-layer（Phase 2） | ✅ |
| P1-33 旧入口安全 | 新端构建器拒绝 legacy engine（测试锁定）；旧脚本本轮未动（逐个适配＝后续子任务，如实挂账） | ✅ 部分 |
| P1-34 负向用例 16 条 | legacy engine／闭集外 platform·env／缺字段／runId·profileKey 越界／sourceRoot·profilePath 出 repoRoot／projectRoot 出 .work／digest 不符／抖音缺 appid／**同 runId 非空覆盖**／旧产物冒充（无指纹）／错 appid／路由不匹配／导航不匹配／**A 读 B 产物（品牌残留）**／缺 app.json·app.js——**每项必须失败，实测全部失败** | ✅ 16/16 |
| **P1-35 双 Profile 真实整包构建（⭐ 本轮主证据）** | 隔离目录真实构建两遍（install frozen＋build:mp-weixin）：**blueberry**（appid `wxb19ad7426dfb8bd4`／appCode `blueBerry`／navTitle「蓝梅旗袍·汉服·民...」）＋**huahua**（appid `wxd3933d928ffed10d`／appCode `huahua`／navTitle「花花旅拍」）——两份 manifest **verify.ok=true**、**profileDigest 不同**（`2d8fb058…`/`81333505…`）、生成配置 digest 不同（`e8bbdeb8…`/`9f46bdc8…`）、**tokenDigest 相同**（`55a65558fc17`，同一 Token 源，符合预期）；**交叉残留实测 0**：blueberry 产物 grep「花花旅拍」命中 **0**、huahua 产物 grep「蓝莓」命中 **0**，各自品牌正常命中（2/1）；**未上传** | ✅ |
| ⭐ 本轮抓出的三个真问题（均已修＋测试锁定） | ①`stripJsonc` 只删整行 `//` 注释、**删不掉行尾注释**——真实 pages.json 首行正是行尾注释写法 ⇒ 重写为**字符串感知**逐字符扫描（串内 `//` 如 URL 不误删）；②`CONTACT_QR_SRC` 白名单**过严**——huahua 实况用包内路径 `/static/contactQRCode.jpg`（旧端既有用法）⇒ 放行 `static/` 包内路径（仍拒 `../` 穿越与非白名单 host，测试锁定）；③verify 路由集合**自证循环**（见 P1-32 行） | ✅ |
| 汇总 | vitest **98/98 exit 0**（9 文件）＋ typecheck exit 0；`.work/` 已入根 .gitignore | ✅ |

**T3b 剩余**：P1-36 CI 双车道（旧端回归／新端套件分车道，发布 job 受保护不执行）、P1-37 独立 CR（Profile/路径/数据隔离）＋**完整复跑 G1**（frozen 安装→typecheck→全量测试→双平台构建→双 Profile manifest/hash 入册）。T4 真机项（P1-25）仍等主人扫码回执。

## 8.12 P1-26 方案 A 修复执行记录（抖音真机三症状 · 2026-09-17 第三批）

> 依据：`docs/migration/wot-realdevice-investigation.md`（定稿，精确到文件行号的修复清单）；主人拍板**方案 A（平台 UI bridge 兜底）**。
> 纪律：平台分支全部做成**运行时可判定结构**（vitest 用纯 @vitejs/plugin-vue、不处理 #ifdef）；本次改动**未新增任何 #ifdef**；门面对外合同（props/emits/expose）不变。

### 改动文件清单

| 文件 | 改动 |
|---|---|
| `miniapp-vue3/src/ui/ui-platform.ts` | **新增**：运行时平台判定（构建期注入位点 `process.env.UNI_PLATFORM` ＋ 运行时兜底 `uni.getSystemInfoSync().uniPlatform`）＋ `setUiPlatformOverride` 测试钩子；`isToutiaoPlatform()` 为方案 A 分支键 |
| `miniapp-vue3/src/ui/wot-composables.js` ＋ `.d.ts` | **新增**：useToast/useDialog 构建期桥接（.js 不进 vue-tsc 程序，规避 wot 包内 .ts 触发 TS7053；.d.ts 提供结构化类型） |
| `miniapp-vue3/src/ui/BaseFeedback.vue` | **重写**：useToast() 函数式驱动（事实源：wd-toast 无 show prop）；抖音分支改 `uni.showToast`/`uni.hideToast` 原生兜底（icon 映射 success/loading/none）；对外 expose `show(text, icon?)/hide()` 不变 |
| `miniapp-vue3/src/ui/BasePopup.vue` | 新增 `rootPortal` prop（默认 true）透传 wd-popup；**抖音分支门面自绘**：纯 view+fixed 蒙层＋居中容器＋fade 过渡，cancel 单一出口与去重逻辑两条分支共用 |
| `miniapp-vue3/src/ui/BasePicker.vue` | 新增 `rootPortal` prop（默认 true）透传 wd-picker；**抖音分支门面自绘**：底部面板（取消/标题/确定＋选项列表＋预选草稿），confirm/cancel/clear 合同与 wot 分支完全一致 |
| `miniapp-vue3/src/pages/_probe/wot-sample.vue` | 对话框改 `useDialog().confirm({title,msg,showClose})` 函数式（resolve=确认、reject=取消/关闭）；挂载点改 `<wd-dialog root-portal :show-close="true">` ＋ `#actions` 作用域插槽（形参 confirm/cancel，wd-dialog.vue:56） |
| `miniapp-vue3/vitest.config.ts` | plugin-vue 标记 uni 内置模板标签（view/text/image/scroll-view）为原生元素，消除误告警 |
| `miniapp-vue3/tests/stubs/wot/wd-toast/wd-toast.vue` | 桩改镜像真实注入链（`__TOAST_OPTION__` provide/inject；真实组件本就无 show prop） |
| `miniapp-vue3/tests/stubs/wot/wd-popup/wd-popup.vue` | 桩补 `rootPortal` prop（真实 types.ts:105）供透传断言 |
| `miniapp-vue3/tests/stubs/wot/wd-dialog/wd-dialog.vue` | **新增**：镜像 `__MESSAGE_OPTION__` 注入通道（success=confirm resolve／fail=cancel reject，index.ts:124-137） |
| `miniapp-vue3/tests/components/ui-contract.spec.ts` | 12 条既有合同测试全保留（挂载方式仅按新实现调整），**新增 12 条抖音分支/函数式测试** |

### 新旧合同对照

| 门面 | 旧实现（违规/缺口） | 新实现 | 对外合同 |
|---|---|---|---|
| BaseFeedback | `<wd-toast :show>`——show prop 不存在，任何平台都不显示 | 非抖音：useToast() 函数式；抖音：uni.showToast 原生兜底 | expose `show/hide` 不变 |
| BasePopup | 仅 wd-popup 链；抖音 fixed 失效渲染成文档流块 | 非抖音：wd-popup ＋ rootPortal=true；抖音：自绘 fixed 蒙层＋居中容器 | props 增 `rootPortal`（向后兼容）；`update:show`/`cancel` 不变 |
| BasePicker | 仅 wd-picker 链；抖音展开收起位置异常 | 非抖音：wd-picker ＋ rootPortal=true；抖音：自绘底部面板 | props 增 `rootPortal`；`confirm/cancel/clear/update:modelValue/update:show` 不变 |
| 探针页 Dialog | `v-model/content/@confirm/@cancel` 均为不存在的 API，任何平台无响应 | `<wd-dialog root-portal>` 纯挂载点＋useDialog() 函数式＋#actions 作用域插槽 | 探针页仅工具链验证用，不进生产包 |

### 测试与构建结果（本机实测，退出码可复算）

| 命令 | 结果 |
|---|---|
| `pnpm exec vitest run` | **110/110，9 文件，exit 0**（此前 98/98；合同测试文件 12 → 24 条） |
| `pnpm run typecheck` | **exit 0**（.js 桥接生效，wot 包内 .ts 未进 vue-tsc 程序） |
| `pnpm run build:mp-weixin` | **exit 0** |
| `pnpm run build:mp-toutiao` | **exit 0** |
| `pnpm run build:mp-xhs` | **exit 0** |

产物抽查（只读）：mp-toutiao `ui/BaseFeedback.js` 含 `index.showToast` 兜底分支；`ui/ui-platform.js` 构建期常量已折叠为 `"mp-toutiao"`（mp-weixin 产物为 `"mp-weixin"`）＋运行时 `getSystemInfoSync().uniPlatform` 兜底；`ui/BasePopup.ttml/.ttss` 含 `base-popup-native` 自绘节点；探针页产物含 useDialog `confirm()` 与 actions 作用域插槽。**未上传任何平台。**

### 调查报告 6 条未验证项闭环情况

| # | 未验证项 | 本次处置 |
|---|---|---|
| 1 | 抖音宿主节点导致 fixed 相对组件定位的运行时细节 | **不依赖**（方案 A 自绘节点在页面级，不经 wot 组件链）；真机回归仍待主人扫码 |
| 2 | 抖音基础库是否原生支持 `<root-portal>` | **不依赖**（方案 A 绕过）；未闭环、也不阻塞 |
| 3 | 候选 E（放开 virtualHost）真机效果与副作用 | **未采纳**（主人拍板方案 A）；未闭环 |
| 4 | wd-toast 改对 API 后抖音端 fixed 定位是否正常 | **部分闭环**：抖音分支直接走 uni.showToast，绕开 wd-toast 定位链路；微信分支改对 useToast API（工具侧闭环，真机未验） |
| 5 | uni.showToast 在 tma preview 真机的实际表现 | **工具侧闭环**（类型 uni.d.ts:11178/11228 ＋ 运行时转发链 ＋ 构建产物含该调用）；**真机表现仍待主人扫码回执** |
| 6 | import useDialog 后 vue-tsc 是否复现 TS7053 | **已闭环**：经 `wot-composables.js`（.js 不进 TS 程序）＋ `.d.ts` 结构化声明，typecheck **exit 0**，未复现 |

**剩余待真机验证**（需主人抖音扫码）：自绘 popup/picker 的 fixed 定位与开合、uni.showToast 原生兜底表现、useDialog 弹窗在抖音端的渲染与回调——工具侧全部就绪，属第 1/4/5 项的真机收口。


## 8.13 对话框抖音自绘降级（方案 A 收尾，2026-09-17 · 主人指定秘书自行完成）

- **背景**：主人第三次前真机回执「除了对话框按钮点击没响应其他的都没问题了」；根因＝`wd-dialog.vue:1-12` 内部包裹 wd-popup，按钮处于抖音失效的 fixed 链内。原派收尾子 Agent（`96b3a3d5`）**模型请求失败未产出**（主人确认），改由秘书本 run 内联完成。
- **修复**：新增 `src/ui/BaseDialog.vue` 双平台门面——对外合同 `confirm(options: {title?, msg?, showCancel?}): Promise<"confirm"|"cancel">` 两平台一致；**抖音分支**＝自绘（fixed 蒙层＋居中卡片＋标题/正文＋底部按钮行，蒙层点击默认不关闭，样式用 tokens，照搬 BasePopup 已真机验证模式）；**非抖音分支**＝保留 wot 链（`<wd-dialog root-portal>` 挂载点＋`useDialog()` 驱动，resolve→confirm／reject→cancel 映射，showCancel 语义由 wot confirm 天然满足）；平台分支键＝`isToutiaoPlatform()`（0 处新增 #ifdef）。
- **探针页**：`wot-sample.vue` 改挂 `<BaseDialog ref="dialogRef" />`，「对话框」按钮调 `confirm({title, msg, showCancel: true})`，结果显示至 dialogResult。
- **测试**：ui-contract.spec.ts 新增 4 条（抖音：确认 resolve＋状态复位／取消 resolve＋蒙层不关闭／showCancel=false 单按钮＋连续两次复位；非抖音：useDialog 桩注入链 confirm/cancel 映射）——**合同测试 24→28，全量 110→114**。
- **验证**：vitest **114/114 exit 0**（9 文件）＋typecheck exit 0＋三平台构建各 exit 0。
- **真机待验点（第三次扫码）**：抖音对话框弹出形态／确认与取消按钮响应与 Promise 映射（dialogResult 显示）；另复验弹层/Picker/Toast 未回归。


## 8.14 T5 执行记录（P2-03/07，2026-09-17 第二批）

| 步骤 | 动作 | 结果 |
|---|---|---|
| P2-03 AuthCoordinator | `application/auth-coordinator.ts`（`createAuthCoordinator({exchangeIdentity, storage, clock})`）——**并发 waitForLogin 只发起一次换票**、completeLogin 唤醒全部等待者并递增 authRevision 持久化、**cancelLogin 全部 reject（不悬挂）**、**logout 作废旧会话＋清净区＋后续 waitForLogin 重新发起（二次 401 场景）**、可选 timeoutMs 防无限等待、启动兼容读 versioned 存储键（损坏内容安全失败＝视为未登录） | ✅ 5 条行为测试 |
| P2-07 品牌馆 controller | `application/brand-hub-controller.ts`（`createBrandHubController({loadConfig})`）——解析复用 domain `brandHubEnabled` 单一事实源；**迟到旧 scope 响应不写入**（切品牌治理，phases 行为测试例子两条变体均落地）；**同 scope 在飞去重**（onLoad/onShow 重叠只查一次）；**成功后热恢复必须重查**（不缓存结果）；坏 JSON／loadConfig 拒绝→**隐藏不抛**；**invalidate 作废在飞请求＋复位安全默认**（epoch 治理） | ✅ 6 条行为测试 |
| 附带修正 | `client.ts` 会话代次判定 `!==` → **`<`**：排队唤醒后新登录代次大于请求代次属正常，仅「会话代次落后于请求代次」判 stale | ✅ http-client 7 条测试保持绿 |
| ⭐ 实现期自纠 | brand-hub-controller 的 finally 清理原引用自身 promise（TS2448/2454 TDZ 静态违规）→ 改**按 scope 判定清理**（语义等价：被更新 scope 接管时不误清） | ✅ TC=0 |
| 汇总 | vitest **132/132 exit 0**（12 文件）＋typecheck **exit 0**＋三平台构建各 exit 0 | ✅ |

**T5 剩余**：P2-01 34 wrapper 落 repositories（8 条切片合同已冻结）、P2-04 上传 multipart `photo`、P2-05 重放策略细则落 client 调用侧、P2-06 versioned storage 完整实现（含旧键兼容读）、P2-08 授权按钮 ui-bridge＋协议两页、P2-09 provider 验证、P2-10 独立 CR。

## 9. G0 验收自查

- [x] 基线可定位（§0，SHA/树/锁哈希齐）
- [x] 资产有去向（§1–4 名单与数量逐条实测；`getalbum` 退役登记）
- [x] 风险/外部前置可见（§4 风险、§5 偏差、§6 前置状态表）
- [x] **未捏造「业务回归全绿」**：P0-11 性能基准 pending（真机依赖）、P0-12 业务口径待产品确认、抖音提审 blocked 如实标注
- G0 审阅人：**待主人指定**（本报告先提交，审阅后勾选）。
