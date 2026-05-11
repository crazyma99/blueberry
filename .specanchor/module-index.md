# Module Index

> 自动维护的模块索引文件，用于快速定位 Module Spec

## 索引

已创建 11 个 Module Spec（9 active + 2 draft），覆盖项目全部核心模块及构建脚本。

## 如何添加

使用以下命令创建 Module Spec:

```
specanchor_module <模块路径>
```

或使用推断命令:

```
specanchor_infer <模块路径>
```

## 模块列表

| 模块路径 | Spec 文件 | 状态 | 说明 |
|---------|----------|------|------|
| `src/pages/index` | `src-pages-index.spec.md` | active | 首页（店铺入口）|
| `src/pages/priceHomePage`, `src/pages/priceList` | `src-pages-price.spec.md` | active | 价目表首页 + 价目列表 |
| `src/pages/demoDetail`, `src/pages/targetPhotoDetail` | `src-pages-album.spec.md` | active | 客片列表 + 客片详情 |
| `src/pages/mine` | `src-pages-mine.spec.md` | active | 我的页（登录三步骤 / 头像昵称合规 / 金刚区 / Banner）|
| `src/pages/favorites` | `src-pages-favorites.spec.md` | active | 我的喜欢 + 站内搜索 |
| `src/pages/policies` | `src-pages-policies.spec.md` | active | 用户协议 + 隐私政策 |
| `src/pages/webview` | `src-pages-webview.spec.md` | active | 外链 H5 承载页 |
| `src/utils` | `src-utils.spec.md` | active | 工具层（config / http / auth / legal）|
| `src/utils/api.uts` | `src-utils-api.spec.md` | active | 业务 API（登录 / 点赞 / 收藏 / 搜索 / 店铺 / 客片 / 配置）|
| `scripts` | `src-scripts.spec.md` | active | 多项目构建流水线 + profile 注入脚本 |
| `src/pages` (全部页面) | `src-pages-redesign.spec.md` | draft | 页面改版设计稿（历史需求文档）|
| `src` (全局) | `src-prd-requirements.spec.md` | draft | PRD 需求文档（历史需求文档）|

## 归档

- `archive/src-api-wechat.spec.md` — 旧版「微信小程序 API」草稿，已在 v0.3.0 重写为 `src-utils-api.spec.md`（路径从「扩展」变更为真实模块路径 `src/utils/api.uts`）。
