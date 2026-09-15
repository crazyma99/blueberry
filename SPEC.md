# 蓝梅旅拍小程序 · Uni-App Vue3 迁移 SPEC（迁移指南）

> 版本 **v1.0** · 生效 **2026-09-15** · 编制：公司秘书（依马老师指示）
> 目的：把 C 端小程序从 **uni-app x（uvue/UTS，仅微信）** 迁移到 **uni-app Vue3**，实现**一套代码多端**（微信 / 抖音 / 小红书，预留快手等），为抖音小程序上线让路。
> 效力：本文是**迁移期唯一执行依据**；与 `mp-vue3/docs/SPEC.md`（2026-09-12 开发纪律）并用，**冲突以本文为准**。评审按本文执行。

---

## 0. TL;DR（十条）

1. **不从零开始**：2026-09-12~09-14 已完成一轮 Vue3 迁移骨架，保存在 `backup/lm-mp-uniapp-vue3_20260914:mp-vue3/`（17 页 / 23 组件 / 9 个 api 模块·26 端点 / PlatformAdapter / H5 冒烟零错误 / mp-weixin 构建通过）。
2. **UI 组件库选 Wot UI v2（`@wot-ui/ui` 2.3.2）**——AI 友好度与维护活跃度双优（§4 有硬数据）；备选 uview-plus。
3. **迁移分支**：`feat/vue3-migration`（已从上述备份创建）。
4. **分层强制**：业务层 → 组件层 → **生态适配层**，业务层禁止 `wx.`/`tt.` 直调、禁止硬编码样式。
5. **平台差异全部收敛**到 `mp-vue3/src/common/platform/adapters/*`（微信/抖音/小红书各一个），业务代码零平台判断。
6. **design token 双源同步**：`src/uni.scss`（SCSS）↔ `src/styles/tokens.ts`（TS），同一提交。
7. **前置未就绪（阻塞项）**：抖音小程序 **AppID/类目/支付** 尚未确认（`manifest.json` 的 `mp-toutiao` 目前无 appid）——见 §3，需主人本周内推进。
8. **验收**：16 页 parity 清单 + 关键链路（登录/支付/上传/试衣/推荐/分享）+ **微信与抖音真机** + 三端构建全 DONE。
9. **最大风险**：Wot UI 与 uview-plus 官方文档**均未点名抖音/小红书**支持 ⇒ Day-0 必须做抖音 spike，并预备「条件编译替换层」逃生门（§8/§10）。
10. **可回滚**：旧端 `main`（`a125889`）与体验版 v1.0.58 原封不动，抖音上线前微信侧零影响。

---

## 1. 决策背景（为什么现在迁）

- **主人 2026-09-15 指示**：需上传**抖音小程序**；当前 uni-app x 的组件生态在抖音不可用 ⇒ 回迁 **uni-app Vue3**（KB 03 分册 §2.17.13／§2.17.12.3）。
- **方向说明（如实登记）**：DCloud 官方只有「uni-app → uni-app x」升级指南，反向回迁属逆官方路线；但**多端（抖音/小红书）是硬需求**，Vue3 生态成熟度与组件库可用性是当前最优解。
- **时间窗口**：本周末（2 天），目标「微信不回归、抖音跑起来」。

---

## 2. 现状盘点（2026-09-15 实测）

