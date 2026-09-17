# 蓝梅旅拍 Uni-app Vue3 迁移 Phase 实施步骤

> 版本：1.1 · 日期：2026-09-15 · 状态：**实施步骤文档，所有 Phase 均尚未执行**。
> 本版新增「Agent 委派约束与计划」与「需要主人提供的内容（阻塞清单）」两节：明确可委派／不可委派边界、委派纪律 12 条、各 Phase 委派计划与停手点。
> 已登记主人 2026-09-15 确认的开工时间、平台范围（微信＋抖音，小红书后置）与账号现状（见「需要主人提供的内容」末节「当前状态」）。
> **For agentic workers:** REQUIRED SUB-SKILL：执行时使用 `subagent-driven-development` 或 `executing-plans`，每个任务按勾选项测试、评审和提交；开始代码工作前按 `using-git-worktrees` 隔离工作区。
> **Goal:** 将已经确定的迁移方案转成能按顺序领取、执行、验收和交接的 Phase 清单，不另行重选架构。
> **Architecture:** 同仓全新 Vue3 工程，旧端独立可构建；业务依赖端口，平台/API/UI 在外层实现；Profile 与产物隔离，按业务闭环分批验收。
> **Tech Stack:** 官方 Vue3 模板验证后的配套工具链；Wot UI v2 为既定首选资格验证对象；TypeScript、Vitest及Sass等在 Phase 1 锁版，不盲追 latest。
> **Spec:** [母方案：Uni-app Vue3迁移实施方案](https://github.com/crazyma99/blueberry/blob/main/docs/uniapp-vue3-migration-plan.md)。同时阅读 [SPEC](https://github.com/crazyma99/blueberry/blob/main/SPEC.md) 与 [Wot AI指南](https://github.com/crazyma99/blueberry/blob/main/docs/wot-ui-ai-guide.md)。

## 使用方式与全局约束

1. **本文件是“怎么执行”，母方案是“为什么这样设计”**。本文件细化 T0–T12/G0–G5，不以分步说明改变商业规则或平台范围。
2. 当前文档基线为 `blueberry@97f3c2c`，业务源码仍为 `2fe70ac` 一线；实际开工时重新记录最新远端SHA及热修，不固定在今天的快照上开工。
3. 全新官方模板起步；不恢复已删除的旧 Vue3 骨架、分支、归档标签或缓存。保留当前旧端与已验证发布记录不等于恢复那个旧骨架。
4. 每个 Phase 状态是 `not_started / in_progress / passed / blocked`；未经验证不勾选。技术资格、真机、业务验收和发布授权分开留证。
5. 不同 Phase 可以准备资料，但**不能跨过前置门禁宣称完成**。同一文件/锁文件/路由表只设一个负责人，禁止多个 Agent 并发覆盖。
6. 默认整个代码任务循环为：**失败用例 → 确认红灯 → 最小实现 → 绿灯 → 独立CR → 修问题 → 复跑 → 明确文件提交**。若失败原因是依赖/语法错误而非目标断言，先修测试基建，不算有效红灯。
7. 自动化测试只用脱敏fixture、内存替身或隔离本地provider；不为测试自动调用付费生成、真实支付或写生产库。平台沙箱/测试环境联调按既定授权范围执行。
8. **产物发布必须另有明确授权**。本文件中的上传步骤不是当前会话的部署指令；不自动改prod、不把超时清锁当常规部署手段。

### 路径、命令与证据目录

| 符号 | 定义 |
|---|---|
| B | 小程序源码仓根；实际执行的隔离工作区根，不硬编码为某台机器路径 |
| N | `B/miniapp-vue3`，未来全新工程根 |
| K | 知识库仓根，供文档同步；不用于构建小程序 |
| BE | 后端源码仓根，遵循其独立分支/数据库/发布约束 |
| R | `N/docs/migration`，阶段状态、合同、审阅和验收记录 |
| I | 每次构建新建的隔离目录，见 Phase 1.5；不得写入B的活动源码 |

- 本文件明确写 `N/`、`B/`、`BE/`；代码块里的 `pnpm --dir miniapp-vue3` 均要求 shell 工作目录为 B。
- **Phase 0 时 N 尚不存在**：基线先记到 `B/docs/migration-preflight.md`，不得为了写基线先造非空N，让官方脚手架随后覆盖。Phase 1.1 初始化后再把基线事实转换成R下的JSON/表格，校验一致。
- 命令标记：**现有命令**可用于旧端核查；**初始化命令**只在正式开工后执行；**目标命令**必须先按本文件实现，当前仓库不保证存在。
- 使用 `set -euo pipefail`；保存完整stdout/stderr与真实退出码。禁止把 `go test/build | tail` 的外层0码当成功。
- 每个Phase一个 `R/phase-NN.md`：记录输入SHA、改动SHA、测试命令/退出码、证据文件、独立CR结论、待决策事项和交接对象；实际账号/密钥只记受控配置引用，不写秘密值。

### 平台工具链现状（2026-09-15 本机实测，Linux）

| 平台 | 工具 | 本机实测状态 |
|---|---|---|
| 微信 | 微信开发者工具 CLI | 已装；体验版上传链路本次迁移前已实测可用（见代码仓 `微信开发者工具预览指南.md`） |
| 抖音 | **官方 CLI `tt-ide-cli`（命令 `tma`）v0.1.33** | ✅ 已全局安装；**无需图形化 IDE**；已跑通「登录（账号 `lanmeilvpai_skill`）→ 本地打包（`tma project-size`）→ 远程预览出二维码（`tma preview --qrcode-output`）→ 真机扫码显示页面」；**抖音无官方 Linux 版 IDE**（仅 AUR 社区 repack `douyin-devtools-bin`）⇒ **抖音侧自本轮起以 `tma` 为既定工具路径** |
| 小红书 | 无独立 CLI 要求 | 本轮仅保留编译目标与边界记录，**不列入上线验收** |

- **抖音侧硬规则（踩坑实测）**：抖音工程**必须同时存在 `app.json` 与 `app.js`**（TS 工程为 `app.js` 或 `app.ts`），否则 CLI 报 `[ProjectConfig]Bad Project Type`；`project.config.json` 须带 `tt` 开头 appid。⇒ **新工程抖音产物必须输出这两个文件**（已并入 P4-13 验收）。
- **抖音测试设备白名单（2026-09-15 主人已完成）**：主人已在抖音开放平台后台**添加测试设备并绑定其手机抖音的 UID／DID**（**标识值本身不入库**，仅登记「已绑定」这一事实）⇒ **抖音真机预览（扫码）与真机调试的前置已具备**；复验 `tma preview` 仍 **exit 0**、出码正常（短链 `https://t.zijieimg.com/iXub1bQY/`）。
- **抖音合法域名（2026-09-15 主人已配置，与代码对表通过）**：request／socket／uploadFile／downloadFile **各 3 条**——`lanmei66.cloud`（正式）／`crazyma99.xyz`（测试）／`lanmeiimgstore-1311468332.cos.ap-shanghai.myqcloud.com`（COS 桶）。对表结论：①`request`＝`src/utils/config.uts` 的 `release→lanmei66.cloud`／其他→`crazyma99.xyz` ✅；②`downloadFile`＝AI 试衣结果页保存相册用的**后端签名 URL**，而后端 `cos.base_url` 在 dev／staging／prod **三套配置里都是同一 COS 桶** ⇒ 域一致 ✅；③`uploadFile`＝上传直传 COS 桶 ✅；④`socket`：**代码中无 `connectSocket` 使用**（配了无害，属预留）。⑤例外：`www.lanmei66.cloud` 仅出现在客服二维码 `<image>` 与 `src/App.uvue` 注释里——`<image>` 不受合法域名限制 ⇒ **抖音侧无需补配**；但该注释所称「微信需配 www.lanmei66.cloud 的 downloadFile」与实际字体源（已走 COS 桶）**疑为过时描述，微信侧上线前需复核**。
- **⚠️ 本机仍做不到「真机自动化」**：`tma --help` 实测**无 debug／automator 类命令**，且无官方 Linux 版 IDE ⇒ **Phase 4 抖音真机验收＝主人手机人工扫码逐项验证**，不得在文档或简报里承诺「真机自动化／无人值守真机测试」。
- **⚠️ 抖音能力门禁（2026-09-15 实测踩到，必须先解决）**：本项目全局与品牌馆页使用 `navigationStyle: custom`（`src/pages.json`），抖音端**需要小程序先获得「自定义页面结构」能力权限**，否则 `tma preview/upload` 会被平台拒绝：
  `Compile Error: 当前小程序「ttd6aba01648cc1bf701」暂未获得「自定义页面结构」权限，请将页面全局配置中的 navigationStyle 参数由 custom 改为 default，或在小程序控制台申请「自定义页面结构」能力权限`
  ⇒ **⭐ 2026-09-16 平台口径（主人核实）：「custom-自定义导航栏」权限仅『S 级小程序』与『平台定向邀请的小程序』可申请** ⇒ **我方当前不具备申请资格** ⇒ **唯一现实路线＝抖音端改用 `default` 系统导航**（**微信端不受影响**：微信允许 custom ⇒ 这是 **per-platform 分支**，不是全局改）。
  - **影响面（2026-09-16 本机实测）**：**17 条路由中 15 页使用 `CustomNavBar`**（仅 `index`／`webview` 自管状态栏）；直接依赖 `statusBarHeight` 的文件 4 个＝`components/CustomNavBar/CustomNavBar.uvue`、`pages/index`、`pages/demoDetail`、`pages/webview`；`pages.json` 的 global（第 68 行）与品牌馆页（第 13 行）各有一处 `navigationStyle: custom`。
  - **抖音 default 导航下的顶部约束**：系统**左上常驻品牌 logo**（点击回首页）、**子页面左侧固定返回按钮**、**胶囊右侧反馈按钮** ⇒ **任何自绘顶部元素都必须避让这三块区域**；现有的自绘标题/搜索框/透明导航（`CustomNavBar transparent`）需按平台分别给出布局。
  - **归属**：该改造登记为 **Phase 4「平台 UI bridge」必做项**（并应在 Phase 2 起就以平台分支写，避免末期返工）；**未解决前抖音端资格门禁保持 `blocked`**。
- **迁移期一次性脚本**：`scripts/release-trial-douyin.sh`（＋`package.json` 的 `build:mp-toutiao`）＝抖音端「构建 → 结构/红线校验 → 包体留痕 → appid 覆盖 → 预览 / 上传」脚本，**默认演练（不加 `--execute` 不动平台）**；它服务**旧仓现有引擎的抖音产物**，属过渡工具，**Phase 5 的 `release-target.mjs` 受保护包装器在新工程落地后取代它**（两者形态不同，不冲突）。
- **⚠️ 抖音端平台 API 差异（2026-09-16 真机 vConsole 实测，**迁移期必须处理**）**：抖音小程序**缺少以下微信侧常用 API**，直接调用会抛 `TypeError`；已逐条定位源码落点，**并入 Phase 2（公共层平台适配）与 Phase 4（平台 UI bridge）改造清单**：

| # | 缺失/不兼容 | 源码落点 | 真机后果 | 处理方向 |
|---|---|---|---|---|
| 1 | `uni.getAccountInfoSync` | `src/utils/config.uts:18` | **抛错 ⇒ `getHttpConfig()` 失败 ⇒ 全部请求发不出 ⇒ 界面完全无数据**（最严重） | 特性守卫＋兜底；或构建期注入 `VITE_API_BASE`（已实测可行） |
| 2 | `uni.loadFontFace` | `src/App.uvue:11、:22` | 自定义字体不加载（onLaunch 抛错） | 抖音端跳过；或字体子集内嵌包内 |
| 3 | `tt.getWindowInfo`（uni-app x 运行时内部调用） | 运行时 `vendor.js`（由 `uni.getSystemInfoSync()` 触发） | 窗口/状态栏尺寸取不到 ⇒ 布局错乱 | 兜底 `getSystemInfoSync`／基础库升级；或守卫 4 处调用点（`index`／`demoDetail`／`webview`／`CustomNavBar`） |
| 4 | `getTabBar()`（微信自定义 tabBar 专用） | `src/utils/tabbar.uts:10` | 每个 tab 页 `onShow` 报错；底栏同步无效 | 特性守卫；抖音端走原生 tabBar |
| 5 | 上传成功回调里的裸 `JSON.parse(res.data)` | `src/utils/api.uts:51` | `res.data` 为 `undefined` 时报 `「undefined」is not valid JSON` | 先判类型与空串再解析 |

- **上述 4 项已写好补丁但按主人口径暂不入库**（2026-09-16：「**现在还没开始迁移，迁移的时候再做这些工作**」）：补丁留存于 `~/backups/douyin/douyin-platform-guards-20260916.patch`（88 行，`App.uvue`／`api.uts`／`config.uts`／`tabbar.uts`），**届时直接复用**；仓库 `src/` 保持零改动。
- **迁移前的抖音联调可行路径（不改 `src/`，本机已验证）**：`VITE_API_BASE=<目标域> npm run build:mp-toutiao` 构建（显式注入可绕开 #1 的运行时探测）→ `./scripts/release-trial-douyin.sh --allow-stale --force-default-nav --force-native-tabbar --execute` 出码 ⇒ 数据可正常下发（字体/底栏/布局三类问题仍存在，属上表待办）。
- **抖音上传/提审仍须单独授权**：`tma preview` 只出预览码；`tma upload -c <更新日志> -v <版本>` 与 `tma audit` 属发布动作，**未经主人明确授权不得执行**。
- **敏感信息**：AppSecret 等密钥**不入库、不写文件、不引进简报**；`tma` 走登录态即可完成预览与上传，**不需要密钥**。

---

## 输入文档与任务简报（委派前必读）

> 本节规定「派活时给谁看哪几份文档、锁哪个版本、简报怎么写」。与下一节的人员边界同时生效；文档口径冲突时以本节第 2 节的裁决规则为准。

### 1. 五份输入文档（缺一不可）

| # | 文档（**以代码仓 `blueberry` 为施工依据**） | 作用 | 必读角色 |
|---|---|---|---|
| D1 | `SPEC.md` | 迁移口径、UI 库选型结论、验收 DoD、前置条件与门禁 | 全部 |
| D2 | `docs/wot-ui-ai-guide.md` | Wot UI 的 AI 接入方式（llms.txt／CLI／MCP／Skills） | 实现、评审（涉 UI 时） |
| D3 | `docs/uniapp-vue3-migration-plan.md` | 母方案：分层、端口、Profile、Token、测试与发布门禁 | 全部 |
| D4 | `docs/uniapp-vue3-migration-phases.md` | 本文件：执行顺序、验收口径与阶段回执 | 全部 |
| D5 | `docs/uniapp-x迁移uniapp-vue3_实施细则&流水线参考.txt` | 主人补全的 149 行原始输入（六阶段＋Profile 组＋行业实践）｜**⚠️ 含 16 处需修正说法，只作溯源、不得据其施工** | 追溯设计出处时 |

- **D5 自 2026-09-15 起随代码仓入库**（此前仅知识库有）；正文保持原貌，SHA-256 `31d827462c281a23c78daddb06da1a91c4b1e185fd06268174bbb64fad8d9fe7`；对其纠正见 D3 第 2 节。
- **知识库里的同内容镜像是备份、不是施工依据**（文件名带「蓝梅旅拍_」前缀、行号可能与代码仓版本不一致）。派活一律引用**代码仓路径 ＋ commit ＋ SHA**。
- **⚠️ D5 的使用边界（重要，先读这条再读原文）**：D5 是**主人补全的原始输入**，保留原貌**不代表其说法可直接照做**——D3 第 2 节「三份输入的处理规则与必要纠错」共列 **16 行**逐条替代（「输入说法 → 修正后的执行规则」），D5 已在这些点上**被取代**。典型几类：
  - **工程与依赖**：不要删除并不存在的 `vite-plugin-uni-x`（现仓已是 `@dcloudio/vite-plugin-uni`）；不要把若干 latest 拼成一套版本（须锁 DCloud 同一发行线）；`pages.json condition` 是**工具启动模式、不是平台编译开关**。
  - **接口与结构数量**：不是「26 个接口」，现行 `api.uts` 有 **34 个网络封装导出**（含 1 个已弃用）＋ 2 个上传队列函数 ＋ 11 个导出类型；`utils/http.uts` 也不是唯一改名目标；目录内部允许重构（旧 `utils` 只能暂作 re-export 门面并设退役任务）。
  - **条件编译与原生边界**：业务域**禁止** `#ifdef`（平台端口／原生 bridge／composition root／manifest 生成属白名单例外）；**微信 native custom tabBar 不能被 `CustomTabBar.vue` 等价替代**（是独立运行边界），抖音／小红书须另验、不共用微信产物。
  - **后端与发布**：非微信端**不是「补白名单」就够**（须身份换票、用户映射、手机号授权、支付下单／验签／对账与幂等）；**旧 `release-trial.sh` 不能在上层目录沿用**（锁定旧根目录与旧 dist，会错发旧端）；「**回滚成本为零、周末三端必上线**」**明确不采纳**。
  - **token 与调研口径**：TS/SCSS 双源改为 **tokens.json 单源**（不许两份手改真值漂移）；「30 天无提交＝冻结」「某 llms.txt 404＝无 AI 能力」这类推论**不采纳**。
  - **纪律**：D5 **只作溯源**（查六阶段与 Profile 组的来源）；**D5 与 D3 §2 冲突时一律以 D3 §2 为准**；实现子 agent 若发现自己在照 D5 施工，**立即停手**并报主控。权威纠错表＝D3 §2（完整 16 行）。

### 2. 业务口径文档（行为等价的意图基准，按页取用）

D1–D5 只说「怎么迁」，不说「每页业务该是什么样」。页面业务口径以现行 PRD／方案为准：

| 页面 / 模块 | 意图基准文档（知识库 `docs/` 或飞书现行版） |
|---|---|
| AI 试衣 | `蓝梅旅拍_AI试衣PRD_最终版.md`、`蓝梅旅拍_AI试衣端云识别方案_最终版.md` |
| 首页 / 门店上下文 / 4Tab | `蓝梅旅拍_门店上下文与4Tab改版PRD.md`、`一店一码与4Tab重构·落地实施文档.md` |
| 上传与选片 | `蓝梅旅拍_上传照片质量拦截_实施文档.md`、`蓝梅旅拍_客户选片需求.md` |
| 接口与后端行为 | `蓝梅旅拍_后端技术方案.md` |
| 视觉 / Token | `design-token.md`（代码仓根目录） |

**冲突裁决规则（硬性）**：**旧端在跑的代码是「实际行为」基准，PRD 是「应然意图」基准。** 两者不一致时**停止该页迁移**、写入 `R/phase-NN.md` 的待决策项并报主控；**不得由子 agent 自行选一侧「顺手改掉」**。已知偏差清单见 Phase 0.2 的 P0-09。

### 3. 每任务简报模板（主控填写；缺任一项不得派活）

~~~text
【任务】T?-?? / Phase ?.?  ｜ 执行：实现子 agent（模型档：?）
【目标】一句话且可验收（不是「迁移XX页」，而是「XX页在微信端与旧端逐项一致，对照表见 R/phase-NN.md」）
【输入版本】代码仓 blueberry @ <commit>；D1 <sha8>／D2 <sha8>／D3 <sha8>／D4 <sha8>／D5 <sha8>
【必读章节】D1 §… ／ D3 §… ／ D4 §…（＋业务口径文档 <名> §…）
【行为基准】旧端 <文件路径> @ <commit>，逐项对照，禁止凭记忆重写
【允许改】<文件白名单，逐条列>
【禁止改】lockfile／Profile 生成器／路由总表／Wot 供应商门面／其他任务文件／<无关目录>
【验收命令】<精确命令 ＋ 期望退出码/输出>；禁止 `| tail`；保存完整 stdout/stderr
【证据落点】R/phase-NN.md ＋ 证据文件路径
【红灯定义】必须是目标断言的失败；失败若源于依赖或语法错误，先修测试基建，不算有效红灯
【停手条件】命中「硬停四类」或需未授权的外部事实 => 停手，报告首行写 STOP 与原因
【报告格式】改动文件逐条／命令与真实退出码／未决问题／下一步建议（≤15 行）
~~~

### 4. 版本锁定纪律

- 派活前主控**必须**实测一次五份文档的 SHA-256 并写入简报；简报哈希与当前工作区不一致时**先停、先查是谁改了文档**。
- Phase 0 的基线文件（`B/docs/migration-preflight.md`）必须登记 D1–D5 实测哈希，作为本次迁移的文档基线（并入 P0-15 一并提交）。
- 文档改动与代码改动**分开提交**；派活期间主控不得改 D1–D5——一旦改动，在飞任务的简报作废、必须重新下发。

---

## 执行方式：Agent 委派约束与计划

> 本节约束「谁来做、怎么派、什么不能派」。与母方案第 9–12 节的测试/发布门禁同时生效；冲突时以本节的人员边界为准。

### 角色与职责

| 角色 | 只做这些 | 绝对不做 |
|---|---|---|
| 主控会话（协调者） | 门禁裁决、任务拆派、评审派发、**自己复跑真实命令核验证据**、KB 落库、发布前停手请示 | 不在主控里直接改业务代码（会跳过评审）；不自行宣布某平台可上线 |
| 实现子 agent | 单任务：写失败用例 → 确认红灯 → 最小实现 → 绿灯 → 自评 → 提交；完整报告写入指定报告文件 | 不派生自己的评审者；不并行改共享文件；未授权不改 lockfile／Profile 生成器／路由总表；无发布权限 |
| 评审子 agent | 对**指定 diff** 给出规格合规 + 代码质量两阶段结论，附命令与行号证据 | 不参与实现；不扩查无关范围；不代替真机与平台验收 |
| 主人 | 提供外部证据与拍板（AppID／资质／真机／商业口径／发布授权） | —— |

### 可委派 / 不可委派

**可委派（代码与文档类）**：T0 清单、T1 初始化、T2 端口与领域、T3a／T3b 生成与流水线、T4 Token 与 UI 门面、T5–T9b 业务迁移、T11 发布包装器的实现与 `--dry-run`、各阶段文档与回执。

**不可委派（必须真人）**：平台账号资质类事实；真机验证（登录／授权／支付回跳／防截屏／分享）；商业口径拍板；生产发布与后端 prod 部署授权；真实支付沙箱所需的资质与额度。

### 委派纪律（12 条，违反即视为该任务未完成）

1. **一次只派一个实现者**；同一时间只允许一个负责人碰 lockfile、Profile 生成器、路由总表、支付用例、Token 生成器。
2. **先写失败用例**；红灯必须是**目标断言失败**——依赖／语法／配置错误不算有效红灯，先修测试基建。
3. **不采信子 agent 的「我通过了」**：主控必须自己复跑该任务命令，读**真实退出码**与用例数。
4. **变异自检**：至少三类关键逻辑各做一次（把刷新调用塞进不可达分支、删掉并发守卫、故意用错 AppID／Profile），确认测试会红再还原。
5. **禁止用 `| tail` 吞掉退出码**；禁止以 stdout 出现 PASS 字样代表全绿。
6. **每任务两阶段评审**：规格合规（是否满足该步骤）＋ 质量（测试是否有牙、是否硬编码／越权／竞态）。实现者自评不能代替。
7. **红项清零才继续**；争议红项由主控裁决并**落账本**，不由实现者自行降级为备注。
8. **模型分层**：机械转录／单文件改动用便宜快档；集成与判断用标准档；架构与整分支终审用最强档。派发时必须显式指定模型。
9. **任务简报自包含**：基线 SHA、Spec／本节路径、要用的接口签名、禁改范围、测试命令、报告文件路径；不要把会话历史或前序任务摘要塞进简报。
10. **进度账本（ledger）**：每任务一行——任务号、commit 范围、测试命令与退出码、评审结论、裁决与理由。上下文压缩后一切以账本 + `git log` 为准，禁止凭记忆重派已完成任务。
11. **派发前做冲突扫描**：对共享文件／接口的任务对，先写明「谁产出、谁消费、结论」再开工。
12. **硬停四类**（出现即停下问主人，不擅自继续）：不可逆或破坏性操作；安全敏感动作；对外副作用（push 共享分支／发布／改 prod）；计划崩到所有前路都是猜测。

### 各 Phase 的委派计划

| Phase | 可派任务 | 建议模型档 | 并行边界 | 停手点（问主人） |
|---|---|---|---|---|
| 0 | 基线／资产／清单文档（1 个 agent） | 标准 | 不并行 | 授权开工、资质现状、测试设备 |
| 1 | T1、T2、T3a、T4、T3b 各一实现者 + 一评审 | T1／T2 标准；T4 最强（含资格判断）；T3 标准 | T2∥T3a（文件隔离）；T4 与 T3b 串行 | 资格未过时是否降级或换库；抖音测试号 |
| 2 | T5、T6、T7 各一实现者 + 一评审 | 标准 | 不并行（T5–T7 同改路由表与组件） | 微信真机报告口径 |
| 3 | T9a、T8、T9b 各一实现者 + 一评审 | 最强（支付与竞态） | T9a 完成后 T8∥T9b | 支付沙箱额度、真机 |
| 4 | 平台 provider（前端／后端各一）+ 评审 | 最强 | 前后端分仓可并行 | AppID、类目、支付资质、账号共享口径、双端真机、域名白名单 |
| 5 | 发布包装器（1 个）+ 独立终审 | 最强 | 不并行 | 上传授权、prod 部署批准、退役窗口 |

### 交付与验收纪律

- 子 agent 的报告**写文件**，回传只给「状态／commit／一行测试摘要／遗留问题」，避免把全文塞回主控上下文。
- 主控在每个阶段结束时更新 `R/phase-NN.md`，把命令、退出码、证据路径、评审结论写实；没有证据不得勾选。
- 全部任务完成后再做一次**整分支终审**（最强模型），只派一次修复，随后一次范围化复评。

## 需要主人提供的内容（阻塞清单）

> 遇到下表任一「需要」项缺失时：**先问主人**（一句话说明卡点与最小替代），再决定降级或停在上一门禁；**不得自行假定平台能力或商业口径**。

| 时点 | 需要主人提供 | 缺失时的影响 | 缺失时的最小替代 |
|---|---|---|---|
| Phase 0 开工前 | ①授权开工（建 `feat/vue3-migration` 与 `miniapp-vue3/`）②本次目标平台范围 ③抖音／小红书账号资质现状 ④可用测试设备与测试号 | 无法建分支与目录，无法判定 Phase 4 范围 | 只做文档与不落仓的调研 |
| Phase 1（T1／T4） | 抖音：**CLI 登录态已就绪**（`tma`，✅ 2026-09-15 主人完成）＋**AppID 已提供**；**抖音测试设备已绑定（2026-09-15）**；仍需**微信真机**与抖音测试小程序号归属确认 | 工程与 Wot 资格门禁无法通过 | 先过微信；抖音标 `blocked`，不宣称支持 |
| Phase 2 | 微信测试号（现有能力）；若涉及旧接口兼容，确认后端环境 | 真实闭环无法验收 | 用受控本地 provider 做合同测试 |
| Phase 3 | 支付沙箱／测试额度（若需真实支付链路验证）；可复现任务失败的服务端日志 | 支付链路只能停在 mock 证据 | 用可控延迟测试证明状态机；真实支付留待授权 |
| Phase 4 | ①每端 AppID 与开发者权限 ②类目／资质审批结果 ③支付能力 ④跨平台账号／余额／买断共享口径 ⑤双端真机（**抖音侧已有主人手机**，iOS/Android 双端覆盖待定）⑥各平台管理台域名白名单配置权限（**抖音侧 2026-09-15 已配置**：request／socket／uploadFile／downloadFile 各 3 条＝`lanmei66.cloud`／`crazyma99.xyz`／COS 桶 `lanmeiimgstore-1311468332.cos.ap-shanghai.myqcloud.com`；**微信侧待核**） | 对应平台门禁 blocked | provider 隔离实现 + 合同测试；不擅自合并账号 |
| Phase 5 | ①体验版／正式版上传授权 ②后端 prod 部署批准 ③旧接口退役窗口与旧版用户分布 | 不得发布 | 只产出经校验的候选包与回滚演练证据 |
| 任意时点 | 商业口径争议（默认品牌／全局开关、免费额度、商户范围） | 相关红项不得自行降级 | 保持现行后端合同，暂停该路径 |

### 当前状态（主人 2026-09-15 确认）

| 项目 | 结论 | 对门禁的影响 |
|---|---|---|
| 开工时间 | **本周末开工**；当前不授权动代码 | Phase 0 起全部仍为 `not_started`；本文件与其镜像只作执行依据 |
| 目标平台范围 | **微信 + 抖音**；**小红书后置** | Phase 4 只验微信与抖音；小红书仅保留编译目标与边界记录，**不列入本次上线验收** |
| 微信账号 | 齐全（现有能力） | Phase 2／3 的微信真实闭环可正常验收 |
| 抖音账号 | **AppID `ttd6aba01648cc1bf701` 已提供**；**CLI（`tma`）已登录并实测跑通「登录→打包→远程预览→真机扫码显示」（Linux 无 IDE，2026-09-15）**；**测试设备白名单已绑定（2026-09-15，主人手机抖音 UID／DID，标识值未登记）**；渠道（类目/主体）备案进行中 | Phase 1 抖音样页可做**编译 + CLI 预览 + 真机扫码**；**类目资质、支付与发布门禁在备案完成前保持 `blocked`** |
| 仍需主人提供 | ①抖音渠道备案结果 ②类目与支付资质 ③抖音真机 ④Phase 5 上传与 prod 部署授权 | 缺失时按上表降级或停在上一门禁，**不得写成「支持上线」** |
| 抖音 Profile 范围（**2026-09-17 主人拍板**） | **客片展示版＝11 页/3 tab**（客片展示 9 ＋ 价目 2；价目纯展示，微信端本无下单支付能力）；**AI 试衣 3 页＋AI 推荐 3 页＝6 页不注册**；「我的」页菜单只留「我的喜欢」、顶部文案去「体验AI试衣」 | Phase 1 的 Profile 生成器（T3a）须支持 `PAGE_REGISTRY` 闭集与功能块开关；Phase 4 抖音验收按 11 页范围执行；**微信全量 17 页不受影响** |

**提问方式**：一句话说明「卡在哪、需要什么、没有它我最多能做到什么」，不夹带技术选择题，不把决策反推给主人。

## Phase 总览：按这一条顺序推进

~~~text
Phase 0  基线和边界                 → G0 / T0
Phase 1  工程、端口、Profile、UI资格  → G1 / T1 → (T2 ∥ T3a) → T4 → T3b
Phase 2  HTTP/认证/品牌与普通页面     → G2 / T5 → T6 → T7
Phase 3  共享支付与AI闭环             → G3 / T9a → (T8 ∥ T9b)
Phase 4  跨平台服务端与真机适配       → G4 / T10
Phase 5  候选产物、灰度和退役         → G5 / T11 → T12
~~~

这里的 ∥ 仅指**文件隔离、接口已确定**时可并行。为减少调度误解，本清单采用Phase顺序过门禁；不要求把母方案允许的所有并行机会都用上。

| Phase | 核心交付 | 尚不能据此宣称 |
|---|---|---|
| 0 | 最新基线、资产去向、风险与范围 | 新工程已经可用 |
| 1 | 新工程/双Profile构建与Wot样页资格 | 所有业务页与支付已迁移 |
| 2 | 微信普通业务闭环；其他端可有只读/fixture证据 | 非微信登录支付已跑通 |
| 3 | 微信试衣/推荐/下载/支付业务闭环 | 抖音/小红书复用了同一身份支付即上线 |
| 4 | 各目标平台的身份、原生能力和真机报告 | 已获准投放生产 |
| 5 | 经授权的候选上传/验收/灰度与兼容退役 | git合并即等于客户端已更新 |

---

## Phase 0｜开工准备、基线固化与风险登记

**对应：T0 / G0。负责人：迁移负责人；协同：产品、测试、后端。**

**入口条件**：确认只是新建迁移分支/新工程，不复活旧Vue3备份；有当前代码访问权限。此阶段不依赖新端工具链。

**文件**：新增 `B/docs/migration-preflight.md`；读取母方案、B的AGENTS/SPEC、现行路由/API/Profile/发布脚本；不修改旧 `B/src/`。

### 0.1 确定最新源与工作分支

- [ ] P0-01 核对旧端当前分支、干净工作树、远端 `fork/main`；后端staging/prod分别取实际SHA/部署版本，不能用staging推测prod。
- [ ] P0-02 在隔离工作区从**当时最新main**创建新的 `feat/vue3-migration`；若已有同名分支先识别归属，不强制覆盖、不从旧标签恢复。
- [ ] P0-03 记录旧端应用版本、源码SHA/树、包体、Profile摘要及依赖锁摘要。今天的17路由/15组件/20工具/34wrapper只是起始盘点口径，开工若增量变化必须更新。

**现有Git命令示例（正式开工时，在隔离B内执行）**：

~~~bash
set -euo pipefail
test -z "$(git status --porcelain)" || { echo '工作树不干净，停止'; exit 1; }
git fetch fork main
git switch main
git merge --ff-only fork/main
BASE_SHA=$(git rev-parse HEAD)
git switch -c feat/vue3-migration "$BASE_SHA"
echo "sourceCommit=$BASE_SHA"
echo "sourceTree=$(git rev-parse HEAD^{tree})"
~~~

### 0.2 建立资产与差异清单

- [ ] P0-04 导出 `src/pages.json` 的完整17条路径和3个Tab；记录每页入参、回退、登录要求、品牌范围、加载/空/错状态。
- [ ] P0-05 对15组件与20工具登记“旧文件→新文件→负责人→用例”；微信native tabBar四文件单独列出，不能算作普通Vue组件改后缀。
- [ ] P0-06 对34个API wrapper登记 method/path/query/body/header/业务code/timeout/副作用/消费者；`getalbum`查无调用后登记退役，而不是重新实现废弃功能。
- [ ] P0-07 单列 `flushPendingUploads/rejectAllPendingUploads` 两个队列函数及11个导出类型；这些不是额外业务接口。
- [ ] P0-08 将Profile现字段、9个shell脚本及apply-profile.mjs的输入输出列成表；记录旧同步脚本可能覆盖新代码、旧发布脚本锁定旧ROOT的风险。
- [ ] P0-09 登记已知偏差：package/lock差异、finalScore类型缺失、下载paid与权益到账竞态、品牌馆跨生命周期30s节流。行为修正必须写明产品依据与测试，不盲保缺陷。

### 0.3 固化测试与外部前置

- [ ] P0-10 保存旧端现有单测/构建结果（不上传）；缺fixture或依赖错误分开记录，不把失败隐藏为通过。
- [ ] P0-11 用同设备/网络/数据集采集首页、相册首图、任务返回等基准；记录样本数量和p50/p95，不能填估计值。敏感图片/账号脱敏。
- [ ] P0-12 产品确认默认品牌/商户开关、跨平台账号/余额/买断共享的业务口径；未确认时按母方案保现有合同，不自动扩大为全局开关。
- [ ] P0-13 登记微信/抖音/小红书AppID、开发者权限、类目/支付资格的**证据状态**。没有账号证据仍可做后续离线代码，但相关真机/商业发布门禁不能通过。
- [ ] P0-14 建热修账本：每笔main修复写旧SHA、新端等价SHA、回归用例；每个Phase开始与候选发布前核对增量。
- [ ] P0-15 独立检查清单完整性，提交 `B/docs/migration-preflight.md`，记录G0审阅人；并登记 D1–D5 五份输入文档的实测 SHA-256（见「输入文档与任务简报」第 4 节）。

**验收 G0**：基线可定位、资产有去向、风险/外部前置可见；未捏造“业务回归全绿”。

**失败处理**：基线不一致或需恢复旧骨架才能继续时停止；缺新平台资质标明会阻断哪个门禁，不妨碍已批准的离线验证。

---

## Phase 1｜全新工程、端口、Profile与UI资格

**对应：T1、T2、T3a、T4、T3b / G1。负责人：工程负责人；领域与Profile任务可分工。**

**入口条件**：G0已通过；N不存在；旧根配置/发布脚本不能被脚手架覆盖。

### 1.1 官方模板初始化与可测试底座（T1）

**文件**：新增 `N/package.json`、`N/pnpm-lock.yaml`、`N/vite.config.ts`、`N/tsconfig.json`、`N/vitest.config.ts`、`N/src/main.ts`、`N/src/App.vue`、`N/src/pages/_probe/index.vue`、`N/tests/pipeline/toolchain.spec.ts`。

- [ ] P1-01 重新核对官方 `vite-ts` 模板commit及配套依赖，冻结Node/pnpm/DCloud/Vue/Vite/TS/vue-tsc/Sass/Vitest组合到 `B/docs/migration-preflight.md`；不把原项目TS5直接覆盖官方模板配套。
- [ ] P1-02 检查N不存在；从官方模板**固定commit**初始化N，记录模板SHA。禁止复制旧 `mp-vue3/` 或给旧UVUE项目批量改后缀充当初始化。
- [ ] P1-03 初始化后建立R；把预检事实转换为 `R/baseline.json`、`inventory.md`、`contracts.md`、`parity.md`、`hotfix-sync.md`、`deviations.md`，与预检记录核对。基线转换只搬文档事实，不搬旧Vue3骨架。
- [ ] P1-04 保留模板最小入口与探针页；配置test/typecheck脚本和platform构建脚本。未迁移页面不生成“看起来存在”的空壳来骗路由验收。
- [ ] P1-05 写工具链测试：DCloud包同发行线、Vue运行时/类型一致、目标平台闭集、lockfile与manifest一致；先令不一致fixture变红，再做校验器。
- [ ] P1-06 构建微信/抖音最小样例、记录工具实际打开结果（**抖音用 `tma project-size`／`tma preview --qrcode-output`，产物须含 `app.json`+`app.js`**）；小红书编译目标也验证并记录。工具/账号不可用不标通过，但不把它当业务SDK已支持。
- [ ] P1-07 保存首次正常安装得到的lockfile；随后使用 `--frozen-lockfile` 重装/构建再验，不能复制旧锁文件。
- [ ] P1-08 提交最小可构建工程与工具链报告。探针页仅用于资格，不进入最终生产包。

**初始化命令协议**：正式执行者在官方模板复核后提供固定SHA，命令不自动追远端分支。

~~~bash
set -euo pipefail
if [ -z "$TEMPLATE_SHA" ]; then echo 'TEMPLATE_SHA 未设置：请填写已核验的官方 vite-ts 模板 commit'; exit 1; fi
test ! -e miniapp-vue3 || { echo '目标目录已存在，禁止覆盖'; exit 1; }
npx degit "dcloudio/uni-preset-vue#$TEMPLATE_SHA" miniapp-vue3
pnpm --dir miniapp-vue3 install
# 下列脚本在P1-04建立后运行
pnpm --dir miniapp-vue3 run typecheck
pnpm --dir miniapp-vue3 exec vitest run tests/pipeline/toolchain.spec.ts
pnpm --dir miniapp-vue3 run build:mp-weixin
pnpm --dir miniapp-vue3 run build:mp-toutiao
pnpm --dir miniapp-vue3 run build:mp-xhs
~~~

**工具版本说明**：初始化下载器自身的版本也记录；首次安装用于形成新锁，后续才强制冻结安装。以上为未来执行模板，不是本轮已经运行的命令。

### 1.2 领域规则与抽象端口（T2）

**文件**：新增 `N/src/ports/{context,http,identity,payments,media,storage,clock}.ts`；`N/src/domain/{brand-hub,album-title,payment-state}.ts`；`N/tests/unit/{brand-hub,album-title,payment-state}.spec.ts`。

**接口**：沿用母方案的 `RequestContext/Result/IdentityTicket/IdentityPort/StoragePort/ClockPort`。HTTP/upload端口再明确 timeout、取消、requestContext快照与replayPolicy；PaymentPort只提供平台面板结果，不改业务余额。

- [ ] P1-09 冻结字段名和允许的错误码：HTTP业务码4001必须映射到 `INSUFFICIENT_CREDITS`，并保留businessCode/安全message/requestId；普通BUSINESS错误不能拉支付。
- [ ] P1-10 先写品牌馆严格boolean、标题6/7码点、emoji、支付门闩状态转移测试；确认缺实现或行为不满足会红。
- [ ] P1-11 只用纯TS实现规则；不导入Vue、Pinia、Wot或平台SDK。12类能力是小端口集合，不写万能平台单例。
- [ ] P1-12 加入闭集测试：未知engine/platform/env失败；必需能力unknown/unsupported阻断用例，可选能力降级必须有批准文案及测试。
- [ ] P1-13 跑领域测试和typecheck，审阅后提交；这些纯领域结果不算真机验证。

**可直接落实的测试与最小实现例子**（两个独立文件）：

~~~ts
// N/tests/unit/brand-hub.spec.ts
import { expect, it } from 'vitest';
import { brandHubEnabled } from '../../src/domain/brand-hub';
it.each<[unknown, boolean]>([
  [undefined, false], ['broken', false], ['{}', false],
  ['{"enabled":false}', false], ['{"enabled":"true"}', false],
  ['{"enabled":true}', true],
])('strict flag %s', (input, expected) => {
  expect(brandHubEnabled(input)).toBe(expected);
});
~~~

~~~ts
// N/src/domain/brand-hub.ts：测试先红后再写
export function brandHubEnabled(input: unknown): boolean {
  if (typeof input !== 'string') return false;
  try { return JSON.parse(input)?.enabled === true; }
  catch { return false; }
}
~~~

**目标命令**：`pnpm --dir miniapp-vue3 exec vitest run tests/unit`；预期真实case通过，0个test不是成功。

### 1.3 Profile生成前置（T3a，可与1.2文件隔离并行）

**文件**：新增 `N/scripts/profile-schema.mjs`、`N/scripts/generate-profile.mjs`、`N/docs/migration/profile-map.json`、`N/tests/pipeline/profile.spec.ts`、`N/tests/fixtures/profiles/{A,B}.json`。

**必须产出的函数接口**：

~~~text
parseProfileText(text) -> 原始键值对象（不eval/source）
validateProfile(raw, {platform, environment}) -> NormalizedProfile 或明确校验错误
generateProfile({profile, sourceRoot, projectRoot}) -> {digest, generatedFiles}
~~~

`NormalizedProfile`必须含profileKey、packageName、manifestName、description、目标appid、appCode、各环境apiBases、导航/品牌/版权/联系方式/协议名/价目fallback字段；每项旧输入到输出的映射写入profile-map.json，不暗中弃字段。**新增（2026-09-17 主人拍板）**：`PAGE_REGISTRY`（该平台注册路径闭集：微信＝17 页、抖音＝11 页）与「我的」页菜单/文案功能块开关（抖音菜单仅「我的喜欢」）。

- [ ] P1-14 对齐母方案5.2列出的全部旧字段；新增抖音/小红书appid仅在目标构建时必填，不用微信appid兜底。
- [ ] P1-15 明确 `API_BASE_URL`仍指release地址；测试地址走受控映射。未知env不落到生产也不默认为trial。
- [ ] P1-16 写失败用例：缺APP_CODE/目标appid、错误Profile选择、非法host、路径越界、注入表达式、必需字段未消费。
- [ ] P1-17 用合成A/B配置验证A→B→A幂等；合成AppID/素材不得进入真实上传。确认所有输出只在projectRoot，不修改模板src。
- [ ] P1-18 实现结构化生成配置与静态资源overlay，避免宽正则静默漏注入；存在的目标目录按幂等策略处理，不覆盖其他run。
- [ ] P1-19 跑pipeline/profile测试并审阅提交。此时只算生成前置通过，尚未证明完整Profile包可用。

**目标命令**：`pnpm --dir miniapp-vue3 exec vitest run tests/pipeline/profile.spec.ts`。

### 1.4 Token、Wot门面与平台样页资格（T4）

**入口**：T2和T3a输出已冻结；尤其Profile生成路径、能力类型不能边写样页边改名。

**文件**：新增 `N/tokens/source.json`、`N/scripts/generate-tokens.mjs`、`N/src/generated/{tokens.ts,theme.css,theme.scss}`、`N/src/ui/{BaseButton,BaseField,BasePopup,BasePicker,BaseFeedback}.vue`、`N/src/pages/_probe/wot.vue`、`N/tests/components/ui-contract.spec.ts`、`N/tests/pipeline/tokens.spec.ts`、`R/ui-qualification.md`。

- [ ] P1-20 从旧端登记颜色/字号/间距/热区/动效/safe-area语义，建primitive→semantic→component单一Token输入；TS/SCSS均为生成输出，禁止双源手改。
- [ ] P1-21 先写token失败用例：循环引用、未知引用、错误单位、重复生成有差异；实现 `generateTokens({sourceFile, outputDir})`，只生成指定目录。
- [ ] P1-22 核对候选Wot v2和CLI/Sass配套。候选组合 `@wot-ui/ui@2.3.2`、`@wot-ui/cli@1.1.0`须锁准确版本；变更先记ADR，不混用v1资料。
- [ ] P1-23 按Wot AI指南先查目标组件API/事件/token，再写项目门面。门面统一label/disabled/busy/value与标准事件，业务层不接收Wot内部数据对象。
- [ ] P1-24 写门面测试：按钮禁用/忙状态不重复提交；弹层取消、picker选中和清空事件正确；图片失败、长标题布局与token映射正确。
- [ ] P1-25 在微信/抖音工具及真机运行同一Wot样页，填写版本/设备/组件/通过与失败证据（**抖音：`tma preview` 出码 → 抖音 App 扫码**）；小红书同样记录但不得冒充已验。
- [ ] P1-26 若关键场景失败：先做最小复现；少量差异收敛platform/ui-bridge；大面积失败才让uview-plus跑同一资格测试，不混装两套库。
- [ ] P1-27 CLI读取与lint作为辅助证据；MCP/Skills仅在宿主配置授权后安装，未握手不宣称已接入。
- [ ] P1-28 通过token测试、门面测试、typecheck和平台样页审阅，提交门面/主题及资格记录。

**目标命令（候选版本经确认后）**：

~~~bash
set -euo pipefail
pnpm --dir miniapp-vue3 add --save-exact @wot-ui/ui@2.3.2
pnpm --dir miniapp-vue3 add --save-dev --save-exact @wot-ui/cli@1.1.0
pnpm --dir miniapp-vue3 exec wot info Button --version 2.3.2
pnpm --dir miniapp-vue3 exec vitest run tests/pipeline/tokens.spec.ts tests/components/ui-contract.spec.ts
pnpm --dir miniapp-vue3 run build:mp-weixin
pnpm --dir miniapp-vue3 run build:mp-toutiao
~~~

这两条build只证明编译；P1-25的工具/真机报告不可省。缺平台测试权限则资格门禁未通过，可以准备独立领域代码但不无证扩铺UI。

### 1.5 Profile完整流水线与旧入口安全适配（T3b）

**入口**：T3a与T4都已通过。不能在Token生成器尚未实现时标“Profile整包验证完成”。

**文件**：新增 `N/scripts/{build-target,verify-target}.mjs`、`N/tests/pipeline/build-target.spec.ts`；逐个适配 `B/scripts/{create-profile,new-miniapp-project,apply-profile,sync-template,build-miniapp,verify-miniapp,build-all-profiles,release-miniapp,release-trial}.sh` 与 `B/scripts/lib/apply-profile.mjs` 的**引擎选择/路径校验**。发布执行在Phase5才开放。

**固定CLI合同（本阶段实现后才能使用）**：

~~~text
node N/scripts/build-target.mjs --request <build-request.json>
node N/scripts/verify-target.mjs --manifest <release-manifest.json>

BuildRequest:
 engine, repoRoot, sourceRoot, projectRoot, profilePath, profileKey,
 platform, environment, sourceCommit, profileDigest, tokenDigest, runId
~~~

- [ ] P1-29 实现BuildRequest闭集和realpath校验；明确模板根、隔离目录、Profile来源，不以调用者cwd或工具仓Profile猜目标。
- [ ] P1-30 每次构建分配 `B/.work/build/<engine>/<profile>/<platform>/<sha>/<digest>/<runId>/`；runId唯一且不覆盖已有run，Profile与Token摘要参与来源验证。
- [ ] P1-31 复制模板白名单→应用当前Profile→生成Token/配置→固定锁依赖安装→构建→产物verify→写manifest；静态资源只在隔离目录清陈旧文件。
- [ ] P1-32 verify同时核对AppID、APP_CODE、环境、17路由的**阶段期望集合**、协议、导航title、静态资源、错误品牌残留和引擎指纹；不能让源码命中代替产物命中。
- [ ] P1-33 保留旧脚本无engine参数时的legacy用法；新端必须显式选vue3和sourceRoot。旧sync-template禁止对新N执行rsync --delete；new-project不再复制旧UVUE模板冒充Vue3。
- [ ] P1-34 写错发负向：旧artifact冒充新engine、错误appid/host、profile A读B产物、同run并发、路径越界、非空目录覆盖，每项必须失败。
- [ ] P1-35 双Profile整包构建：合成fixture做生成测试，获准的实际Profile做工具打开验证；核对各自manifest及hash，未获准不上传。
- [ ] P1-36 CI的PR无secret车道落地：旧端回归与新端已建立套件分车道；发布job暂受保护且不执行。产物文件与日志作为测试证据保存。
- [ ] P1-37 独立CR检查Profile/路径/数据隔离；修完后完整复跑G1，提交工程底座。

**G1验收命令（此时所有列出的套件均已实现）**：

~~~bash
set -euo pipefail
pnpm --dir miniapp-vue3 install --frozen-lockfile
pnpm --dir miniapp-vue3 run typecheck
pnpm --dir miniapp-vue3 exec vitest run tests/unit tests/components tests/pipeline
pnpm --dir miniapp-vue3 run build:mp-weixin
pnpm --dir miniapp-vue3 run build:mp-toutiao
# build-target / verify-target的真实调用和A/B产物哈希同时记入phase-01.md
~~~

**验收 G1**：模板/版本可复建；端口/生成器/UI门面通过；双Profile隔离；微信/抖音样页有实际证据；旧发版入口不被破坏。

---

## Phase 2｜公共服务与普通业务闭环

**对应：T5 → T6 → T7 / G2。负责人：业务迁移负责人；范围：先微信真实闭环。**

**入口条件**：G1通过；目标合同表与Profile/Token/端口接口冻结。抖音/小红书在本阶段的mock/只读展示只算前置证据，不能宣布其身份支付完成。

### 2.1 HTTP、上传、认证与品牌上下文（T5）

**文件**：新增 `N/src/infrastructure/http/{client,upload,errors}.ts`、`N/src/infrastructure/repositories/`各域模块、`N/src/application/{auth-coordinator,brand-context,brand-hub-controller}.ts`、`N/src/infrastructure/storage/versioned-storage.ts`、`N/src/platform/weixin/`端口实现；`N/tests/contracts/{http,upload,identity,page-config}.spec.ts`、`N/tests/unit/{auth-coordinator,brand-hub-controller,storage}.spec.ts`。

**接口（具体函数名固定，参数类型承接ports/context.ts）**：

~~~text
createHttpClient({transport, authCoordinator}) -> {request(input)}
createBrandHubController({loadConfig}) -> {
  refresh(context: RequestContext): Promise<void>,
  enabled: boolean, invalidate(): void
}
createAuthCoordinator({exchangeIdentity, storage, clock}) -> {
  waitForLogin(context): Promise<Result<Session>>,
  completeLogin(session): void, cancelLogin(): void, logout(): void
}
Session = {userId: string, token: string, platform: PlatformId,
           profileKey: string, authRevision: number}
~~~

Session是**新端内部模型**，不是伪造后端响应字段；repository从已冻结的真实provider DTO映射。loadConfig使用真实page-config信封映射后的config字符串；controller只做严格开关与并发治理。

- [x] P2-01 先按母方案11.4给34wrapper逐个落到repositories；保原method/path/header/body/业务码，废弃项记录不恢复。HTTP网络错误与业务4001、0/200成功兼容分别测试。（2026-09-17 完成：`infrastructure/repositories/` **14 个仓储文件**（carousels/albums/shops/likes/favorites/packages/page-config/brands/webview 相关/credits/wx-auth/ai/ai-result/user-info 等）逐端点保原 method/path/参数位与业务码；**34 wrapper 逐条去向台账见 `miniapp-vue3/docs/migration/contracts.md`**（含 Phase3 新增 credits 四端点与 AI 端点表）；契约+仓储用例 **21 例**（`tests/unit/repositories.spec.ts` 11 ＋ `tests/contracts/*` 10）覆盖 4001→INSUFFICIENT_CREDITS、0/200 兼容、网络错误、认证与重放策略）
- [x] P2-02 让所有请求捕获发起时的RequestContext；保Bearer、X-App-Code与**可选**X-Brand-Id。默认品牌不能硬塞到所有数据请求，后端默认品牌规则只按现合同消费。（2026-09-17 完成：client 头注入口径＝**`X-App-Code` 恒带**、**`X-Brand-Id` 仅品牌作用域且有值**（`client.ts:30` 注释与 `:91-92` 实现）；`RequestContext` 由调用方在**发起时**快照（`next()` 递增 requestSeq、`bumpScope()`/`bumpAuth()` 作废旧上下文），`request-context.spec.ts` 覆盖）
- [x] P2-03 写并发401/取消/退出/超时/二次401测试后实现AuthCoordinator；一个登录交互唤醒队列，取消时全部reject，不能无限等待。**（2026-09-17 完成：协调器本体 `application/auth-coordinator.ts`＋六类测试（并发只换票一次／cancel 全 reject／换票失败／logout 作废+二次401／reject 不悬挂／超时）；**provider 侧本笔落地**：`platform/uni/login.ts`（`uni.login` 取 code，容器守卫）＋`application/silent-login.ts`（code→`POST /api/wx/login`→Session→completeLogin，**fail-closed 绝不伪造会话**）＋**全仓 11 页 stub 清零**（原误标 `wx-login-pending-T7`）＋`t43` 六例；vitest 344 passed/3 skipped＋TC 0＋三平台构建 0。真机验证由主人稍后自验。原进展注记（保留留痕）：协调器本体已落地 `application/auth-coordinator.ts`（一个登录交互唤醒全部等待者）＋并发/401 测试；⚠️ 仍缺 provider 侧——`exchangeIdentity` 在 8 个页面仍是 stub（`wx-login-pending-T7`，命名有误：T7=P2-17～23 已完成），真机 `authRequired` 端点（结果页保存/买断、权益查询、我的页资料等）因此以 AUTH_EXPIRED 收口。收口动作＝`platform/uni/login.ts`（`uni.login` 取 code，容器守卫）＋`application/silent-login.ts`（code→`wxAuth.login(POST /api/wx/login)`→Session→completeLogin，fail-closed）＋8 页改接该工厂＋t43 用例。**主人 2026-09-17 拍板：先做此项解锁保存/买断；微信真机由主人稍后自验**）
- [x] P2-04 上传仍用multipart字段 `photo`，对JSON字符串响应解码、非法JSON、权限、取消、401挂起上传队列分别测试；不把上传改成普通JSON请求。（2026-09-17 完成：`ports/upload`＋`platform/uni/upload`（**字段名 `photo` 逐字**、品牌头透传、容器安全、settled 标记防误 abort）＋`application/ai-photo-upload`（**JSON 字符串/对象两形态解码**、非法 JSON→稳定失败文案、`filename` 空判失败、**401→`authExpired` 交页面拉登录**、10MB 上限）；`t34` 七例＋`t31` 六例。**有意偏差**：旧端 401「挂起上传队列待登录重试」改为 fail-closed 上抛 `authExpired`（不静默、不自动重放——与 P2-05 扣费类禁重放口径一致），已登记）
- [x] P2-05 明确请求重放策略：安全读可在同上下文重发；跨品牌/账号旧POST作废；同步扣次/下单/兑换码没有provider幂等保证就禁止自动重发。（2026-09-17 完成：client `replayPolicy ?? "never"`（**默认即禁重放，fail-closed**）＋各仓储逐端点声明——读 `idempotent`、写/扣费（`credits.createRecharge`/`redeemCode`、`ai.submitTryOnTask`、`ai.getRecommend`、`ai-result.downloadResult`、`wx-auth.login`）一律 `never`；跨品牌/账号旧响应由 `bumpScope`/`bumpAuth`＋代次守卫（T8 页面 `pollGeneration`）作废，`be0f6da` 后 authRequired 端点走真实换票）
- [x] P2-06 实现versioned storage：兼容读旧token/userInfo/brand_id，同平台+Profile有效性校验、幂等读旧写新；验证期间不删除旧key，损坏内容安全失败。（2026-09-17 完成：`infrastructure/storage/versioned.ts`；`tests/unit/versioned-storage.spec.ts` 五例逐条覆盖——兼容迁移旧 token/userInfo 且**旧键保留不删**、二次 load 幂等不重写、**跨平台/Profile 校验**（异 Profile 新键视为无会话）、**损坏内容安全失败**（非法 JSON→null 不抛，旧 userInfo 损坏仍可迁 token）、brand_id 兼容迁移＋新键优先＋`clearSession` 只清新键）
- [x] P2-07 实现品牌馆强制刷新与在飞去重：onLoad/onShow同上下文重叠只查一次；请求已完成后再次热恢复需重查；切品牌invalidate，迟到旧响应不写入；移除跨生命周期30s缓存的行为修正写deviations。（2026-09-17 完成：`application/brand-hub-controller.ts`／`brand-hub-gate.ts`——**同 scopeRevision 在飞去重**、切品牌作废在飞、迟到旧响应不写入；首页 onShow 品牌基线变化触发重载（`12296d1`）；**行为修正已登记 `docs/migration/deviations.md` 第 4 条**（旧端 60s 内存缓存不再保留、原「下拉/热恢复强制刷新」表述已更正）。用例：`brand-hub.spec.ts`／`brand-hub-controller.spec.ts`／`t27-brand-hub.spec.ts`）
- [x] P2-08 原生手机号/头像授权按钮置于platform/ui-bridge；首次交付 `N/src/pages/policies/{user,privacy}.vue` 与登录同意/拒绝流程（B0两页由T5负责）。（2026-09-17 完成：`platform/ui-bridge/AuthNativeButton.vue`（原生 `<button open-type>` 面）＋`pages/policies/{user,privacy}.vue` 两页（协议内容忠实搬运＋`miniAppName` 随 Profile 注入，P2-08 交付）；登录同意/拒绝流程＝`LoginPopup` 的 `loginAgreementChecked` 闸门＋`showLoginAgreementToast`（未勾协议不发授权），`t24-mine`／`t38` 断言）
- [x] P2-09 provider验证：真实API client在本地provider/受控测试环境核对报文；fixture与provider不一致要修合同，不假造mock通过。数据写入/付费调用须单独在允许范围。（2026-09-17 完成：`tests/provider/wire-format.spec.ts`——真实传输适配（node fetch→业务信封解码）**只读 GET** 核对受控测试域 `https://crazyma99.xyz` 的报文形状（shops/carousels/categories/albums/album detail/like status），纪律「fixture 与 provider 不一致要修合同、不假造 mock」写入文件头；**该 spec 默认 gated skipped**（需真实网络），跑动时可显式启用；`repositories/albums.ts:2-4` 已按实测报文登记键名。**数据写入/付费调用未执行**（本阶段只读核对）
- [ ] P2-10 运行contracts/unit/typecheck，独立CR关注越权、错误码丢失、队列悬空，修完提交公共层。

**控制迟到响应的行为测试例子**（目标实现按上述controller接口创建）：

~~~ts
// N/tests/unit/brand-hub-controller.spec.ts
import { expect, it, vi } from 'vitest';
import type { RequestContext } from '../../src/ports/context';
import { createBrandHubController } from '../../src/application/brand-hub-controller';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
it('新品牌结果不被迟到的旧品牌响应覆盖', async () => {
  const a = deferred<string>(); const b = deferred<string>();
  const loadConfig = vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const controller = createBrandHubController({ loadConfig });
  const ctx: RequestContext = {
    profileKey: 'fixture', appCode: 'fixture', brandId: 'A', platform: 'weixin',
    environment: 'trial', scopeRevision: 1, authRevision: 1,
  };
  const oldRequest = controller.refresh(ctx);
  const newRequest = controller.refresh({ ...ctx, brandId: 'B', scopeRevision: 2 });
  b.resolve('{"enabled":false}'); await newRequest;
  a.resolve('{"enabled":true}'); await oldRequest;
  expect(controller.enabled).toBe(false);
  expect(loadConfig).toHaveBeenCalledTimes(2);
});
~~~

再加同scope两个在飞调用只查一次、成功后热恢复必须重查、坏JSON/网络失败隐藏三个用例；不能仅grep源码有refresh调用就算过。

### 2.2 第一条业务纵切片（T6）

**文件**：新增 `N/src/pages/{index,demoDetail,targetPhotoDetail}/index.vue`、`N/src/composables/use-home.ts`、`N/src/components/{PhotoGrid,SkeletonBlock,LoadingBlock,CustomNavBar}.vue`；微信native tabBar在 `N/src/custom-tab-bar/index.{js,json,wxml,wxss}`；对应工具/真机记录 `N/tests/e2e/read-flow.md`。

- [ ] P2-11 先写路由/入参/列表VM测试，再接首页→相册→普通客片详情→返回。targetPhotoDetail不是shareToken作品页，idx/type等原参数不能丢。
- [ ] P2-12 复刻3Tab路径与选中态；微信每页native TabBar独立实例，按页面onShow同步；不恢复已回滚的背景位移动效。
- [ ] P2-13 相册列表与搜索两套布局都验：≥7码点显示6+...、emoji、两处间距、AI按钮位置、图片成功/失败时序。
- [ ] P2-14 点赞/收藏先写乐观更新与乱序失败回滚测试；计数不负数、按下反馈和触感按能力降级；不改变收藏默认全量读取的合同。
- [ ] P2-15 跑有/无品牌、空/正常/长标题、未登录/过期、弱网/失败/返回场景；记录按device/platform区别的截图或几何结果。
- [ ] P2-16 通过微信真机与独立CR后提交纵切片；抖音只读流能测试就记录，但不能以此标登录/支付支持。

### 2.3 普通业务页面扩展（T7）

**文件**：新增 `N/src/pages/{priceHomePage,priceList,mine,favorites,brandHub,webview}/index.vue`；`N/src/components/{AppFooter,ServiceContact,LoginPopup,ProfilePopup,BottomActionBar,BottomActionBarSecondary}.vue`；`N/tests/e2e/account-content.md`。

- [x] P2-17 迁价目两页，保业务数据和无数据状态，不恢复旧端已下线的店铺轮播。（2026-09-17 完成：priceHomePage `13c061c` 独立CR 三🔴全清；priceList 页＋packages 仓储＋pages.json 注册＋t23 四用例；vitest 193/193+3 skipped＋TC 0＋三平台构建0＋双端产物注册实证；honghe-price.png 死引用与旧端保持一致已声明）
- [x] P2-18 迁我的页登录两态、头像昵称非空合并和退出；协议两页只做集成回归，不在T7重新实现T5逻辑。（2026-09-17 完成：mine 页＋user-info 仓储/user-info-store 非空合并/login-flow 三步登录/haptics＋三弹窗组件，`84a24f0`；独立CR 1🔴（user-info 缺 authRequired）全清＋6🟡 处理；vitest 201/201+3＋TC 0＋三平台0）
- [x] P2-19 迁收藏：**默认一次获取全量，搜索才分页**；取消收藏、回退/空态/计数对齐。别在迁移里偷偷引入默认分页。（2026-09-17 完成：favorites 页＋favorites 仓储四端点＋pages.json 注册＋t26 四用例；独立CR 0🔴/6🟡（🟡 已清），红线 4/4 成立：默认零分页参数/分页 UI 仅搜索态/loadMore isSearching 守卫/仓储无 page·size；vitest 205/205+3＋TC 0＋三平台0＋双端产物 10 页实证；抖音端无搜索入口已声明待拍板）
- [x] P2-20 迁品牌馆页面自守卫、过滤PLATFORM、品牌持久化和缓存隔离；统一消费同一开关repository，不能入口显示但进入又被错误拦回。（2026-09-17 完成：page-config 仓储＋brand-hub-gate 同源闸门（index 内联解析已移除）＋PLATFORM 过滤＋持久化＋切品牌闭环（首页 onShow 品牌基线重载），`12296d1`；独立CR 2🔴（切品牌不重载／失败 toast 死代码）全清；vitest 216/216＋TC 0＋三平台0）
- [x] P2-21 上提AppFooter/ServiceContact的请求到用例/组合函数，再props注入；逐项保留OPS优先/全局/本地兜底及Profile字段映射。（2026-09-17 完成：`9275540`——page-config-content 用例＋两纯 props 组件（CR 复核组件内零请求）＋五页接入（index/demoDetail/priceHomePage/priceList/favorites）；CR 无已证实🔴、🟡 全清（含**真回归**：本地兜底漏抄 5 条→已补全 8 条））
- [x] P2-22 webview只允许既有合法URL策略，协议/客服/联系信息均验证拒绝和返回路径，不放开任意URL。（2026-09-17 完成：`382aa3c`——domain/webview-url 白名单（无 URL 构造器依赖）＋页面拒绝路径＋幂等返回；CR 1🔴（**反斜杠旁路**，WHATWG 与校验器解析分歧）已修并先红后绿锁定；有意加固登记 deviations #8；t29 八例）
- [x] P2-23 更新parity至B0+B1+B2共11条公开路由；完成unit/contracts/components/pipeline回归，独立CR后通过G2。（2026-09-17 完成：parity.md **首次落真值**——11 条公开路由逐条带批次＋提交证据、AI 6 页 not_started、组件 15 条 9 ported／6 not_started、native tabBar 产物实证；四层回归 `vitest run` 228 passed/3 skipped（unit 含契约 11 例／components 28 例／pipeline 4 套全绿；provider 真实线格式 3 例 gated）、TC 0、三平台构建 0。**⚠️ G2 独立 CR 子代理（v4-flash-vision-exp）两次催促后仍超时无回，本轮改由主会话按 G2 七条自查取证替代**：①11 条路由均已迁移且注册（pages.json 12 条＝11 业务＋1 debug probe，probe 按 G2 口径不计业务页）②AI 6 页未注册 ③components 9 目录与 parity 一致 ④pages/components 无直接 `uni.request`／`wx.` 业务调用（均经 client/仓储）⑤契约可测（repositories.spec 覆盖全部端点，含 P2-20/21/22 新增 page-config/brands）⑥四层回归全绿 ⑦勾选文案与提交事实一致 ⇒ **G2 自查通过**。**2026-09-17 独立复核已完成**（只读子代理，基线 `7ce5dd5`）：**G2 通过**——七条中 1/2/4/5/6/7 有据、第 3 条口径内成立；⚠️ 复核为**只读且未复跑测试/构建**（三项为未独立复核项）。复核指认两处**台账不实**（🔴1 `parity.md` 未回填 `aiTryOnResult`（实际 1409 行已注册）＋AI 页表标题/编号已乱；🔴2 页数陈述时效：微信 15→**17** 页），**已即时修复**（`parity.md` AI 页表按 12→17 重排＋页数改为「当时实证」口径＋补 `AiTemplatePicker` 口径说明）。复核 🟡 挂账：`downloadFile`/`saveImageToPhotosAlbum`/`authorize` 下沉 `platform/uni/*` 端口；`share` 契约提到 `tests/contracts/`）

**G2验收**：微信非AI业务闭环有真实证据，公共合同可测；真实SDK不再散落业务域；页面数量/路径与本阶段清单一致，debug probe不算业务页。

---

## Phase 3｜共享支付先行，再迁移AI闭环

**对应：T9a → T8/T9b / G3。负责人：AI/支付负责人；后端、测试协同。**

**入口条件**：G2通过；T5认证/HTTP/上传可用。试衣和推荐可在共享支付合同冻结后并行，但不得各自再写一套支付门闩。

### 3.1 共享支付与权益确认（T9a，必须前置）

**文件**：新增 `N/src/application/payment-coordinator.ts`、完善 `N/src/domain/payment-state.ts`（T2已创建）、`N/src/infrastructure/repositories/credits.ts`、`N/src/platform/weixin/payments.ts`；`N/tests/unit/payment.spec.ts`、`N/tests/contracts/credits.spec.ts`。

**状态/合同**：

~~~text
idle → creatingOrder → awaitingUser → confirmingEntitlement → succeeded
用户取消 → cancelled；超时/业务错误 → failed（均释放前端门闩）
同operationId重复点击复用同一在飞过程，不创建第二笔订单

tryon/recommend：订单paid 且对应池balance>0，才允许后续任务
单任务下载：订单paid 且服务端taskBought=true，才允许原图保存
平台支付面板success ≠ 订单paid ≠ 权益已到账
~~~

- [x] P3-01 先写三池（tryon/recommend/download）和taskId归属测试；业务普通错误不触发充值，4001仅由对应业务处理。（2026-09-17 完成：`tests/contracts/credits.spec.ts` 三池归属——tryon 不带 feature／recommend 显式／download＋taskId 绑定＋边界（feature=''、taskId<=0 不传）；4001→INSUFFICIENT_CREDITS 与「普通 BUSINESS 不触发充值」由 `tests/unit/payment-state.spec.ts:66-79` 锁定）
- [x] P3-02 写连击、用户取消、面板失败、查单超时、callback重复、paid先于权益到账、旧账号回复迟到等失败场景。（2026-09-17 完成：连击＝busy／operationId 复用；取消＝cancelled；面板失败＝payment-failed；查单超时＝timeout＋outTradeNo；**callback 重复**＝反复 paid 只确认一次权益（`polls()=1`＋`entPolls()=1`）；**paid 先于权益**＝权益迟到协议用例；**旧账号/会话过期**＝AUTH_EXPIRED→create-order-failed 且不拉起面板；另补面板回调兜底超时）
- [x] P3-03 实现统一门闩与operationId；后端已有幂等则按合同传递，没有就禁止扣费POST自动重放，不能以客户端去重代替服务端幂等。（2026-09-17 完成：门闩＝PayGuard 单一出口（全仓仅 coordinator 一处 tryBegin）；operationId 同值**复用同一在飞 Promise**（用例断言 `p1===p2` 且下单 1 次）；扣费/兑换 POST `replayPolicy:"never"`（禁自动重放）；**并已声明：客户端去重仅防重入，不等价服务端幂等**）
- [x] P3-04 明确确认截止时间与退出状态；不得无限轮询。前端超时不代表订单作废，后续重新进入按后端状态恢复而不是再创建订单。（2026-09-17 完成：`poll.timeoutMs` 截止＋超时返回 `outTradeNo`；新增 `resume(outTradeNo)` 按后端状态恢复——用例断言**恢复路径下单次数仍为 1**（不新建订单））
- [x] P3-05 下载买断必须查服务端权益；修正“仅paid就本地置taskBought”的静态竞态疑点，用可控延迟测试证明不再重复扣费或提前放原图。（2026-09-17 完成：权益确认下沉到协调器——tryon/recommend 需 paid **且对应池 balance>0**；download 需 paid **且服务端 taskBought=true**；可控延迟用例证明 paid 先到而权益未到时不判成功（继续确认直至到位或超时））
- [x] P3-06 对本地provider/沙箱验签、订单/权益归属与重复入账做验证。不能调用真实支付只为测试变绿。（2026-09-17 完成：**验签口径说明**＝微信支付签名由服务端完成，客户端仅透传 `paySign`，故本地不做验签而做**订单字段逐字透传（归属）**＋`isWeixin=false` 时**零支付调用**断言；重复入账＝callback 重复只确认一次；全部测试基于本地 mock provider，**未调用任何真实支付**）
- [x] P3-07 独立CR通过后提交共享PaymentCoordinator；T8/T9b只消费它。（2026-09-17 完成：共享协调器经独立 CR 后提交（`31586ee`）；**T8/T9b 四张 AI 页全部只消费它**——`grep createPaymentCoordinator src/pages/` 命中 `aiTryOn`／`aiTryOnResult`／`aiRecommend`／`aiRecommendLoading` **恰四页**，且四页内**无直接 `tryBegin`**（`PayGuard` 仅作 `gate` 入参构造，`grep -n "tryBegin" src/pages/` = 0）；`t45` 静态守卫另锁「等待页不得持有查单能力」）

> **2026-09-17 进展（T9a 共享底板已落地，P3-01～P3-07 均未勾选）**：`application/payment-coordinator.ts`＋
> `infrastructure/repositories/credits.ts`（四端点）＋`platform/weixin/payments.ts`（fail-closed 适配）＋
> `domain/payment-state.ts` 追加 `PaymentPhase` 状态机；测试 `tests/unit/payment.spec.ts`(15)＋`tests/contracts/credits.spec.ts`(3)，
> 全量 246 passed/3 skipped＋TC 0＋三平台构建 0；独立 CR（v4-flash-vision-exp）**无 🔴**、三条硬约束全绿（状态机逐字一致／
> 终态全路径释放门闩／三池单一出口＋4001 映射未动）。**已实现并有测试**：operationId 复用（P3-03 前半）、有限轮询＋
> 超时≠作废＋`resume(outTradeNo)` 恢复（P3-04）、paid≠权益（balance>0／taskBought）＋下载买断校验（P3-05 核心）、
> 面板回调兜底超时＋防御收敛。**遗留（下一步）**：P3-01 三池/taskId 归属用例扩充、P3-02 callback 重复与旧账号迟到场景、
> P3-06 本地 provider/沙箱验签与归属校验、P3-07 后半（T8/T9b 消费端装配：显式传 `isWeixin`，按 `isTerminalPhase` 判终态）。

**控制权益迟到的最小测试协议**：

~~~text
Given：查询1返回paid=true、entitlement=false；查询2返回paid=true、entitlement=true
When：同operationId调用购买流程两次，并在查询1后尝试保存
Then：createOrder只调用1次；查询1后不保存/不提交；查询2后只续跑1次
And：切换authRevision后，即便旧查询返回true也不改变新账号权益
~~~

把该协议落实到 `tests/unit/payment.spec.ts` 的可控Promise/fake clock测试；不能用真实等待几十秒碰运气。

### 3.2 试衣全链路（T8）

**文件**：新增 `N/src/pages/{aiTryOn,aiTryOnResult,aiTryOnHistory}/index.vue`、`N/src/application/{tryon,task-poller,download-entitlement}.ts`、`N/src/components/{AppPhotoPicker,GenerationProgress}.vue`；`N/tests/unit/tryon.spec.ts`、`N/tests/contracts/tryon.spec.ts`、`N/tests/e2e/tryon.md`。

- [ ] P3-08 迁选图/拍照/质量校验/模板匹配；拒绝授权、取消、文件异常、JSON异常分别测；前端检查不能替代后端人脸/安全校验。
- [ ] P3-09 迁上传/提交，任务创建与扣次是有副作用动作，不因网络timeout自动创建另一任务。
- [ ] P3-10 迁真实任务状态与伪进度分离；按已冻结的旧策略轮询，离页/切品牌/新请求代次停止旧计时器与写回，重进由任务状态恢复。
- [ ] P3-11 迁水印预览、付费原图URL与任务永久买断；用共享支付确认后只保存一次，不让匿名分享获得付费下载接口能力。
- [ ] P3-12 迁记录页：当前一次取全量历史，删除/返回/进度恢复按旧合同，不顺带引入分页。
- [ ] P3-13 明确分享分支：好友直达试衣；朋友圈带taskId/shareToken的作品页匿名只查一次、不轮询；scene1154不跳页；分享封面网络JPG及失败兜底。
- [ ] P3-14 防截屏/字体/媒体等能力按当前平台capability实施，onHide/onUnload恢复作用域；未实现不能返回假成功。
- [ ] P3-15 单测/合同/微信真机/独立CR通过后提交B3三页。**（2026-09-17 进展：单测/合同 ✅、**T8 独立 CR 已完成且无 🔴（可在代码级收口）**、三平台构建 0；⚠️ **微信真机未做**（主人自验）⇒ 未勾。CR 的 P1/P2/P3 四项已全清（代次守卫补漏／`canSaveOriginal` 接线／photo-check 头 P3-08 声明／买断等价性说明））**

### 3.3 推荐闭环（T9b）

**文件**：新增 `N/src/pages/{aiRecommend,aiRecommendLoading,aiRecommendResult}/index.vue`、`N/src/application/recommend.ts`、`N/src/infrastructure/repositories/recommend.ts`；`N/tests/unit/recommend.spec.ts`、`N/tests/contracts/recommend.spec.ts`、`N/tests/e2e/recommend.md`。

- [x] P3-16 保留现行同步180秒请求合同；每次POST会扣推荐次数，等待页不能用重复POST当轮询，也不能超时后自动扣第二次。（2026-09-17 完成：内核 `RECOMMEND_REQUEST_TIMEOUT_MS=180000`＋`createRecommendRunner` **单次 POST**（同 `operationId` 复用在飞 Promise、失败不自动重发、仅用户显式重试才再发）；`t44` 锁「同 op 复用 `p1===p2` 且请求数 1」「失败不自动重发」；`t45` 静态守卫锁「等待页**不得调用查单**（`getRechargeStatus(`/`pollRechargeStatus(`/`payPollToken` 清零）＋存在 180s 计时器 `countdownTimer`（**注：t45 未锁 setInterval 用途**，CR 已更正表述））
- [x] P3-17 复用共享支付/登录/上传，paid与余额同时满足后只续跑一次；取消/离页/未知网络结果均有明确恢复入口。（2026-09-17 完成：等待页与入口页充值**一律走共享 `payment-coordinator.recharge/resume`**，**旧端自建 `pollRechargeStatus` 2.5s×48 次轮询整段删除**（`t45` 守卫）；`resumeAfterCredit`／`resumeAnalyzeAfterCredit` **一次性标记先清后调**（`t45` 次序断言）；取消/超时/下单失败/网络异常→失败态给「重试／返回」入口；登录走 P2-03 静默换票、上传复用既有端口。**已拍板**：coordinator 到账确认保持默认 30s（主人 2026-09-17；与 422e73f 一致，不再列为收口项））
- [x] P3-18 返回DTO显式包含 `finalScore`，不照搬旧类型漏字段；按现行显示条件处理缺失/0/异常值，禁止用原始score凑分。（2026-09-17 完成：`normalizeFinalScore` 仅接受 `number>0 且有限`（缺失/0/负数/字符串/NaN/Infinity→null），`shouldShowScore` 与旧端 `v-if="rec.finalScore > 0"` 等价；结果页**只渲染**该口径的分数并**指出旧 `AiRecommendation` 漏 `finalScore` 字段**（按现行 DTO 显式收、兼容 `final_score`）；`t44` 锁九态＋`{score:99}`→不显示；`t45` 守卫禁「原始 score 拼分」。**并修内核缺陷**：`{analysis,recommendations}` 多形态兼容、空载荷判失败（`59e7a89`））
- [x] P3-19 保留移除“暂无同性样例”标签、缩略图成功/失败时序、试衣跳转参数、等待页文案与操作。（2026-09-17 完成：①标签**确已移除**且新端有意不恢复（结果页 :319 留注释、全仓 0 命中）；②结果页缩略图 `previewLoaded` 骨架成功/失败时序；③试衣跳转参数口径保留——查看模板 `targetPhotoDetail?idx&type=shopId&liked=false&style`，`onPreviewClick`（`aiTryOn?style&gender&shopId`）**旧端定义但模板未绑定**⇒ 原样保留方法同样不绑定（偏差已登记）；④等待页文案与操作=NavBar「AI分析中」＋仅步骤条＋失败遮罩「AI分析失败，请重试」＋重试/返回（旧端 2026-09-14 主人指示**不要** Tips／双按钮））
- [ ] P3-20 测同一任务复进、连点、401、4001、超时、弱网、旧响应覆盖；独立CR后提交B4三页。**（2026-09-17 部分完成，未勾：内核层已覆盖——连点/同 op 复用＋失败不自动重发（t44）、4001→共享支付、超时只切 failed、弱网/ 异常分类（t44）、**旧响应覆盖**＝等待页 `stopAll()` 递增代次（`runGeneration`，`t45` 静态守卫）；⚠️ 入口页**无代次守卫**（仅有一次性标记＋onUnload/onHide 双清＋协调器同 op 在飞复用）——T9b CR 更正台账；**页级场景测试与独立 CR 仍未做**；另**两条存疑已由主人 2026-09-17 拍板并清零**：①`inFlight` **保持页面实例级**（跨页重进按同步扣费合同会再扣一次，**与旧端口径一致**，不做模块级单例）②到账确认**保持 coordinator 默认 30s**（不改 `poll` 参数），两条均已在 `t44`／`t45` 与页面注释留痕）**

**G3验收命令（无新平台真实支付凭据也可跑这些本地套件）**：

~~~bash
set -euo pipefail
pnpm --dir miniapp-vue3 run typecheck
pnpm --dir miniapp-vue3 exec vitest run tests/unit tests/contracts tests/components tests/pipeline
pnpm --dir miniapp-vue3 run build:mp-weixin
pnpm --dir miniapp-vue3 run build:mp-toutiao
~~~

**验收 G3**：17条微信公开路由与原业务都已覆盖；3个池/下载买断、分享匿名/付费边界通过；缺身份/支付provider的非微信端此时仍不得标G4通过。

---

## Phase 4｜跨平台服务端合同与真机适配

**对应：T10 / G4。负责人：平台适配负责人 + 后端负责人；产品确认资质与账号共享规则。**

**入口条件**：G3通过；每端AppID/权限/类目/支付资格有状态记录。先离线实现与合同测试，真实平台调用按获准测试范围进行。

- **抖音验收范围（2026-09-17 主人拍板）**：抖音端＝客片展示版（**11 页/3 tab**，AI 六页不注册，「我的」页只留「我的喜欢」，**零支付改造**）⇒ Phase 4 的抖音真机/工具验收按此范围执行，产物校验须断言「AI 六页未在 `pages.json` 注册」；AI 试衣/推荐的跨端适配**不在本轮抖音范围**（微信端照常验收）。

### 4.1 冻结平台身份与支付合同

**文件（新端）**：新增 `N/contracts/{platform-auth,platform-pay}.json`、`N/src/platform/{toutiao,xhs,h5}/`对应端口与ui-bridge、`N/tests/contracts/{platform-auth,platform-pay}.spec.ts`、`N/tests/e2e/platform-matrix.md`。

**文件（后端计划落点，遵循BE的SOP，在开工读当前注册点后实施）**：新增 `BE/internal/platformauth/{provider,handler,types,handler_test}.go` 与 `BE/internal/platformpay/{provider,service,notify_handler,service_test}.go`；在 `BE/cmd/api/main.go` 的依赖装配/路由注册处接入。旧微信handler与接口不删除，具体provider DTO在合同审阅中固定。

- [ ] P4-01 产品批准跨平台账号/手机号/余额/买断能否共用以及绑定/解绑规则；没有批准保持provider隔离，不能把相同openid字符串当同一用户。
- [ ] P4-02 后端合同明确平台+appid+subject→internalUserId映射；平台ticket交换与手机号校验只在服务端，秘密不进客户端Profile。
- [ ] P4-03 支付合同明确订单归属、平台provider、下单参数、查单、回调验签、幂等唯一约束、订单与权益原子性/补偿、退款与对账。
- [ ] P4-04 新端与后端共同审阅auth/pay合同及失败码，再生成类型/fixtures；接口还没上线时不得在前端调用猜测路径，旧mock登录接口不得冒充生产多端登录。
- [ ] P4-05 实现后端provider替身测试后接真实provider；旧/新consumer合同一起跑，先扩展后迁消费者，禁止破坏老微信客户端。
- [ ] P4-06 注册各平台管理台的request/upload/download合法域名；H5 CORS、COS权限和后端身份/支付路由分别核查，不能统称一项“白名单已配”。

### 4.2 实现各端SDK与原生UI桥接

- [ ] P4-07 按 `MP-WEIXIN / MP-TOUTIAO / MP-XHS` 构造平台实现；`condition`仅作调试启动模式，不作平台裁剪。
- [ ] P4-08 手机号/头像、分享按钮、canvas等native UI放 `N/src/platform/<platform>/ui-bridge/`；业务页面只接标准事件。不能在domain/application塞条件编译。
- [ ] P4-09 微信保native custom-tabBar与每页实例同步；抖音/小红书按各自官方方式实现，不把普通Vue栏或微信四文件生硬复制。
- [ ] P4-10 对媒体/导航/客服/保存/分享/订阅/防截屏/字体/震动逐项填 `supported / unsupported / unknown`、依据版本与实际验证；必需unknown阻断，可选降级需批准和测试。
- [ ] P4-11 对每端实现context/env识别，未知环境失败关闭；平台/AppID/provider返回值不跨端混用。
- [ ] P4-12 配置/编译/代码扫描中只允许登记的platform/bridge/app装配/generated例外；不对整个第三方bundle盲grep“wx”零命中。

### 4.3 平台验收

- [ ] P4-13 三端逐一构建并verify产物（**抖音产物须自带 `tt` 开头的 `project.config.json` 与 `app.json`+`app.js`，并能被 `tma project-size` 正确识别**）；工具运行记录与真机记录不能合成一个“通过”。
- [ ] P4-14 微信与抖音各在iOS/Android跑登录→上传→任务→结果→支付/权益→分享→退出/重进（**抖音端用 `tma preview` 出码，在已绑定测试设备的主人手机上人工逐项验证**；本机无 IDE，不承诺真机自动化）；小红书按目标资格执行同样的必需场景。
- [ ] P4-15 在已批准沙箱/测试环境验证重复callback、错误签名、错误appid/商户、paid先于权益、超时/重进，确认后端不重复入账；不在生产刷单做验证。
- [ ] P4-16 获取平台与后端独立CR。协议兼容/身份/支付/默认品牌语义红项必须明确关闭，不由实现者自行降级为备注。
- [ ] P4-17 按平台标G4结果：未通过的端保持blocked，不从required集合悄悄删掉；若产品批准本次延后小红书，记录批准、范围和仍未完成项，不能报“三端迁移完成”。

**目标命令**：

~~~bash
set -euo pipefail
pnpm --dir miniapp-vue3 exec vitest run tests/contracts/platform-auth.spec.ts tests/contracts/platform-pay.spec.ts
pnpm --dir miniapp-vue3 run build:mp-weixin
pnpm --dir miniapp-vue3 run build:mp-toutiao
pnpm --dir miniapp-vue3 run build:mp-xhs
# 下行仅在BE中对应的新包已经由P4-05实现后运行；不调用真实付费provider
(cd "$BE" && go test ./internal/platformauth/... ./internal/platformpay/...)
~~~

**验收 G4**：准备发布的每个平台都有完整资格/业务/设备/provider证据；全局迁移完成状态仍保留其他目标端未完成项。仅编译通过不能过G4。

---

## Phase 5｜候选冻结、发布演练、灰度与兼容退役

**对应：T11 → T12 / G5。负责人：发布负责人；产品/测试/后端/独立评审联合签核。**

**入口条件**：候选发布范围已明确，相关平台G4通过；没有未关闭红项；main热修已经全部在新端等价验证。

### 5.1 构建不可变候选与发布包装器（T11）

**文件**：新增 `N/scripts/release-target.mjs`、`N/tests/pipeline/release-target.spec.ts`、`R/release-manifest.json`、`R/release-approval.json`、`R/rollback-drill.md`、`R/acceptance.md`。

- [ ] P5-01 冻结候选sourceCommit/sourceTree与Profile/token/lock摘要；核对热修映射，没有待同步项才构建。
- [ ] P5-02 移除资格探针/调试菜单/测试凭据和可触达的空壳路由；最终manifest期望公开路径必须是17条，而非早期probe页。
- [ ] P5-03 由build-target创建全新run目录，执行全套测试与verify；release-manifest引用测试/CR/设备证据，保存精确产物hash。
- [ ] P5-04 实现受保护release-target：验证engine/sourceRoot/profile/platform/appid/environment/sourceSHA/manifest/hash与批准范围，确认后只上传这份artifact，**不得重新构建替换它**。
- [ ] P5-05 将旧 `B/scripts/release-trial.sh`/release-miniapp兼容入口与新包装器明确分流；不让新项目 `cd ..` 后上传旧dist；manifest缺失或错根目录直接失败。
- [ ] P5-06 写失败测试：wrong AppID/旧engine产物/修改一个字节/缺批准/错误环境/同appid并发锁，保证上传子进程调用次数为0。
- [ ] P5-07 加上传有界超时、完整日志与同run进程管理；超时先核实平台是否已收包再考虑至多一次重试。禁止广泛pkill或清用户全局锁/登录态。
- [ ] P5-08 异常、超时、取消路径验证环境文件复原与敏感信息不入日志；不能假定被SIGKILL后trap已执行。
- [ ] P5-09 本地fake uploader dry-run验证过程无副作用；独立CR检查故障时绝不回退旧包、跳过校验或继续推生产。

**固定release CLI合同（目标脚本在P5-04实现后使用）**：

~~~text
node N/scripts/release-target.mjs --manifest <manifest-file>
   --approval <approval-file> --dry-run
node N/scripts/release-target.mjs --manifest <manifest-file>
   --approval <approval-file> --execute
~~~

审批文件不是自签的绕过开关：只记录负责人批准的candidate/target范围与时间，受保护发布job还必须取得真实人工授权/环境权限。PR无secret车道不得持有发布凭据。

**目标命令示例（只演练，不上传）**：

~~~bash
set -euo pipefail
if [ -z "$MANIFEST_PATH" ]; then echo 'MANIFEST_PATH 未设置：由通过verify的build-target输出'; exit 1; fi
if [ -z "$APPROVAL_PATH" ]; then echo 'APPROVAL_PATH 未设置：由发布负责人批准的candidate记录'; exit 1; fi
pnpm --dir miniapp-vue3 exec vitest run tests/pipeline/release-target.spec.ts
node miniapp-vue3/scripts/verify-target.mjs --manifest "$MANIFEST_PATH"
node miniapp-vue3/scripts/release-target.mjs --manifest "$MANIFEST_PATH" --approval "$APPROVAL_PATH" --dry-run
~~~

**平台上传器分工（2026-09-15 实测口径）**：release-target 不写死某一端 CLI，按 platform 分派——

- **微信**：微信开发者工具 CLI（沿用现有体验版链路）；
- **抖音**：官方 CLI `tma upload -c <更新日志> -v <版本>`，上传前先 `tma preview --qrcode-output` 取预览证据；产物须含 `tt` 开头 appid 的 `project.config.json` 与 `app.json`+`app.js`，否则 CLI 直接拒绝；
- **小红书**：本轮无上传要求（仅编译目标）。

两端上传均属发布动作：**必须携带 `--approval` 并取得主人明确授权**；dry-run 只允许 fake uploader，不得触碰真实平台。
### 5.2 旧新共存与回退演练

- [ ] P5-10 检查旧客户端+新后端、新客户端+新后端合同均通过；未到退役窗口不删字段/接口。
- [ ] P5-11 在获准测试范围演练回旧包/旧配置，验证登录、分享、买断、未完任务/订单与存储兼容；记录耗时与人工环节。
- [ ] P5-12 验证支付回调/权益对账在回滚期间继续处理；不做数据库反向删字段或清订单“恢复状态”。
- [ ] P5-13 查明目标平台控制台实际灰度/版本回退能力；没有百分比分流能力就使用白名单/受控体验分组，不承诺任意1%/10%灰度。
- [ ] P5-14 测性能p95预算和包体硬上限：按母方案同设备/同网络基准比对；无实测基线不签性能通过。

### 5.3 授权上传与小范围验收

- [ ] P5-15 获得明确的环境/平台/AppID/版本/候选产物批准后，先部署必须的**向后兼容服务端扩展**，验证再上传客户端；生产发布需单独批准。
- [ ] P5-16 上传job按平台+AppID串行；核对平台成功回执，记录version/sourceSHA/artifactHash与日志；只有“preparing”或外层退出0不是成功。
- [ ] P5-17 邀请获准测试人员安装对应候选，确认实际版本和入口参数；失败、取消、热恢复、切品牌各跑一遍。
- [ ] P5-18 小范围观察白屏/登录/重复收费/商户串数据/匿名付费原图等硬门禁，触发即停止扩圈并走回退流程，不继续“观察一下”。
- [ ] P5-19 达标后产品确认扩圈/全量；持续收集平台、Profile、App版本、构建SHA、requestId、错误类别，日志不采token/手机号/用户原图。

### 5.4 验收与退役（T12，不能和首次上传同时草率完成）

- [ ] P5-20 产品/测试/后端/发布负责人共同签 `R/acceptance.md`，逐平台标完整/未完整，并记录批准的延后项。
- [ ] P5-21 验收后才把默认构建/发布入口指向新工程；迁移分支按团队合并规则进入main，核对远端与artifact来源，不重写历史。
- [ ] P5-22 旧客户端支持窗口结束、旧API无使用证据、未完订单/任务已清算且获退役批准后，才安排删除旧实现/compat shim；不是“新包能跑就删旧端”。
- [ ] P5-23 同步SPEC、实施方案、阶段回执、知识库03分册/索引/CHANGELOG与**对应key**源码锚点；发布版本与文档提交分别记录。

**验收 G5**：候选可追溯、故障可止损、发布获授权、回退演练有证据、业务验收有签核；T12退役可晚于首次发布，但必须保留未完成状态与责任人。

---

## 附录 A｜每个Phase到底跑哪些测试

| 当前进度 | 必跑集合 | 此时尚不能强制的未来套件 |
|---|---|---|
| P0 | 旧端现有测试/基线核查；新端不构建 | 新N不存在 |
| P1.1 | toolchain.spec + typecheck + 最小平台构建 | unit/components/contracts尚未创建 |
| P1.2 | 追加domain unit，不能0例通过 | 后续HTTP/支付端到端 |
| P1.3 | 追加profile.spec（独立临时目录） | Token未完成前不算Profile全包已验 |
| P1.4 | 追加tokens.spec、ui-contract.spec与平台样页证据 | 业务登录/支付 |
| P1.5 / G1 | 聚合unit/components/pipeline及A/B完整构建 | contracts到P2.1才建立 |
| P2 / G2 | 所有已建unit/contracts/components/pipeline + 本批页面微信真机 | 非微信真实身份/支付依赖P4 |
| P3 / G3 | 上述全套 + payment/tryon/recommend/权益及分享测试 | 非微信provider不可用时只算mock证据 |
| P4 / G4 | 上述全套 + 各端provider合同/工具/真机 | 不等于已获发布授权 |
| P5 / G5 | 冻结candidate上全套 + artifact负向验证 + 回退演练 + 受控上传回执 | 旧端退役需额外支持窗口证据 |

测试套件在其引入步骤即变为required；未开始的不塞空壳，已开始的缺失/0用例不能绿。父流程完整保留返回码，明确环境性失败、产品红项和实现缺陷，不能筛掉失败行报全部通过。

## 附录 B｜15个原任务与Phase的一一映射

| 母方案任务 | 执行位置 |
|---|---|
| T0 | P0-01～P0-15 |
| T1 | P1-01～P1-08 |
| T2 | P1-09～P1-13 |
| T3a | P1-14～P1-19 |
| T4 | P1-20～P1-28 |
| T3b | P1-29～P1-37 |
| T5 | P2-01～P2-10 |
| T6 | P2-11～P2-16 |
| T7 | P2-17～P2-23 |
| T9a | P3-01～P3-07 |
| T8 | P3-08～P3-15 |
| T9b | P3-16～P3-20 |
| T10 | P4-01～P4-17 |
| T11 | P5-01～P5-19 |
| T12 | P5-20～P5-23 |

T9a必须先于T8/T9b；T4必须先于T3b。不要按数字把T3b提前，也不要因T8数字小就先做买断下载。

## 附录 C｜阶段回执与下一位执行者的交接格式

每次执行结束更新 `R/phase-NN.md`（Phase0暂存B/docs/migration-preflight.md），必须写具体证据，不能只写“测试通过”。

~~~text
phase/任务：当前Phase编号与步骤ID
状态：not_started | in_progress | passed | blocked
输入：源码SHA、后端/合同版本、Profile/token/toolchain摘要
本次：完成步骤、改动SHA、实际文件清单
验证：完整命令、实际cwd、退出码、用例数、日志路径
平台：编译/工具/真机/资质分开填；设备和基础库版本
评审：审阅者、阻断项、修复SHA、复核结论
风险：未通过项、受影响平台/下一步、是否需要业务批准
交接：下一可执行步骤ID、所需文件/接口、禁止修改范围
发布：若未授权或未执行，明确写“未部署/未上传”
~~~

**停止条件**：发现输入版本漂移、旧骨架被恢复、路由/账务语义改变、Profile串号、必需能力unknown、签名/权益/归属错误、红项未决或发布目标无法确认，停止该路径并回到对应任务修复。其他无依赖任务可继续，但不可把阻断Phase标通过。

**交接纪律**：文档步骤“已写出”不等于该步骤“已执行”。当前这份Phase清单所有执行项均未开始，本轮仅完成文档编写与一致性检查。
