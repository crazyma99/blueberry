# 蓝梅旅拍小程序 · Uni-App Vue3 迁移 SPEC（迁移指南）

> **版本 v2.0** · 生效 **2026-09-15** · 编制：公司秘书（依马老师指示）
> **替代 v1.0**（v1.0 以历史 Vue3 骨架为起点，已按主人 2026-09-15 指示废弃）。
> ⚠️ **口径（主人 2026-09-15 明确）**：**不使用、也不保留任何历史 Vue3 骨架与备份**（相关分支／标签／目录已全部删除）；本文只**借鉴其「解耦逻辑」**（分层架构 · 平台适配层 · token 双源），代码**从官方模板全新初始化**。
> 目的：把 C 端小程序从 **uni-app x（uvue/UTS，仅微信）** 迁移到 **uni-app Vue3**，一套代码覆盖 **微信 / 抖音 / 小红书**（预留快手等），为抖音小程序上线让路。

---

## 0. TL;DR

1. **起点＝全新工程**：用官方 uni-app Vue3 模板（Vue3 + Vite + TS）初始化，**不继承任何历史代码骨架**；旧端代码只作「行为对照物」，逐页复刻。
2. **唯一事实源＝旧端 uni-app x（`main`）**：17 个页面路径 / 15 个组件 / 20 个 `utils` 工具模块（含接口封装）——迁移清单见 §10。
3. **UI 组件库定选 Wot UI v2（`@wot-ui/ui` 2.3.2）**：AI 友好度与维护活跃度双优（§6 有硬数据）；备选 uview-plus。
4. **三层强制解耦**：业务层 → 组件层 → **生态适配层**；业务层禁止 `wx.`/`tt.` 直调、禁止硬编码样式。
5. **平台差异全部收敛**到 `src/common/platform/adapters/{Weixin,Tt,Xhs}Adapter.ts`（§7 差异矩阵）。
6. **design token 双源同步**：`src/uni.scss`（SCSS）↔ `src/styles/tokens.ts`（TS），同一次提交（§8）。
7. **前端不动后端契约**：沿用旧端 26 个接口契约（`src/utils/api.uts` 为对照），后端仅需补抖音域名白名单。
8. **前置阻塞**：抖音 **AppID / 类目资质 / 支付 / 登录** 未就绪（§3）——需主人本周内推进。
9. **最大风险**：Wot UI 与 uview-plus 官方文档**均未点名抖音/小红书** ⇒ Day-0 必须 spike 验证，并预备条件编译替换层逃生门（§6.4/§11）。
10. **可回滚**：旧端 `main` 与体验版 **v1.0.58** 原封不动；抖音上线前微信侧零影响。

---

## 1. 决策背景与口径

- **主人 2026-09-15 指示**：需上传**抖音小程序** ⇒ 当前 uni-app x 组件生态在抖音不可用 ⇒ 回迁 **uni-app Vue3**（KB 03 分册 §2.17.13／§2.17.12.3）。
- **主人同日补充口径（本文 v2.0 依据）**：**历史 Vue3 骨架不要、也不用备份**，只借鉴解耦逻辑 ⇒ 已删除：本地与远端分支 `backup/lm-mp-uniapp-vue3_20260914`、`feat/vue3-migration`，以及归档标签 `archive/20260915/backup-lm-mp-uniapp-vue3_20260914`（并执行 `git gc --prune=now`，仓库内已无 `mp-vue3` 引用）。
- **方向说明（如实登记）**：DCloud 官方只有「uni-app → uni-app x」升级指南，反向回迁属逆官方路线；但**多端（抖音/小红书）是硬需求**，Vue3 生态的组件库可用性与成熟度是当前最优解。
- **时间窗口**：本周末（2 天），目标「微信不回归、抖音跑起来」。

---

## 2. 迁移起点与现状（2026-09-15 实测）

**旧端（唯一事实源）＝`main`（uni-app x，体验版 v1.0.58 已上线）**

