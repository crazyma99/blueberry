---
specanchor:
  level: module
  module_name: src-pages-redesign
  module_path: src/pages
  version: "1.0.0"
  owner: "@team"
  status: draft
  last_synced: "2026-03-27"
  depends_on:
    - src-api-wechat
---

# Module Spec: 小程序页面改版设计稿

## 概述

基于 6 张设计稿截图，对小程序现有页面进行改版。主要变更包括：
- TabBar 新增"我的"页面（从 2 Tab 变为 3 Tab）
- 首页和价目表页的店铺列表改为动态获取
- 客片列表页新增搜索栏、点赞计数、分页
- 客片详情页新增点赞 + 收藏双按钮
- 新增"我的"页面（登录、金刚区、轮播图）

---

## 一、页面总览

| 页面 | 路径 | 类型 | 状态 |
|------|------|------|------|
| 首页 | `pages/index/index` | TabBar | 需改造 |
| 价目表 | `pages/priceHomePage/index` | TabBar | 需改造 |
| 我的 | `pages/mine/index` | TabBar | **新增** |
| 客片列表页 | `pages/demoDetail/index` | 子页面 | 需改造 |
| 客片详情页 | `pages/targetPhotoDetail/index` | 子页面 | 需改造 |
| 价目表详情页 | `pages/priceList/index` | 子页面 | 需改造 |
| 我的喜欢 | `pages/favorites/index` | 子页面 | **新增** |

---

## 二、pages.json 变更

### TabBar 变更

**现状**: 2 个 Tab（首页、价目表）

**目标**: 3 个 Tab（首页、价目表、我的）

```json
{
  "tabBar": {
    "color": "#fff",
    "selectedColor": "#F3D9AC",
    "backgroundColor": "#000",
    "borderStyle": "black",
    "list": [
      {
        "pagePath": "pages/index/index",
        "iconPath": "static/homepage.png",
        "selectedIconPath": "static/homepage-choosed.png",
        "text": "首页"
      },
      {
        "pagePath": "pages/priceHomePage/index",
        "iconPath": "static/pricelist.png",
        "selectedIconPath": "static/pricelist-choosed.png",
        "text": "价目表"
      },
      {
        "pagePath": "pages/mine/index",
        "iconPath": "static/mine.png",
        "selectedIconPath": "static/mine-choosed.png",
        "text": "我的"
      }
    ]
  }
}
```

### 新增页面注册

```json
{
  "path": "pages/mine/index",
  "style": {
    "navigationBarTitleText": "蓝梅旗袍·汉服·民..."
  }
}
```

### 新增静态资源

需要新增的 TabBar 图标:
- `static/mine.png` — "我的" Tab 未选中图标
- `static/mine-choosed.png` — "我的" Tab 选中图标

---

## 三、各页面设计详情

### 3.1 首页 (`pages/index/index`) — 需改造

#### 设计稿分析（截图 1）

页面从上到下依次为：
1. **轮播图**: 品牌宣传图（已有，保持）
2. **"客片欣赏"区域**: 展示所有店铺，每行两个
3. **"服务保障"区域**: 品牌 Logo + slogan + 8 条服务保障
4. **"联系我们"区域**: 二维码 + 联系电话
5. **Copyright 底部**

#### 与现有代码差异

| 功能点 | 现状 | 设计稿目标 |
|--------|------|------------|
| 店铺列表 | 写死 2 张静态图片 | 动态获取 `/api/shops`，渲染 `homeImage` |
| 店铺名称 | 静态图片内嵌文字 | 每个店铺卡片下方显示 `displayName` |
| 点击行为 | 硬编码跳转 `idx=1` / `idx=2` | 动态传递 `shopId` |
| 服务保障 | 一张静态图片 `service.png` | 设计稿看起来仍为静态图，保持 |

#### 改造要点

1. **店铺列表动态化**
   - 调用 `getShops()` 接口获取店铺列表
   - 数据结构: `{ id, shopName, displayName, displayNameEn, homeImage, sortOrder }`
   - 按 `sortOrder` 排序
   - 每行两个，使用 flex 布局
   - 每个卡片显示 `homeImage` + `displayName` 文字

