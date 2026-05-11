# Project CodeMap

> 项目全局代码地图，提供项目的整体架构视图

## 项目信息

- **项目名称**: blueBerry
- **技术栈**: uni-app x (Vue 3 + UTS)
- **目标平台**: 微信小程序
- **构建特性**: 多 Profile 模板化构建（blueberry / huahua 两套品牌共享同一份源码）

## 代码结构

```
blueBerry/
├── .specanchor/              # Spec 规范管理目录
│   ├── global/               # Global Spec（架构 / 编码规范 / 项目配置 / Profile / 微信合规）
│   ├── modules/              # Module Spec（页面 + 工具 + 脚本）
│   ├── tasks/                # Task Spec
│   └── archive/              # 归档
├── profiles/                 # 多项目 Profile（每个子目录一个品牌）
│   ├── blueberry/project.env
│   └── huahua/project.env
├── scripts/                  # 构建流水线 + profile 注入
│   ├── lib/apply-profile.mjs # 核心注入脚本（必填键校验 + 源码文本替换）
│   ├── build-miniapp.sh      # 一条龙构建入口
│   ├── apply-profile.sh      # profile 加载 → 调 apply-profile.mjs
│   ├── verify-miniapp.sh     # 构建产物校验
│   ├── sync-template.sh      # 多项目源码同步
│   ├── create-profile.sh     # 基于模板新建 profile
│   ├── new-miniapp-project.sh / release-miniapp.sh
│   └── templates/profile.env.example
├── src/                      # 源代码
│   ├── pages/
│   │   ├── index/            # 首页（店铺入口）
│   │   ├── demoDetail/       # 客片列表
│   │   ├── targetPhotoDetail/ # 客片详情
│   │   ├── priceHomePage/    # 价目表首页
│   │   ├── priceList/        # 价目列表
│   │   ├── mine/             # 我的（登录 + 金刚区 + Banner）
│   │   ├── favorites/        # 我的喜欢 + 站内搜索
│   │   ├── policies/         # 用户协议 / 隐私政策
│   │   └── webview/          # 外链 H5 承载页
│   ├── utils/
│   │   ├── config.uts        # baseURL / timeout
│   │   ├── http.uts          # 请求封装（Bearer token + X-App-Code + 401 自动登出）
│   │   ├── api.uts           # 所有业务接口
│   │   ├── auth.uts          # token / userInfo（含 mergeUserInfo）
│   │   └── legal.uts         # MINI_APP_NAME + 协议跳转函数
│   ├── static/               # 编译后暴露为 /static/...
│   ├── App.uvue
│   ├── main.uts
│   ├── pages.json
│   ├── manifest.json
│   └── uni.scss
├── package.json
├── project.config.json       # 含 mp-weixin appid
├── vite.config.ts
└── tsconfig.json
```

## 运行链路

1. `npm run dev:mp-weixin` / `npm run build:mp-weixin` 调用 uni CLI。
2. Vite + `@dcloudio/vite-plugin-uni` 从 `src/main.uts`、`src/App.uvue`、`src/pages.json`、`src/manifest.json` 读取应用入口和页面配置。
3. `src/static/` 编译后暴露为运行时 `/static/...`。
4. 微信小程序产物输出到 `dist/dev/mp-weixin` 或 `dist/build/mp-weixin`。

根目录不维护 `pages/`、`static/`、`utils/` 或同名入口配置副本；这些副本会绕开真实运行链路并造成漂移。

## Profile 构建链路

```
profiles/<key>/project.env
        │
        ▼
scripts/apply-profile.sh  (bash 壳，加载 env)
        │
        ▼
scripts/lib/apply-profile.mjs  (Node 脚本，必填键校验 + 文本替换)
        │
        ├─ package.json / project.config.json / src/manifest.json
        ├─ src/pages.json（补齐 policies 路由）
        ├─ src/utils/config.uts（baseURL）
        ├─ src/utils/http.uts（X-App-Code 请求头）
        ├─ src/utils/legal.uts（MINI_APP_NAME）
        └─ 首页 / 价目页 / 客片页 / 收藏页（版权行、联系方式、fallback 标题）
        │
        ▼
npm run build:mp-weixin → dist/build/mp-weixin → verify-miniapp.sh
```

## 核心模块

### 页面模块

1. **首页** — `src/pages/index/` 店铺列表入口
2. **价目表** — `src/pages/priceHomePage/` + `src/pages/priceList/`
3. **客片展示** — `src/pages/demoDetail/` + `src/pages/targetPhotoDetail/`
4. **我的** — `src/pages/mine/` 登录合规三步骤 / 头像昵称授权 / 金刚区 / Banner
5. **我的喜欢** — `src/pages/favorites/` 收藏列表 + 站内搜索
6. **合规页** — `src/pages/policies/` 用户协议 + 隐私政策
7. **外链承载页** — `src/pages/webview/` 跳 H5 唯一出口

### 工具模块

- `src/utils/config.uts` — baseURL / timeout
- `src/utils/http.uts` — Bearer 注入、401 自动登出、可选 X-App-Code 请求头
- `src/utils/api.uts` — 业务接口总集（登录 / 点赞 / 收藏 / 搜索 / 店铺 / 客片 / 配置）
- `src/utils/auth.uts` — token 与 userInfo 管理，`mergeUserInfo` 合并写入避免 null 覆盖
- `src/utils/legal.uts` — 品牌名与协议跳转

### 构建模块

- `scripts/` — 多项目构建流水线与 profile 注入脚本（详见 `modules/src-scripts.spec.md`）

## Global Spec

- `project-setup.spec.md` — 项目配置 / 依赖 / 页面清单 / 静态资源真实性
- `architecture.spec.md` — 分层架构 / 数据流 / 脚本层
- `coding-standards.spec.md` — 编码规范 / HTTP 约定 / 认证约定 / 协议命名
- `profile-management.spec.md` — Profile 目录 / 必填键 / 脚本职责 / 注入合同
- `wechat-auth-compliance.spec.md` — 登录三步骤 / 头像昵称合规 / UI 状态分支

## Module Spec

共 9 份 active + 2 份 draft，完整清单见 `module-index.md`。

## 开发指南

1. 新增功能前，先查阅相关 Global Spec（登录相关必读 `wechat-auth-compliance`，构建相关必读 `profile-management`）
2. 涉及模块修改时，查看对应 Module Spec
3. 复杂任务使用 Task Spec 跟踪
4. 修改代码后考虑是否需要更新对应 Module Spec
5. 改动 `scripts/lib/apply-profile.mjs` 中的替换正则时，同步检查源码锚点是否仍可匹配