| 维度 | 数值 |
|---|---|
| 页面路径 | **17 条**（16 个目录，`policies` 下 2 页） |
| 组件 | **15 个**（`src/components/*`，自研） |
| 工具/接口 | `src/utils/` **20 个 `.uts`**（含 `api.uts` 接口封装、`http.uts`、`loginFlow.uts`、`payGuard.uts`、`share.uts`、`vkFace.uts` 等） |
| 源文件规模 | 33 个 `.uvue` + 21 个 `.uts` |
| 平台耦合 | `wx.` 直调 **9 处**；`#ifdef` **16 处**（几乎全是 `MP-WEIXIN`，另有 `APP-ANDROID/APP-HARMONY`） |
| 主题 | `App.uvue` 内 **21 个** `--color-*` CSS 变量 + `src/uni.scss` |
| tabBar | **3 Tab**（首页 / 价目表 / 我的），`custom: true`（`src/custom-tab-bar/*`） |
| 构建 | `npm run build:mp-weixin`（uni-app x 编译器 5.08）；出包 `./scripts/release-trial.sh` |

**新端（目标态）＝全新 uni-app Vue3 工程**（Vue3 + Vite + TS，官方模板初始化），目录建议见 §4；**与旧端同仓并存**（便于逐页对照），迁移验收后再决定是否拆分独立仓（§12-D）。

---

## 3. 前置条件（迁移开始前必须就绪）

| # | 事项 | 责任 | 状态 |
|---|---|---|---|
| P1 | **抖音小程序**：账号主体、**AppID**、类目资质（摄影/旅拍/生活服务）、开发者绑定 | 主人 | ⛔ **未就绪** |
| P2 | 抖音**支付能力**（担保支付/虚拟支付资质）与**登录**（`tt.login` + 手机号）方案 | 主人 + 后端 | ⛔ 未确认 |
| P3 | 后端**域名白名单**：抖音要求 request/uploadFile/downloadFile 合法域名（测试 `crazyma99.xyz`、生产 `lanmei66.cloud`） | 后端 | ⚠️ 待办 |
| P4 | 微信侧保持不变（appid `wxb19ad7426dfb8bd4`） | — | ✅ |
| P5 | **小红书**：AppID 与开放范围（DCloud 提供 `@dcloudio/uni-mp-xhs` 平台包） | 主人 | ⚠️ P2 优先级，可后置 |
| P6 | 抖音端特有：订阅消息模板、客服/拨号/导航/相册授权差异、分享入口 | 前端 | ⚠️ Day1 处理 |

---

## 4. 目标工程与目录结构（全新初始化）

**初始化（Day 0）**：
```bash
# 官方 Vue3 + Vite + TS 模板（新版 HBuilderX 亦可直接建项目）
npx degit dcloudio/uni-preset-vue#vite-ts miniapp-vue3 && cd miniapp-vue3 && pnpm i
# 组件库（§6 选型）
pnpm add @wot-ui/ui
```

**目录约定（分层即目录，禁止越层）**：

```
miniapp-vue3/
├─ src/
│  ├─ pages/            # 业务层：页面（17 页，对照旧端逐页复刻）
│  ├─ api/              # 业务层：接口封装（按域拆分：album/search/shops/wx/aiface/brand/interaction/packages/page-config）
│  ├─ stores/           # 业务层：跨页状态（登录态、门店上下文、AI 任务）
│  ├─ components/       # 组件层：业务组件（纯展示 + 事件，禁发请求）
│  │  └─ platform/      #   可选的平台覆盖组件（仅差异无法收敛到适配层时使用）
│  ├─ common/platform/  # 生态适配层：PlatformAdapter + adapters/{Weixin,Tt,Xhs}Adapter.ts
│  ├─ styles/tokens.ts  # design token（TS 侧）
│  ├─ uni.scss          # design token（SCSS 侧）
│  ├─ pages.json        # 路由 / tabBar(custom) / easycom(wd-*)
│  └─ manifest.json     # 各端 appid 与配置（mp-weixin / mp-toutiao / mp-xhs）
└─ docs/parity.md       # 迁移对照清单（§10），每完成一页打勾
```

