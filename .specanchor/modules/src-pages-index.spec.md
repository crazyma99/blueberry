---
specanchor:
  level: module
  module_name: src-pages-index
  module_path: src/pages/index
  version: "1.2.0"
  owner: "@team"
  status: active
  last_synced: "2026-05-11"
---

# Module Spec: 首页模块

## 模块路径

`src/pages/index/`

## 模块职责

首页模块是应用的启动页面（TabBar 之首），负责：

1. 展示品牌轮播图
2. 展示店铺客片入口（横向滚动）
3. 展示服务说明图
4. 展示联系方式与二维码
5. 首次未登录时触发登录弹窗与头像昵称补全

## 核心功能

| 功能         | 说明                                                            |
| ------------ | --------------------------------------------------------------- |
| 轮播图       | `getImage('get', { type: 0 })`，自动播放品牌宣传图              |
| 店铺客片入口 | `getShops()` 返回的店铺列表；点击跳客片列表页                   |
| 服务说明     | 静态服务信息图                                                  |
| 联系方式     | 二维码 + 联系电话（由 profile 注入 `CONTACT_QR_SRC` / `CONTACT_PHONE_TEXT`） |
| 登录弹窗     | 未登录时触发三步骤登录协议（参考 `global/wechat-auth-compliance.spec.md`） |
| 版权信息     | 底部版权文案（profile 注入 `COPYRIGHT_TEXT`）                   |

## 接口依赖

| 接口              | 位置            | 用途                                |
| ----------------- | --------------- | ----------------------------------- |
| `getImage`        | `utils/api.uts` | 首页轮播图（`{ type: 0 }`）         |
| `getShops`        | `utils/api.uts` | 店铺客片入口列表                    |
| `wxLogin`         | `utils/api.uts` | 登录换 token                        |
| `wxBindPhone`     | `utils/api.uts` | 绑定手机号                          |
| `wxUpdateUserInfo`| `utils/api.uts` | 补齐头像昵称                        |

## 页面路由

- **入口**：TabBar 首页
- **出口**：
  - 点击店铺客片 → `/pages/demoDetail/index?from=banner&idx=${shop.id}`
  - 无店铺数据兜底 → 使用 `demo1.png` / `demo2.png` 的静态兜底跳转

## 关键方法

| 方法                          | 职责                                                       |
| ----------------------------- | ---------------------------------------------------------- |
| `onLoad()`                    | 并行请求轮播图与店铺列表                                   |
| `checkAndShowLogin()`         | 读取 `App.globalData.needShowLogin`，首次未登录时弹出登录  |
| `onShopClick(shop)`           | 跳转至 demoDetail，传递 `from=banner` 与 `shop.id`         |
| `onDemoClick(idx)`            | 无店铺数据时走静态兜底                                     |
| `onGetPhoneNumber(e)`         | 登录弹窗手机号授权入口，遵循三步骤登录协议                 |

## 数据结构

```typescript
data() {
  return {
    loading: true,
    banners: [] as any[],       // 轮播图列表
    shopList: [] as any[],      // 店铺列表（getShops 返回）
    showLoginPopup: false,      // 登录弹窗
    loginAgreementChecked: false,
    showProfilePopup: false,    // 头像昵称授权弹窗
    profileAvatarUrl: '',
    profileNickname: ''
  }
}
```

## 样式规范

| 元素         | 尺寸                        |
| ------------ | --------------------------- |
| 背景         | `#000`                      |
| 轮播图高     | `384rpx`                    |
| 客片卡片     | `364rpx × 226rpx`（横向滚动）|
| 服务说明图   | `736rpx × 910rpx`           |
| 二维码       | `200rpx × 200rpx`           |

## 业务规则

1. 轮播图请求失败 → 隐藏轮播区域（或展示骨架），不中断其它区域
2. `getShops` 失败或返回空列表 → 使用静态兜底（`demo1.png` / `demo2.png`）
3. 店铺卡片**不按数量平分宽度**，超过两张走横向滚动，避免压缩
4. 二维码支持长按识别（`show-menu-by-longpress`）
5. 页面垂直滚动；店铺卡片条支持横向滚动

## 注意事项

1. 联系电话 / 二维码 src / 版权文案均为 profile 注入点，不得硬编码
2. 登录弹窗与头像昵称弹窗实现必须符合 `global/wechat-auth-compliance.spec.md`
3. 跳转 demoDetail 必须带 `idx`（shopId）；下游页面依赖此参数
