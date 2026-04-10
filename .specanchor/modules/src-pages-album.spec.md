---
specanchor:
  level: module
  module_name: src-pages-album
  module_path: src/pages/demoDetail, src/pages/targetPhotoDetail
  version: "1.1.0"
  owner: "@team"
  status: active
  last_synced: "2026-03-29"
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

- `getalbum` (from `utils/api.uts`): 获取客片列表数据
  - 参数: `{ type?: string, page?: number, size?: number }`
  - `type`: 搜索栏内容（可选）
  - `page`: 页码，从0开始（可选，不传则返回全部）
  - `size`: 每页数量，默认10（可选）
  - 返回: `{ code, data: { alltabs: [{ id, parentName, sortOrder, subCategory: [{ id, name, parentId, sortOrder, albumTotal?, albumList: [{ id, title, coverImageUrl, price, packageDesc }] }] }] } }`
  - 分页说明：
    - 不传 `page` 参数：返回全部相册，`albumTotal` 不返回（兼容老版本）
    - 传 `page` 参数：每个子分类的 `albumList` 按分页返回，`albumTotal` 返回该子分类的相册总数
    - 前端判断是否还有更多：`(page + 1) * size < albumTotal`

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
    idx: '',           // 门店标识
    from: '',          // 来源
    selectedTab: {     // 当前选中的分类
      parentTab: '',   // 一级分类 ID
      childTab: ''     // 二级分类 ID
    },
    alltabs: [],       // 全部分类数据
    currentPage: 0,    // 当前页码（从0开始）
    pageSize: 10,      // 每页数量
    hasMore: true      // 是否有更多数据
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
  albumTotal?: number   // 分页模式下返回总数
  albumList: AlbumItem[]
}

interface AlbumItem {
  id: number
  title: string
  coverImageUrl: string
  price: number
  packageDesc: string
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
- `getAlbumInfo(id, page?, size?)`: 获取客片列表数据（支持分页）
- `loadMore()`: 加载更多数据（分页模式下）
- `changeTab(id, pos)`: 切换分类 (parent/child)，重置分页状态
- `handleCollect(item)`: 收藏/取消收藏
- `gotoDetail(item)`: 跳转至详情页
- `refreshLikeStatus(list)`: 刷新收藏状态
- `checkHasMore()`: 检查是否还有更多数据 `(currentPage + 1) * pageSize < albumTotal`

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

1. 页面加载时默认选中第一个一级分类和第一个二级分类
2. 切换分类后自动刷新收藏状态，并重置分页状态（`currentPage = 0`）
3. 收藏状态存储在本地,跨页面共享
4. 详情页返回后列表页需刷新收藏状态 (`onShow`)
5. 分页模式下，滚动到底部时调用 `loadMore()` 加载下一页
6. 分页判断：`(currentPage + 1) * pageSize < albumTotal` 时有更多数据

## 注意事项

1. 收藏功能依赖本地存储,需处理存储失败情况
2. 客片列表数据层级较深,需安全访问 (使用 `?.`)
3. 分类切换使用 `$nextTick` 确保数据更新后刷新收藏状态
4. 收藏按钮使用 `@click.stop` 阻止事件冒泡
5. 页面使用垂直滚动布局,分类标签区域支持横向滚动
