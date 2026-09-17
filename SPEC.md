# 蓝梅旅拍小程序 · Uni-App Vue3 迁移 SPEC（迁移指南）

> **版本 v2.1** · 更新 **2026-09-15** · 编制：公司秘书（依马老师指示）
> **执行细则**：本轮依据补全149行参考细则完成 [`docs/uniapp-vue3-migration-plan.md`](./docs/uniapp-vue3-migration-plan.md)。其中基线、端口、Profile改造、六阶段测试/发布/回退门禁是重构执行入口；只交付文档，不代表已创建新工程或获准发布。
> **替代 v1.0**（v1.0 以历史 Vue3 骨架为起点，已按主人 2026-09-15 指示废弃）。
> ⚠️ **口径（主人 2026-09-15 明确）**：**不使用、也不保留任何历史 Vue3 骨架与备份**（相关分支／标签／目录已全部删除）；本文只**借鉴解耦思路**（分层架构、平台适配、主题隔离；具体以本轮实施方案的依赖向内与Token单源规则为准），代码**从官方模板全新初始化**。
> 目的：把 C 端小程序从 **uni-app x（uvue/UTS，仅微信）** 迁移到 **uni-app Vue3**，一套代码覆盖 **微信 / 抖音 / 小红书**（预留快手等），为抖音小程序上线让路。

---

## 0. TL;DR

1. **起点＝全新工程**：用官方 uni-app Vue3 模板（Vue3 + Vite + TS）初始化，**不继承任何历史代码骨架**；旧端代码只作「行为对照物」，逐页复刻。
2. **唯一事实源＝旧端 uni-app x（`main`）**：17 个页面路径 / 15 个组件 / 20 个 `utils` 工具模块（含接口封装）——迁移清单见 §10。
3. **既定首选 Wot UI v2（`@wot-ui/ui`）**：2.3.2 是现有调研候选；经锁版兼容与微信/抖音关键交互验证后再准入，不盲装 latest，备选库也走同一验证。
4. **依赖向内**：UI/页面调用 application/domain；用例依赖 ports，平台/API仓储实现 ports；业务不经 UI 调 SDK，组件不发请求。
5. **平台差异收敛**到 `src/platform/`（SDK 与 native UI bridge）；装配层和 manifest/pages 生成保留受控条件编译例外，业务域禁止平台判断。
6. **Design Token 单源生成**：`tokens/source.json` 生成 CSS/SCSS/TS；`uni.scss` 引用生成物，Wot 映射独立，不再人工同步两份数值。
7. **微信旧契约不破坏**：当前34个网络封装函数逐项建合同；抖音/小红书另补服务端身份/手机号与支付provider，绝非只加白名单。
8. **外部前置需确认**：抖音/小红书 AppID、类目资质、支付/登录与账号绑定需实际证据；没有证据不判已就绪，也不把缺证据当作已确认“没有”。
9. **多端资格先验**：官方平台包、工具能编译与业务可上线不是同一件事；先微信/抖音样页，随后真机/账号/支付验证，小红书逐门禁单独记录。
10. **回退保留但非零成本**：当前业务基线 `2fe70ac`（体验版1.0.59对应代码）；旧包、兼容后端和用户存储的回退各自演练，不恢复已删除Vue3骨架。

---

## 1. 决策背景与口径

- **主人 2026-09-15 指示**：需上传**抖音小程序** ⇒ 当前 uni-app x 组件生态在抖音不可用 ⇒ 回迁 **uni-app Vue3**（KB 03 分册 §2.17.13／§2.17.12.3）。
- **主人同日补充口径（本文 v2.0 依据）**：**历史 Vue3 骨架不要、也不用备份**，只借鉴解耦逻辑 ⇒ 已删除：本地与远端分支 `backup/lm-mp-uniapp-vue3_20260914`、`feat/vue3-migration`，以及归档标签 `archive/20260915/backup-lm-mp-uniapp-vue3_20260914`（并执行 `git gc --prune=now`，仓库内已无 `mp-vue3` 引用）。
- **方向说明**：这是从现有UTS/UVUE业务到标准uni-app Vue3的新工程迁移，不把缺少“一键迁移脚本”理解成官方禁止；需逐层验证契约与平台能力。
- **工作窗口**：本周末推进；按实施方案G0–G5门禁交付，不承诺两天完成所有多端上线。