2. **跳转参数调整**
   - 点击店铺跳转: `uni.navigateTo({ url: '/pages/demoDetail/index?from=home&idx=${shop.id}' })`
   - `idx` 使用店铺的 `id` 字段

#### 数据结构变更

```typescript
data() {
  return {
    loading: true,  // Loading 态（新增）
    banners: [],    // 轮播图列表（保持）
    shops: []       // 店铺列表（新增）
  }
}
```

#### 接口依赖

- `getImage({ type: 0 })` — 获取首页轮播图（保持）
- `getShops()` — 获取店铺列表（新增）

---

### 3.2 价目表 (`pages/priceHomePage/index`) — 需改造

#### 设计稿分析（截图 2）

页面从上到下依次为：
1. **"价目表"标题区域**
2. **店铺列表**: 每行两个店铺（与首页类似但使用 `priceImage`）
3. **"服务说明"区域**: 品牌 Logo + slogan + 服务保障列表
4. **Copyright 底部**

#### 与现有代码差异

| 功能点 | 现状 | 设计稿目标 |
|--------|------|------------|
| 店铺列表 | 写死 2 张静态图片 | 动态获取 `/api/shops`，渲染 `priceImage` |
| 店铺名称 | 静态图片内嵌文字 | 每个店铺卡片下方显示 `displayName` |
| 跳转行为 | 硬编码 `idx=1` / `idx=2` | 动态传递 `shopId` |
| 联系我们 | 有二维码和联系方式 | 设计稿中无联系我们区域（精简） |

#### 改造要点

1. **店铺列表动态化**
   - 调用 `getShops()` 接口获取店铺列表
   - 使用 `priceImage` 作为封面图
   - 每行两个卡片，显示 `priceImage` + `displayName`

2. **跳转参数调整**
   - 点击店铺跳转: `uni.navigateTo({ url: '/pages/priceList/index?idx=${shop.id}' })`

3. **服务说明区域调整**
   - 设计稿中只保留服务说明，没有联系我们区域

#### 数据结构变更

```typescript
data() {
  return {
    loading: true,  // Loading 态（新增）
    shops: []       // 店铺列表（新增，现有代码无状态数据）
  }
}
```

#### 接口依赖

- `getShops()` — 获取店铺列表（新增）

---

### 3.3 我的 (`pages/mine/index`) — **新增页面**

#### 设计稿分析（截图 3）

页面从上到下依次为：
1. **用户区域**: 头像 + "点击立即登陆" / 已登录显示昵称
2. **金刚区**: 4x2 网格快捷入口
   - 第一行: 我的喜欢（红心 icon）、AI 旅拍、AI 滤镜、关注微信
   - 第二行: 美食推荐、旅游规划、招商加盟、关注微信
3. **轮播图 Banner**: 品牌宣传图（带指示点）
4. **底部留白**

#### 功能描述

1. **用户区域**
   - 未登录: 显示默认头像 + "点击立即登陆" 文字
   - 点击触发微信登录流程（调用 `wx.login()` + `wxLogin` API）
   - 已登录: 显示微信头像 + 昵称（从全局 `userInfo` 读取）

2. **金刚区**
   - 数据来源: `getPageConfig()` 接口的金刚区配置
   - 每个入口包含: icon、文字、跳转链接（接口下发）
   - 4 列 x 2 行网格布局
   - 跳转行为:
     - **我的喜欢**: 跳转到收藏列表页 `pages/favorites/index`（新增页面）
     - **其余入口**: 接口下发对应链接，小程序内直接跳转 (`uni.navigateTo`)

3. **轮播图**
   - 调用 `getPageConfig()` 获取 Banner 配置
   - 自动轮播，带指示点

4. **Loading 态**
   - 页面数据加载中显示 loading 状态

#### 数据结构

```typescript
data() {
  return {
    loading: true,      // Loading 态
    userInfo: null,     // 用户信息（从 storage 读取）
    isLoggedIn: false,  // 登录状态
    banners: [],        // 轮播图列表（来自 getPageConfig）
    menuItems: []       // 金刚区菜单（来自 getPageConfig）
  }
}
```

