# Wot UI AI 能力接入指南（蓝梅旅拍小程序 · uni-app Vue3）

> **版本 v1.1** · 更新2026-09-15 · 编制：公司秘书（依马老师指示）
> **执行细化**：[重构迁移实施方案](./uniapp-vue3-migration-plan.md)第6.3节规定项目级锁版、MCP授权范围、Skills发现路径和验收证据；本轮不安装或更改现有客户端配置。
> 官方依据：[Wot UI AI 使用指南](https://wot-ui.cn/guide/ai.html)。前序会话有CLI help/list/info及llms读取记录；**这不等于MCP已握手、Skills已安装、CI已接入或多端已验证**。本轮重新核实官方文档与CLI源码，并区分文档示例和实际安装状态。
> 适用：迁移到 uni-app Vue3 后的新端工程（组件库选型见 `SPEC.md` §6，结论＝Wot UI v2 `@wot-ui/ui` 2.3.2）。

---

## 0. 为什么需要这份指南

AI 写页面最大的风险是**凭空编造组件 API**。Wot UI 官方提供四件套，把「组件清单 / props / events / slots / CSS 变量 / Demo 源码」变成 **AI 可直接检索的事实源**：

| 能力 | 提供内容 | 我们是否采用 |
|---|---|---|
| **LLMs.txt** | 面向 AI 的文档入口、组件索引与结构化链接（每页可单独抓 .md） | 推荐引用文档入口，无须安装 |
| **@wot-ui/cli** | 离线组件元数据、API 查询、Demo 查询、CSS 变量查询 | ✅ 必装（并纳入提交前检查） |
| **MCP Server**（`wot mcp`） | 通过 MCP tools 暴露组件知识库 | 可选；宿主配置合同与真实握手待验证 |
| **AI Skills** | 面向 Agent 的任务说明、约束与最佳实践 | 按目标Agent发现机制配置，不能仅建目录就视为生效 |

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
# 以下用于未来已初始化并获准接入的新工程，本轮没有执行安装
cd miniapp-vue3
pnpm add --save-dev --save-exact @wot-ui/cli@1.1.0
pnpm exec wot --help
```



### 3.1 命令清单（前序 `wot --help` 记录，CLI **1.1.0**）

表中`wot`为官方命令名；项目级安装后使用`pnpm exec wot`。目标组件版本也要传给支持`--version`的查询命令，避免把CLI的回退版本当成工程真实依赖。

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
...
```



> 提示：在**尚未接入 wot-ui 的目录**里运行会提示 `[wot] Version not detected in project, falling back to 2.3.2`——属正常回退，工程内装好后会读到项目版本。

### 3.3 纳入提交前检查（建议加入 CR / CI）

```bash
pnpm exec wot doctor --format text
pnpm exec wot lint --format json
pnpm exec wot usage --format markdown
```



## 4. MCP Server —— 让 AI 直接调用组件知识库

```bash
pnpm exec wot mcp serve   # 显式启动MCP Server（长驻进程）
pnpm exec wot mcp         # 同样启动Server，并非只显示管理菜单
```



**客户端配置（官方通用示例，不是DSH现成配置）**：

仅当宿主支持这个schema、能解析`wot`可执行路径且用户批准配置范围时应用。使用项目内CLI须给宿主可解析的绝对路径或锁版启动命令；不能把这个示例复制到DSH后就宣称接通。

```json
{
  "mcpServers": {
    "wot-ui": {
      "command": "wot",
      "args": ["mcp"]
    }
  }
}
```



**一键接入（实测 `wot mcp init --help`，CLI 1.1.0）**：

```bash
pnpm exec wot mcp list
pnpm exec wot mcp init --dry-run   # 先查看将写到哪里；确认目标客户端和scope
# 仅经用户批准后运行init/agent init；具体client按上一步检测与本机help选择
pnpm exec wot mcp status
pnpm exec wot mcp doctor           # 配置完成后，实际握手结果才算接入证据
```



CLI 1.1.0 `--client`帮助列：`auto | all | claude | cursor | vscode | codex | opencode | antigravity`。**不包含DSH专用自动接入承诺**，需查当前宿主配置合同；未接MCP时可以先用CLI只读查询，不阻塞整个迁移。

## 5. AI Skills —— 让 Agent 按 Wot UI 规范干活

```bash
pnpm dlx skills add wot-ui/open-wot     # 官方安装方式（按需勾选）
```



官方 Skills（与迁移最相关）：

| Skill | 作用 |
|---|---|
| `wot-ui-v2` | 组件选型 / API 查询 / 页面生成 / 常见坑位排查（**核心，必装**） |
| `create-wot-ui-theme` | 辅助生成受审查的Wot主题bridge；品牌Token仍由项目单源生成 |
| `migrate-v1-to-v2` | 仅在从 v1 迁到 v2 时使用 |

**我们的约定**：先审查官方Skill全文，固定来源commit/版本，再按目标Agent实际发现路径安装并验证能被加载。`agent/skills/`可作项目参考副本但不是各客户端通用自动发现目录；不自动改全局工具设置。主题Skill可辅助生成单文件SCSS，但**不能自动保证TS同步**；本项目以`tokens/source.json`单源生成CSS/SCSS/TS，Wot bridge独立映射（SPEC §8）。

## 6. 新端工程落地清单（DoD 勾选）

- [ ] 新工程内锁定CLI版本与lockfile，查询目标UI版本
- [ ] AI 工具接入 `llms.txt`（DSH / Cursor / TRAE）
- [ ] 若采用MCP：批准目标客户端/scope，init后doctor真实握手通过（未采用则记明CLI替代，不假报已接）
- [ ] `wot-ui-v2`与`create-wot-ui-theme`的来源版本/发现路径/加载证据已记录
- [ ] CR 流程纳入 `wot doctor` / `wot lint` / `wot usage`
- [ ] Token由单源生成并经过幂等测试，主题Skill输出只作受审阅的Wot bridge实现

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
- AI 专页：https://wot-ui.cn/guide/ai.html（`/ai/overview.html`本轮返回首页，不作专页证据）
- CLI 1.1.0 MCP实现：https://raw.githubusercontent.com/wot-ui/open-wot/v1.1.0/src/commands/mcp.ts
- CLI 文档：https://wot-ui.cn/guide/open-wot.md
- 组件文档示例（可按名替换）：https://wot-ui.cn/component/button.md
- 选型与执行入口：[SPEC](../SPEC.md)及[细化实施方案](./uniapp-vue3-migration-plan.md)；CLI检查不替代业务合同、框架编译与真机验收。

---

> 维护约定：Wot UI 升级或 CLI 命令变化时同步更新本文，并在 KB 03 分册登记。
