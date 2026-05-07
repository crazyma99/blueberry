# Module Index

> 自动维护的模块索引文件，用于快速定位 Module Spec

## 索引

已创建 7 个 Module Spec,覆盖项目核心模块。

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

| 模块路径 | Spec 文件 | 状态 | 覆盖页面 |
|---------|----------|------|---------|
| `src/pages/index` | `src-pages-index.spec.md` | active | 首页 |
| `src/pages/priceHomePage`, `src/pages/priceList` | `src-pages-price.spec.md` | active | 价目表首页、价目列表 |
| `src/pages/demoDetail`, `src/pages/targetPhotoDetail` | `src-pages-album.spec.md` | active | 客片列表、客片详情 |
| `src/utils` | `src-utils.spec.md` | active | 工具模块 (HTTP/API/认证/配置) |
| `src/utils/api.uts` | `src-api-wechat.spec.md` | draft | 微信小程序 API (登录/点赞/收藏/搜索/店铺) |
| `src/pages` (全部页面) | `src-pages-redesign.spec.md` | draft | 页面改版设计稿 (首页/价目表/我的/客片列表/客片详情/价目详情) |
| `src` (全局) | `src-prd-requirements.spec.md` | draft | PRD 需求文档 (登录/我的页/点赞收藏/搜索/骨架屏/后台优化/埋点) |