---

## 2. 迁移起点与现状（2026-09-15 实测）

**旧端事实源＝`main@2fe70acb49c204b468c5492a4a15231e51eab913`（本轮静态核查；体验版1.0.59对应代码）**

| 维度 | 数值 |
|---|---|
| 页面路径 | **17 条**（16 个目录，`policies` 下 2 页） |
| 组件 | **15 个**（`src/components/*`，自研） |
| 工具/接口 | `src/utils/` **20 个 `.uts`**（含 `api.uts` 接口封装、`http.uts`、`loginFlow.uts`、`payGuard.uts`、`share.uts`、`vkFace.uts` 等） |
| 源文件规模 | 33 个 `.uvue` + 21 个 `.uts` |
| 平台耦合 | .uts/.uvue内`wx.`为9个文本命中行（含注释，非调用数）；12个`#ifdef`+4个`#ifndef`，原生Tab另有wx调用；完整债务需按调用者盘点 |
| 主题 | `App.uvue` 内 **21 个** `--color-*` CSS 变量 + `src/uni.scss` |
| tabBar | **3 Tab**（首页 / 价目表 / 我的），`custom: true`（`src/custom-tab-bar/*`） |
| 构建 | `npm run build:mp-weixin`（uni-app x 编译器 5.08）；出包 `./scripts/release-trial.sh` |

**新端（目标态）＝全新 uni-app Vue3 工程**（Vue3 + Vite + TS，官方模板初始化），目录建议见 §4；**与旧端同仓并存**（便于逐页对照），迁移验收后再决定是否拆分独立仓（§12-D）。

---

## 3. 前置条件（迁移开始前必须就绪）

| # | 事项 | 责任 | 状态 |
|---|---|---|---|
| P1 | **抖音小程序**：账号主体、AppID、适用类目、开发者绑定的控制台证据 | 主人 | 待确认；本轮未核账号后台 |
| P2 | 抖音**支付能力**（担保支付/虚拟支付资质）与**登录**（`tt.login` + 手机号）方案 | 主人 + 后端 | ⛔ 未确认 |
| P3 | 各平台管理台的request/upload/download合法域名；另核H5 CORS、COS和后端身份/支付适配（职责不混淆） | 平台管理员 + 后端 | 门禁待验证 |
| P4 | 微信侧保持不变（appid `wxb19ad7426dfb8bd4`） | — | ✅ |
| P5 | **小红书**：AppID 与开放范围（DCloud 提供 `@dcloudio/uni-mp-xhs` 平台包） | 主人 | ⚠️ P2 优先级，可后置 |
| P6 | 抖音端特有：订阅消息模板、客服/拨号/导航/相册授权差异、分享入口 | 前端 | ⚠️ Day1 处理 |

---

## 4. 目标工程与目录结构（全新初始化）

**初始化（未来T1，本轮不执行）**：官方模板与当前项目依赖不是同一组合；官方`vite-ts`模板本轮查到的TypeScript为`^4.9.4`，不能独立强装TS5。先验证并锁定模板commit、DCloud同发行线、Node/pnpm/Vite/Vue/TS/typecheck工具与lockfile，再进入CI。
```bash
# 官方 Vue3 + Vite + TS 模板（新版 HBuilderX 亦可直接建项目）
npx degit dcloudio/uni-preset-vue#vite-ts miniapp-vue3 && cd miniapp-vue3 && pnpm i
# 组件库（§6 选型）
pnpm add --save-exact @wot-ui/ui@2.3.2
```

