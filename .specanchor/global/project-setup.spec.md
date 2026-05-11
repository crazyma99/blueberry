---
specanchor:
  level: global
  type: project-setup
  version: "1.1.0"
  last_updated: "2026-05-11"
---

# Project Setup Spec

## 技术栈

- **框架**: uni-app x (Vue 3 + UTS)
- **目标平台**: 微信小程序 (`mp-weixin`)
- **构建工具**: Vite 5.2.8 + `@dcloudio/vite-plugin-uni`
- **语言**: TypeScript 5.0+、UTS (Uni TypeScript)

## 项目结构

```
blueBerry/
├── src/                      # 唯一源码根
│   ├── pages/                # 页面目录，每页一个子目录 + index.uvue
│   │   ├── index/            # 首页 (TabBar)
│   │   ├── priceHomePage/    # 价目表首页 (TabBar)
│   │   ├── priceList/        # 价目列表
│   │   ├── demoDetail/       # 客片列表
│   │   ├── targetPhotoDetail/# 客片详情
│   │   ├── mine/             # 我的 (TabBar)
│   │   ├── favorites/        # 我的收藏
│   │   ├── webview/          # 外链承载
│   │   └── policies/         # 协议页 (user / privacy)
│   ├── utils/                # 工具层 (config/http/api/auth/legal)
│   ├── components/           # 组件 (当前为空，预留)
│   ├── static/               # 静态资源
│   ├── App.uvue              # 应用入口
│   ├── main.uts              # 主入口
│   ├── pages.json            # 页面路由与 TabBar 配置
│   ├── manifest.json         # 小程序应用配置
│   └── uni.scss              # 全局样式变量
├── profiles/                 # 多项目差异化配置 (blueberry / huahua 等)
├── scripts/                  # profile 注入与构建流水线脚本
├── .specanchor/              # Spec 锚定目录
├── dist/                     # 编译产物
├── package.json
├── project.config.json       # 微信开发者工具项目配置
├── vite.config.ts
└── tsconfig.json
```

> **硬约束**：`src/` 是唯一源码根。根目录不得维护 `pages/`、`static/`、`utils/`、`App.uvue`、`main.uts`、`pages.json`、`manifest.json`、`uni.scss` 的副本；一切副本都会绕开 uni CLI 的运行链路并导致漂移。

## 构建命令

### 基础命令（单项目）

```bash
npm run dev:mp-weixin     # 开发模式 → dist/dev/mp-weixin
npm run build:mp-weixin   # 生产构建 → dist/build/mp-weixin
```

### Profile 多项目命令（详见 `global/profile-management.spec.md`）

```bash
npm run profile:new       # 初始化一个新的小程序目录
npm run profile:create    # 创建 profile 配置
npm run profile:apply     # 将 profile 注入到当前源码
npm run profile:build     # apply + npm build + verify 一条龙
npm run profile:release   # 发布产物
npm run profile:verify    # 校验构建产物是否符合 profile
```

## 路由配置（与 `src/pages.json` 逐条一致）

### TabBar

| 页面     | 路径                          |
| -------- | ----------------------------- |
| 首页     | `pages/index/index`           |
| 价目表   | `pages/priceHomePage/index`   |
| 我的     | `pages/mine/index`            |

### 其他页面

| 页面          | 路径                             | 特殊配置                        |
| ------------- | -------------------------------- | ------------------------------- |
| 客片列表      | `pages/demoDetail/index`         | `navigationStyle: custom`       |
| 价目列表      | `pages/priceList/index`          |                                 |
| 客片详情      | `pages/targetPhotoDetail/index`  | 标题：客片欣赏                  |
| 我的收藏      | `pages/favorites/index`          | `navigationStyle: custom`       |
| WebView       | `pages/webview/index`            | 标题由页面动态设置              |
| 用户协议      | `pages/policies/user`            | 标题：用户协议                  |
| 隐私政策      | `pages/policies/privacy`         | 标题：隐私政策                  |

### 全局样式

- 导航栏：白字黑底（`navigationBarTextStyle: white`、`navigationBarBackgroundColor: #000`）
- 页面背景：黑色 (`backgroundColor: #000`)
- TabBar 选中色：`#F3D9AC`

## 开发规范

1. 页面文件使用 `.uvue` 扩展名
2. 工具函数使用 `.uts` 扩展名
3. 静态资源放在 `src/static/`
4. 页面与静态资源路径以 uni-app 运行时路径引用：`/pages/...`、`/static/...`
5. 不在根目录维护源码副本；新增代码一律进入 `src/`
6. 任何 profile 差异化数据通过 `profiles/<key>/project.env` 配置，不在源码中硬编码分支

## 静态资源真实性约束

1. 代码中引用的 `/static/xxx` 资源**必须**在 `src/static/` 目录下真实存在；严禁凭想象引用不存在的资源
2. 新增资源时先在 `src/static/` 落盘，再在代码中引用
3. profile 替换静态资源（如二维码、logo）时通过 `profiles/<key>/static/` 覆盖到 `src/static/`，不可在源码中硬编码路径分支