#### 页面路由

- **入口**: TabBar "我的"
- **出口**:
  - `pages/favorites/index` — 我的喜欢（收藏列表）
  - 其他入口由接口下发链接，小程序内跳转

#### 接口依赖

- `auth.uts` — `getUserInfo()`, `isLoggedIn()` 获取登录状态和用户信息
- `wxLogin()` — 微信登录
- `getPageConfig()` — 获取金刚区配置和轮播图 Banner

#### 新增静态资源

需要的图标资源:
- `static/mine.png` / `static/mine-choosed.png` — TabBar 图标
- `static/mine-like.png` — 我的喜欢图标
- `static/mine-ai-photo.png` — AI 旅拍图标
- `static/mine-ai-filter.png` — AI 滤镜图标
- `static/mine-wechat.png` — 关注微信图标
- `static/mine-food.png` — 美食推荐图标
- `static/mine-travel.png` — 旅游规划图标
- `static/mine-join.png` — 招商加盟图标
- 默认头像图片

#### 样式规范

- 背景色: `#000`
- 用户区域: 虚线边框分隔，白色文字
- 金刚区: 圆角矩形容器，4 列网格，icon 圆形灰色背景
- "我的喜欢" icon 背景为红色心形
- 轮播图: 带白色指示点

---

### 3.4 客片列表页 (`pages/demoDetail/index`) — 需改造

#### 设计稿分析（截图 5）

页面从上到下依次为：
1. **搜索栏**: 搜索图标 + 输入框（"汉服蓝花"示例文字）
2. **副标题**: "蓝梅每个系好看"
3. **父级 Tab**: 横向滚动（全部、单人、情侣、闺蜜、亲子、写真、其他...）
4. **子级 Tab**: 横向滚动（全部、汉服、旗袍、民族服...）
5. **客片瀑布流**: 两列网格，每个卡片包含：
   - 封面图
   - 底部渐变遮罩
   - 标题（如"蓝梅少女"）
   - 点赞图标 + 点赞数（如"55.9万"）
   - 红心收藏按钮（右下角）
6. **Copyright 底部**

#### 与现有代码差异

| 功能点 | 现状 | 设计稿目标 |
|--------|------|------------|
| 搜索栏 | 无 | **新增** 搜索栏，调用 `/api/search` |
| 副标题 | "套餐与子系分类：" | "蓝梅每个系好看"（或动态文案） |
| 点赞计数 | 无，只有收藏心形 | **新增** 点赞图标 + 点赞数展示 |
| 收藏机制 | 本地存储 `collectList` | 云端 API `/api/favorite` |
| 点赞机制 | 无 | **新增** 云端 `/api/like` |
| 分页 | 无 | **新增** 分页加载（上拉加载更多） |
| 卡片布局 | 只有标题+心形 | 标题 + 点赞数 + 收藏按钮 |

#### 改造要点

1. **新增搜索栏**
   - 顶部固定搜索栏
   - 输入关键词后调用 `searchAlbums(keyword)` 接口
   - 搜索结果替换当前列表
   - 空结果时展示: "抱歉没有检索到您搜索的内容，请换个搜索词试试~"
   - 搜索结果替换当前列表
   - 空结果时展示: 文件夹空图标 + "暂无内容" + "换个搜索关键词试试吧！"
   - 清空搜索后恢复分类列表和 Tab 区域

2. **点赞功能**
   - 列表加载后调用 `getLikeStatus(albumIds)` 获取批量点赞状态和点赞数
   - 每个卡片展示 `likeCount`（格式化: 如 559000 -> "55.9万"）
   - 点击点赞按钮调用 `toggleLike(albumId)`

3. **收藏功能迁移**
   - 移除所有本地存储收藏逻辑（`uni.getStorage/setStorage` 的 `collectList`）
   - 列表加载后调用 `getFavoriteStatus(albumIds)` 获取收藏状态
   - 点击收藏按钮调用 `toggleFavorite(albumId)`