---

## 5. 架构分层与解耦（强制）

**依赖方向单向**：业务层 → 组件层 → 生态适配层；**禁止反向/跨层直调**。

| 层 | 目录 | 职责 | 禁止事项 |
|---|---|---|---|
| 业务层 | `src/pages/**`、`src/api/**`、`src/stores/**` | 页面组装、业务逻辑、数据请求 | ❌ 直调平台 API（`wx.` / `tt.` / `xhs.`）❌ 硬编码颜色/字号/间距 |
| 组件层 | `src/components/**` | 基础 UI（Wot 二次封装）+ 业务组件 | ❌ 发请求；❌ 平台判断；❌ 样式硬编码 |
| 生态适配层 | `src/common/platform/**` | `PlatformAdapter` 接口 + 各端适配器 | ✅ **仅此层**允许条件编译 `#ifdef MP-WEIXIN/MP-TOUTIAO/MP-XHS` |

**PlatformAdapter 能力清单（12 类，接口先冻结、各端按需实现）**：
客服 · 拨号 · 导航 · 保存相册 · 复制文本 · 分享 · 登录 · 支付 · 防截屏 · 加载字体 · 选图/拍照 · 震动反馈

**旧 → 新 迁移映射**：

| 旧（uni-app x） | 新（uni-app Vue3） |
|---|---|
| `src/pages/*/index.uvue` | `src/pages/*/index.vue` |
| `src/components/X/X.uvue` | `src/components/X.vue`（能换 Wot 组件的先换，再自研） |
| `src/utils/api.uts` | `src/api/*.ts`（按域拆分，契约字段保持一致） |
| `src/utils/haptics.uts` | 适配层的 `haptic()` 能力 |
| `src/custom-tab-bar/*` | `pages.json` tabBar `custom:true` + 自研 `CustomTabBar.vue` |
| `#ifdef MP-WEIXIN { wx.xxx() }` | `adapters/WeixinAdapter.ts` 内实现，业务层调 `getPlatformAdapter()` |

---

## 6. UI 组件库选型（调研结论 · 2026-09-15 实测）

**选型硬指标（主人指定）**：① **AI 开发友好度** ② **维护更新频率/活跃度** ③ 多端覆盖 ④ 主题/design token ⑤ 体积与生态。

### 6.1 数据对比（npm registry + GitHub API + 官方文档实测）

| 库 | npm 包 | 最新版 | 发布日期 | 版本数 | 近一周下载 | 仓库 | Stars | 最近推送 | 近 30 天提交 | AI 工具链 | `llms.txt` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Wot UI v2** ✅ | `@wot-ui/ui` | **2.3.2** | 2026-08-10 | 33 | 1,883 | `wot-ui/wot-ui` | 358 | **2026-09-15** | 16 | **LLMs.txt + MCP Server + `@wot-ui/cli` + AI Skills** | ✅ 200（6,840 B） |
| Wot UI v1 | `wot-design-uni` | 1.14.0 | 2026-01-04 | 180 | 2,378 | `Moonofweisheng/wot-design-uni` | 2,294 | 2026-08-13 | **0（v1 冻结）** | 无 | ✖ |
| uview-plus（备选） | `uview-plus` | 3.8.120 | **2026-09-07** | 293 | **5,096** | `ijry/uview-plus` | 716 | 2026-09-15 | **57** | 无 | ✖ 404 |
| nutui-uniapp | `nutui-uniapp` | 1.11.2 | 2026-03-11 | 79 | 284 | `nutui-uniapp/nutui-uniapp` | 559 | 2026-06-30 | — | 无 | ✖ |
| uv-ui | `uv-ui` | 1.0.25 | 2023-11-17 | 32 | 48 | — | — | **停更** | — | 无 | ✖ |

### 6.2 结论：**Wot UI v2（`@wot-ui/ui`）**

