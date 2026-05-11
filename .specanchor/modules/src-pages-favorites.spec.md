---
specanchor:
  level: module
  module_name: src-pages-favorites
  module_path: src/pages/favorites
  version: "1.0.0"
  owner: "@team"
  status: active
  last_synced: "2026-05-11"
---

# Module Spec: 我的喜欢模块

## 模块路径

`src/pages/favorites/index.uvue`

## 模块职责

展示登录用户的收藏客片列表，并在同一页面内内置全站客片搜索能力。搜索与收藏两种模式在同一列表组件上切换。

## 关键文件

- `src/pages/favorites/index.uvue` — 唯一入口文件，自定义导航栏 + 可搜索的收藏列表。

## 页面模式

| 模式 | 触发条件 | 数据源 | 分页行为 |
|------|----------|--------|----------|
| **收藏模式** | `searchKeyword` 为空 | `getFavoriteList()` | 接口一次性返回全部，`noMore` 立即置 true，不展示"加载更多" |
| **搜索模式** | 用户在搜索框回车 | `searchAlbums(keyword, page, size)` | 分页加载，展示"加载更多"/"已经到底了" |

切换由 `isSearching` 状态驱动。

## 自定义导航栏

- `navigationStyle: custom`（见 `pages.json`）
- 状态栏占位：`uni.getSystemInfoSync().statusBarHeight`
- 返回按钮：`goBack()`——搜索框有值时清空搜索并重载收藏，否则 `uni.navigateBack()`
- 搜索输入框：`@confirm="handleSearch"`（回车触发）

## 生命周期与刷新策略

- `onLoad`：记录 `statusBarHeight`，调 `loadData()` 拉取初始收藏列表
- `onShow`：
  - 首次进入由 `firstShow` 标志跳过（避免与 `onLoad` 重复请求）
  - 从客片详情页返回时，搜索态重搜、收藏态重拉。保证收藏/取消收藏后回到本页状态最新

## 空状态

| 场景 | 文案 |
|------|------|
| 未登录或收藏为空（无关键词）| 「还没有收藏任何内容哦」|
| 搜索无结果 | 「换个搜索关键词试试吧」|

## 点击跳转

`handleItemClick(item)` → `uni.navigateTo` 到 `/pages/targetPhotoDetail/index?id=<albumId>`。

## 依赖

- `src/utils/api.uts` — `getFavoriteList()` / `searchAlbums(keyword, page, size)`
- 无 auth.uts 直接依赖（401 由 `http.uts` 统一拦截，会清空 token 并提示重新登录）

## 关键约定

1. **收藏列表不分页**：后端一次性返回全部收藏，不要误加分页 UI（避免刷屏）。
2. **搜索分页判断**：`(page + 1) * size < total` 时才能 `loadMore`；`dataList.length < pageSize` 立即置 `noMore`。
3. **搜索与收藏不混用数据源**：`getSearchItems` / `getSearchTotal` 只从 `searchAlbums` 响应读取，不从 `getFavoriteList` 读取。
4. **`firstShow` 标志必留**：防止 `onLoad + onShow` 重复请求浪费流量。

## 关联规范

- `modules/src-utils-api.spec.md` — `getFavoriteList` / `searchAlbums` 接口契约
- `modules/src-pages-album.spec.md` — 客片详情页（返回跳转目标）
