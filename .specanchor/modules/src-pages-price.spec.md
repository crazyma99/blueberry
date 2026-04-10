---
specanchor:
  level: module
  module_name: src-pages-price
  module_path: src/pages/priceHomePage, src/pages/priceList
  version: "1.0.0"
  owner: "@team"
  status: active
  last_synced: "2026-03-27"
---

# Module Spec: 价目表模块

## 模块路径

- `src/pages/priceHomePage/` - 价目表首页 (TabBar)
- `src/pages/priceList/` - 价目表详情页

## 模块职责

价目表模块展示门店价格信息和服务说明,支持两个门店的价目表切换。

## 核心功能

### priceHomePage (价目表首页)

1. **客片预览**: 展示精选客片,点击跳转至价目列表
2. **服务说明**: 展示服务信息图片
3. **联系方式**: 展示二维码和联系电话

### priceList (价目表详情)

1. **轮播图展示**: 根据门店展示不同轮播图
2. **价目表展示**: 根据门店 ID 展示不同价目表图片
3. **动态标题**: 根据门店切换导航栏标题

## 接口依赖

- `getImage` (from `utils/api.uts`): 获取轮播图数据
  - 参数: `{ type: id }` (id 为门店标识)
  - 返回: `{ code, data: [{ imageUrl }] }`

## 页面路由

### priceHomePage
- **入口**: TabBar 价目表
- **出口**: `/pages/priceList/index` (参数: `from`, `idx`)

### priceList
- **入口**: 从 priceHomePage 跳转
- **参数**:
  - `idx`: 门店标识 ('1' = 红河水乡店, '2' = 太平湖店)
  - `from`: 来源标识

## 数据结构

### priceHomePage
```typescript
data() {
  return {} // 无状态数据
}
```

### priceList
```typescript
data() {
  return {
    id: '',       // 门店标识
    banners: []   // 轮播图列表
  }
}
```

## 关键方法

### priceHomePage
- `onDemoClick(idx)`: 跳转至价目列表页

### priceList
- `onLoad(query)`: 页面加载时设置门店 ID 和标题
- `getBanner(id)`: 获取对应门店的轮播图
- `getPriceBg` (computed): 根据门店返回价目表图片路径

## 样式规范

- 背景色: `#000`
- 轮播图尺寸: `384rpx` 高度
- 价目表图片:
  - 太平湖店: `734rpx × 1478rpx`
  - 红河水乡店: `734rpx × 1664rpx`

## 业务规则

1. 门店 ID 为 '1' 时显示红河水乡店价目表
2. 门店 ID 为 '2' 或其他时显示太平湖店价目表
3. 导航栏标题根据门店动态设置
4. 价目表图片使用静态资源文件

## 注意事项

1. priceHomePage 无 API 调用,纯静态展示
2. priceList 需要获取轮播图数据
3. 价目表图片尺寸不同,需使用不同的 CSS 类
4. 页面使用垂直滚动布局
