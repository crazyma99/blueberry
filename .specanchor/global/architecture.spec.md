---
specanchor:
  level: global
  type: architecture
  version: "1.0.0"
  last_updated: "2026-05-07"
---

# Architecture Spec

## 架构层次

```
页面层 (Pages) → 工具层 (Utils) → uni-app 运行时 → 目标平台
```

## 模块划分

### 页面模块

- **首页**: `src/pages/index/` - 应用入口
- **价目表**: `src/pages/priceHomePage/`, `src/pages/priceList/` - 价格展示
- **客片展示**: `src/pages/demoDetail/`, `src/pages/targetPhotoDetail/` - 作品展示
- **我的**: `src/pages/mine/` - 登录状态、快捷入口和中台 Banner
- **收藏**: `src/pages/favorites/` - 我的喜欢列表和搜索
- **WebView**: `src/pages/webview/` - 外部链接承载页

### 工具模块

- **HTTP**: `src/utils/http.uts` - 网络请求封装
- **API**: `src/utils/api.uts` - 接口定义
- **认证**: `src/utils/auth.uts` - token 与用户信息管理
- **配置**: `src/utils/config.uts` - 应用配置

## 数据流

```
用户交互 → API 调用 → HTTP 请求 → 后端 → 数据返回 → 页面渲染
```

## 扩展指南

1. 新增页面: `src/pages/` 创建目录,在 `src/pages.json` 注册
2. 新增工具: `src/utils/` 创建文件
3. 新增 API: 在 `src/utils/api.uts` 添加定义
4. 静态资源: 存放在 `src/static/`
5. 根目录同名源码文件和目录不属于运行链路,不得新增