4. **后端分页支持**
   - 接口级分页，传递 `page` / `pageSize` 参数
   - 上拉加载更多（`onReachBottom` 或 scroll-view 的 `@scrolltolower`）
   - 搜索接口同样支持分页

5. **卡片底部信息调整**
   - 左侧: 标题
   - 左下: 点赞图标 + 点赞数
   - 右下: 收藏心形按钮（红色=已收藏）

6. **Loading 态**
   - 页面首次加载显示 loading 状态
   - 搜索时显示 loading 状态
   - 上拉加载更多时底部显示加载指示器

#### 数据结构变更

```typescript
data() {
  return {
    loading: true,         // Loading 态（新增）
    idx: '',               // 门店 ID
    from: '',              // 来源
    searchKeyword: '',     // 搜索关键词（新增）
    isSearchMode: false,   // 是否搜索模式（新增）
    searchResults: [],     // 搜索结果（新增）
    selectedTab: {
      parentTab: '',
      childTab: ''
    },
    alltabs: [],
    // 分页参数（新增）
    page: 1,
    pageSize: 10,
    hasMore: true,         // 是否还有更多数据
    loadingMore: false,    // 是否正在加载更多
    likeStatusMap: {},     // 点赞状态 Map { albumId: { liked, likeCount } }（新增）
    favoriteStatusMap: {}, // 收藏状态 Map { albumId: favorited }（新增）
  }
}
```

#### 搜索交互流程

```
用户输入关键词 → 点击虚拟键盘"搜索"按钮 (@confirm)
  → isSearchMode = true
  → 隐藏 Tab 分类区域
  → 调用 searchAlbums(keyword, page=1, pageSize)
  → 展示搜索结果（支持上拉加载更多分页）
  → 无结果时展示空状态

用户清空搜索框
  → isSearchMode = false
  → 恢复 Tab 分类区域 + 分类列表
```

#### 接口依赖

- `getalbum({ type: id })` — 获取客片分类列表（保持）
- `searchAlbums(keyword)` — 搜索客片（新增）
- `getLikeStatus(albumIds)` — 批量获取点赞状态（新增）
- `getFavoriteStatus(albumIds)` — 批量获取收藏状态（新增）
- `toggleLike(albumId)` — 点赞/取消点赞（新增）
- `toggleFavorite(albumId)` — 收藏/取消收藏（新增）

#### 样式变更

- 新增搜索栏: 灰色背景圆角输入框 + 搜索图标
- 卡片底部: 增加点赞数展示区域
- 保持现有瀑布流布局 `362rpx x 482rpx`

---

### 3.5 客片详情页 (`pages/targetPhotoDetail/index`) — 需改造

#### 设计稿分析（截图 4）

页面从上到下依次为：
1. **标题区域**: 左侧标题"蓝梅花园"，右侧点赞按钮(心) + 收藏按钮(星)
2. **描述文字**: 套餐内容说明
3. **图片列表**: 客片图片纵向排列
4. **Copyright 底部**

#### 与现有代码差异

| 功能点 | 现状 | 设计稿目标 |
|--------|------|------------|
| 交互按钮 | 只有 1 个收藏心形按钮 | **改为** 点赞(心) + 收藏(星) 两个按钮 |
| 点赞 | 无 | **新增** 点赞按钮 + 点赞计数 |
| 收藏 | 本地存储 | **改为** 云端 API |
| 按钮位置 | 右侧 1 个心形 | 右侧 2 个按钮（心 + 星） |

#### 改造要点

1. **右侧按钮区域调整**
   - 点赞按钮: 心形图标 + 点赞计数，支持点击调用 `toggleLike`
   - 收藏按钮: 星形图标 + 收藏计数，支持点击调用 `toggleFavorite`
   - 两个按钮纵向排列在右上角

2. **收藏逻辑迁移**
   - 移除所有本地存储收藏逻辑
   - 页面加载时调用 `getLikeStatus` 和 `getFavoriteStatus` 获取初始状态

3. **路由参数调整**
   - 移除 `liked` 参数传递（不再从列表页传递收藏状态，改为从 API 获取）