**目录以实施方案第4节为准**：

~~~text
miniapp-vue3/src/
  app/              配置与端口装配
  domain/           纯TS规则
  application/      用例与状态机
  ports/            身份/支付/http/media/storage/clock接口
  infrastructure/   transport、仓储、DTO解析
  platform/         各端SDK与原生UI bridge
  ui/               Wot供应商门面
  components/       纯展示业务组件
  composables/      生命周期与用例绑定
  stores/           跨页状态
  pages/            17条兼容路由
  generated/        Profile/Token生成物
~~~

路由和Profile输入保持兼容，内部目录不为“只改后缀”而复制旧耦合。

---

## 5. 架构分层与解耦（强制）

- 页面/组合函数调用业务用例，usecase依赖domain与ports；平台/API实现ports，由app层注入。
- domain不依赖Vue/Pinia/Wot/uni，application不依赖wx/tt/nativeUI；展示组件不发请求、不处理支付签名。
- 原生授权按钮/canvas/分享等放platform/ui-bridge，输出标准事件；普通API调用放platform adapter。
- HTTP与上传保留独立的401等待/取消/重放合同，跨品牌/账号的旧请求不得用新身份无脑重发。
- **微信custom tabBar是独立native组件**：uni-app源码根（本计划src）下的custom-tab-bar四文件按平台复制与验证；普通CustomTabBar.vue不能直接等价替代。
- 平台/UI/API/Token四种接口与全部旧文件去向见实施方案第4、5、7、11节。

---

## 6. UI 组件库选型（调研结论 · 2026-09-15 实测）

**选型硬指标（主人指定）**：① **AI 开发友好度** ② **维护更新频率/活跃度** ③ 多端覆盖 ④ 主题/design token ⑤ 体积与生态。

### 6.1 历史调研快照（2026-09-15 前序会话数据）

以下数字不是长期活跃保证、也不是多端资格证据。本轮保留溯源，不据“30天0提交/单一路径404”推断停更或无AI；开工复核主分支/发布/维护者公告，并把资格样页结果与数据快照分开。

| 库 | npm 包 | 最新版 | 发布日期 | 版本数 | 近一周下载 | 仓库 | Stars | 最近推送 | 近 30 天提交 | AI 工具链 | `llms.txt` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Wot UI v2** ✅ | `@wot-ui/ui` | **2.3.2** | 2026-08-10 | 33 | 1,883 | `wot-ui/wot-ui` | 358 | **2026-09-15** | 16 | **LLMs.txt + MCP Server + `@wot-ui/cli` + AI Skills** | ✅ 200（6,840 B） |
| Wot UI v1 | `wot-design-uni` | 1.14.0 | 2026-01-04 | 180 | 2,378 | `Moonofweisheng/wot-design-uni` | 2,294 | 2026-08-13 | 0（仅统计窗口，不足以判冻结） | 本轮不作否定断言 | 未核实 |
| uview-plus（备选） | `uview-plus` | 3.8.120 | **2026-09-07** | 293 | **5,096** | `ijry/uview-plus` | 716 | 2026-09-15 | **57** | 旧抓取不足以判无AI工具 | 旧测试路径404，不证明无能力 |
| nutui-uniapp | `nutui-uniapp` | 1.11.2 | 2026-03-11 | 79 | 284 | `nutui-uniapp/nutui-uniapp` | 559 | 2026-06-30 | 未复核 | 未核实 | 旧路径检查不足以下结论 |
| uv-ui | `uv-ui` | 1.0.25 | 2023-11-17 | 32 | 48 | — | — | 该查询快照无更新发布记录，不断言停更 | 未复核 | 未核实 | 未核实 |

### 6.2 结论：**Wot UI v2（`@wot-ui/ui`）**