1. **AI 友好度（决定性）**：官方专设 AI 支持——**LLMs.txt**（`https://wot-ui.cn/llms.txt` 实测 **200 / 6,840 B**，另有 `llms-full.txt`）、**MCP Server**、**`@wot-ui/cli`**（1.1.0／2026-08-19，含 `wot doctor`、`wot usage`、`wot lint`）、官方 **AI Skills**（`wot-ui-v2`、`create-wot-ui-theme`、`migrate-v1-to-v2`）⇒ AI 可直接查 API、生成页面、做组件用量与空按钮检查，与本仓既有 AI 工作流衔接。
2. **维护活跃**：v2 线**当日（2026-09-15）仍有推送**、近 30 天 16 次提交、npm 33 个版本、最近发版 2026-08-10；**v1 已冻结（30 天 0 提交）** ⇒ **必须锁 v2 包名 `@wot-ui/ui`**。
3. **主题/token**：CSS 变量主题 + 官方 `create-wot-ui-theme` 生成**单文件主题 SCSS**（把我们的黑金 token 映射到 Wot 变量），与 §8 双源 token 直接对接。
4. 其余：Vue3 + TypeScript、80+ 组件、MIT、暗黑模式与国际化。

### 6.3 备选与排除

- **备选（逃生门）＝ uview-plus**：提交最活跃（57/30 天）、周下载最高（5,096）；**代价**：无 AI 工具链（无 llms.txt/MCP/CLI）、基于 uView2 的组合式改造仍在推进。**仅在 Wot UI 多端 spike 失败时启用**。
- **排除**：nutui-uniapp（活跃度低、周下载 284）、uv-ui（2023 停更）、TMUI4x（仅 uni-app x，与迁移方向冲突）。

### 6.4 ⚠️ 共同风险（必须 Day-0 验证）

**Wot UI 与 uview-plus 官方文档均只笼统声明「多平台」，未点名抖音/小红书** ⇒ 抖音/小红书可用性属**待验证假设**。对策：Day-0 spike（抖音开发者工具跑通 `wd-*` 与首页）→ 失败则 ①启用 `components/platform/{toutiao,xhs}/` 条件编译替换层（最坏自研基础件）②仍不行则切 uview-plus 重跑 spike。

---

## 7. 各生态条件编译层（微信 / 抖音 / 小红书）

- **编译期**：`#ifdef MP-WEIXIN / MP-TOUTIAO / MP-XHS`（uni-app 官方平台包：`@dcloudio/uni-mp-weixin`、`uni-mp-toutiao`、`uni-mp-xhs`、`uni-mp-kuaishou`）；构建 `pnpm build:mp-toutiao` / `build:mp-xhs`。
- **运行期**：业务层只调 `getPlatformAdapter()`；适配器内部用条件编译或 `uni.getSystemInfoSync().uniPlatform` 分支。
- **红线**：`#ifdef` **只允许出现在 `src/common/platform/**`**；`src/pages/**`、`src/components/**` 中命中 `#ifdef` 或 `wx.`/`tt.` 即评审退回。

**能力差异矩阵（迁移期逐项实测填写）**

| 能力 | 微信 | 抖音 | 小红书 | 备注 |
|---|---|---|---|---|
| 客服（企业微信 kf-url） | ✅ | ⚠️ 无企微 ⇒ 降级（拨号/提示） | ⚠️ | 微信独有 |
| 拨号 `makePhoneCall` | ✅ | ⚠️ 待验证 | ⚠️ | |
| 导航 `openLocation` | ✅ | ⚠️ 待验证 | ⚠️ | 坐标系/权限差异 |
| 保存相册 | ✅ | ⚠️ 授权流程不同 | ⚠️ | |
| 复制文本 | ✅ | ⚠️ | ⚠️ | |
| 分享 | ✅ `onShareAppMessage`/`onShareTimeline` | ⚠️ 无朋友圈时间线 | ⚠️ 能力最弱 | 分享卡片需降级方案 |
| 登录 | ✅ `wx.login` | ⚠️ `tt.login` | ⚠️ | 后端按平台换 code2session |
| 支付 | ✅ 微信小程序支付 | ⚠️ **抖音担保支付**（资质） | ⚠️ | 高风险项（§11） |
| 防截屏 | ✅ `setVisualEffectOnCapture` | ❌ 无 | ❌ | 直接跳过 |
| 加载字体 | ✅ | ⚠️ | ⚠️ | |
| 选图/拍照 | ✅ | ⚠️ | ⚠️ | |
| 震动反馈 | ✅ | ⚠️ | ⚠️ | |

