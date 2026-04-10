---
specanchor:
  level: global
  type: architecture
  version: "1.0.0"
  last_updated: "2026-03-27"
---

# Architecture Spec

## 架构层次

```
页面层 (Pages) → 工具层 (Utils) → uni-app 运行时 → 目标平台
```

## 模块划分

### 页面模块

- **首页**: `pages/index/` - 应用入口
- **价目表**: `pages/priceHomePage/`, `pages/priceList/` - 价格展示
- **客片展示**: `pages/demoDetail/`, `pages/targetPhotoDetail/` - 作品展示

### 工具模块

- **HTTP**: `utils/http.uts` - 网络请求封装
- **API**: `utils/api.uts` - 接口定义
- **配置**: `utils/config.uts` - 应用配置

## 数据流

```
用户交互 → API 调用 → HTTP 请求 → 后端 → 数据返回 → 页面渲染
```

## 扩展指南

1. 新增页面: `src/pages/` 创建目录,在 `pages.json` 注册
2. 新增工具: `src/utils/` 创建文件
3. 新增 API: 在 `utils/api.uts` 添加定义
4. 静态资源: 存放在 `src/static/`