1. **AI 友好度（决定性）**：官方专设 AI 支持——**LLMs.txt**（`https://wot-ui.cn/llms.txt` 实测 **200 / 6,840 B**，另有 `llms-full.txt`）、**MCP Server**、**`@wot-ui/cli`**（1.1.0／2026-08-19，含 `wot doctor`、`wot usage`、`wot lint`）、官方 **AI Skills**（`wot-ui-v2`、`create-wot-ui-theme`、`migrate-v1-to-v2`）⇒ AI 可直接查 API、生成页面、做组件用量与空按钮检查，与本仓既有 AI 工作流衔接。
2. **维护活跃需持续复核**：版本与30/90天提交、issue响应、维护者公告一起看；v1统计窗口无提交不等于已正式冻结。新工程仍沿用既定首选v2包名`@wot-ui/ui`，通过资格门禁后锁版。
3. **主题/token**：单源Token生成多输出，Wot bridge独立；不把官方主题生成器产物当成第二份手改权威数据。
4. 其余：Vue3/TypeScript、MIT、主题与国际化等能力按锁定版本文档核查。
5. **AI接入步骤**：[`docs/wot-ui-ai-guide.md`](./docs/wot-ui-ai-guide.md)，工程实装限定见新实施方案第6.3节。

### 6.3 资格测试与备选

先选Wot v2样页跑微信/抖音编译、工具、真机；组件清单含授权入口、Button/Input/Popup/Picker/Toast/Dialog及失败态。不以star、周下载、文档200或可安装等同业务可用。

少量差异做platform/ui-bridge；关键场景广泛失败才让uview-plus跑同一组资格测试，再作ADR决定。不安装两套完整库拼接。未证实兼容性的库先不纳入主路径，不将缺证据写成“永久不支持”。

---

## 7. 各生态条件编译层（微信 / 抖音 / 小红书）

