# Wot UI AI 能力接入指南（蓝梅旅拍小程序 · uni-app Vue3）

> **版本 v1.0** · 2026-09-15 · 编制：公司秘书（依马老师指示）
> 官方依据：**https://wot-ui.cn/guide/ai.html**（AI 使用指南）；本文所有命令与链接均于 **2026-09-15 本机实跑/实测**，非转述。
> 适用：迁移到 uni-app Vue3 后的新端工程（组件库选型见 `SPEC.md` §6，结论＝Wot UI v2 `@wot-ui/ui` 2.3.2）。

---

## 0. 为什么需要这份指南

AI 写页面最大的风险是**凭空编造组件 API**。Wot UI 官方提供四件套，把「组件清单 / props / events / slots / CSS 变量 / Demo 源码」变成 **AI 可直接检索的事实源**：

| 能力 | 提供内容 | 我们是否采用 |
|---|---|---|
| **LLMs.txt** | 面向 AI 的文档入口、组件索引与结构化链接（每页可单独抓 .md） | ✅ 必装 |
| **@wot-ui/cli** | 离线组件元数据、API 查询、Demo 查询、CSS 变量查询 | ✅ 必装（并纳入提交前检查） |
| **MCP Server**（`wot mcp`） | 通过 MCP tools 暴露组件知识库 | ✅ 推荐（DSH / Cursor 可接） |
| **AI Skills** | 面向 Agent 的任务说明、约束与最佳实践 | ✅ 必装（放 `agent/skills/`） |

## 1. 四种接入方式（官方对照 + 适用场景）

| 场景 | 推荐能力 | 适合工具 |
|---|---|---|
| 让 AI 读取完整文档 | LLMs.txt | Cursor、TRAE、支持 URL 文档摄取的工具 |
| 查询组件 API、Demo 和 CSS 变量 | `@wot-ui/cli` | 终端、脚本、Agent 工具调用 |
| 在 AI 客户端中调用组件知识库 | MCP Server | 支持 MCP 的编辑器与 Agent 客户端 |
| 让 Agent 按 Wot UI 规范完成开发任务 | AI Skills | Cursor、TRAE、Cline、Codex 等 |

## 2. LLMs.txt —— 让 AI 读懂组件文档

- **入口（实测 HTTP 200 / 6,840 B）**：`https://wot-ui.cn/llms.txt`
- **全文版（更长上下文时用）**：`https://wot-ui.cn/llms-full.txt`
- **结构**：Markdown 目录 + 组件索引，**每一项都指向可单独抓取的 `.md`**，例如：
  - `https://wot-ui.cn/guide/ai.md`（本页的 AI 优化版）
  - `https://wot-ui.cn/component/button.md`（按钮组件文档）
  - `https://wot-ui.cn/guide/open-wot.md`（CLI 文档）

**三种用法**：① 把 `llms.txt` 加入 AI 工具的文档集/知识库；② 让 Agent 直接 fetch 该 URL；③ 讨论某个组件时，**只抓它那一页 `.md`**（省 token、避免噪音）。

**我们的约定**：写任何组件代码前，先让 AI 读该组件对应的 `.md`（或走 CLI 的 `wot info`），**禁止凭记忆写 props**。

## 3. @wot-ui/cli —— 离线组件元数据 + 提交前检查

```bash
npm install -g @wot-ui/cli        # 全局（临时用）
pnpm add -D @wot-ui/cli          # 项目内（推荐：锁版本，随 lockfile 提交）```


### 3.1 命令清单（实测 `wot --help`，CLI **1.1.0**）

| 命令 | 用途 |
|---|---|
| `wot list [keyword]` | 列出组件（含 `wd-*` 标签名与一句话描述） |
| `wot info <component>` | 输出组件 **props / events / slots / CSS 变量** |
| `wot doc <component>` | 打印组件 Markdown 文档 |
| `wot demo <component> [name]` | 打印官方 Demo 源码 |
| `wot token [component]` | 查询组件 **CSS 变量**（对接我们的 design token） |
| `wot changelog [versionOrComponent] [component]` | 查看变更记录 |
| `wot doctor [dir]` | **工程体检**（依赖/配置/接入是否健康） |
| `wot usage [dir]` | 统计项目里 `wd-*` 组件用量 |
| `wot lint [dir]` | **用法检查**（未知组件、空按钮等） |
| `wot mcp <子命令>` | 启动/管理 MCP Server |
| `wot agent <子命令>` | 一键把 **MCP + Skill + 说明**接入 AI 客户端 |

> `doctor` / `usage` / `lint` 均支持 `--format text|json|markdown` 与 `--version <版本>`（钉住目标版本）。

### 3.2 实测示例（2026-09-15 本机真实输出）

