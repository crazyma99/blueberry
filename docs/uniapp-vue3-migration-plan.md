# 蓝梅旅拍 Uni-app Vue3 重构迁移实施方案

> 版本：1.0 · 编写日期：2026-09-15 · 用途：重构时逐任务执行的参考方案。
> **For agentic workers:** 执行时使用 `subagent-driven-development` 或 `executing-plans`，按任务测试、独立评审；**本文交付不代表已经开工或允许发布**。
> **Goal:** 从当前 uni-app x 业务基线重新初始化 Vue3 工程，保留微信业务与多 Profile 交付能力，验证抖音并为小红书保留适配边界。
> **Architecture:** 新旧工程同仓、独立编译；按业务闭环逐批验收，不在一个小程序包中混跑两套引擎。领域/用例依赖抽象端口，UI 库和平台 SDK 均处于外层。
> **Tech Stack:** 官方 uni-app Vue3 + TypeScript 模板的兼容版本组合；Wot UI v2 为首选候选；具体工具链在 G1 锁定。
> **Spec:** 当前 `SPEC.md` 与 `docs/wot-ui-ai-guide.md`，补充/修正关系见第 2 节。

## 0. 范围、基线与文档效力

- 本轮只确定方案、校核资料、完善文档；不创建 Vue3 业务工程、不改后端、不恢复任何旧 Vue3 分支/标签/备份、不部署。
- **全新初始化是硬约束**。旧端当前源码可以阅读和迁移已确认的业务行为；禁止以已经废弃的 `mp-vue3/` 为起点。
- 当前代码基线：`crazyma99/blueberry main@2fe70acb49c204b468c5492a4a15231e51eab913`；当前文档不能再把 `a125889/v1.0.58` 当作最新业务基线。
- 后端关联基线：staging 的品牌馆修复 `f736de4`；这是测试环境基线，**不等于生产已部署**。实际开工前重新核对远端与当前运行版本。
- 输入为用户补全后的 `docs/uniapp-x迁移uniapp-vue3_实施细则&流水线参考.txt`，共 149 行，SHA-256 `31d827462c281a23c78daddb06da1a91c4b1e185fd06268174bbb64fad8d9fe7`；初次收到的 56 行残稿不再作为依据。
- 本方案主维护位置：blueberry 的 `docs/uniapp-vue3-migration-plan.md`；知识库保留同内容镜像。飞书产品 PRD 的业务口径不由本文擅改。
- 标记约定：**现状**=本轮读过的源码/文档事实；**方案决定**=本轮确定的技术实现约束；**开工/发布门禁**=必须拿到证据才能通过，不是已完成事项。

### 本轮确定的七个决定

1. **同仓新工程** `miniapp-vue3/`，迁移分支未来从当时的 `fork/main` 新建 `feat/vue3-migration`；不新建仓库、不恢复同名旧分支。
2. 保留旧端路由、业务结果和 3 Tab 语义；首轮不同时改首页布局、商业计费、4 Tab 产品方案或数据库主结构。
3. 优先打通「工程 + Profile + 平台端口 + 契约测试」，再走薄纵切片；不以“所有后缀改完”衡量进度。
4. 微信同平台接口保持向后兼容；抖音/小红书身份和支付是独立后端适配任务，不能复用微信 code/openid/签名假装多端。
5. Wot UI v2 通过微信/抖音关键组件验证后方可锁定；UI 只依赖本项目门面，不能让 `wd-*` 和库事件渗入业务层。
6. Design Token **单一数据源生成多端输出**，不再由人工维护 TS/SCSS 两份权威值。
7. 单测、契约、构建、真机、独立 CR、产物验证分别设闸；**周末是工作窗口，不是三端上线保证**，不通过闸门就不发布。

## 1. 行业最佳实践：采纳什么，不照搬什么

