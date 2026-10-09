# 多端兼容与开发工序 SPEC（v1.0）

> **适用**：`miniapp-vue3/`（新端，uni-app x → 微信／抖音／小红书）
> **地位**：**强制**。本文件是多端兼容与开发工序的**唯一权威**；仓库根 `AGENTS.md` 的红线指向本文件。
> **强制手段**：静态守卫（`vitest run tests/pipeline`）＋ 构建门（CI `migration-ci.yml`）＋ 提交 `Compat:` trailer。
> **原则：一切平台差异都必须"看得见、可校验、有兜底"；未登记即失败。**

---

## 一、三端与唯一事实源

| 端 | uni 平台 id | 现状 |
|---|---|---|
| 微信 | `mp-weixin` | 已上线（体验版） |
| 抖音 | `mp-toutiao` | 已上线（体验版） |
| 小红书 | `mp-xhs` | **待开发**（构建门已开，产物需可编译） |

**唯一事实源**：`src/ports/context.ts` 的 `PLATFORMS` 闭集。**新增端必须先改这里**，并同步本 SPEC 的表格与 `PORT_MATRIX`。

---

## 二、四条结构纪律（不可协商）

1. **平台 API 只许出现在 `src/platform/**`、`src/ui/**`、`src/generated/**`**
   其余层一律经 `src/ports/**` 抽象。**绕过形态同等禁止**：`globalThis.wx`／`const w = wx` 别名／`const { request } = uni` 解构／`wx["request"]` 方括号。
2. **逻辑层（`.ts`）零 `#ifdef`**
   平台分支一律做成**运行时可判定结构**（`src/ui/ui-platform.ts`：`detectUiPlatform()`／`isToutiaoPlatform()`）。
   理由（migration §8.12）：**vitest 只用纯 `@vitejs/plugin-vue`，不处理 uni 的条件编译** ⇒ 写在逻辑层里的 `#ifdef` **测试永远覆盖不到**、且只能承载唯一逻辑时必然漏端。
   ⇒ `#ifdef` **只允许出现在模板／样式／配置**，且**不得承载唯一逻辑**（必须有兜底或登记）。
3. **禁止为平台分叉写两套文件**
   样式差异走「运行时判定 ＋ 挂修饰类（`-tt` 后缀）」；wxss/ttss 编译**同一份 CSS**，微信端不挂类即不命中。
4. **例外必须显式登记，且带理由**
   任何无法满足 ①②③ 的写法，必须在登记表里写「文件 ＋ 规则 ＋ 理由 ＋ 影响端 ＋ 兜底」；**未登记 = 失败**（不是警告）。

---

## 三、每次改动的「兼容性评估」5 问（必须答完，进 `Compat:` trailer）

| # | 问题 | 取值 |
|---|---|---|
| 1 | **影响端** | `wx`／`tt`／`xhs`（多选；全选＝三端） |
| 2 | **是否触及平台 API 或端口契约** | `yes`／`no`。`yes` ⇒ 必须落在 `src/platform/**` 并登记，或改 `ports/**` 并同步 `PORT_MATRIX` |
| 3 | **各端兜底** | `n/a`，或逐端写"不支持时用户看到什么"（**不接受"没实现"这种空话**） |
| 4 | **实测端** | 这次实际在哪个端验过（模拟器／真机；**跨端改动不允许只测一端**） |
| 5 | **登记落点** | `ports-matrix`／`compat-decl`／`deviations#N`／`n/a` |

---

## 四、变更级载体：`Compat:` trailer（提交必填一行）

```
Compat: ends=wx,tt | platform-api=no | fallback=n/a | tested=wx,tt | spec=n/a
```

- `ends`：影响端；`platform-api`：`yes`/`no`；`fallback`：兜底摘要（无则 `n/a`）；
  `tested`：实测端；`spec`：登记落点（`ports-matrix`/`compat-decl`/`deviations#N`/`n/a`）。
- **门**：CI 校验——diff 触及 `miniapp-vue3/src/**` 而最新提交**无** `Compat:` 行 ⇒ **失败**并打印模板。
  - ⚠️ **当前状态（2026-10-09）**：CI 步骤**尚未落地**——本机 `gh` token **缺 `workflow` scope**，GitHub 直接拒收 `.github/workflows/**` 的推送（实测 `remote rejected … without 'workflow' scope`）。**开通方式**：`gh auth refresh -s workflow`（需主人完成一次授权）后补该步骤；**在此之前以「提交前自查」执行**（人工核对 trailer 是否存在）。
- 为什么用 trailer 而不是 PR 模板：本仓是**直推分支**工作流（CI `on.push.branches=[feat/vue3-migration]`），**没有 PR 强制点**；trailer 对直推同样有效、零成本、机器可判。

---

## 五、强制工序（9 步，顺序不可换）