4. **Loading 态**
   - 页面数据加载中显示 loading 状态

#### 数据结构变更

```typescript
data() {
  return {
    loading: true,     // Loading 态（新增）
    liked: false,      // 点赞状态（改为从API获取）
    favorited: false,  // 收藏状态（新增）
    likeCount: 0,      // 点赞数（新增）
    favoriteCount: 0,  // 收藏数（新增）
    detail: null
  }
}
```

#### 接口依赖

- `getalbumDetail({ albumId, type })` — 获取客片详情（保持）
- `getLikeStatus(albumId)` — 获取点赞状态（新增）
- `getFavoriteStatus(albumId)` — 获取收藏状态（新增）
- `toggleLike(albumId)` — 点赞/取消点赞（新增）
- `toggleFavorite(albumId)` — 收藏/取消收藏（新增）

#### 新增静态资源

- `static/star.svg` — 收藏未选中图标（星形）
- `static/starred.svg` — 收藏已选中图标（星形，实心）

---

### 3.6 价目表详情页 (`pages/priceList/index`) — 需改造

#### 设计稿分析（截图 6）

页面从上到下依次为：
1. **导航栏标题**: "太平湖店价目表"
2. **轮播图 Banner**: 门店宣传图
3. **价目表图片**: 一张完整的价目表图片
4. **Copyright 底部**

#### 与现有代码差异

| 功能点 | 现状 | 设计稿目标 |
|--------|------|------------|
| 导航栏标题 | 硬编码判断 id=1/2 设置标题 | 动态使用 `shop.shopName + "价目表"` |
| 价目表图片 | 硬编码 2 个静态路径 | 动态获取（通过 `/api/shops` 的 `priceImage`） |

#### 改造要点

1. **标题动态化**
   - 通过路由参数传递店铺名称，或通过 `shopId` 从接口获取
   - 不再硬编码 id=1/2 的判断

2. **价目表图片动态化**
   - 从 `/api/shops` 接口的 `priceImage` 字段获取价目表图片 URL
   - 移除静态路径判断逻辑 (`price.png` / `honghe-price.png`)
   - 图片使用 `mode="widthFix"` 自适应高度

3. **Loading 态**
   - 页面数据加载中显示 loading 状态

---

### 3.7 我的喜欢 (`pages/favorites/index`) — **新增页面**

#### 设计稿分析（截图 7）

两种状态：

**有数据状态（左图）**:
1. **搜索栏**: 顶部搜索框（与客片列表页搜索栏一致）
2. **收藏列表**: 两列网格瀑布流，每个卡片包含：
   - 封面图
   - 标题（如"蓝梅少女"）
   - 点赞图标 + 点赞数（如"55.9万"）
3. **Copyright 底部**

**空状态 / 兜底状态（右图）**:
1. **搜索栏**: 顶部搜索框（保持）
2. **空状态区域**: 居中显示
   - 空文件夹图标
   - "暂无内容" 主文案
   - "换个搜索关键词试试吧！" 副文案
3. **Copyright 底部**

#### 功能描述

1. **收藏列表**
   - 调用 `getFavoriteList(shopId?)` 获取收藏列表
   - 可选按门店筛选（通过 `shopId` 参数）
   - 两列网格展示，布局与客片列表页一致
   - 每个卡片显示: 封面图 + 标题 + 点赞数

2. **搜索功能**
   - 搜索栏支持关键词搜索收藏内容
   - 点击虚拟键盘"搜索"按钮触发搜索
   - 搜索空结果时展示空状态: 文件夹图标 + "暂无内容" + "换个搜索关键词试试吧！"

3. **Loading 态**
   - 页面数据加载中显示 loading 状态

4. **空状态**
   - 无收藏数据时展示: 文件夹图标 + "暂无内容" + "换个搜索关键词试试吧！"

#### 数据结构

```typescript
data() {
  return {
    loading: true,         // Loading 态
    searchKeyword: '',     // 搜索关键词
    favoriteList: [],      // 收藏列表
    isEmpty: false,        // 是否为空状态
  }
}
```

#### 页面路由

