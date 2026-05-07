---
specanchor:
  level: module
  module_name: src-pages-index
  module_path: src/pages/index
  version: "1.1.0"
  owner: "@team"
  status: active
  last_synced: "2026-05-07"
---

# Module Spec: 首页模块

## 模块路径

`src/pages/index/`

## 模块职责

首页模块是应用的启动页面,负责展示品牌信息、轮播图、客片预览、服务说明和联系方式。

## 核心功能

1. **轮播图展示**: 自动播放品牌宣传图
2. **店铺客片入口**: 动态展示店铺列表,点击进入对应店铺客片列表
3. **服务说明**: 展示服务信息图片
4. **联系方式**: 展示二维码和联系电话
5. **版权信息**: 底部版权说明

## 接口依赖

- `getImage` (from `utils/api.uts`): 获取轮播图数据
  - 参数: `{ type: 0 }` (0 表示首页轮播图)
  - 返回: `{ code, data: [{ imageUrl }] }`
- `getShops` (from `src/utils/api.uts`): 获取店铺列表
  - 返回: `{ code, data: [{ id, displayName, displayNameEn, homeImage }] }`
- 登录相关接口 (from `src/utils/api.uts`, `src/utils/auth.uts`): 首次启动未登录时展示手机号登录与头像昵称补全弹窗

## 页面路由

- **入口**: TabBar 首页
- **出口**:
  - `/pages/demoDetail/index` - 点击客片跳转 (参数: `from`, `idx`)

## 数据结构

```typescript
data() {
  return {
    loading: true,
    banners: [],
    shopList: [],
    showLoginPopup: false,
    showProfilePopup: false
  }
}
```

## 关键方法

- `onLoad()`: 并行获取轮播图数据和店铺列表
- `checkAndShowLogin()`: 读取 `App.globalData.needShowLogin`,首次未登录时弹出登录
- `onShopClick(shop)`: 店铺点击事件,跳转至 `/pages/demoDetail/index?from=banner&idx=${shop.id}`
- `onDemoClick(idx)`: 无店铺数据时使用本地静态图兜底跳转

## 样式规范

- 背景色: `#000`
- 轮播图尺寸: `384rpx` 高度
- 客片尺寸: `364rpx × 226rpx`
- 服务说明图: `736rpx × 910rpx`
- 二维码: `200rpx × 200rpx`

## 注意事项

1. 轮播图数据来自后端 API,需处理加载失败情况
2. 店铺列表来自 `/api/shops`; 接口失败或返回空列表时使用 `demo1.png` / `demo2.png`
3. `demoPhoto` 使用横向滚动卡片条,每张保持 `364rpx × 226rpx`,滚动内容宽度按图片数量计算
4. 二维码支持长按识别 (`show-menu-by-longpress`)
5. 页面使用垂直滚动布局
