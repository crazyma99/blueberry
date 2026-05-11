---
specanchor:
  level: module
  module_name: src-pages-price
  module_path: src/pages/priceHomePage, src/pages/priceList
  version: "1.2.0"
  owner: "@team"
  status: active
  last_synced: "2026-05-11"
---

# Module Spec: 价目表模块

## 模块路径

- `src/pages/priceHomePage/` - 价目表首页（TabBar）
- `src/pages/priceList/` - 价目详情

## 模块职责

展示门店价格信息与服务说明；支持多门店的价目表切换与详情浏览。

## 核心功能

### priceHomePage（价目表首页）

| 功能       | 说明                                                  |
| ---------- | ----------------------------------------------------- |
| 店铺价目入口 | `getShops()` 返回门店列表，展示 `priceImage` 封面     |
| 服务说明   | 静态服务信息图                                        |
| 联系方式   | 二维码 + 联系电话（profile 注入）                     |

### priceList（价目详情）

| 功能       | 说明                                                   |
| ---------- | ------------------------------------------------------ |
| 轮播图     | `getImage('get', { type: id })`，按门店 ID 加载         |
| 价目表图   | 显示大图；优先路由传参 `priceImage`，否则按门店 ID 回退本地兜底 |
| 动态标题   | 根据门店切换导航栏标题，使用 profile 的 `PRICE_FALLBACK_TITLE` 兜底 |

## 接口依赖

| 接口        | 位置            | 用途                                                       |
| ----------- | --------------- | ---------------------------------------------------------- |
| `getShops`  | `utils/api.uts` | 门店列表 `{ id, displayName, displayNameEn, homeImage, priceImage }` |
| `getImage`  | `utils/api.uts` | 轮播图 `{ type: id }`                                      |

## 页面路由

### priceHomePage

- **入口**：TabBar 价目表
- **出口**：
  - `/pages/priceList/index?from=&idx=<shopId>&shopName=<encoded>&priceImage=<encoded>`

### priceList

- **入口**：从 priceHomePage 跳转
- **路由参数**：
  - `idx`：门店 ID
  - `from`：来源标识
  - `shopName`：门店名称（需 `encodeURIComponent` 传参）
  - `priceImage`：店铺价目图 URL（需 `encodeURIComponent` 传参）

## 数据结构

### priceHomePage

```typescript
data() {
  return {
    loading: true,
    shopList: [] as any[]
  }
}
```

### priceList

```typescript
data() {
  return {
    id: '',           // 门店 ID
    loading: true,
    banners: [] as any[],
    priceImage: ''    // 路由参数解码后的价目图 URL，或兜底静态图
  }
}
```

## 关键方法

### priceHomePage

| 方法                | 职责                                                              |
| ------------------- | ----------------------------------------------------------------- |
| `onLoad()`          | `getShops()` 获取店铺列表                                         |
| `onShopClick(shop)` | 跳 priceList，`idx=shop.id`，`shopName`/`priceImage` 均 URL 编码   |
| `onDemoClick(idx)`  | 无店铺数据时的静态兜底跳转                                        |

### priceList

| 方法                              | 职责                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| `onLoad(query)`                   | 设置 `id`、导航栏标题、解码 `priceImage`                   |
| `getBanner(id)`                   | 请求 `getImage('get', { type: id })`                       |
| `decodeRouteValue(value)`         | 对路由字符串参数做 `decodeURIComponent`                    |
| `getFallbackPriceImage(id)`       | 路由未传 `priceImage` 时按门店 ID 回退本地静态图           |

## 样式规范

| 元素       | 尺寸                       |
| ---------- | -------------------------- |
| 背景       | `#000`                     |
| 轮播图高   | `384rpx`                   |
| 价目图     | 宽 `734rpx`，高度随图像比例 |

## 业务规则

1. `priceHomePage` 优先显示 `shop.priceImage`，缺失时回退 `shop.homeImage`
2. `priceList` 优先显示路由传参的 `priceImage`
3. 路由未传 `priceImage` 且 `id === '1'` → `/static/honghe-price.png`
4. 路由未传 `priceImage` 且其它门店 → `/static/price.png`
5. 轮播图一律通过 `getImage('get', { type: id })` 动态获取
6. 店铺卡片支持横向滚动，不按数量平分宽度

## 注意事项

1. `getShops` 失败或空列表 → 本地 `demo1.png` / `demo2.png` 兜底
2. 路由传参中文需 URL 编码，否则 iOS 小程序可能丢失
3. 价目图大图需保持原始比例；避免被容器裁切
4. 兜底标题 `PRICE_FALLBACK_TITLE` 为 profile 注入，禁止硬编码