| 实践 | 权威来源 | 在本项目的落点 |
|---|---|---|
| 渐进替换，而非大爆炸重写 | [Martin Fowler：Strangler Fig](https://martinfowler.com/bliki/StranglerFigApplication.html) | 先证明一条业务闭环再扩展；旧端继续服务用户，新端在独立包验证 |
| 在替换点建立抽象边界 | [Branch by Abstraction](https://martinfowler.com/bliki/BranchByAbstraction.html) | API/平台/UI 三种门面；测试同一业务契约，不在业务中散落 SDK 分支 |
| Expand → Migrate → Contract | [Parallel Change](https://martinfowler.com/bliki/ParallelChange.html) | 后端先加兼容能力，再迁移消费者；旧客户端仍在用时不得删老接口/字段 |
| 单元多、契约/集成适量、端到端精简但真实 | [The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html) | 业务单测负责状态机，契约测试负责真实报文，平台工具/真机负责渲染与原生能力 |
| 合同不是“mock 自己通过” | [Pact：Consumer Tests](https://docs.pact.io/implementation_guides/javascript/docs/consumer) | 用真实 API client 产生请求；同份契约在本地 provider 验证，不能仅验证手写 mock |
| 新旧并存也必须有回退设计 | [AWS：Strangler fig pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-decomposing-monoliths/strangler-fig.html) | 借鉴分批和回退；**不引入微服务、网关或运行时流量代理**，本项目不需要这些额外架构 |
| Token 统一输入、多平台导出 | [Style Dictionary](https://styledictionary.com/) | 一个 JSON 数据源生成 CSS/SCSS/TS，再由独立 Wot bridge 映射供应商变量 |

**选择比较**：原地批量改写会同时破坏旧包编译与发版；独立新仓会放大热修同步和 Profile 漂移。推荐同仓双工程、独立工具链与产物，以短任务分支合到迁移集成分支；通过微信发布门禁后才切正式交付入口。

**小程序限制**：渐进验收不等于线上能按页面切两种引擎。微信仍以完整包发布；灰度是否有比例/回退按钮以目标平台控制台权限为准。不承诺所有平台都能 1%/10% 任意分流，也不把 `git revert` 等同于用户端立即回滚。

## 2. 三份输入的处理规则与必要纠错

| 输入说法 | 采用/修正后的执行规则 |
|---|---|
| 六阶段、工程先通、公共层先迁、分批业务、灰度验证 | 全部采用，映射到第 10 节 G0–G5 与任务 T0–T12 |
| 参考稿推荐全新初始化，又建议原地迁移保历史 | 采用**新工程 + 同一 Git 仓库/当前主线派生分支**，既保追溯，又不恢复旧骨架；不批量覆盖旧 `src/` |
| 移除 `vite-plugin-uni-x` 换 `vite-plugin-uni` | 现仓已经是 `@dcloudio/vite-plugin-uni`；按依赖清单核实迁移，不删除不存在的包，不靠插件名判断是否 uni-app x |
| Vite 5 / TS 5 / 最新稳定版固定组合 | 以官方 Vue3 模板所需 peer/engine 组合为准，统一锁 DCloud 同一发行线、Vue/types、Vite、TS、Node、pnpm；不能把若干 latest 拼起来 |
| `pages.json condition` 做平台编译 | `condition` 是工具启动模式，不是平台编译开关。平台差异由编译常量/生成配置处理 |
| 26 个接口、API 全改成 `uni.request` | 当前 `api.uts` 有 **34 个网络封装导出常量**（含 1 个已弃用）、2 个上传队列函数、11 个导出类型；函数数不等于唯一 HTTP 端点数。保留请求抽象，不能在每个 API 函数里直调 SDK |
| `utils/http.uts` 是唯一改名目标 | 同时核查上传、认证队列、品牌/cache、Profile 注入和产物校验；修改位置改为固定生成配置与端口实现，不只改扩展名 |
| 所有目录层级不变 | 对外路由/资源与 Profile 输入保持兼容；内部允许拆到 domain/application/infrastructure/platform/ui；旧 utils 可暂作 re-export 门面，设退役任务 |
| 所有 `#ifdef` 只能在一个目录，组件零例外 | **业务域中禁止**；平台端口、原生 UI bridge、composition root、manifest/pages 生成允许白名单例外。比如授权按钮原生属性不能靠纯 TS 适配器代替 |
| `CustomTabBar.vue` 就能替代现有 native custom tabBar | 微信的 `custom-tab-bar/index.js/json/wxml/wxss` 是独立运行边界；先保留其路由同步行为再适配。抖音/小红书须按官方支持另验，不共用微信产物 |
| 后端只补白名单 | 微信原接口保持；非微信必须补身份换票、用户映射、手机号授权、支付下单/验签回调/对账与幂等，见第 8 节 |
| TS/SCSS 双源同步 | 改成 tokens.json 单源生成，不允许两份手改的“真值”漂移 |
| 小红书有包/能构建即完成 | 平台包存在、编译通过、工具运行、真机链路、提审获准是五件事，分别记录；任何一关缺证据不得标“支持上线” |
| 旧 `release-trial.sh` 在上层目录直接沿用 | 当前脚本锁定**旧根目录和旧 dist**，会错发旧端。保留旧入口兼容但新引擎发布必须显式解析 sourceRoot/profile/platform/artifact 并验证后分流 |
| 回滚成本为零、周末三端必上线 | 不采纳。订单/支付、存储迁移、客户端版本滞后都有回退成本；先演练回退与旧客户端兼容，周末按门禁交付 |
| “30 天无提交 = 冻结”“某 llms.txt 404 = 无 AI 能力” | 不采纳这些推论。版本/活跃性是带日期的证据快照，API 路径失败不是否定能力的证明；仍以 Wot v2 为首选验证对象 |

**优先级**：用户明确的新起点/不恢复备份要求与仓库安全红线最高；本文件对上述实施细节的修正替代旧文档冲突句；原参考 txt 保持原文不改。

## 3. 资产与行为基线：冻结的是证据，不是整个团队

### 3.1 G0 必须记录的基线

开工负责人记录 `docs/migration/baseline.json`（未来新建）：

- sourceCommit、sourceTree、backendStagingCommit、backendProductionVersion（分别核实）、trialVersion、Profile/config 摘要哈希。
- 完整路由/组件/utils/静态资源清单、网络端点（method + path + auth + brand 规则）、页面/能力的实际调用者。平台债务统计注明口径：当前 .uts/.uvue 的 `wx.` 为 9 个文本命中行（含注释），不是 9 次真实调用；12 个 `#ifdef` + 4 个 `#ifndef` 之外，原生 tabBar 还有平台调用与 `(wx as any)` 写法，必须按 AST/调用者完整盘点。
- iOS/Android 的设备、系统版本、平台基础库、编译器/渲染器、网络条件；冷启动首页、相册首图、试衣等待/返回、包体主包/分包数据。
- 用户态：未登录、已登录、过期 token；品牌态：无品牌、已选品牌、切换品牌；数据态：空、正常、长标题/emoji、失败/弱网。
- 旧代码中的缺陷/歧义单独登记 `docs/migration/deviations.md`，**不把已知缺陷自动写成“必须兼容”**，也不趁迁移擅改商业规则。

旧端根 `package.json` 仍负责老包；当前 `55` 条脚本断言是既有验证线索，不足以代表全量业务回归已覆盖。本轮不重跑真实支付/生成任务，不取生产照片做测试。

**已知偏差单独记账**：当前 package/lock 的 UTS 范围与 sass 声明并非完全一致，不能复制锁文件就承诺 `npm ci` 成功；当前推荐 API 类型漏 `finalScore`，新类型须按真实后端字段补全；下载页仍有仅凭 `paid` 即本地置买断、而后端先标 paid 再发权益的静态竞态疑点，须在 T9 用可控延迟测试确认并修正，不能宣称旧端所有支付路径已统一防重。

### 3.2 热修与提交纪律

- 正式开工时从最新 `fork/main` 创建迁移分支；小任务分支每完成一个可测试任务即合回，避免巨型长分支。
- “迁移期间暂停新功能”是开工协调动作，由负责人通知；本方案交付不自动暂停其他成员工作。
- 主线线上 bugfix 继续正常修；每一笔登记 `hotfix-sync.md`：旧 SHA → 新端等价改动 SHA → 对照测试。**不能把旧 `.uvue/.uts` 补丁直接 cherry-pick 进新业务目录**。
- 每批合并与候选发版前检查主线增量。无法核对的 hotfix 必须挡发布，不允许“以昨日 SPEC 为最新”。
- 文档改动本身不更新线上客户端；不新建被用户禁止的旧 Vue3 备份。保留当前可发布旧端与必要发布回退记录，不做历史重写。

## 4. 分层与接口：依赖向内，不能“业务经过 UI 才访问平台”

### 4.1 目录与允许依赖（全部为目标结构）

**路径基准统一**：`B` 为 blueberry 仓根，`N = B/miniapp-vue3` 为未来新工程。以下目标 `src/`、`tokens/`、`tests/`、`scripts/`、`docs/migration/` 均相对 N；带“旧/当前/现有”的路径均相对 B。现有入口改造表的左列特指 `B/scripts/`，不会用新旧同名路径隐式互换。文件清单引用后端时明确写后端仓，不拼在N下。

~~~text
miniapp-vue3/
  src/
    app/                 bootstrap.ts、providers.ts：装配配置/端口/仓储/用例
    domain/              纯 TS 模型与规则：brand、album、ai-task、credits
    application/         用例：登录恢复、切品牌、点赞、生成、支付确认；依赖 ports
    ports/               http.ts、identity.ts、payments.ts、media.ts、storage.ts、clock.ts
    infrastructure/      http/、repositories/、storage/；实现端口和 DTO 转换
    platform/            weixin/、toutiao/、xhs/、h5/；SDK + 原生 UI bridge
    ui/                  BaseButton/BaseField/BasePopup/BaseTabBar 等 Wot 门面
    components/          业务展示组件（props/emits），不发请求/不引用 SDK
    composables/         Vue 状态/用例绑定与页面生命周期；不做供应商协议解析
    stores/              Pinia 保存跨页状态；受用例控制，不变成万能请求层
    pages/               保留旧端公开路由，装配 view-model 与展示组件
    generated/           profile.ts、tokens.ts、theme.css/scss（生成物）
    static/              公共及本 Profile 的资源，不跨 Profile 覆盖
  tokens/source.json     唯一手改 Token 输入
  scripts/               build/verify/release 与 profile/token 生成器
  tests/                 unit、contracts、components、pipeline、fixtures
  docs/migration/        baseline、inventory、contracts、parity、hotfix、release 证据
~~~

| 代码区域 | 可以依赖 | 不可以依赖 |
|---|---|---|
| domain | 纯 TS 模型/规则 | Vue/Pinia、uni/wx/tt、Wot、网络/存储 |
| application | domain、ports | SDK、Wot、页面组件、全局隐式单例 |
| infrastructure/platform | ports、domain DTO、选定平台实现 | pages、UI 门面、商业决策 |
| composables/stores/pages | application、domain view-model、ui/components | 直接 SDK、原始支付签名、供应商 API DTO |
| ui/components | Vue、项目 Token；ui 门面内可用 Wot | 发 API 请求、判商户权限、写支付状态 |
| app 装配层 | 所有实现的构造器 | 承载产品规则/页面 DOM |

特殊边界：授权手机号/头像、分享按钮、canvas、人脸能力等必须借助平台原生 UI 的场景，放在 `platform/*/ui-bridge/`，对上只发标准事件。不是强行把原生 UI 包成一个无参数 TS 函数，也不是把所有条件编译撒到业务页面。

### 4.2 必须先冻结的设计接口

以下为**新端设计契约，不表示当前代码已有实现**；任务 T2/T3 实现并测试这些文件。

~~~ts
// src/ports/context.ts
export type PlatformId = 'weixin' | 'toutiao' | 'xhs' | 'h5';
export type ReleaseEnv = 'develop' | 'trial' | 'release';
export interface RequestContext {
  profileKey: string; appCode: string; brandId: string | null;
  platform: PlatformId; environment: ReleaseEnv;
  scopeRevision: number; authRevision: number;
}
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'UNSUPPORTED' | 'CANCELLED' | 'UNAUTHORIZED' |
      'NETWORK' | 'BUSINESS' | 'INSUFFICIENT_CREDITS' | 'STALE_CONTEXT';
      businessCode?: number; message: string; requestId?: string; retryable: boolean };
export interface IdentityTicket { platform: PlatformId; code: string }
export interface IdentityPort { acquireTicket(): Promise<Result<IdentityTicket>> }
export interface StoragePort {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}
export interface ClockPort { now(): number; sleep(ms: number): Promise<void> }
~~~

- HTTP transport 接受**请求发起时的** RequestContext、signal/取消、timeout 与 replayPolicy；只 transport 直调 `uni.request/uni.uploadFile`。
- API repository 负责 HTTP status、业务 `code`、空值和 DTO 转换；按每个端点记录现行 `0/200` 成功兼容与 `4001` 等业务错误，不能全局只认 HTTP 200 或盲目只认业务 200。
- 推荐是现行同步长请求（180 秒）且会扣次数，不能改为不断重复 POST 的伪轮询；普通请求与 `photo` 字段的 multipart 上传各有 401 挂起队列与取消路径，迁移时合并抽象不丢行为。
- 401 队列由 application 的 AuthCoordinator 管理：并发仅唤起一次登录；取消/登出/超时让所有等待者明确结束；禁止无限悬挂。
- 切品牌或账号后，旧上下文请求作废；旧 POST 不可带新品牌头自动重放。读请求可按显式策略重新发起；生成/下单/扣费只有获得服务端幂等支持才能安全重试。
- DTO错误映射必须保留业务码与脱敏message/requestId：例如HTTP200+业务4001映射为 `INSUFFICIENT_CREDITS`、`businessCode:4001`、`retryable:false`，充值提示由用例决定；不得吞码变成所有错误都 `BUSINESS`。T5/T9a须验证4001/未授权/超时/取消的分支和消息脱敏。
- UI 支付成功只代表平台面板结果；订单支付完成、余额到账、单任务买断须由后端确认，不能在 UI success 分支直接加次数。
- PlatformPort 是多个小端口的集合，不是巨型“通用工具对象”；Capabilities 必须可查询，未实现能力返回 `UNSUPPORTED`，禁止假成功。能力状态unknown/unsupported若属于当前用例必需项，就阻断对应端门禁；若可选，需有批准的降级文案/路径及测试，不能把收到UNSUPPORTED视为验收通过。

## 5. Profile 与流水线：保留入口，隔离作用域

### 5.1 三个不同维度不能混为一个 ID

- **project/profile**：某个发行小程序/客户交付配置；`APP_CODE` 与各平台 appid 属此维度。
- **platform**：微信、抖音、小红书、H5；每端自己的编译器、appid、合法域名与授权能力。
- **brand/merchant**：运行时商户上下文；`X-Brand-Id` 不能用数字 merchantId 代替，也不能把默认品牌写进所有请求头。

### 5.2 Profile 字段契约

保留现有 `PROJECT_KEY/PACKAGE_NAME/MANIFEST_NAME/DESCRIPTION/MP_WEIXIN_APPID/NAVIGATION_TITLE/BRAND_NAME/COPYRIGHT_TEXT/CONTACT_PHONE_TEXT/CONTACT_QR_SRC/CONTACT_COOP_TEXT/PRICE_FALLBACK_TITLE/API_BASE_URL/APP_CODE/MINI_APP_NAME/RESIDUAL_SEARCH_REGEX` 的旧输入含义。

- 新增可选平台字段 `MP_TOUTIAO_APPID`、`MP_XHS_APPID`；只有构建/发布相应平台才必填，缺失时明确失败或标为验证未通过，绝不回退用微信 appid。
- `API_BASE_URL` 作为**该 Profile release 地址**保留兼容；补充测试环境 allowlist，在生成器显式输出 release/trial/develop 的映射。本项目沿用生产 `https://lanmei66.cloud`、体验/开发 `https://crazyma99.xyz` 的边界。
- engine/platform/env 必须运行时闭集校验：engine只认legacy/vue3、platform只认本轮批准目标、env只认develop/trial/release；未知值**不回退生产，也不回退trial假通过**，停止联网/构建或上传并报告配置错误。H5开发环境须显式输入；平台各自版本检测API由端口实现，不在跨平台共用config中无保护调用微信API。
- 配置文件只含客户端可见配置，不含 app secret/支付密钥/私钥/管理员 token。CI 从受保护变量生成本地输入，不提交秘密值，也不把整个 project.env 原文写入日志。
- 环境文件不是 shell 脚本：新生成器按键值解析并校验，不 `eval/source` 不可信配置；拒绝换行注入、路径越界、非法 host 与 appid/profile 混配。
- 用 `profile-map.json` 记录每个输入字段的消费者/输出目标/测试；未消费的必需字段即校验失败。正则静默找不到目标不得报告 apply 成功。
- **平台页面注册表与功能块开关（2026-09-17 主人拍板）**：`NormalizedProfile` 新增 `PAGE_REGISTRY`（该平台注册的公开路径闭集）与功能块开关字段（「我的」页菜单项列表、顶部引导文案变体）。抖音 Profile 定稿＝11 页（客片展示 9 ＋ 价目 2）/3 tab，AI 试衣与 AI 推荐 6 页不注册；「我的」页菜单仅「我的喜欢」。生成器对注册表做闭集校验：产物 `pages.json` 出现闭集外路径＝失败；开关字段未消费＝校验失败（沿用 profile-map.json 规则）。微信 Profile 保持 17 页全量。

### 5.3 逐脚本改造范围

| 现有入口 | 新端落实方式 | 必须验证的失败路径 |
|---|---|---|
| `create-profile.sh` | 保留交互字段及默认规则，增加 schema version/platform 选择 | appid 未填、非法项目名、目录已存在不得覆盖 |
| `new-miniapp-project.sh` | 明确 engine/sourceRoot，生成全新目标；保留初始化提示 | 不允许覆盖活动旧工程、不从已删除骨架恢复 |
| `apply-profile.sh + lib/apply-profile.mjs` | 入口兼容；新端改为 JSONC/AST/结构化生成 fixed config，不对任意源码做宽正则替换 | 重复 apply 幂等；A→B→A 相同；无残留品牌值 |
| `sync-template.sh` | 新端模板文件白名单/manifest；legacy 与 vue3 明确区分，执行前 dry-run | 旧 `rsync --delete` 不能落到新 `src/`；保留 package/lock、profiles、私有静态资源 |
| `build-miniapp.sh` | 显式 sourceRoot + projectRoot + profile + platform，隔离工作目录后 apply/install/build/verify | 从错误 cwd 调用也只构建指定目标；错 root/engine 直接失败 |
| `verify-miniapp.sh` | 对指定产物验证 appid、APP_CODE、路由、协议、资源、host、引擎指纹与禁用模块 | 能抓到错误 appid、残留品牌、漏授权/分享模块、旧端产物冒充新端 |
| `release-miniapp.sh / release-trial.sh` | 保留老用法映射 legacy；新端经发布包装器调用目标平台官方工具，强制 artifact 验证 | 新子目录不得 `cd ..` 后误上传旧包；缺审核批准/锁/元数据不得上传 |
| `build-all-profiles.sh` | 使用隔离目录做有界并行，逐项记录结果，任何失败汇总非零退出 | A/B 互不污染；同 AppID 的上传串行，不并发覆盖体验版 |

参考稿所说“7 个脚本”是工作流组数，**不是仓库脚本总数**；实际资产以本轮核对的清单为准。

### 5.4 构建与发布的目标协议（未来新增，不是现有命令）

~~~text
BuildInput { engine, repoRoot, sourceRoot, projectRoot, profilePath, profileKey,
             platform, environment, sourceCommit, profileDigest, tokenDigest, runId }
       → 新建 B/.work/build/<engine>/<profile>/<platform>/<sha>/<digest>/<runId>/
       → 复制模板白名单 + 精确 Profile 资源覆盖
       → 生成 profile / tokens / manifest / pages 配置
       → 锁依赖安装 → 类型/单测/契约 → 编译 → verify
       → release-manifest.json + 完整产物 hash
       → 独立评审/授权 → 同一份已校验产物上传（不偷换构建）
~~~

**输入路径解析**：repoRoot=B，sourceRoot是经批准的模板引擎根（legacy为B，vue3为N），projectRoot是本次隔离工作目录；profilePath必须明确绑定B/profiles/<key>/project.env或调用者批准的绝对路径，禁止工具仓Profile静默抢优先级。规范化realpath后拒绝越界/符号链接逃逸；runId唯一且目录已存在就失败，禁止同SHA并发覆盖已验证artifact。

release-manifest 至少含 sourceCommit、sourceTree、engine、profileKey、platform、appid、appCode、toolchain/lockfile hash、Profile/token digest、环境策略、路由清单、文件校验和、主/分包大小、测试报告与 CR 编号。

Profile 静态资源优先级：公共模板 → 当前 Profile 覆盖，路径白名单；发现不在当前 manifest 的陈旧文件必须在**隔离工作目录**清除，不能在用户源码目录清除。

## 6. UI 与 Design Token：替换库不应牵动业务

### 6.1 Wot 的准入门禁

- 首选沿用现有调研的 `@wot-ui/ui@2.3.2` 与 `@wot-ui/cli@1.1.0` **作为待验证候选组合**，而非永远的最新版本。初始化时先复核官方 metadata/模板兼容；变更版本走一次 ADR。Wot v2快速上手要求Sass高于1.78，官方推荐1.98+，须和DCloud/Vite一起锁版实编译，不单独盲升。
- 门禁样页必须同时包含 Button/Input/Popup/Picker/Toast/Dialog/Cell/图片失败态与列表长文本；验证关闭、取消、loading、防连点、禁用与无障碍可点击区域。
- 按需导入/easycom，只允许 `ui/` 门面和样页直接出现 `wd-*`；业务视图用 BaseButton/BasePopup 等稳定契约。替换库时不改 API/支付代码。
- 至少通过**微信、抖音**的编译 + 工具运行 + 真机关键交互，才将 Wot 标为本轮准入；小红书单独记录能力等级。
- 失败处置顺序：定位最小复现 → 少量差异放平台 UI bridge → 若关键弹层/表单广泛失效，才让 uview-plus 跑同一组资格测试。禁止多套完整 UI 库混装“哪里坏用哪套”。
- 活跃度取**发布时间、近 30/90 天主分支代码提交、issue/PR 响应、维护者公告、license**多项；不以 star 或一天 push 作“保证不弃坑”。开工与发版前各复核一次，锁文件保证可重建。

### 6.2 Token 单源

`tokens/source.json` 是唯一手改入口，保留 primitive → semantic → component 三层：

~~~json
{
  "primitive": { "gold": "#F1CD91", "ink": "#160F04" },
  "semantic": { "colorAction": "{primitive.gold}", "colorPage": "{primitive.ink}" },
  "component": { "albumTitleLikeGapRpx": 10, "likeCountGapRpx": 10 }
}
~~~

- 生成 `src/generated/tokens.ts`、`theme.css`、`theme.scss`；`uni.scss` 只引入生成文件，不再存另一份手写数值。
- Wot bridge 独立文件把 semantic token 对到**已核对**的组件变量；不能凭空编 `--wd-*` 名称，先用 CLI token/doc 查目标版本。
- 动画时长、字号、safe-area 语义、点击热区、相册 140rpx 避让等要从当前源码盘点并登记，不套用旧文档的“4/8/6 档”数字当既成事实。
- 0、100%、布局比例和业务计算不是一律禁用；允许项列明，品牌色/重复间距/字号必须有 token 归属。
- G1 验证生成幂等、循环引用/未知 token 报错、二次生成无 diff；G3 对截图/几何检查品牌一致，**迁移期不重设计 UI**。

### 6.3 Wot AI 接入如何进入实际流水线

1. 从 [官方 AI 指南](https://wot-ui.cn/guide/ai.html) 和 `llms.txt` 找到**真实文档链接**；不能把返回首页的 HTTP 200 当作子页成功。
2. 新工程项目级锁 CLI，使用 `pnpm exec wot info Button --version 2.3.2` 等只读查询；确切参数按锁版 CLI help 验证。
3. `doctor/lint/usage` 的机器可读结果作为辅助检查，**不代替**框架编译、业务契约、真机与独立 CR；确认退出码语义，不把 stdout 有 PASS 当全绿。
4. MCP 先 dry-run，得到用户对目标客户端/配置范围许可后才写；DSH 是否识别对应 schema/是否握手成功单独记录，不能套用别家 `mcpServers` JSON 宣称已接通。
5. Skills 固定来源 commit/版本，审阅全文后纳入项目文档；不能假定 `agent/skills/` 是所有客户端自动扫描目录。写明每个客户端的发现路径/加载方式，未支持时用显式读取。
6. AI 一次只实现一个任务和一组测试，输入当前 baseline/接口/禁改范围；不让多个 agent 同时改 Profile 生成器/锁文件/路由总表。
7. 本轮只交付方案，不安装 CLI/Skills、不更改现有 DSH MCP 配置，不用安装旧骨架来“复用接入”。

## 7. 当前必须保住的业务行为

| 领域/现有文件 | 迁移验收要点 | 失败用例 |
|---|---|---|
| `http.uts / auth.uts / loginFlow.uts` | Authorization、X-App-Code、可选 X-Brand-Id；401 单登录、取消结束队列、用户资料非空合并 | 并发 401、取消后返回重弹、旧账号/品牌 POST 被重放 |
| `brand.uts / pageConfig.uts / pages/index` | 无品牌不伪造所有接口的 brand；page-config 按商户或后端默认品牌下发；仅 `enabled === true` 展示 | 无配置/坏 JSON/错误响应隐藏；跨品牌旧响应不能复活入口 |
| `demoDetail / favorites / text.uts` | 标题 ≥7 码点显示前6+...；点赞按下乐观反馈、失败回滚、计数不为负、触感 | 6/7边界、emoji、连击后乱序回复、收藏列表同规则 |
| `pageConfig / share / faceShareCard / aiTryOnResult` | 分享卡片槽位/品牌/全局回退；试衣结果的匿名shareToken与付费下载分开；targetPhotoDetail是普通客片详情 | 匿名拿付费原图、旧share卡串品牌；朋友圈scene1154跳页/重复查询或轮询 |
| `aiTryOn / aiTryOnResult / photoCheck / vkFace` | 选图→质量拦截→上传→任务→结果→水印→买断原图下载；好友直达试衣、朋友圈token作品页/JPG封面 | 取消选图、权限拒绝、任务失败/重进恢复、临时URL过期、防截屏未恢复；scene1154禁跳且只读查询一次 |
| `aiRecommend / aiRecommendLoading / aiRecommendResult` | 同步长请求/等待状态按旧协议；结果展示 `finalScore`，不恢复已删除性别标签 | 分数缺省/0/异常、重复提交、取消离页后迟到写入 |
| `payGuard / api` | 支付门闩、paid+余额到账确认、taskBought 任务永久买断、不自动二次拉支付 | 面板成功但余额未更新、回调重复、用户取消、网络重试重复收费 |
| `AppFooter / ServiceContact / ProfilePopup / legal` | OPS驱动文案、服务保障、联系/版权、协议同意与头像昵称 | 不把展示组件改成独立请求者、不把空字段覆盖用户资料 |
| `custom-tab-bar / tabbar.uts` | 三个旧路径、选中态及 onShow 同步；不恢复用户已回滚的选中背景位移动画 | 快速切页/程序化切页错选中、跨端复用微信文件 |

**品牌馆专项边界**：当前代码热恢复有 30 秒节流，与“重新进入立刻拿最新”之间存在时间窗口。本方案在 `deviations.md` 明确记录这项**有意修正**（依据用户此前刷新/重进诉求，而非无声改变parity）：新端下拉、冷启动、热恢复强制刷新开关；同上下文初次onLoad/onShow在飞请求去重，回前台若前一请求已完成则重新查询，不使用跨生命周期30s缓存阻止刷新。后台切换关闭后请求完成即隐藏；品牌变化/请求代次变化丢弃旧回复。默认品牌兜底是现行后端合同，不可擅改为“任何商户开了就全局显示”。

## 8. 多平台不是只换编译目标

### 8.1 平台能力确认与降级

| 能力 | 微信迁移 | 抖音迁移 | 小红书准备 | 发布闸门 |
|---|---|---|---|---|
| 编译/路由/原生组件 | 与当前路由与基础库对照 | `mp-toutiao / MP-TOUTIAO` | `mp-xhs / MP-XHS`，实际资格逐版本核实 | 锁版最小程序与 17 页构建 |
| custom tabBar | 保持 native custom-tab-bar 结构/桥接 | 按官方方式独立适配，不复制微信 wxml | 独立验证，必要时采用被支持的导航方式 | 用户可达路径、选中态、safe-area一致 |
| 登录/手机号 | 老微信端点与账号保持 | SDK ticket→新增后端 provider 交换 | 同样建独立 provider，不能臆造 SDK 方法名 | 服务端会话、签名、用户归属通过 |
| 支付 | 保留 paid/余额/taskBought 语义 | 按已批准类目/平台产品重做下单/回调 | 无正式能力前标阻断 | 沙箱/受控对账、重放幂等、退款策略 |
| 分享/订阅 | 页面生命周期与分享配置保留 | 使用平台实际支持的渠道与字段 | 逐项验证，未验证标 unknown | 工具/真机证据，不能仅查方法存在 |
| 媒体/COS/权限 | 上传队列与 URL 规则照旧 | 权限授权/临时路径/上传合同核对 | 同左 | 允许、拒绝、取消、超时覆盖 |
| 防截屏/人脸/字体/震动 | 实际支持才启用并恢复作用域 | 先查基础库与能力后再实现 | 未确认不写“无/最弱”结论 | 不支持时明确说明，不静默假成功 |

**抖音范围定稿（2026-09-17 主人拍板）**：本轮抖音端＝「客片展示版」（11 页/3 tab），**不迁 AI 试衣/推荐闭环**（B3/B4 不进抖音产物），价目两页纯展示、**零支付改造**（支付能力仅存在于 AI 链路，实测 `payGuard`／`requestPayment` 仅出现在 AI 链路 4 页＋`utils/api.uts`）；上表「支付」行的抖音列本轮标 **N/A（无支付功能）**，待后续授权再评估；「登录/手机号」行的抖音列仍需实现（「我的喜欢」`needLogin`）。

app secret、支付 key、code2session 换票永远留在服务端。请求白名单配置在**各平台管理台**；H5 CORS、后端路由/auth、COS允许域名是另外的配置，不能混称“后端白名单”一次解决。

### 8.2 后端兼容扩展契约（设计，不代表接口已存在）

- 非微信身份端口传 `{platform, code}`；后端按平台+appid 校验并绑定 `(platform, appid, subject) → internalUserId`，不以 openid 字符串跨平台直接等同用户。
- 是否通过手机号合并账号是业务与合规决策，证据不足时不自动合并；跨平台余额/买断共用也必须有身份与归属依据。
- 订单至少持久化 platform/provider/orderId/internalUserId/merchantScope/paymentState；provider 回调验签、幂等唯一约束、到账与订单事务一致。
- 用户/任务/商户归属在后端校验；客户端 header、capability flag 或按钮隐藏不是权限控制。
- 旧微信路径/响应字段继续可用。新增路径和 schema 在 `contracts/platform-auth.json`、`contracts/platform-pay.json` 冻结后再写实现，不提前在前端调用假定路径。
- 先服务端扩展，旧/新 consumer 契约一起跑；观察到旧版使用结束且有退役批准才进入 Contract 阶段。迁移不能为赶周末删除旧微信接口。
- 未具备支付资质不能自行改成“免费额度/引流”上线；这属于商业与合规改动，需主人批准。

## 9. 测试与流水线门禁

### 9.1 测试层次与最低覆盖矩阵

| 层 | 工具/方式（目标） | 必须测的内容 | 不能据此声称 |
|---|---|---|---|
| 领域单测 | 锁版 Vitest，fake clock、可控 Promise | 标题/计数、支付状态机、品牌代次、401队列终结、取消/超时 | native能力或真机渲染已通过 |
| HTTP consumer 合同 | 真实 repository + 注入 transport；同份 fixture/provider 验证 | method/path/header/body/业务code/timeout/upload字段 | 只 mock resolve 一段数据就是后端兼容 |
| 后端合同 | 本地 provider +隔离测试库/替身 | 微信兼容、身份/支付provider、验签/幂等/归属 | staging或prod已部署 |
| Vue/UI 门面 | Vue Test Utils + 平台标签stub | props/emits、loading、按钮可达性、Token 映射 | 微信/抖音原生组件行为已通过 |
| 工程/Profile | 临时目录构建、负向突变 | A/B隔离、幂等生成、错AppID/错根目录/残留字符串会失败 | 多Profile真实商户均已发布 |
| 平台 E2E | 官方工具支持的自动化 + 真机清单 | 路由、原生按钮、分享、权限、支付回跳、弱网 | H5截图等同小程序验收 |
| 人工独立 CR | 不参与实现的审阅者 | 跨商户/支付/回滚、门禁可绕过、退役风险 | 红项未解也能用“口径说明”放行 |

不把“正则找到一行字符串”当行为覆盖。至少做三个负向验证：把刷新调用放进不可达分支；删掉 seq guard；把构建 appid 换成另一 Profile——对应测试必须红。所有命令读取真实退出码，禁止用 `... | tail` 的 0 码报构建成功。

### 9.2 一份真实可执行的测试样例（目标新模块）

T2 创建 `src/domain/brand-hub.ts` 与 `tests/unit/brand-hub.spec.ts`；不依赖 Vue/SDK。

~~~ts
// tests/unit/brand-hub.spec.ts：先建测试，确认模块缺失时失败
import { expect, it } from 'vitest';
import { brandHubEnabled } from '../../src/domain/brand-hub';
it.each([
  [undefined, false], ['bad json', false], ['{}', false],
  ['{"enabled":false}', false], ['{"enabled":"true"}', false],
  ['{"enabled":true}', true],
])('strict enabled: %s', (config, expected) => {
  expect(brandHubEnabled(config)).toBe(expected);
});
~~~

~~~ts
// src/domain/brand-hub.ts：测试确认失败后再添加的最小实现
export function brandHubEnabled(config: unknown): boolean {
  if (typeof config !== 'string') return false;
  try { return JSON.parse(config)?.enabled === true; }
  catch { return false; }
}
~~~

任务中运行 `pnpm --dir miniapp-vue3 exec vitest run tests/unit/brand-hub.spec.ts`。再测完整 page-config repository 的信封/数组解析与其他组件保留，不能用这个纯函数测试替代全链路。

### 9.3 CI 分车道

- **PR无秘密车道**：依赖锁安装→类型→domain/contract/UI门面→Profile生成/负向→微信/抖音构建与产物扫描。小红书若编译或能力不支持，独立作未通过目标，不从 required 列表暗删后宣称三端全绿。
- **分层扫描范围**：第一方domain/application/composables/pages走AST与依赖规则，SDK/UI bridge按白名单；文档示例、fixture、node_modules不被误判成业务调用。产物扫描按目标平台禁止模块引用/错误AppID/host，不对全部第三方bundle盲做`wx`字符串零命中。
- **legacy回归车道**：迁移期间旧端根目录构建与既有脚本照跑；新端改动不能使旧发版入口失效。
- **发布车道**：只受信代码、人工批准、目标环境凭据、按 appid+platform 串行锁；不得把不受信 PR 与发布 token 放同一执行环境。
- 上游失败/缺 fixture 单独报实际失败原因。不得关 TLS 校验、自动买 AI 次数、调用真实支付来“让全仓测试绿”。环境依赖测试与 deterministic unit 分组，完整结果都保留。
- build job 生成并保存被验证 artifact；release job 校验 manifest/hash 后上传同一 artifact。身份、环境、签名文件校验任何一处失败即结束，不能回退旧工程。

## 10. 六阶段执行清单（T0–T12）

每个任务统一走：**读基线/端口 → 写该任务失败用例 → 确认失败原因正确 → 最小实现 → 运行所列测试 → 独立评审 → 显式 add 本任务文件提交**。下表中的文件/脚本是**未来要创建或适配的交付物**，不冒充现有可用工具。

| 阶段/门禁 | 任务与输入→输出 | 文件及测试落点 | 退出条件 |
|---|---|---|---|
| 1 / G0 | **T0 基线与风险**：当前main+完整参考→清单/基准/热修账本 | `docs/migration/{baseline.json,inventory.md,contracts.md,parity.md,hotfix-sync.md,deviations.md}` | 17路由、15组件、20工具逐项有去向；列清操作方/平台资质/性能采样缺口 |
| 2 / G1 | **T1 新工程与版本资格**：官方模板→锁版可编译最小App | `miniapp-vue3/{package.json,pnpm-lock.yaml,vite.config.ts,tsconfig.json,src/main.ts,src/App.vue}`；`tests/pipeline/toolchain.spec.ts` | 微信/抖音最小App编译与工具运行；版本/模板commit已记；未改旧根配置 |
| 2 / G1 | **T2 ports与domain**：第4节接口→纯TS模块/port替身 | `src/domain/{brand-hub,album-title,payment-state}.ts`，`src/ports/*.ts`，`tests/unit/*.spec.ts` | 严格boolean/emoji/扣费门闩/迟到响应取消全部实跑；domain无SDK/Vue |
| 3 / G1 | **T3a Profile生成前置**：现字段→schema/隔离overlay | `scripts/{profile-schema,generate-profile}.mjs`，`tests/pipeline/profile.spec.ts` | 用真实最小fixture验A→B→A、输入闭集、路径隔离；此步不宣称完整构建已验 |
| 3 / G1 | **T3b 完整构建集成**：T3a+T4→隔离生成/编译/校验 | `scripts/{build-target,verify-target}.mjs`，`tests/pipeline/build-target.spec.ts`；适配B/scripts旧入口 | Token/Profile都真实生成后双Profile构建；错AppID/root/host/engine负向必失败，旧接口保持 |
| 2/3 / G1 | **T4 Token与Wot样页**：旧tokens→单源生成+UI门面 | `tokens/source.json`、`scripts/generate-tokens.mjs`、`src/ui/*.vue`、`tests/components/ui-contract.spec.ts` | 样页通过微信/抖音真实交互；生成幂等；Wot/CLI兼容锁定；未通过则阻断UI铺开 |
| 4 / G2 | **T5 HTTP/认证/品牌与授权基础**：api/http/auth/brand→仓储/用例，首次交付B0两协议页 | `src/infrastructure/http/*.ts`、`src/application/{auth-coordinator,brand-context}.ts`、`src/pages/policies/{user,privacy}.vue`、`tests/contracts/*.spec.ts` | 真实client合同与协议同意/拒绝对齐；401取消/并发、scope切换、upload队列和JSON异常通过 |
| 4 / G2 | **T6 第一条纵切片**：首页→相册列表→详情→返回 | 对应3个旧路由、`src/composables/use-home.ts`、`tests/e2e/read-flow.md` | 带/不带品牌内容正确，默认品牌开关合同保留，3Tab同步、首图失败态、长标题布局通过 |
| 4 / G2 | **T7 第二批页面**：价目/我的/收藏/品牌馆/webview | 第11节B2路由与展示组件；`tests/e2e/account-content.md` | 微信登录/退出、OPS页脚/客服、喜欢/取消/回退、webview安全域；T5已交付的协议这里只做集成回归 |
| 4 / G3 | **T9a 共享支付前置**：T5身份+本地provider合同→PaymentCoordinator | `src/application/payment-coordinator.ts`、`src/domain/payment-state.ts`、`tests/unit/payment.spec.ts` | 微信下单/paid+权益双确认、重复/超时/取消、三池与taskBought幂等先过；T8所有收费入口依赖本任务 |
| 4 / G3 | **T8 AI试衣闭环**：T5+T9a→选图/上传/任务/结果/下载 | 对应3路由、`src/application/{tryon,task-poller,download-entitlement}.ts`；`tests/unit/tryon.spec.ts` | 微信拒绝权限/任务中断重进/水印/匿名只读/买断/取消/轮询停止通过；抖音身份支付mock不得算G4完成 |
| 4 / G3 | **T9b 推荐闭环**：T5+T9a→提交/等待/结果/付费续跑 | 推荐3路由、`src/application/recommend.ts`；`tests/unit/recommend.spec.ts` | finalScore与无性别标签；180s同步扣次不重发；复用PaymentCoordinator，不另造支付门闩 |
| 5 / G4 | **T10 跨平台身份与原生UI**：port合同+资质→非微信实现 | `src/platform/{toutiao,xhs}/`；后端独立身份/支付变更与合同文件；`tests/e2e/platform-matrix.md` | 微信保持；抖音provider服务端验证+真机通过；小红书逐关记录，不以编译代替完成 |
| 6 / G5 | **T11 候选包与回退演练**：冻结SHA→可审核产物 | `scripts/release-target.mjs`、`docs/migration/release-manifest.json`、测试/CR/设备报告 | 无未关闭CR红项；同artifact上传；平台退回版本/后端旧新共存演练有证据 |
| 6 / G5 | **T12 验收和旧入口退役**：试运行证据→批准切换 | `docs/migration/acceptance.md`、发布索引、KB锚点 | 批准后才改默认构建入口，旧端/接口保留至支持窗口结束；不自动删标签/改prod |

**顺序约束**：T0→T1→T2/T3a（文件隔离）→T4→T3b→T5→T6；T3a仅测试Profile生成，完整构建T3b必须等T4真实Token生成器，避免隐式循环。然后T7与T9a可并行；T9a完成后T8/T9b并行→T10→T11→T12。T5负责首次交付协议与授权同意；T7仅回归。T5–T9b的完整业务门禁先按微信验收，抖音/小红书的UI与API mock只能算前置证据，真实登录支付必须等T10独立provider门禁。抖音UI资格在T1/T4提前验证，不到发布前才查。

### 10.1 任务测试命令契约

T1定义脚本命名合同，各任务在引入对应真实测试时启用自己的script：`typecheck`（`vue-tsc --noEmit`）、`test:unit`、`test:contracts`、`test:components`、`test:pipeline`（均固定使用 `vitest run` 对应目录）、`build:mp-weixin`、`build:mp-toutiao`、`build:mp-xhs`、`build:h5`（官方 CLI 平台值）。缺目录/空测试集不能默认成功。

**逐阶段required suites**：T1仅工具链/最小构建；T2新增unit；T3a新增profile pipeline；T4新增components/token；T3b新增完整build pipeline；T5新增contracts，G2起聚合全部已交付suite。任务未开始的suite不伪造空测试或设置passWithNoTests，已开始的required suite缺失/为空必须失败。

以下聚合命令适用于**G2及之后、上述任务已产生对应套件**，不是T1就执行未来尚未存在的测试；各阶段都显式限定目录：

~~~bash
set -euo pipefail
pnpm --dir miniapp-vue3 install --frozen-lockfile
pnpm --dir miniapp-vue3 run typecheck
pnpm --dir miniapp-vue3 run test:unit
pnpm --dir miniapp-vue3 run test:contracts
pnpm --dir miniapp-vue3 run test:components
pnpm --dir miniapp-vue3 run test:pipeline
pnpm --dir miniapp-vue3 run build:mp-weixin
pnpm --dir miniapp-vue3 run build:mp-toutiao
~~~

这些是 T1/T3 完成后的命令，不在本轮执行。没有编写并验证的目标发布包装器前，**不提供可直接上传新包的旧脚本命令**。

### 10.2 周末交付安排（不以时间代替质量）

- 周五：负责人确认 Profile/目标平台/资质；T0 采样并锁基线；T1/T4 最小样页做准入。
- 周六：T2/T3/T5 先达 G1；T6 第一纵切片双端跑通；T7 拆给独立开发者，不同时改路由/锁文件。
- 周日：仅在前序全绿时推进 T9a→T8/T9b 与已获资质的 T10；至少输出当前通过的任务、失败用例、差异账本与下一批计划。
- **不承诺周日三端上线**：若支付/资质/平台能力未通过，交付“验证到 Gx 的候选”，保持现网旧端；不能为了日期把不支持写成可用。

## 11. 完整页面/组件/工具迁移去向

### 11.1 路由逐条验收（对外 path 不变）

| 批次 | 旧/新公开路径 | 必验内容 |
|---|---|---|
| B0/T5 | `pages/policies/user` | 协议标题/同意与版本 |
| B0/T5 | `pages/policies/privacy` | 隐私弹窗、链接与拒绝路径 |
| B1/T6 | `pages/index/index` | 默认/商户数据、品牌馆开关、首图与3Tab |
| B1/T6 | `pages/demoDetail/index` | 列表/搜索结果、加载/空/失败、标题点赞试衣入口 |
| B1/T6 | `pages/targetPhotoDetail/index` | 普通客片图组详情，保idx/type入参、分享与返回；不把试衣shareToken语义移入此页 |
| B2/T7 | `pages/priceHomePage/index` | 价目展示与Tab |
| B2/T7 | `pages/priceList/index` | 套餐/价目、禁复活已下线轮播 |
| B2/T7 | `pages/mine/index` | 登录两态、头像昵称、退出 |
| B2/T7 | `pages/favorites/index` | 默认收藏全量列表、搜索分页分别对照；取消/空态/卡片一致，不擅加默认分页 |
| B2/T7 | `pages/brandHub/index` | 开关页自守卫、品牌切换与缓存隔离 |
| B2/T7 | `pages/webview/index` | URL白名单/返回/不可信链接 |
| B3/T8 | `pages/aiTryOn/index` | 选图质量与权限、模板匹配、提交 |
| B3/T8 | `pages/aiTryOnResult/index` | 等待/错误/结果、水印、买断下载、只读分享 |
| B3/T8 | `pages/aiTryOnHistory/index` | 当前一次获取全量历史；进度恢复/删除按旧合同，不凭空添加分页 |
| B4/T9b | `pages/aiRecommend/index` | 入参/校验/付费续跑 |
| B4/T9b | `pages/aiRecommendLoading/index` | 伪进度与真实状态分离、离页停止轮询 |
| B4/T9b | `pages/aiRecommendResult/index` | finalScore、缩略图/失败、试衣跳转 |

**抖音 Profile 覆盖范围（2026-09-17 主人拍板）**：B0＋B1＋B2 共 **11 页**进抖音产物（另加「我的」页功能块裁剪：菜单仅「我的喜欢」、文案去 AI 字样）；**B3＋B4 六页不进抖音产物**。迁移实现仍逐条 parity——**代码全量迁移，差别只在抖音 Profile 的 `PAGE_REGISTRY` 不含这六条路径**，不是「抖音分支删代码」；微信产物 17 页不变。

### 11.2 十五个组件

| 旧组件 | 新去向 |
|---|---|
| AppInput / AppSegment / AppSelector | UI 门面，候选库实现细节封装在门面内 |
| AppPhotoPicker | 展示门面 + platform media/ui-bridge + 用例协调，不在展示组件上传 |
| LoginPopup / ProfilePopup | 纯视图 + Auth/Profile 用例；原生授权按钮在 bridge |
| BottomActionBar / BottomActionBarSecondary | 保留业务布局、安全区、loading/事件合同 |
| CustomNavBar | 保留品牌视觉，capsule/安全区数据来自适配端口 |
| GenerationProgress | 保留阶段文案，伪进度不得触发业务“完成” |
| LoadingBlock / SkeletonBlock | 保留图加载/失败时序；如换库必须过时序与几何测试 |
| PhotoGrid | 纯展示，接收已准备view-model；标题/点赞/AI按钮关系不改 |
| AppFooter / ServiceContact | OPS数据由页面用例加载注入；组件不再私自发请求 |

### 11.3 二十个工具

| 旧模块 | 新责任区/注意事项 |
|---|---|
| config.uts | generated profile + environment port；禁直接读错平台env |
| http.uts | infrastructure transport + AuthCoordinator；保留可取消401语义 |
| api.uts | 按域 repositories；导出wrapper到 endpoint 的映射表 |
| auth.uts / loginFlow.uts / profileSubmit.uts | identity/profile usecases + versioned storage |
| brand.uts / pageConfig.uts | brand context + configuration repository，cache key包含scope |
| payGuard.uts | payment usecase 的可测状态机，不绑 UI |
| format.uts / text.uts | 纯 domain/util，标题码点与格式化行为测试 |
| navigate.uts / tabbar.uts | navigation port + lifecycle bridge |
| share.uts / faceShareCard.uts | share usecase + canvas/native bridge |
| photoCheck.uts / vkFace.uts | media/vision ports，服务端校验保持权威 |
| imageLoader.uts | image pipeline repository，取消/失败/URL边界 |
| legal.uts | Profile生成政策数据 + 导航用例 |
| haptics.uts | capability-aware feedback port |

存储迁移：保留旧 token/userInfo/brand_id 的兼容读取，新增带 platform/profile/schemaVersion 的命名空间；旧 key 不在验证期删除。无效/跨 appid 身份必须重新授权，不把旧微信 openid 搬给抖音。迁移是幂等读旧写新，并留能回旧包的兼容读路径；测试空值、损坏内容、用户取消与回退。

### 11.4 API wrapper 全量去向（34 个，不等于 34 条独立 URL）

下列函数名称来自 `src/utils/api.uts`。每个 wrapper 在 `contracts.md` 登记 method/path/body/header/response/副作用/调用页面/新文件与测试 ID；同 URL 不同参数/权限也要覆盖。

| 新 repository | 当前 wrapper 名称 | 关键约束 |
|---|---|---|
| `album.ts` | getImage、getalbum（废弃）、getCategories、getAlbumList、getalbumDetail | getalbum 查调用者后登记退役，不能恢复废弃页面；其余保 type/shopId/idx 等入参 |
| `identity-weixin.ts` | wxLogin、wxBindPhone、wxGetUserInfo、wxUpdateUserInfo | 保微信合同；非微信由独立 provider 映射，不改名后直接复用 |
| `interaction.ts` | toggleLike、getLikeStatus、toggleFavorite、getFavoriteStatus、getFavoriteList | 乐观更新、默认收藏全量/搜索分页分开、取消与上下文隔离 |
| `catalog.ts` | searchAlbums、getShops、getPackages、getBrands | 品牌编码与 shopId 不混用；过滤 PLATFORM 按现行页面行为 |
| `page-config.ts` | getPageConfig | 原品牌键+60s cache语义、force与新的生命周期去重策略单测 |
| `templates.ts` | getAiTemplates、getAiStyles、getAiTemplateDetail | 商户/店铺匹配与启用条件 |
| `media.ts` | uploadPhoto | uni.uploadFile、multipart字段photo；JSON字符串解码、取消401上传队列 |
| `tryon.ts` | submitAiTryOn、getAiTryOnResult、getSharedAiTryOnResult、downloadAiTryOnResult、getAiTasks、deleteAiTask | 匿名只读与登录下载分离，任务/签名URL/买断权益，不自动重复创建 |
| `credits.ts` | getCreditBalance、createCreditRecharge、getCreditRechargeStatus、redeemCreditCode | tryon/recommend/download三池；订单回执、幂等发权益；兑换非安全重放 |
| `recommend.ts` | getAiRecommend | 同步180秒请求与扣次副作用；finalScore字段与旧显示条件对照 |

`flushPendingUploads`、`rejectAllPendingUploads` 是两个队列操作而非 API；迁移到 Auth/UploadCoordinator 并覆盖取消与只重放一次。11 个导出类型逐一归属 domain 或 DTO，不能原样复制缺字段类型就算完成。

## 12. 发布、观测与回滚

### 12.1 发布前门禁

- 锁候选 sourceCommit/target Profile；从 manifest 指定的 artifact 验证 appid、环境策略、APP_CODE、路由、brand头规则、包体与完整资源。
- 双端设备报告明确到机型/系统/基础库；H5通过不代替小程序。小红书未通过则标“未上线目标”，不能宣称三端迁移完成。
- 新端登录/支付必须先部署兼容后端能力再投客户端；生产部署仍需单独批准，本轮研究不授权它。
- 独立 CR 红项清零；若涉及默认品牌/全局开关/免费额度等语义争议，必须业务负责人确认，不能由实现者用技术解释自行降级红项。
- 记录旧候选产物与后端兼容窗口；不向已删除 Vue3 备份回滚，不一键 reset shared main。

### 12.2 观测指标与阈值

同环境、设备、网络、账号态和 Profile 采样；性能阈值是**本方案建议的验收预算**而非当前已达指标：关键路径 p95 不高于旧基线 10%，主包不超过平台当前硬上限且相对基准增加须解释。无基线数据先补采样，不填估算值冒充实测。

业务硬门禁：新增白屏/无法登录/重复收费/商户串数据/匿名获得付费原图=立即停止扩圈；没有这些严重问题才讨论性能回归。记录 platform/profile/appVersion/buildSha/requestId/错误类目，日志不收 token、手机号、用户原图或支付签名。IP或响应字节数仅作排查线索，不能据其唯一归因品牌/用户。

### 12.3 回滚顺序

1. 停止发布队列与扩圈，保留现场与 candidate manifest，通知负责人。
2. 按平台控制台实际支持选择回退/重新上传已验证旧产物；未经平台确认不能承诺立刻覆盖所有用户端缓存版本。
3. 后端保留 old/new 兼容：不要直接反向删数据库字段/订单记录；已发起的支付回调、任务、退款和余额必须持续对账。
4. 恢复兼容 storage 路径与功能配置，复验旧端登录/分享/买断；观测通过后记录恢复时间和影响面。
5. 回滚演练本身是 G5 证据，成本与耗时实测，不写“回滚成本为零”。

### 12.4 发布工具卡住时的安全处理（必须写进新包装器）

- 上传子进程设有界超时、保留完整日志、返回真实退出码；超时后先查版本平台是否已收包，避免重复上传覆盖。
- 仅终止本任务启动的进程/子树，至多一次受控重试；若需关闭用户 IDE、清 singleton 锁或重新扫码，先确认实际存活 PID 与用户许可。
- **禁止**广泛 `pkill -f`、删除全部 `/tmp/.io.nwjs.*`、清用户登录态来掩盖不明问题。
- 清缓存限本次隔离产物；env 还原可恢复（包含异常/超时路径），不把“shell被杀”当作 trap 必然已执行。
- 发版回执必须包含 target/profile/appid/version/sha/平台成功结果；只见“preparing”或外层tail退出0不得报成功。

## 13. 已定细节与仍需业务证据的事项

**已定**：全新工程、同仓独立构建、保17路由3Tab、六阶段门禁、Profile兼容输入与隔离输出、依赖向内、Token单源、Wot资格试验、合同测试、旧接口兼容、发布/回退协议。

**不再泛泛询问技术选项**。只保留不能由代码或文档推定的外部事实，由负责人在对应门禁给证据：

| 事项 | 需要的证据 | 不满足时怎么办 |
|---|---|---|
| 抖音/小红书 AppID、主体类目、支付授权 | 平台控制台配置与审批结果，不要求把秘密发聊天 | 样页与 mock 可继续，相关真机/支付/发布门禁不通过 |
| 默认品牌与全局开关业务口径 | 当前产品负责人确认；明确哪个Profile/商户对应哪个默认值 | 保持当前后端合同，不扩大为平台级开关 |
| 跨平台账号/余额共享 | 用户映射、绑定/解绑、异常对账规则批准 | provider隔离，不自动合并账号或迁移余额 |
| 性能与包体基准 | 固定设备/数据集/网络的 baseline 报告 | 不能以“构建成功”签性能验收 |
| 生产切换与兼容退役时间 | 旧版用户分布、订单/任务清算、平台发布能力和批准 | 继续兼容，不能自动删旧逻辑 |

## 14. 来源、证据与实施时再次核对

- 输入参考：用户补全的 149 行实施细则（哈希见第 0 节）；六阶段与 Profile 组拆解来自该原文，纠错清单见第 2 节。
- 当前源码：`blueberry@2fe70ac` 的 `package.json`、`vite.config.ts`、`src/pages.json`、`src/utils/*.uts`、`scripts/`、Profile 模板；后端只读代码接口，用于识别兼容边界，不表示新端实现已存在。
- 当前 SPEC/AI 文档输入：[SPEC v2](https://github.com/crazyma99/blueberry/blob/2fe70acb49c204b468c5492a4a15231e51eab913/SPEC.md)、[Wot AI 指南](https://github.com/crazyma99/blueberry/blob/2fe70acb49c204b468c5492a4a15231e51eab913/docs/wot-ui-ai-guide.md)。
- 行业一手资料：[Fowler Strangler](https://martinfowler.com/bliki/StranglerFigApplication.html)、[Branch by Abstraction](https://martinfowler.com/bliki/BranchByAbstraction.html)、[Parallel Change](https://martinfowler.com/bliki/ParallelChange.html)、[Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)、[Pact](https://docs.pact.io/)、[AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-decomposing-monoliths/strangler-fig.html)、[Style Dictionary](https://styledictionary.com/)。
- 官方精确对照：[Vue3 vite-ts模板依赖](https://raw.githubusercontent.com/dcloudio/uni-preset-vue/vite-ts/package.json)（本轮同发行线3.0.0-5020420260813003，Vite5.2.8/TS^4.9.4/vue-tsc^1.0.24，开工再锁commit）；[微信原生custom-tabBar](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/custom-tabbar.html)、[DCloud custom-tab-bar](https://uniapp.dcloud.net.cn/collocation/pages.html#custom-tab-bar)、[小程序原生组件](https://uniapp.dcloud.net.cn/tutorial/miniprogram-subject.html)。
- DCloud 官方入口：[CLI/模板](https://uniapp.dcloud.net.cn/quickstart-cli.html)、[条件编译](https://uniapp.dcloud.net.cn/tutorial/platform.html)、[pages.json](https://uniapp.dcloud.net.cn/collocation/pages.html)；平台支持按锁版再核对，不以旧清单推断当前能力。
- Wot版本与限制：[v2快速上手/Sass要求](https://wot-ui.cn/guide/quick-use.md)、[CLI 1.1.0 MCP命令](https://raw.githubusercontent.com/wot-ui/open-wot/v1.1.0/src/commands/mcp.ts)、[uview-plus兼容性提示](https://uview-plus.jiangruyi.com/components/intro.html)（换库也不是平台兼容保底）。
- Wot：[官方 AI](https://wot-ui.cn/guide/ai.html)、[文档索引](https://wot-ui.cn/llms.txt)；CLI/技能与具体版本对齐，环境握手/安装/编译结果分别留证。

> 最终交付是方案而非迁移结果。重构时先过 G0/G1，再按任务推进；当前运行的小程序与测试/生产服务都不因本方案自动切换。