---

## 8. Design Token 与主题

- **双源同步（同一提交）**：`src/styles/tokens.ts`（TS 侧，供逻辑/内联样式）↔ `src/uni.scss`（SCSS 侧，供样式）。
- **黑金体系**：迁移输入＝旧端 `App.uvue` 内 **21 个 `--color-*` 变量** + `src/uni.scss`；主色 `#F1CD91`，深色底 `#160F04` 等（以旧端为准，逐项登记成 token 表）。
- **Wot 映射**：用官方 `create-wot-ui-theme` 生成**单文件主题 SCSS**，把我们的 token 映射到 Wot CSS 变量；`App.vue` 只做 `@use` 引入。
- **Layout token**：圆角 4 档 / 间距 8 档（8rpx 基准）/ 字号 6 档 / 组件尺寸 5 项——**新增尺寸先立 token 再使用**。
- ❌ 页面与组件内**禁止硬编码**颜色、圆角、字号、间距（评审退回项）。

---

## 9. 执行计划（本周末 2 天）

**Day 0（周五晚 · 初始化与 spike，最关键）**
1. 主人确认 **P1/P2**（抖音 AppID、类目资质、支付、登录）。
2. **初始化工程**（§4）：官方 Vue3 模板 + `pnpm i` + 接入 `@wot-ui/ui` + easycom 规则 + 主题（§8）。
3. **抖音 spike**：`pnpm build:mp-toutiao` → 抖音开发者工具打开，跑通首页与 `wd-*` 表单/弹层类组件。
4. **结论分叉**：通过 → 按计划推进；大面积失败 → 启用 §6.4 逃生门（替换层 / 切 uview-plus）。
5. 抖音域名白名单（P3）与客服/分享替代方案确认。

**Day 1（周六 · 骨架与主体页面）**
6. 建骨架：`pages.json`（17 页路由 + 3 Tab custom）、`PlatformAdapter` 接口 + `WeixinAdapter`、`src/api/**`（对照 `src/utils/api.uts` 逐接口复刻）、token 双源、`CustomNavBar`/`CustomTabBar`。
7. 逐页迁移（对照 `docs/parity.md`）：首页 → 相册列表/详情 → 门店 → 价目表 → 我的 → 收藏 → 品牌馆 → 政策页/webview。
8. **实现 `TtAdapter`**：登录 / 分享 / 支付 / 客服 / 相册 / 导航（未支持项按 §7 矩阵降级）。
9. **微信回归**：`build:mp-weixin` + 真机冒烟，逐项对齐旧端行为。

**Day 2（周日 · AI 链路、多端跑通与出包）**
10. AI 试衣链路（上传/生成/结果/下载/买断）与 AI 推荐链路（提交/等待/结果）迁移。
11. 抖音端全链路联调（登录 → 首页/门店 → 相册 → 试衣上传 → 生成 → 结果 → 支付/次数 → 分享）。
12. `XhsAdapter` 与 `build:mp-xhs` 构建尝试（能构建即达标，功能差异登记）。
13. 冒烟矩阵 + **独立 CR（🔴 清零）** + 修 🟡。
14. 出包：微信体验版（`./scripts/release-trial.sh <版本> "描述"`）+ 抖音体验版（抖音开发者工具上传）。
15. 落库：KB 03 分册 + CHANGELOG + `data/source-anchors.yaml` + 索引「最后更新」。

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