| 维度 | 旧端 uni-app x（`main@a125889`） | 新端 Vue3 骨架（`mp-vue3/`，09-14 备份） |
|---|---|---|
| 页面 | **16 页**（33 个 `.uvue`） | **17 个 `.vue`**（含 policies/webview 拆页） |
| 组件 | **15 个**（`src/components/*/*.uvue`） | **23 个 `.vue`**（Wot 二次封装 + 业务组件） |
| 工具/接口 | `src/utils/` **20 个 `.uts`**（含 api.uts） | `src/api/` **9 模块**（album/search/shops/wx/aiface/brand/interaction/packages/page-config，**26 端点契约全量复刻**） |
| 平台适配 | **无适配层**：`wx.` 直调 **9 处**、`#ifdef` **16 处**（几乎全是 `MP-WEIXIN`） | **PlatformAdapter + WeixinAdapter**（12 类能力：客服/拨号/导航/相册/复制/分享/登录/支付/防截屏/字体/选图/震动） |
| 主题 token | `App.uvue` 内 **21 个** `--color-*` + `src/uni.scss` | `src/uni.scss` + `src/styles/tokens.ts` **双源** |
| 构建 | `npm run build:mp-weixin`（uni-app x 编译器 5.08） | `pnpm build:mp-weixin` / `build:h5`（uni-app vue3 `3.0.0-5020420260813003`） |
| 验证状态 | 体验版 **v1.0.58 `[ga125889]`** 已上线；单测 41/41 | H5 16 页冒烟零错误、`build:mp-weixin` DONE、vue-tsc 零错误；**真机扫码冒烟待办** |

**差距（周末要补的）**：真机冒烟、抖音/小红书条件编译层与适配器、抖音支付/登录、Wot 组件在抖音的兼容验证、parity 清单收尾。

---

## 3. 前置条件（迁移开始前必须就绪）

| # | 事项 | 责任 | 状态 |
|---|---|---|---|
| P1 | **抖音小程序**：账号主体、**AppID**、类目资质（摄影/旅拍/生活服务）、开发者绑定 | 主人 | ⛔ **未就绪**（manifest `mp-toutiao` 无 appid） |
| P2 | 抖音**支付能力**（担保支付/虚拟支付资质）与**登录**（tt.login + 手机号）方案确认 | 主人 + 后端 | ⛔ 未确认 |
| P3 | 后端**域名白名单**：抖音要求 request/uploadFile/downloadFile 合法域名（测试 `crazyma99.xyz`、生产 `lanmei66.cloud`） | 后端 | ⚠️ 待办 |
| P4 | 微信侧保持不变（appid `wxb19ad7426dfb8bd4`，`urlCheck:false` 保持） | — | ✅ |
| P5 | **小红书**：AppID 与开放范围（DCloud 提供 `@dcloudio/uni-mp-xhs` 平台包） | 主人 | ⚠️ P2 优先级，可后置 |
| P6 | 抖音端特有：订阅消息模板、客服/拨号/导航/相册授权差异、分享入口 | 前端 | ⚠️ Day1 处理 |

---

## 4. UI 组件库选型（调研结论 · 2026-09-15 实测数据）

**选型硬指标（主人 2026-09-15 追加）**：① **AI 开发友好度**（决定 AI 协作效率）② **维护更新频率/活跃度**（决定长期可维护）③ 多端覆盖 ④ 主题/design token ⑤ 体积与生态。

### 4.1 数据对比（npm registry + GitHub API + 官方文档实测）

| 库 | npm 包 | 最新版 | 发布日期 | 版本数 | 近一周下载 | 仓库 | Stars | 最近推送 | 近 30 天提交 | AI 工具链 | `llms.txt` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Wot UI v2** ✅ | `@wot-ui/ui` | **2.3.2** | 2026-08-10 | 33 | 1,883 | `wot-ui/wot-ui` | 358 | **2026-09-15** | 16 | **LLMs.txt + MCP Server + `@wot-ui/cli` + AI Skills** | ✅ HTTP 200（6,840 B） |
| Wot UI v1 | `wot-design-uni` | 1.14.0 | 2026-01-04 | 180 | 2,378 | `Moonofweisheng/wot-design-uni` | 2,294 | 2026-08-13 | **0（v1 冻结）** | 无 | ✖ |
| uview-plus（备选） | `uview-plus` | 3.8.120 | **2026-09-07** | 293 | **5,096** | `ijry/uview-plus` | 716 | 2026-09-15 | **57** | 无 | ✖ 404 |
| nutui-uniapp | `nutui-uniapp` | 1.11.2 | 2026-03-11 | 79 | 284 | `nutui-uniapp/nutui-uniapp` | 559 | 2026-06-30 | — | 无 | ✖ |
| uv-ui | `uv-ui` | 1.0.25 | 2023-11-17 | 32 | 48 | — | — | **停更** | — | 无 | ✖ |