| # | 步骤 | 产出物 | 机器门 |
|---|---|---|---|
| 1 | **`git pull` 拉最新分支** | 干净工作树、与远端 0/0 | —— |
| 2 | **准备改代码**：读本 SPEC ＋ 4 问兼容性草案 | 评估 5 问草稿 | —— |
| 3 | **修改** | 代码（平台差异只落 `platform/**`；逻辑层零 `#ifdef`） | 静态守卫 `vitest run tests/pipeline` |
| 4 | **单元测试** | `vitest run` 全绿 ＋ `vue-tsc` 0；**新增守卫必须做变异自证**（撤掉即红） | ✅ |
| 5 | **独立 CR** | 独立子会话**对抗式**评审：🔴/🟡 清单 ＋ 逐条处置回执 | —— |
| 6 | **完成交付** | 构建产物 ＋ 审核清单（放主人可见处）；**此时不 commit** | 三端构建 wx/tt/xhs ＋ 合成 Profile 端到端 |
| 7 | **主人开发版测试** | 主人导入产物实测 | —— |
| 8 | **主人回执通过** | 主人明确「提交」（有 BUG ⇒ 回第 3 步重走） | —— |
| 9 | **`commit` ＋ `push`** | 提交带 `Compat:` trailer；**不同批次分次提交、不混** | CI 全绿 |

> ⚠️ **第 6→9 之间不提交**是硬要求：产物在主人手里回归，git 历史保持"每个提交都是验过的"。
> ⚠️ **不擅自 commit / push**；不跳过第 5 步（独立 CR）；不跳过第 8 步（主人回执）。

---

## 六、机器门清单（跑在哪／失败怎么办）

| 规则 | 门 | 位置 | 失败处置 |
|---|---|---|---|
| C1 平台 API 白名单 ＋ 绕过形态 | vitest | `tests/pipeline/scan-platform-usage.spec.ts` | 下沉到 `ports/platform`，或登记例外 |
| C2 配置文件宏登记 ＋ 配对 | vitest | 同上（`scanConfigPlatformUsage`） | 修宏名／补 `#endif` |
| **C3 逻辑层零 `#ifdef`** | vitest | 本 SPEC 附带的 `tests/pipeline/compat-guard.spec.ts` | 改运行时可判定（`ui-platform.ts`） |
| **C4 `#ifdef` 无兜底必须登记** | vitest | 同上 | 加 `#else` 兜底，或登记 `COMPAT_DECLARATIONS` |
| **C5 端口 × 端 矩阵齐全** | vitest | 同上 | 在 `PORT_MATRIX` 补该端状态（`impl`/`unsupported(理由)`/`todo(issue)`） |
| **C6 平台目录登记** | vitest | 同上 | 登记新端目录 |
| B1 三端构建 | CI | `migration-ci.yml` `new-end-suite` | 修编译错误（**xhs 也须可编译**） |
| B2 合成 Profile 端到端（锁抖音裁剪/appid/tt 前缀/跨品牌残留） | CI | 同上（`node scripts/e2e-build.mjs mp-toutiao both`） | 修平台作用域声明 |
| **B3 `Compat:` trailer** | CI（**步骤待补：需 `workflow` scope**） | 同上 | 用 `git commit --amend` 补 trailer |
| B4 旧端 `src/` 禁改（迁移期） | CI | `old-end-regression` | 回退对旧端的改动 |

---

## 七、登记表的写法（两处，都在 `scripts/scan-platform-usage.mjs` 内导出，便于守卫复用）

**① `COMPAT_DECLARATIONS`（条件编译声明）**——每个**无 `#else` 兜底**的 `#ifdef` 都要有一条：

```js
{ file: "src/pages.json", macro: "MP-WEIXIN", lines: "12,25,…", ends: ["tt","xhs"],
  reason: "抖音/小红书侧 AI 六页**不注册**（2026-09-17 主人拍板）；入口在两端亦不下发 ⇒ 用户看不到该入口，无功能缺口" }
```

**② `PORT_MATRIX`（端口 × 端 矩阵）**——`src/ports/*.ts` **每个文件**都要有一条，且**三端齐全**：

```js
{ port: "src/ports/upload.ts",
  wx:  { status: "impl", at: "src/platform/uni/upload.ts" },
  tt:  { status: "impl", at: "src/platform/uni/upload.ts" },
  xhs: { status: "todo", issue: "#待登记" } }
```

- `status` 只允许：`impl`（并给 `at` 实现位置）／`unsupported`（**必须给 `reason`：该端用户看到什么**）／`todo`（**必须给 `issue`**）。
- 新增端口文件或新增端 ⇒ 矩阵必须同步，否则 C5 红。

---

## 八、存量（grandfather）与新账

- 本 SPEC 生效时**存量已逐条登记**（见 `COMPAT_DECLARATIONS` / `PORT_MATRIX` 现有条目）；守卫对**存量**以登记为准、对**新增/修改**从严。
- **存量清单以守卫实测为准**：`vitest run tests/pipeline/compat-guard.spec.ts` 会打印未登记项。
- 新账：任何**新增**的 `#ifdef`、**新增**的端口文件、**新增**的 `platform/<端>/` 目录，缺登记即失败。

---

## 九、变更记录

| 版本 | 日期 | 变更 | 依据 |
|---|---|---|---|
| v1.0 | 2026-10-09 | 首版：四条结构纪律 ＋ 兼容性评估 5 问 ＋ `Compat:` trailer ＋ 9 步强制工序 ＋ 机器门 C1–C6/B1–B4 | 主人 2026-10-09 指示「小程序侧适配多端，所有改动都要做兼容性评估；把这套流程做成硬 SPEC」；既有纪律见 `src/ui/ui-platform.ts` §8.12 与 `tests/pipeline/scan-platform-usage.spec.ts`（P4-12） |
