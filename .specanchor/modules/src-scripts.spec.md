---
specanchor:
  level: module
  module_name: src-scripts
  module_path: scripts
  version: "1.0.0"
  owner: "@team"
  status: active
  last_synced: "2026-05-11"
---

# Module Spec: 构建与多项目脚本模块

## 模块路径

`scripts/`

## 模块职责

承载多项目模板化构建流水线：从「选择 profile」→「注入 profile 参数到工作区源码」→「npm build」→「构建产物校验」的一条龙脚本。让同一套 blueBerry 源码可以以不同品牌/AppID/接口域名生成两个独立小程序包。

## 关键文件

| 文件 | 职责 |
|------|------|
| `scripts/build-miniapp.sh` | 一条龙构建入口。按序调用 sync-template → apply-profile → `npm run build:mp-weixin` → verify-miniapp |
| `scripts/apply-profile.sh` | Bash 封装。加载 `profiles/<key>/project.env` 后调 `node scripts/lib/apply-profile.mjs` |
| `scripts/lib/apply-profile.mjs` | 核心注入逻辑。校验 12 个必填键，替换 `package.json` / `project.config.json` / `manifest.json` / `pages.json` / `config.uts` / `http.uts` / `legal.uts` / 联系页 / 价目页 / 版权行 |
| `scripts/verify-miniapp.sh` | 校验 `dist/build/mp-weixin` 构建产物是否包含关键文件与正确 AppID |
| `scripts/sync-template.sh` | 将 blueBerry 源码同步到目标仓库（多项目场景）|
| `scripts/create-profile.sh` | 基于 `scripts/templates/profile.env.example` 创建新 profile |
| `scripts/new-miniapp-project.sh` | 一键创建全新的小程序子项目 |
| `scripts/release-miniapp.sh` | 发布流水线 |
| `scripts/templates/profile.env.example` | profile.env 文件模板 |

## 构建流水线

```
build-miniapp.sh <profile-key> [--repo <dir>] [--sync-template] [--install] [--skip-apply] [--skip-verify]
  │
  ├─(--sync-template)→ sync-template.sh   # 可选：把 blueBerry 源码同步到 --repo 目标
  ├─(默认执行)────→ apply-profile.sh       # 加载 profile 并注入到源码
  │     └─ node apply-profile.mjs (必填键校验 + 源码文本替换)
  ├─(首次或--install)→ npm install
  ├─(默认执行)────→ npm run build:mp-weixin
  └─(默认执行)────→ verify-miniapp.sh     # 校验产物
```

## Profile 必填键（12 项）

`apply-profile.mjs` 顶部声明的 `required` 数组是契约来源：

```
PROJECT_KEY, PACKAGE_NAME, MANIFEST_NAME, DESCRIPTION,
MP_WEIXIN_APPID, NAVIGATION_TITLE, COPYRIGHT_TEXT,
CONTACT_PHONE_TEXT, CONTACT_QR_SRC, PRICE_FALLBACK_TITLE,
API_BASE_URL, MINI_APP_NAME
```

缺任何一项 → 直接抛 `${key} is required in profile` 并中断。`APP_CODE` 为可选键，仅当存在时注入 `http.uts` 的 `X-App-Code` 请求头。

## 注入合同（文件 → 替换点）

| 目标文件 | 替换点 |
|----------|--------|
| `package.json` | `name` 字段 |
| `project.config.json` | `appid` 字段 |
| `src/manifest.json` | `name` / `description` / `mp-weixin.appid` |
| `src/pages.json` | `globalStyle.navigationBarTitleText`；如缺 `pages/policies/user` 或 `pages/policies/privacy` 自动补齐路由块 |
| `src/utils/config.uts` | `const baseURL = '…'` |
| `src/utils/http.uts` | `finalHeader` 整块（含可选 `X-App-Code`）|
| `src/utils/legal.uts` | `export const MINI_APP_NAME = '…'` |
| `src/pages/index/index.uvue` / `src/pages/priceHomePage/index.uvue` | 联系 QR 图 `src` / 电话文案 / 版权行 |
| `src/pages/priceList/index.uvue` | 版权行 / 价目表 fallback 标题 |
| `src/pages/demoDetail/index.uvue` / `src/pages/targetPhotoDetail/index.uvue` / `src/pages/favorites/index.uvue` | 仅替换版权行 |

## 写入语义

- `writeIfChanged`：内容相同时不写盘，避免触发无用 diff
- `replaceText`：正则必须匹配到，否则抛 `pattern not found` 中断（防止错版源码无声漂移）

## 关键约定

1. **源码中所有"应由 profile 决定"的字面量必须保留可匹配锚点**：如版权行必须保留 `Copyright 2025 ... - 版权所有` 格式、`MINI_APP_NAME = '...'` 必须保留单引号。改动源码时不得破坏注入正则。
2. **不要删除 required 键**：即使暂未用到的键也不能随便从 `required` 数组中删，删键会造成历史 profile 缺字段时不再拦截。
3. **新增注入点 = 同时改两处**：`apply-profile.mjs` 新增替换逻辑时，`templates/profile.env.example` 要同步加键并加注释。
4. **Profile 目录只含 `project.env`**：`profiles/<key>/` 下不放其他文件，避免被当成源码参与构建。
5. **CI/本地一致性**：verify-miniapp 的校验项变更要同步更新 release-miniapp 流水线。

## 关联规范

- `global/profile-management.spec.md` — Profile 目录结构、脚本职责矩阵
- `global/project-setup.spec.md` — 页面清单、AppID 注入
- `global/coding-standards.spec.md` — HTTP 约定（`X-App-Code` 注入）