### 4.2 结论：**Wot UI v2（`@wot-ui/ui`）**

1. **AI 友好度（决定性指标，本项唯一满分）**：官方文档专设 AI 章节——**LLMs.txt**（实测 `https://wot-ui.cn/llms.txt` → 200/6,840 B，另有 `llms-full.txt`）、**MCP Server**、**`@wot-ui/cli`**（1.1.0，2026-08-19，含 `wot doctor` / `wot usage` / `wot lint`）、官方 **AI Skills**（`wot-ui-v2`、`create-wot-ui-theme`、`migrate-v1-to-v2`）。⇒ 与本仓既有 AI 工作流（DSH + `agent/skills/`）**无缝衔接**，AI 可直接查组件 API、生成页面、跑组件用量检查。
2. **维护活跃度**：v2 线**今日（2026-09-15）仍有推送**、近 30 天 16 次提交、44 个开放 issue 在处理、npm 33 个版本、最近发版 2026-08-10；而 v1（`wot-design-uni`）**近 30 天 0 提交＝已冻结** ⇒ **必须锁 v2 包名 `@wot-ui/ui`**，不要用 v1。
3. **主题与 token**：CSS 变量主题 + 官方 `create-wot-ui-theme` 生成**单文件主题 SCSS**（黑金 token 映射），与 §7 的双源 token 体系直接对接。
4. 其余：Vue3 + TypeScript、80+ 组件、MIT、支持暗黑模式与国际化。

### 4.3 备选与排除

- **备选（逃生门）= uview-plus**：提交最活跃（57/30 天）、周下载最高（5,096）、官方宣称兼容 nvue/鸿蒙/uni-app x；**代价**：无 AI 工具链（无 llms.txt/MCP/CLI）、基于 uView2 血统的组合式改造（官方自述"后续会陆续修复 vue3 兼容性"）。**仅在 Wot UI 多端 spike 失败时启用**。
- **排除**：nutui-uniapp（活跃度低、周下载 284、仓库近 3 个月无推送）、uv-ui（2023 年停更）、TMUI4x（仅 uni-app x，与本迁移方向冲突）。

### 4.4 ⚠️ 共同风险（必须 Day-0 验证）

- **Wot UI 官方文档只声明「支持 微信小程序、支付宝小程序、钉钉小程序、H5、APP 等」，未点名抖音/小红书**；uview-plus 亦仅笼统称"多平台"。⇒ 抖音/小红书支持**属于待验证假设，不是已知事实**。
- **对策**：Day-0 spike（§8）用抖音开发者工具跑通 `wd-*` 组件与首页；若大范围失败 → ①启用**条件编译替换层** `components/platform/{weixin,toutiao,xhs}/`（组件级覆盖，最坏自研基础件）②仍不行则切 uview-plus 重跑 spike。

---

## 5. 架构分层与解耦（强制）

**依赖方向单向**：业务层 → 组件层 → 生态适配层；**禁止反向/跨层直调**。

| 层 | 目录 | 职责 | 禁止事项 |
|---|---|---|---|
| 业务层 | `src/pages/**`、`src/api/**`、`src/stores/**` | 页面组装、业务逻辑、数据请求 | ❌ 直调平台 API（`wx.` / `tt.` / `xhs.`）❌ 硬编码颜色/字号/间距 |
| 组件层 | `src/components/**` | 基础 UI（Wot 二次封装）+ 业务组件 | ❌ 发请求（纯展示 + 事件回调）❌ 样式硬编码（只允许 token） |
| 生态适配层 | `src/common/platform/**` | `PlatformAdapter` 接口 + `WeixinAdapter`/`TtAdapter`/`XhsAdapter` | ✅ 仅此层允许条件编译 `#ifdef MP-WEIXIN/MP-TOUTIAO/MP-XHS` |