**D. 工程红线**：三端构建（`mp-weixin`/`mp-toutiao`/`mp-xhs`）全 DONE、`vue-tsc` 零错误；① `src/pages`+`src/components` 中 `#ifdef` 与 `wx.`/`tt.` **0 命中** ② 无硬编码色值/尺寸 ③ `.env.local` 留空自动分流、产物无硬编码地址 ④ 未用 `--no-verify` 绕过校验。

**E. 真机**：微信（iOS/Android）+ 抖音（iOS/Android）各一遍，无白屏、无控制台报错。

---

## 11. 风险台账与回滚

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| **Wot UI 在抖音/小红书不兼容** | 中 | 高 | Day-0 spike；条件编译组件替换层；必要时切 uview-plus 或自研基础件 |
| **抖音支付/登录资质与流程差异** | 高 | 高 | 提前确认资质；支付走适配层；最坏先上「免费次数/引导」降级版 |
| 抖音类目审核 | 中 | 中 | 提前准备资质材料 |
| 两天窗口不足 | 中 | 中 | **微信端保持旧端可发版**：旧端 `main` 不动，迁移只在新工程/新分支推进 |
| 组件库停更 | 低 | 中 | 锁版本 + lockfile；uview-plus 作为可切换备选 |
| **回滚** | — | — | 旧端 uni-app x（`main`）与体验版 **v1.0.58** 原封不动；新工程可整体丢弃 |

---

## 12. 附录

### A. 分支与归档现状（2026-09-15）

- **保留分支**：`main`（旧端主线）、`backup/pre-squash-20260915`（2026-09-15 提交压缩的安全网，与 Vue3 无关）。
- **归档标签**：`archive/20260915/*`（24 个），覆盖历史 feat/fix 分支；可 `git checkout -b <name> archive/20260915/<name>` 复原。
- **已删除（主人指示）**：`backup/lm-mp-uniapp-vue3_20260914`（历史 Vue3 骨架）、`feat/vue3-migration`、归档标签 `archive/20260915/backup-lm-mp-uniapp-vue3_20260914`；仓库内已无 `mp-vue3/` 引用。

### B. 命令速查

```bash
# 新建新端工程（§4）
npx degit dcloudio/uni-preset-vue#vite-ts miniapp-vue3 && cd miniapp-vue3 && pnpm i && pnpm add @wot-ui/ui

# 三端构建与预览
pnpm build:mp-weixin   # 微信
pnpm build:mp-toutiao  # 抖音
pnpm build:mp-xhs      # 小红书
pnpm dev:h5            # H5 预览（本地冒烟）

# 解耦红线自查
grep -rn "#ifdef" src/pages src/components | wc -l   # 应为 0（只允许在 common/platform）
grep -rn "\bwx\." src/pages src/components src/api | wc -l  # 应为 0

# 微信体验版出包（旧端脚本沿用）
cd .. && ./scripts/release-trial.sh <版本号> "描述"
```

### C. 调研来源（2026-09-15 实测）

- Wot UI v2 文档 / AI 能力：https://wot-ui.cn/ai/overview.html ｜ `llms.txt`：https://wot-ui.cn/llms.txt（HTTP 200 / 6,840 B）
- Wot UI v1（已冻结）：https://v1.wot-ui.cn/guide/introduction.html
- uview-plus：https://uview-plus.jiangruyi.com/
- nutui-uniapp：npm `nutui-uniapp` ｜ https://github.com/nutui-uniapp/nutui-uniapp
- 数据源：npm registry、npm downloads API、GitHub REST API（stars / pushed_at / 近 30 天提交）
- uni-app 平台包（抖音/小红书官方支持的证据）：`@dcloudio/uni-mp-toutiao`、`@dcloudio/uni-mp-xhs`

### D. 工程形态（待主人拍板）

- **默认**：新端工程与旧端同仓并存（`miniapp-vue3/` 子目录，便于逐页对照）。
- **备选**：三端验证通过后拆为独立仓库（如 `lanmei-miniapp-vue3`），旧仓转归档。

---

> 维护约定：本文件随迁移进度更新（每轮实质改动同步提交），关键结论同步登记 KB 03 分册。