- 官方标识：`mp-weixin / MP-WEIXIN`、`mp-toutiao / MP-TOUTIAO`、`mp-xhs / MP-XHS`；不使用未定义的mp-douyin。
- 业务域禁止平台判断；受控例外为platform端口与native UI bridge、app装配入口、manifest/pages生成、必要生成样式。`pages.json condition`只是工具启动模式。
- 包存在≠编译成功≠工具/真机可用≠支付/授权资质齐备；每平台逐关留证。不支持/未验证的能力返回明确结果，不做成功no-op。
- 微信tabBar原生文件与页面生命周期不变，抖音/小红书采用目标平台支持的方式，不能把H5专用同名组件或微信wxml直接复用。
- 登录、手机号、支付、分享、订阅、选图/相册、客服/导航、字体、震动、防截屏/人脸的能力矩阵与后端工作见实施方案第8节。
- **抖音 Profile 范围定稿（2026-09-17 主人拍板）**：抖音端＝「客片展示版」——注册 **11 页**（客片展示 9 ＋ 价目 2）/**3 tab**（`index`／`priceHomePage`／`mine`）；**不注册** AI 试衣 3 页（`aiTryOn`／`aiTryOnResult`／`aiTryOnHistory`）与 AI 推荐 3 页（`aiRecommend`／`aiRecommendLoading`／`aiRecommendResult`）。「我的」页抖音侧菜单只留「我的喜欢」（去「AI试衣」入口），顶部引导文案去「体验AI试衣」字样；价目两页**纯展示**（微信端本无下单支付能力；秘书实测两页支付关键词零命中、`payGuard`／`requestPayment` 仅在 AI 链路 4 页＋`utils/api.uts`）⇒ **抖音端零支付改造**。实现纪律：页面注册表与功能块开关由 **Profile/生成配置驱动**，不写 `#ifdef`；微信全量 17 页不受影响。提醒：「我的喜欢」`needLogin` ⇒ 抖音授权登录属 Phase 4 既定范围；协议两页保留（登录依赖协议同意＋审核通常要求隐私政策可达）。

---

## 8. Design Token 与主题

- `tokens/source.json`唯一手改来源：primitive→semantic→component。
- 生成`src/generated/tokens.ts`、`theme.css`、`theme.scss`；`uni.scss`只引入生成物。
- Wot桥接只使用锁版文档/CLI核实的变量名；不得双源手抄TS/SCSS。
- 旧端颜色、重复间距/字号、动效和safe-area是迁移输入，不按本轮未核准的“4/8/6档”猜测数字；0/100%等布局常量按白名单合理允许。
- Token生成幂等、无环/悬空引用、重复生成无diff；视觉对照保持品牌而不是顺便重设计。

---

## 9. 执行计划（按门禁，不按日期宣告完成）

完整六阶段/T0–T12任务、文件路径、输入输出、测试命令和退出条件见[实施方案](./docs/uniapp-vue3-migration-plan.md)第10节。

- 周五先固化基线/协议/Profile与版本资格，T1/T4做最小样页。
- 周六工程与Profile隔离、端口/Token、HTTP/认证打底；第一条“首页→相册→详情→返回”闭环通过再扩批。
- 周日按前置完成情况推进AI、支付、多平台provider和真机；不通过则交付已通过Gx的候选与差异账本，旧端照常服务。
- 没有新增并验证目标sourceRoot/profile/platform/artifact绑定的发布包装器前，**不得调用旧根release-trial.sh发布新工程**。
- 不允许以热修漏同步、CR红项口径争议未批准、缺平台资质为代价赶周末上线。

---

## 10. 验收标准（Definition of Done）

**A. 页面 parity 清单（旧端 17 条路径，逐条打勾）**
```
pages/index              首页（含品牌馆入口开关、门店/轮播/客片网格）
pages/brandHub           品牌馆
pages/demoDetail         相册列表页（含点赞/收藏/AI试衣入口）
pages/priceList          套餐列表
pages/priceHomePage      价目表
pages/targetPhotoDetail  照片详情（分享落地只读模式）
pages/mine               我的（登录态/菜单/退出）
pages/favorites          我的喜欢
pages/webview            通用 webview
pages/policies/user      用户协议
pages/policies/privacy   隐私政策
pages/aiTryOn            AI试衣（表单/上传/提交）
pages/aiTryOnResult      AI试衣结果（水印/下载/买断）
pages/aiTryOnHistory     AI试衣记录
pages/aiRecommend        AI推荐（提交）
pages/aiRecommendLoading AI推荐等待页
pages/aiRecommendResult  AI推荐结果（finalScore 展示）
```
**B. 组件 parity（旧端 15 个）**：AppFooter / AppInput / AppPhotoPicker / AppSegment / AppSelector / BottomActionBar / BottomActionBarSecondary / CustomNavBar / GenerationProgress / LoadingBlock / LoginPopup / PhotoGrid / ProfilePopup / ServiceContact / SkeletonBlock —— 逐个「等价实现 或 用 Wot 组件替换」并在 `docs/parity.md` 登记去向。

**C. 关键链路（两端各跑一遍）**：手机号一键登录 → 首页/门店切换 → 相册列表与详情 → AI 试衣（选图/上传/生成/结果/下载/买断） → AI 推荐（提交/等待/结果） → 点赞/收藏 → 分享卡片 → 客服入口。

**D. 工程红线**：每个目标独立记录编译/工具/真机/资质状态；小红书未过关不得宣称三端完成。业务域禁止SDK直调，受控桥接/生成配置有白名单；模板兼容版本typecheck通过；Profile/Token生成幂等、产物AppID/APP_CODE/环境/源SHA校验通过；保留受控发布入口与真实退出码，不用`--no-verify`。

**E. 真机**：微信（iOS/Android）+ 抖音（iOS/Android）各一遍，无白屏、无控制台报错。

**F. 平台范围验收（抖音＝客片展示版，2026-09-17 主人拍板）**：抖音产物页面注册表＝**11 页**（B0 协议 2 ＋ B1 首页/详情 3 ＋ B2 价目 2/我的/收藏/品牌馆/webview 6）、3 tab 不变；**B3＋B4 六页（AI 试衣/推荐）在抖音产物中不得注册**——产物校验须能断言「未注册」；「我的」页抖音 Profile 菜单仅「我的喜欢」＋退出登录；微信产物仍 17 页全量。两端产物各自通过上述注册表断言，平台范围验收才算通过。

---

## 11. 风险台账与回滚

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| **Wot UI 在抖音/小红书不兼容** | 中 | 高 | Day-0 spike；条件编译组件替换层；必要时切 uview-plus 或自研基础件 |
| **抖音支付/登录资质与流程差异** | 高 | 高 | 平台provider与账号/权益合同先冻结；无资质则阻断相应发布，不擅改免费额度/引流商业规则 |
| 抖音类目审核 | 中 | 中 | 提前准备资质材料 |
| 两天窗口不足 | 中 | 中 | **微信端保持旧端可发版**：旧端 `main` 不动，迁移只在新工程/新分支推进 |
| 组件库停更 | 低 | 中 | 锁版本 + lockfile；uview-plus 作为可切换备选 |
| **回滚** | — | — | 回到已验证旧包/兼容后端；订单/任务/存储和客户端更新延迟分别演练，不等于git revert立即生效 |

---

## 12. 附录

### A. 分支与归档现状（2026-09-15）

- **保留分支**：`main`（旧端主线）、`backup/pre-squash-20260915`（2026-09-15 提交压缩的安全网，与 Vue3 无关）。
- **归档标签**：`archive/20260915/*`（24 个），覆盖历史 feat/fix 分支；可 `git checkout -b <name> archive/20260915/<name>` 复原。
- **已删除（主人指示）**：`backup/lm-mp-uniapp-vue3_20260914`（历史 Vue3 骨架）、`feat/vue3-migration`、归档标签 `archive/20260915/backup-lm-mp-uniapp-vue3_20260914`；仓库内已无 `mp-vue3/` 引用。

### B. 命令与发布边界

官方模板初始化仍在第4节；新端的目录限定、测试脚本契约、Profile构建/上传包装器见实施方案第5/10/12节。那些脚本是未来任务产物，**当前不能当成已经实现的命令**。

禁止新工程`cd ..`后调用旧`release-trial.sh`：它按脚本父目录构建旧包。旧项目继续原脚本，新项目必须经已校验的engine/sourceRoot/profile/platform/artifact入口发布。

### C. 调研来源（2026-09-15 实测）

- Wot UI v2 官方 AI 指南：https://wot-ui.cn/guide/ai.html ｜文档索引：https://wot-ui.cn/llms.txt；HTTP 200必须核正文而非首页回退。
- Wot UI v1历史资料：https://v1.wot-ui.cn/guide/introduction.html（不以短窗口无提交推断冻结）。
- uview-plus：https://uview-plus.jiangruyi.com/
- nutui-uniapp：npm `nutui-uniapp` ｜ https://github.com/nutui-uniapp/nutui-uniapp
- 数据源：npm registry、npm downloads API、GitHub REST API（stars / pushed_at / 近 30 天提交）
- uni-app官方模板：https://uniapp.dcloud.net.cn/quickstart-cli.html ；平台包清单仅证明编译目标存在，业务资格仍需测试。

### D. 工程形态（待主人拍板）

- **默认**：新端工程与旧端同仓并存（`miniapp-vue3/` 子目录，便于逐页对照）。
- **备选**：三端验证通过后拆为独立仓库（如 `lanmei-miniapp-vue3`），旧仓转归档。

---

> 维护约定：本文件随迁移进度更新（每轮实质改动同步提交），关键结论同步登记 KB 03 分册。