**旧 → 新 迁移映射**：

| 旧（uni-app x） | 新（uni-app Vue3） |
|---|---|
| `src/pages/*/index.uvue` | `mp-vue3/src/pages/*/index.vue` |
| `src/components/X/X.uvue` | `mp-vue3/src/components/X.vue` |
| `src/utils/api.uts` | `mp-vue3/src/api/*.ts`（按域拆分，已完成） |
| `src/utils/haptics.uts` | `common/platform`（震动能力） |
| `src/custom-tab-bar/*` | `pages.json` tabBar `custom:true` + `components/CustomTabBar.vue` |
| `#ifdef MP-WEIXIN { wx.xxx() }` | `adapters/WeixinAdapter.ts` 内实现，业务层调 `getPlatformAdapter()` |

---

## 6. 各生态条件编译层（微信 / 抖音 / 小红书）

**编译期**：uni-app 官方平台包已全部就位（`@dcloudio/uni-mp-weixin`、`uni-mp-toutiao`、`uni-mp-xhs`、`uni-mp-kuaishou` 等），构建命令 `pnpm build:mp-toutiao` / `build:mp-xhs`。
**运行期**：统一 `getPlatformAdapter()`；适配器内部用条件编译或 `uni.getSystemInfoSync().uniPlatform` 分支。

**能力差异矩阵（迁移期逐项实测填写，✅已实现 / ⚠️待适配 / ❌该端不支持）**

| 能力 | 微信 | 抖音 | 小红书 | 备注 |
|---|---|---|---|---|
| 客服（企业微信 kf-url） | ✅ WeixinAdapter | ⚠️ 无企微 ⇒ 降级提示/拨号 | ⚠️ | 微信独有，抖音需替代路径 |
| 拨号 `makePhoneCall` | ✅ | ⚠️ 待验证 | ⚠️ | |
| 导航 `openLocation` | ✅ | ⚠️ 待验证 | ⚠️ | 坐标系/权限差异 |
| 保存相册 | ✅ | ⚠️ 授权流程不同 | ⚠️ | |
| 复制文本 | ✅ | ⚠️ | ⚠️ | |
| 分享 | ✅ `onShareAppMessage`/`onShareTimeline` | ⚠️ 无朋友圈时间线，分享入口不同 | ⚠️ 能力最弱 | 分享卡片降级方案见 §9 |
| 登录 | ✅ `wx.login` | ⚠️ `tt.login` | ⚠️ | 后端需按平台换 code2session |
| 支付 | ✅ 微信小程序支付 | ⚠️ **抖音担保支付**（资质） | ⚠️ | 高风险项，见 §10 |
| 防截屏 | ✅ `setVisualEffectOnCapture` | ❌ 无 | ❌ | 抖音/小红书直接跳过 |
| 字体加载 | ✅ | ⚠️ | ⚠️ | |
| 选图/拍照 | ✅ | ⚠️ | ⚠️ | |
| 震动反馈 | ✅ | ⚠️ | ⚠️ | |

**目录约定**：`src/common/platform/PlatformAdapter.ts`（接口）+ `adapters/{Weixin,Tt,Xhs}Adapter.ts`（实现）；组件级平台覆盖放 `src/components/platform/<platform>/`（仅在差异无法收敛到适配层时使用）。

---

## 7. Design Token 与主题

