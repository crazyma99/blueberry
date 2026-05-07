---
specanchor:
  level: global
  type: project-setup
  version: "1.0.0"
  last_updated: "2026-05-07"
---

# Project Setup Spec

## 技术栈

- **框架**: uni-app x (Vue 3 + UTS)
- **目标平台**: 微信小程序
- **构建工具**: Vite 5.2.8
- **语言**: TypeScript 5.0+, UTS

## 项目结构

```
src/
├── pages/              # 页面 (index, demoDetail, priceList, targetPhotoDetail, priceHomePage, mine, favorites, webview)
├── utils/              # 工具 (config.uts, http.uts, api.uts, auth.uts)
├── static/             # 静态资源
├── App.uvue            # 应用入口
├── main.uts            # 主入口
├── pages.json          # 页面配置
├── manifest.json       # 应用配置
└── uni.scss            # 全局样式
```

> 约束: `src/` 是唯一源码根。根目录不得维护 `pages/`、`static/`、`utils/`、`App.uvue`、`main.uts`、`pages.json`、`manifest.json`、`uni.scss` 的副本。

## 构建命令

```bash
npm run dev:mp-weixin    # 开发
npm run build:mp-weixin  # 构建
```

构建产物:

- 开发: `dist/dev/mp-weixin`
- 生产: `dist/build/mp-weixin`

## 路由配置

### TabBar

- 首页: `pages/index/index`
- 价目表: `pages/priceHomePage/index`
- 我的: `pages/mine/index`

### 页面

- 客片详情: `pages/demoDetail/index`
- 价目列表: `pages/priceList/index`
- 目标照片详情: `pages/targetPhotoDetail/index`
- 我的喜欢: `pages/favorites/index`
- WebView: `pages/webview/index`

### 全局样式

- 导航栏: 白字黑底
- 页面背景: 黑色

## 开发规范

1. 页面文件使用 `.uvue` 扩展名
2. 工具函数使用 `.uts` 扩展名
3. 静态资源放在 `src/static/`
4. 页面与静态资源路径在代码中按 uni-app 运行时路径引用,如 `/pages/...`、`/static/...`
5. 不在根目录维护源码副本,新增或迁移代码必须进入 `src/`
