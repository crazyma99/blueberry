---
specanchor:
  level: module
  module_name: src-pages-album
  module_path: src/pages/demoDetail, src/pages/targetPhotoDetail
  version: "2.0.0"
  owner: "@team"
  status: active
  last_synced: "2026-04-11"
---

# Module Spec: 客片展示模块

## 模块路径

- `src/pages/demoDetail/` - 客片列表页
- `src/pages/targetPhotoDetail/` - 客片详情页

## 模块职责

客片展示模块提供客片浏览功能,支持分类筛选、收藏功能和详情查看。

## 核心功能

### demoDetail (客片列表页)

1. **分类筛选**: 支持两级分类 (套餐分类 + 子系分类)
2. **客片列表**: 网格展示客片封面
3. **收藏功能**: 本地存储收藏状态
4. **详情跳转**: 点击客片跳转至详情页

### targetPhotoDetail (客片详情页)

1. **详情展示**: 展示客片标题、价格、套餐内容
2. **图片浏览**: 展示客片图片列表
3. **收藏功能**: 收藏/取消收藏当前客片

## 接口依赖

- `getCategories` (from `utils/api.uts`): 获取客片分类
  - 请求方法: GET
  - 接口地址: `/wechat/categories`
  - 参数: `shopId`（店铺 ID，必填）
  - 返回: `{ code, message, data: { alltabs: [{ id, parentName, sortOrder, subCategory: [{ id, name, parentId, sortOrder }] }] } }`

- `getAlbumList` (from `utils/api.uts`): 获取客片列表（支持分页 + 搜索）
  - 请求方法: GET
  - 接口地址: `/wechat/albums`
  - 参数: `shopId`（必填）、`parentId`（父分类 ID，必填）、`childId`（子分类 ID，必填）、`keyword`（搜索关键词，可选）、`page`（页码，可选）、`size`（每页大小，可选）
  - 返回: `{ code, message, data: { albums: [{ id, title, coverImageUrl, price, packageDesc, likeCount, liked }], total, page, size } }`
  - 分页说明：
    - 前端通过 `Math.ceil(total / size)` 计算总页数，当前页 >= 总页数时无更多数据
    - `liked` 字段由服务端直接返回，无需单独查询

- `getalbumDetail` (from `utils/api.uts`): 获取客片详情
  - 参数: `{ albumId, type }`
  - 返回: `{ code, data: { title, price, packageDesc, images: [{ imageUrl }] } }`

## 页面路由

### demoDetail

- **入口**: 从首页跳转 (参数: `from`, `idx`)
- **出口**: `/pages/targetPhotoDetail/index` (参数: `from`, `idx`, `liked`, `type`)

### targetPhotoDetail

- **入口**: 从 demoDetail 跳转
- **参数**:
  - `idx`: 客片 ID
  - `liked`: 收藏状态 ('true'/'false')
  - `type`: 门店标识

## 数据结构

### demoDetail

```typescript
data() {
  return {
    idx: '',           // 店铺标识 (shopId)
    from: '',          // 来源
    selectedTab: {     // 当前选中的分类
      parentTab: '',   // 一级分类 ID
      childTab: ''     // 二级分类 ID
    },
    alltabs: [],       // 全部分类数据（仅分类信息，不含 albumList）
    albumList: [],     // 当前分类下的客片列表
    albumTotal: 0,     // 当前分类客片总数
    albumPage: 1,      // 当前页码
    albumSize: 10,     // 每页数量
    albumNoMore: false  // 是否还有更多数据
  }
}
```

### 子分类数据结构

```typescript
interface SubCategory {
  id: number
  name: string
  parentId: number
  sortOrder: number
}

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
    liked: false,      // 收藏状态
    detail: null       // 详情数据
  }
}
```

## 关键方法

### demoDetail

- `initPage(shopId)`: 初始化页面，先调用 `getCategories` 获取分类，再调用 `getAlbumList` 获取第一页客片
- `fetchAlbumList(page)`: 调用 `getAlbumList` 获取指定页的客片列表
- `loadMoreAlbum()`: 加载更多数据（分类模式）
- `changeTab(id, pos)`: 切换分类，重置分页并重新加载客片列表
- `handleSearch()`: 触发搜索，通过 `getAlbumList` 传 `keyword` 参数实现
- `doSearch(keyword, page)`: 执行搜索请求
- `handleLike(item)`: 点赞/取消点赞
- `gotoDetail(item)`: 跳转至详情页
- `refreshLikeStatus(list)`: 刷新收藏状态（onShow 时使用）

### targetPhotoDetail

- `getDetail(id, type)`: 获取客片详情
- `handleCollect()`: 收藏/取消收藏

## 收藏功能实现

收藏数据存储在 `uni.getStorage` 的 `collectList` 键中:

```typescript
// 存储结构
{
  key: 'collectList',
  data: {
    id: 'list',
    value: [title1, title2, ...]  // 收藏的客片标题列表
  }
}
```

### 收藏逻辑

1. 获取本地存储的收藏列表
2. 判断当前客片是否在收藏列表中
3. 存在则取消收藏,不存在则添加收藏
4. 更新 UI 收藏状态

## 样式规范

- 背景色: `#000`
- 分类标签:
  - 未选中: `128rpx × 42rpx`, 灰色文字
  - 选中: `32rpx` 字号, 白色文字
- 客片卡片: `362rpx × 482rpx` (两列网格)
- 渐变遮罩: 底部渐变显示标题和收藏按钮

## 业务规则

1. 页面加载时先调用 `getCategories` 获取分类，默认选中第一个一级分类和第一个二级分类
2. 分类选定后调用 `getAlbumList` 加载客片列表
3. 切换分类时重置分页状态并重新调用 `getAlbumList`
4. 搜索功能通过 `getAlbumList` 的 `keyword` 参数实现，不再使用独立搜索接口
5. `liked` 字段由服务端在 `getAlbumList` 响应中直接返回
6. 详情页返回后列表页通过 `refreshLikeStatus` 刷新点赞状态（`onShow`）
7. 分页判断：`Math.ceil(total / size)` 计算总页数，当前页 >= 总页数时无更多数据

## 注意事项

1. 收藏功能依赖本地存储,需处理存储失败情况
2. 客片列表数据层级较深,需安全访问 (使用 `?.`)
3. 分类切换使用 `$nextTick` 确保数据更新后刷新收藏状态
4. 收藏按钮使用 `@click.stop` 阻止事件冒泡
5. 页面使用垂直滚动布局,分类标签区域支持横向滚动