- **单一事实源（双源同步，同一提交）**：`src/styles/tokens.ts`（TS 侧，供逻辑/内联样式）+ `src/uni.scss`（SCSS 侧，供样式）。
- **黑金体系**：沿用旧端色板（主色 `#F1CD91` 等；旧端 `App.uvue` 内 21 个 `--color-*` 变量为迁移输入）。
- **Wot 主题映射**：用官方 `create-wot-ui-theme` 生成**单文件主题 SCSS**，把我们 token 映射到 Wot CSS 变量；`App.vue` 仅做 `@use` 引入（遵守"单文件含 mixin 与挂载选择器"约束）。
- **Layout token**：圆角 4 档 / 间距 8 档（8rpx 基准）/ 字号 6 档 / 组件尺寸 5 项——**新增尺寸先立 token 再使用**。
- ❌ 页面与组件内**禁止硬编码**颜色、圆角、字号、间距（评审退回项）。

---

## 8. 执行计划（本周末 2 天）

**Day 0（周五晚 · 前置与 spike，最关键）**
1. **P1/P2 前置确认**（主人）：抖音 AppID、类目资质、支付能力、登录方案。
2. **抖音 spike**：`pnpm i && pnpm build:mp-toutiao` → 抖音开发者工具打开 `dist/build/mp-toutiao`，验证首页 + `wd-*` 组件 + 表单类组件（picker/popup/toast）渲染与交互。
3. **结论分叉**：spike 通过 → 按计划推进；大面积失败 → 启用 §4.4 逃生门（条件编译替换层 / 切 uview-plus）。
4. 域名白名单（P3）与抖音端客服/分享替代方案确认。

**Day 1（周六 · 主体迁移）**
5. 切换工作分支：`git checkout feat/vue3-migration`（已从备份建立）。
6. 逐页 parity 补齐：对照 `mp-vue3/docs/migration-parity.md`（旧 16 页 / 15 组件 / 全功能）；补齐清单里剩余项。
7. **实现 `TtAdapter`**：登录 / 分享 / 支付 / 客服 / 相册 / 导航（未支持项按 §6 矩阵降级）。
8. 清理业务层残留平台直调：`grep -rn "wx\." src/pages src/api` 应为 **0**；条件编译只出现在适配层。
9. **微信回归**：`build:mp-weixin` + 真机冒烟（对齐旧端行为）。

**Day 2（周日 · 多端跑通与出包）**
10. 抖音端全链路：登录 → 首页/门店 → 相册列表 → AI 试衣上传 → 生成 → 结果页 → 支付/次数 → 分享。
11. `XhsAdapter` 与 `build:mp-xhs` 构建尝试（能构建即算达标，功能差异登记）。
12. 冒烟矩阵 + 独立 CR（🔴 必须清零）+ 修 🟡。
13. 出包：**微信体验版**（沿用 `./scripts/release-trial.sh <版本> "描述"`）+ **抖音体验版**（抖音开发者工具上传）。
14. 落库：KB 03 分册 + CHANGELOG + `data/source-anchors.yaml` + 索引「最后更新」。

---

## 9. 验收标准（Definition of Done）

- [ ] **parity 清单全绿**：旧端 16 页 / 15 组件 / 全部功能逐项对照（服务保障、联系我们、版权、分享、登录、收藏、上传拦截、订阅消息等不允许遗漏）。
- [ ] **关键链路**（两端各跑一遍）：手机号一键登录 → 首页/门店切换 → 相册列表与详情 → AI 试衣（选图/上传/生成/结果/下载） → AI 推荐（提交/等待/结果） → 点赞/收藏 → 分享卡片 → 客服入口。
- [ ] **构建**：`build:mp-weixin` / `build:mp-toutiao` / `build:mp-xhs` 全部 DONE，`vue-tsc` 零错误。
- [ ] **真机**：微信（iOS/Android）+ 抖音（iOS/Android）各一遍，无白屏/无控制台报错。
- [ ] **红线**：① `.env.local` 留空自动分流，产物无硬编码地址（发布脚本已内建校验）② 业务层 `wx.`/`tt.` 直调 0 命中 ③ 无硬编码色值/尺寸 ④ 未使用 `--no-verify` 绕过校验。

