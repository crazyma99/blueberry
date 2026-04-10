---
specanchor:
  level: module
  module_name: src-pages-index
  module_path: src/pages/index
  version: "1.0.0"
  owner: "@team"
  status: active
  last_synced: "2026-03-27"
---

# Module Spec: 首页模块

## 模块路径

`src/pages/index/`

## 模块职责

首页模块是应用的启动页面,负责展示品牌信息、轮播图、客片预览、服务说明和联系方式。

## 核心功能

1. **轮播图展示**: 自动播放品牌宣传图
2. **客片预览**: 展示精选客片,点击跳转至详情页
3. **服务说明**: 展示服务信息图片
4. **联系方式**: 展示二维码和联系电话
5. **版权信息**: 底部版权说明

## 接口依赖

- `getImage` (from `utils/api.uts`): 获取轮播图数据
  - 参数: `{ type: 0 }` (0 表示首页轮播图)
  - 返回: `{ code, data: [{ imageUrl }] }`

## 页面路由

- **入口**: TabBar 首页
- **出口**:
  - `/pages/demoDetail/index` - 点击客片跳转 (参数: `from`, `idx`)

## 数据结构

```typescript
data() {
  return {
    banners: [] // 轮播图列表
  }
}
```

## 关键方法

- `onLoad()`: 页面加载时获取轮播图数据
- `onDemoClick(idx)`: 客片点击事件,跳转至详情页

## 样式规范

- 背景色: `#000`
- 轮播图尺寸: `384rpx` 高度
- 客片尺寸: `364rpx × 226rpx`
- 服务说明图: `736rpx × 910rpx`
- 二维码: `200rpx × 200rpx`

## 注意事项

1. 轮播图数据来自后端 API,需处理加载失败情况
2. 客片点击跳转使用 `uni.navigateTo` (非 TabBar 页面)
3. 二维码支持长按识别 (`show-menu-by-longpress`)
4. 页面使用垂直滚动布局