- **入口**: 从"我的"页金刚区"我的喜欢"跳转
- **出口**: 点击卡片跳转至 `pages/targetPhotoDetail/index` 客片详情页

#### 接口依赖

- `getFavoriteList(shopId?)` — 获取收藏列表（需登录）

#### pages.json 注册

```json
{
  "path": "pages/favorites/index",
  "style": {
    "navigationBarTitleText": "我的喜欢"
  }
}
```

#### 样式规范

- 背景色: `#000`
- 搜索栏: 灰色背景圆角输入框（与客片列表页一致）
- 卡片布局: 两列网格（与客片列表页一致）
- 空状态: 文件夹图标居中 + 灰色文字

#### 新增静态资源

- `static/empty-folder.png` — 空状态文件夹图标

---

## 四、全局 Loading 态规范

所有页面在数据加载期间需展示 loading 状态，具体规范：

| 页面 | Loading 场景 | 实现方式 |
|------|-------------|---------|
| 首页 | 轮播图 + 店铺列表加载 | 全局 loading 提示 |
| 价目表 | 店铺列表加载 | 全局 loading 提示 |
| 我的 | 金刚区 + 轮播图加载 | 全局 loading 提示 |
| 客片列表页 | 首次加载 / 搜索中 | 全局 loading 提示 |
| 客片列表页 | 上拉加载更多 | 底部加载指示器 |
| 客片详情页 | 详情数据加载 | 全局 loading 提示 |
| 价目表详情页 | 轮播图 + 价目表图加载 | 全局 loading 提示 |
| 我的喜欢 | 收藏列表加载 / 搜索中 | 全局 loading 提示 |

---

## 五、需移除的代码

### 本地收藏逻辑（全部移除）

以下文件中的本地收藏逻辑需要完全移除：

1. **`pages/demoDetail/index.uvue`**:
   - `refreshLikeStatus()` 方法 — 从本地 storage 读取收藏状态
   - `handleCollect()` 方法 — 本地 storage 读写收藏
   - 替换为云端 API 调用

2. **`pages/targetPhotoDetail/index.uvue`**:
   - `handleCollect()` 方法 — 本地 storage 读写收藏
   - 替换为云端 API 调用

---

## 六、新增静态资源清单

| 资源文件 | 用途 | 说明 |
|---------|------|------|
| `static/mine.png` | "我的" Tab 图标（未选中） | 需要设计 |
| `static/mine-choosed.png` | "我的" Tab 图标（选中） | 需要设计 |
| `static/star.svg` | 收藏未选中（星形） | 客片详情页用 |
| `static/starred.svg` | 收藏已选中（星形，实心） | 客片详情页用 |
| `static/search.svg` | 搜索图标 | 客片列表页 + 我的喜欢页搜索栏用 |
| `static/default-avatar.png` | 默认头像 | "我的"页未登录状态 |
| `static/empty-folder.png` | 空状态图标 | 我的喜欢页 + 搜索无结果 |

---

## 七、Open Questions（已解答）

以下问题已由用户确认：

### Q1: 金刚区功能入口的跳转目标？ ✅ 已确认

**决策**:
- **我的喜欢**: 跳转到新增的收藏列表页 `pages/favorites/index`（包含有数据和兜底空状态两种展示）
- **其余入口**: 接口下发对应跳转链接，小程序内直接跳转
- 金刚区数据来自 `getPageConfig()` 接口的金刚区配置
- 每个页面都需要加 loading 态

### Q2: 搜索是实时搜索还是回车搜索？ ✅ 已确认

**决策**:
- 用户点击虚拟键盘上的"搜索"按钮触发搜索（`@confirm` 事件），非实时搜索
- 搜索时 Tab 分类区域隐藏
- 搜索模式下支持分页

### Q3: 分页接口参数？ ✅ 已确认

**决策**:
- 后端接口分页，传递 `page` / `pageSize` 参数
- 搜索接口 `/api/search` 同样支持分页

### Q4: 客片详情页的收藏按钮样式？ ✅ 已确认

