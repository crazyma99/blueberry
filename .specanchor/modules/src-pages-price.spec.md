---
specanchor:
  level: module
  module_name: src-pages-price
  module_path: src/pages/priceHomePage, src/pages/priceList
  version: "1.1.0"
  owner: "@team"
  status: active
  last_synced: "2026-05-07"
---

# Module Spec: 价目表模块

## 模块路径

- `src/pages/priceHomePage/` - 价目表首页 (TabBar)
- `src/pages/priceList/` - 价目表详情页

## 模块职责

价目表模块展示门店价格信息和服务说明,支持两个门店的价目表切换。

## 核心功能

### priceHomePage (价目表首页)

1. **店铺价目入口**: 从店铺接口获取门店列表,展示价目封面图,点击跳转至价目详情
2. **服务说明**: 展示服务信息图片
3. **联系方式**: 展示二维码和联系电话

### priceList (价目表详情)

1. **轮播图展示**: 根据门店展示不同轮播图
2. **价目表展示**: 根据门店 ID 展示不同价目表图片
3. **动态标题**: 根据门店切换导航栏标题

## 接口依赖

- `getShops` (from `src/utils/api.uts`): 获取店铺列表
  - 返回: `{ code, data: [{ id, displayName, displayNameEn, homeImage, priceImage }] }`
- `getImage` (from `src/utils/api.uts`): 获取轮播图数据
  - 参数: `{ type: id }` (id 为门店标识)
  - 返回: `{ code, data: [{ imageUrl }] }`

## 页面路由

### priceHomePage
- **入口**: TabBar 价目表
- **出口**: `/pages/priceList/index` (参数: `from`, `idx`)

### priceList
- **入口**: 从 priceHomePage 跳转
- **参数**:
  - `idx`: 门店 ID
  - `from`: 来源标识
  - `shopName`: 门店名称,需通过 `encodeURIComponent` 传递
  - `priceImage`: 店铺接口返回的价目图 URL,需通过 `encodeURIComponent` 传递

## 数据结构

### priceHomePage
```typescript
data() {
  return {
    loading: true,
    shopList: []
  }
}
```

### priceList
```typescript
data() {
  return {
    id: '',       // 门店标识
    loading: true,
    banners: [],  // 轮播图列表
    priceImage: ''
  }
}
```

## 关键方法

### priceHomePage
- `onLoad()`: 调用 `getShops()` 获取店铺列表
- `onShopClick(shop)`: 跳转至价目列表页,传递 `idx`、URL 编码后的 `shopName` 和 `priceImage`
- `onDemoClick(idx)`: 无店铺数据时使用静态兜底门店跳转
- 店铺卡片样式: 横向滚动卡片条,每张价目封面保持 `364rpx × 226rpx`,滚动内容宽度按图片数量计算

### priceList
- `onLoad(query)`: 页面加载时设置门店 ID 和标题
- `getBanner(id)`: 获取对应门店的轮播图
- `decodeRouteValue(value)`: 解码路由传入的字符串参数
- `getFallbackPriceImage(id)`: 当未传 `priceImage` 时按门店 ID 回退本地静态价目图

## 样式规范

- 背景色: `#000`
- 轮播图尺寸: `384rpx` 高度
- 价目表图片:
  - 太平湖店: `734rpx × 1478rpx`
  - 红河水乡店: `734rpx × 1664rpx`

## 业务规则

1. `priceHomePage` 优先显示 `shop.priceImage`,缺失时回退 `shop.homeImage`
2. 进入 `priceList` 时优先显示路由参数 `priceImage`
3. 未传 `priceImage` 时,门店 ID 为 '1' 显示 `/static/honghe-price.png`
4. 未传 `priceImage` 且门店 ID 为其他值时显示 `/static/price.png`
5. 轮播图仍通过 `getImage('get', { type: id })` 获取
6. 店铺卡片不按数量平分宽度;超过两张时通过横向滚动查看,避免多个价目图被压缩或纵向重叠

## 注意事项

1. priceHomePage 调用 `getShops`,失败或空列表时显示本地 `demo1.png` / `demo2.png`
2. priceList 需要获取轮播图数据
3. 价目表图片可能来自后端 URL 或本地静态兜底图
4. 页面使用垂直滚动布局