```bash
$ wot list
- ActionSheet 动作面板 (wd-action-sheet): 从底部弹出的动作菜单面板。
- Avatar 头像 (wd-avatar): 用来代表用户或事物，支持图片、文本或图标展示。

$ wot info Button
Button 按钮 (wd-button)
按钮用于触发一个操作，如提交表单或打开链接。
Props:
- type: string = primary | 按钮类型，可选值为 primary、success、info、warning、danger
- variant: string = base | 按钮变体，可选值为 base、plain、dashed、soft、subtle、text
- size: string = medium | 按钮尺寸，可选值为 mini、small、medium、large
- round: boolean = false | 圆角按钮
...```


> 提示：在**尚未接入 wot-ui 的目录**里运行会提示 `[wot] Version not detected in project, falling back to 2.3.2`——属正常回退，工程内装好后会读到项目版本。

### 3.3 纳入提交前检查（建议加入 CR / CI）

```bash
wot doctor --format text      # 工程体检
wot lint --format json        # 用法检查（可机读）
wot usage --format markdown   # 组件用量报表（评审用）```


## 4. MCP Server —— 让 AI 直接调用组件知识库

```bash
wot mcp serve        # 显式启动 MCP server
wot mcp              # 进入管理子命令：serve / init / list / status / remove / doctor```


**客户端配置（官方示例）**：

```json
{
  "mcpServers": {
    "wot-ui": {
      "command": "wot",
      "args": ["mcp"]
    }
  }
}```


**一键接入（实测 `wot mcp init --help`，CLI 1.1.0）**：

```bash
wot mcp init --dry-run                              # 先预览，不写文件
wot mcp init --client auto --scope project -y       # 自动识别客户端并写入项目配置
wot mcp list                                        # 看支持/检测到的客户端
wot mcp doctor                                      # 校验配置并做一次真实 MCP 握手
wot agent init                                      # MCP + Skill + Agent 说明 一次接好```


`--client` 可选：`auto | all | claude | cursor | vscode | codex | opencode | antigravity`。

## 5. AI Skills —— 让 Agent 按 Wot UI 规范干活

```bash
pnpm dlx skills add wot-ui/open-wot     # 官方安装方式（按需勾选）```


官方 Skills（与迁移最相关）：

| Skill | 作用 |
|---|---|
| `wot-ui-v2` | 组件选型 / API 查询 / 页面生成 / 常见坑位排查（**核心，必装**） |
| `create-wot-ui-theme` | 生成品牌主题（**我们的黑金 token 就靠它**） |
| `migrate-v1-to-v2` | 仅在从 v1 迁到 v2 时使用 |

**我们的约定**：Skills 与代码同仓维护（放 `agent/skills/`，随提交入库）；**每个开发任务开始前先读对应 `SKILL.md`**；主题相关改动必须走 `create-wot-ui-theme`，保证「单文件主题 SCSS ↔ 双源 token」同源（见 SPEC §8）。

## 6. 新端工程落地清单（DoD 勾选）

- [ ] `pnpm add -D @wot-ui/cli`（锁版本，随 lockfile 提交）
- [ ] AI 工具接入 `llms.txt`（DSH / Cursor / TRAE）
- [ ] MCP 配好：`wot mcp init` → `wot mcp doctor` 握手通过
- [ ] `agent/skills/` 放入 `wot-ui-v2` 与 `create-wot-ui-theme`
- [ ] CR 流程纳入 `wot doctor` / `wot lint` / `wot usage`
- [ ] 主题由 `create-wot-ui-theme` 生成，映射 SPEC §8 的双源 token

## 7. 验证记录（2026-09-15 本机实测，可复算）

| 项 | 结果 |
|---|---|
| `https://wot-ui.cn/llms.txt` | **HTTP 200 / 6,840 B**（Markdown 目录 + 逐页 `.md` 链接） |
| `@wot-ui/cli` | **1.1.0**（npm 发布 2026-08-19）；`--help` 实跑列出 **11 条命令** |
| `wot list` | ✅ 实跑成功，返回 `wd-*` 组件清单与描述 |
| `wot info Button` | ✅ 实跑成功，返回 props 列表（type/variant/size/round/hairline/block/loading/text…） |
| `wot mcp init --help` | ✅ 支持 `auto/all/claude/cursor/vscode/codex/opencode/antigravity` |
| `wot agent --help` | ✅ `init / list / status / doctor / remove` |
| `wot mcp --help` | ✅ `serve / init / list / status / remove / doctor` |

## 8. 参考链接

- **官方 AI 使用指南（本文依据）**：https://wot-ui.cn/guide/ai.html
- LLMs.txt：https://wot-ui.cn/llms.txt ｜ 全文版：https://wot-ui.cn/llms-full.txt
- AI 总览：https://wot-ui.cn/ai/overview.html
- CLI 文档：https://wot-ui.cn/guide/open-wot.md
- 组件文档示例（可按名替换）：https://wot-ui.cn/component/button.md
- 选型依据与迁移计划：本仓 `SPEC.md`（§6 组件库选型 / §8 design token / §9 执行计划）

---

> 维护约定：Wot UI 升级或 CLI 命令变化时同步更新本文，并在 KB 03 分册登记。