**决策**:
- 右上角有点赞按钮（心形）和收藏按钮（星形），均支持点击交互
- 两个按钮都有对应的计数展示（点赞数 + 收藏数）

### Q5: "我的"页轮播图的数据来源？ ✅ 已确认

**决策**: 来自 `getPageConfig()` 接口的 Banner 配置。

### Q6: 价目表详情页的动态化程度？ ✅ 已确认

**决策**: 动态获取。价目表图片从 `/api/shops` 的 `priceImage` 字段动态获取。

### Q7: 首页和价目表页的"服务保障/服务说明"区域？ ✅ 已确认

**决策**: 继续使用静态图片 `service.png`，不做结构化改造。

---

## 七、开发任务分解

### Phase 1: 基础改造（页面结构 + 路由）

1. 新建 `pages/mine/index.uvue` 页面骨架
2. 新建 `pages/favorites/index.uvue` 页面骨架
3. 更新 `pages.json` — 注册新页面 + 添加 TabBar 第三项
4. 准备静态资源（TabBar 图标、搜索图标、空状态图标等）

### Phase 2: 首页 + 价目表店铺动态化

5. 首页改造 — 店铺列表动态获取 (`getShops`)，替换静态图片，加 loading 态
6. 价目表首页改造 — 店铺列表动态获取，替换静态图片，加 loading 态
7. 价目表详情页 — 标题动态化 + 价目表图片动态化 + loading 态

### Phase 3: 客片列表页改造

8. 新增搜索栏 UI + 键盘搜索触发逻辑 (`searchAlbums`，支持分页)
9. 新增点赞功能 — 批量获取点赞状态 + 展示点赞数 + 点赞交互
10. 收藏功能云端化 — 移除本地存储逻辑，接入云端 API
11. 后端分页支持 — 上拉加载更多
12. 搜索空结果展示 — 空文件夹图标 + 兜底文案
13. 加 loading 态（首次加载 + 搜索中 + 加载更多）

### Phase 4: 客片详情页改造

14. 新增双按钮（点赞 + 收藏），均含计数展示
15. 接入云端点赞/收藏 API
16. 移除本地存储收藏逻辑
17. 加 loading 态

### Phase 5: "我的"页面实现

18. 用户区域 — 登录状态展示 + 微信登录流程
19. 金刚区 — 从 `getPageConfig()` 获取菜单数据 + 网格布局 + 跳转逻辑
20. 轮播图 — 从 `getPageConfig()` 获取 Banner 数据 + 展示
21. 加 loading 态

### Phase 6: "我的喜欢"页面实现

22. 收藏列表展示 — 调用 `getFavoriteList` + 两列瀑布流
23. 搜索功能 — 搜索栏 + 键盘搜索触发
24. 空状态 — 无数据时展示兜底空状态
25. 加 loading 态

---

## 九、依赖关系

```
Phase 1 (路由结构 + 静态资源)
    ↓
Phase 2 (店铺动态化) ← 依赖 getShops API
    ↓
Phase 3 (客片列表改造) ← 依赖 search/like/favorite API + 分页
    ↓
Phase 4 (客片详情改造) ← 依赖 like/favorite API
    ↓
Phase 5 ("我的"页面) ← 依赖 auth + wxLogin + getPageConfig API
    ↓
Phase 6 ("我的喜欢") ← 依赖 getFavoriteList API
```

注意: Phase 1-2 可与 API 模块（`src-api-wechat.spec.md` 的 Phase 1）并行开发。

---

## 九、样式规范（全局）

| 属性 | 值 |
|------|-----|
| 全局背景色 | `#000` |
| 主题色（选中态） | `#F3D9AC` |
| 文字颜色（主要） | `rgba(255, 255, 255, 0.9)` |
| 文字颜色（次要） | `rgba(255, 255, 255, 0.5)` |
| 文字颜色（辅助） | `rgba(255, 255, 255, 0.3)` |
| 点赞/收藏红色 | `#FF4D4F` 或设计稿红 |
| 分隔线 | `rgba(255, 255, 255, 0.15)` |
| 卡片圆角 | `8rpx` |
| 内容边距 | `8rpx` ~ `32rpx` |
