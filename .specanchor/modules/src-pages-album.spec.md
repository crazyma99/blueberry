---
specanchor:
  level: module
  module_name: src-pages-album
  module_path: src/pages/demoDetail, src/pages/targetPhotoDetail
  version: "2.2.0"
  owner: "@team"
  status: active
  last_synced: "2026-05-11"
---

# Module Spec: 客片展示模块

## 模块路径

- `src/pages/demoDetail/` - 客片列表（自定义导航栏）
- `src/pages/targetPhotoDetail/` - 客片详情

## 模块职责

客片浏览的两级页面：列表页按门店 + 两级分类筛选，详情页展示完整图文与点赞收藏操作。

## 核心功能

### demoDetail（客片列表）

| 功能       | 说明                                                       |
| ---------- | ---------------------------------------------------------- |
| 分类筛选   | 两级分类（套餐分类 + 子系分类）                            |
| 列表展示   | 网格卡片；`getAlbumList` 分页加载                          |
| 点赞       | 服务端返回 `liked` / `likeCount`；登录用户可切换           |
| 搜索       | 通过 `getAlbumList` 的 `keyword` 参数                      |
| 下拉触底   | `onReachBottom` 触发 `loadMoreAlbum`                       |
| 详情跳转   | 点击客片跳 targetPhotoDetail                               |

### targetPhotoDetail（客片详情）

| 功能       | 说明                                            |
| ---------- | ----------------------------------------------- |
| 详情展示   | 标题、价格、套餐说明                            |
| 图片浏览   | 客片图片列表                                    |
| 点赞       | 对当前客片 `toggleLike`                         |
| 收藏       | 对当前客片 `toggleFavorite`                     |

## 接口依赖

| 接口              | 方法 | 路径                       | 用途                                     |
| ----------------- | ---- | -------------------------- | ---------------------------------------- |
| `getCategories`   | GET  | `/wechat/categories`       | 两级分类；参数 `shopId`                  |
| `getAlbumList`    | GET  | `/wechat/albums`           | 分页列表 + 搜索；参数透传子分类 `query` 对象 |
| `getalbumDetail`  | GET  | `/wechat/album/detail`     | 详情；参数 `{ albumId, type }`           |
| `toggleLike`      | POST | `/api/like`                | 切换点赞                                 |
| `getLikeStatus`   | GET  | `/api/like/status`         | 批量刷新点赞状态                         |
| `toggleFavorite`  | POST | `/api/favorite`            | 切换收藏                                 |
| `getFavoriteStatus`| GET | `/api/favorite/status`     | 批量刷新收藏状态                         |

## 页面路由

### demoDetail

- **入口**：首页店铺卡片跳转 `?from=banner&idx=<shopId>`
- **出口**：`/pages/targetPhotoDetail/index?from=&idx=<albumId>&liked=<bool>&type=<shopId>`

### targetPhotoDetail

- **入口**：从 demoDetail 或 favorites 跳转
- **路由参数**：
  - `idx`：客片 ID（albumId）
  - `liked`：点赞初始状态（'true' / 'false'）
  - `type`：门店标识（shopId），**必填**，缺失会导致详情接口 400

## 数据结构

### demoDetail

```typescript
data() {
  return {
    idx: '',                // shopId
    from: '',
    selectedTab: {
      parentTab: '',        // 一级分类 ID
      childTab: ''          // 二级分类 ID
    },
    alltabs: [] as any[],   // 分类结构（仅分类信息）
    albumList: [] as any[], // 当前分类下客片
    albumTotal: 0,
    albumPage: 1,
    albumSize: 10,
    albumNoMore: false
  }
}
```

### 类型约定

```typescript
interface AlbumItem {
  id: number
  title: string
  coverImageUrl: string
  price: number
  packageDesc: string
  likeCount: number
  liked: boolean
}
```

### targetPhotoDetail

```typescript
data() {
  return {
    liked: false,
    favorited: false,
    detail: null as any
  }
}
```

## 关键方法

### demoDetail

| 方法                          | 职责                                                          |
| ----------------------------- | ------------------------------------------------------------- |
| `initPage(shopId)`            | 先 `getCategories`，再 `getAlbumList` 获取第一页              |
| `fetchAlbumList(page)`        | 分页请求 `getAlbumList`                                       |
| `loadMoreAlbum()`             | 加载下一页（按分类或搜索模式）                                |
| `changeTab(id, pos)`          | 切换分类，重置分页并重新加载                                  |
| `handleSearch()` / `doSearch` | 通过 `getAlbumList` 的 `keyword` 参数实现                     |
| `handleLike(item)`            | 点赞/取消点赞；未登录触发登录弹窗                             |
| `gotoDetail(item)`            | 跳详情页，**必传** `idx / liked / type`                       |
| `refreshLikeStatus(list)`     | `onShow` 时批量刷新点赞状态                                   |

### targetPhotoDetail

| 方法               | 职责                        |
| ------------------ | --------------------------- |
| `getDetail(id, type)` | 拉取客片详情              |
| `handleLike()`     | 点赞/取消                   |
| `handleFavorite()` | 收藏/取消                   |

## 点赞与收藏业务规则

1. 列表接口优先使用 `getAlbumList` 返回的 `liked` / `likeCount`
2. 列表展示后可通过 `getLikeStatus(albumIds)` 批量刷新
3. 点击心形按钮 → `toggleLike(albumId)`，更新当前卡片 UI
4. 收藏逻辑同理，使用 `toggleFavorite` / `getFavoriteStatus`
5. 未登录 → 触发登录弹窗，不直接调接口

## pages.json 约束

- `demoDetail`：`navigationStyle: custom`、`onReachBottomDistance: 80`
- `targetPhotoDetail`：`navigationBarTitleText: "客片欣赏"`

## 样式规范

| 元素         | 规格                                           |
| ------------ | ---------------------------------------------- |
| 背景         | `#000`                                         |
| 分类标签未选 | `128rpx × 42rpx`，灰色文字                     |
| 分类标签选中 | 字号 `32rpx`，白色文字                         |
| 客片卡片     | `362rpx × 482rpx`（两列网格）                  |
| 卡片底部遮罩 | 线性渐变（透明 → 黑色），展示标题与点赞数      |

## 业务规则

1. 初始化默认选中第一个一级分类 + 第一个二级分类
2. 切换分类必须重置 `albumPage=1 / albumNoMore=false / albumList=[]`
3. 搜索走 `getAlbumList(keyword=...)`，不用独立搜索接口
4. 分页判断：`Math.ceil(total / size)` 为总页数，当前页 >= 总页数即无更多
5. 详情页返回后 `onShow` 调 `refreshLikeStatus` 刷新列表点赞
6. 跳转 targetPhotoDetail **必须** 带 `type=shopId`，否则 400

## 注意事项

1. 点赞/收藏依赖登录态；未登录时先走登录弹窗流程
2. 列表数据安全访问使用可选链 `?.`
3. 分类切换用 `$nextTick` 保证数据更新后再刷新点赞
4. 点赞按钮 `@click.stop` 防止冒泡触发卡片跳详情
5. 列表页垂直滚动；分类标签区域支持横向滚动