---

## 10. 风险台账与回滚

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| **Wot UI 在抖音/小红书不兼容** | 中 | 高 | Day-0 spike；条件编译组件替换层；必要时切 uview-plus 或自研基础件 |
| **抖音支付/登录资质与流程差异** | 高 | 高 | 提前确认资质；支付走适配层；最坏先上线"免费次数/引导下载 App"降级版 |
| 抖音类目审核 | 中 | 中 | 提前准备资质材料与备案 |
| 两天窗口不足 | 中 | 中 | **微信端保持旧端可发版**：旧端 `main` 不动；迁移只在新分支推进 |
| 组件库已停更风险 | 低 | 中 | 锁版本 + `pnpm-lock.yaml`；uview-plus 作为可切换备选 |
| **回滚** | — | — | 旧端 uni-app x（`main@a125889`）与体验版 **v1.0.58** 原封不动；抖音未上线前微信零影响；迁移分支可随时丢弃 |

---

## 11. 附录

### A. 分支与归档（2026-09-15 已执行）

- **归档标签**：`archive/20260915/*`（**25 个**，覆盖全部历史 feat/fix 分支 + Vue3 备份 + mp-ui-branding 线），已推送 fork；**17 个远端历史分支 + 23 个本地历史分支已删除**（内容 100% 由标签保留，可随时 `git checkout -b <name> archive/20260915/<name>` 恢复）。
- **保留分支**：`main`（旧端主线，`a125889`）、`backup/pre-squash-20260915`（历史压缩安全网）、`backup/lm-mp-uniapp-vue3_20260914`（**Vue3 迁移基座**，此前仅存本地，已补推 fork）。
- **新建**：`feat/vue3-migration`（自 `backup/lm-mp-uniapp-vue3_20260914` 建立，本周末工作分支）。

### B. 命令速查

```bash
# 迁移工作分支
git checkout feat/vue3-migration && cd mp-vue3 && pnpm i

# 三端构建
pnpm build:mp-weixin   # 微信
pnpm build:mp-toutiao  # 抖音
pnpm build:mp-xhs      # 小红书
pnpm build:h5          # H5 预览（8098/8099 本地冒烟）

# 红线自查
grep -rn "wx\." src/pages src/api | wc -l        # 应为 0
grep -rn "#ifdef" src/pages src/components | wc -l # 应为 0（只允许在 common/platform）

# 出包（微信体验版）
cd .. && ./scripts/release-trial.sh <版本号> "描述"
```

### C. 调研来源（2026-09-15 实测）

- Wot UI v2 文档与 AI 能力：https://wot-ui.cn/ai/overview.html ｜ llms.txt：https://wot-ui.cn/llms.txt（HTTP 200 / 6,840 B）
- Wot UI v1（已冻结）：https://v1.wot-ui.cn/guide/introduction.html
- uview-plus：https://uview-plus.jiangruyi.com/
- nutui-uniapp：npm `nutui-uniapp`；仓库 https://github.com/nutui-uniapp/nutui-uniapp
- 数据源：npm registry（`registry.npmjs.org`）、npm downloads API、GitHub REST API（stars / pushed_at / 近 30 天提交）
- uni-app 平台包清单（抖音/小红书官方支持证据）：`@dcloudio/uni-mp-toutiao`、`@dcloudio/uni-mp-xhs`（见 `mp-vue3/package.json`）

### D. 目录形态（待主人拍板）

- **本轮方案（默认）**：沿用 `mp-vue3/` 子目录（与旧端 uni-app x 同仓并存，便于对照复刻）。
- **备选**：三端验证通过后，把 `mp-vue3/` 拆成独立仓库（`lanmei-miniapp-vue3`），旧仓转归档 —— 待迁移验收后再议。

---

> 维护约定：本文件随迁移进度更新（每轮实质改动同步提交），并在 KB 03 分册登记关键结论。
