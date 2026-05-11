---
specanchor:
  level: module
  module_name: src-utils-api
  module_path: src/utils/api.uts
  version: "1.0.0"
  owner: "@team"
  status: active
  last_synced: "2026-05-11"
---

# Module Spec: 业务 API 模块

## 模块路径

`src/utils/api.uts`

## 模块职责

集中定义所有业务接口；封装 URL、HTTP 方法、入参、出参类型。业务层只 import 函数，不关心请求细节；底层统一依赖 `src/utils/http.uts` 的 `request`。

## 通用响应结构

所有接口响应统一结构：

```typescript
interface BaseResp<T> {
  code: number       // 200 = 成功；非 200 = 业务失败
  message?: string
  data: T
}
```

仅当 `code === 200` 时使用 `data`，否则 toast `message` 并视场景处理。

## 类型定义

```typescript
export interface UserInfo {
  id: number
  openid: string
  phone: string | null
  nickname: string | null
  avatarUrl: string | null
}

export interface AlbumBasic {
  id: number
  title: string
  coverImageUrl: string
  shopId: number
  price?: number
  likeCount: number
}

export interface ShopInfo {
  id: number
  shopName: string
  displayName: string
  displayNameEn: string
  homeImage: string
  priceImage: string
  sortOrder: number
}

export interface SearchPageResult {
  list: AlbumBasic[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
```

## 接口清单

### 轮播图与客片

| 函数                           | 方法 | 路径                    | 入参                                  | 出参/备注                                     |
| ------------------------------ | ---- | ----------------------- | ------------------------------------- | --------------------------------------------- |
| `getImage(method, params?)`    | 动态 | `/wechat/carousels`     | `{ type }`                            | 首页 `type=0`，价目表 `type=<shopId>`          |
| `getalbum(method, params?)`    | 动态 | `/wechat/album`         | `{ type: id }`                        | **已废弃**，请用 `getCategories + getAlbumList`|
| `getCategories(shopId)`        | GET  | `/wechat/categories`    | `shopId: string \| number`            | 返回两级分类树                                 |
| `getAlbumList(params)`         | GET  | `/wechat/albums`        | `{ shopId, parentId?, childId?, subName?, keyword?, page?, size? }` | 返回 `{ albums, total, page, size }` |
| `getalbumDetail(method, params?)` | 动态 | `/wechat/album/detail` | `{ albumId, type }`                   | `type` 即 `shopId`，缺失后端 400              |

### 登录与用户

| 函数                              | 方法 | 路径                | 入参                                      | 出参/备注                                        |
| --------------------------------- | ---- | ------------------- | ----------------------------------------- | ------------------------------------------------ |
| `wxLogin(params)`                 | POST | `/api/wx/login`     | `{ code, nickname?, avatarUrl? }`         | 返回 `{ token, userInfo: UserInfo }`             |
| `wxBindPhone(code)`               | POST | `/api/wx/phone`     | `code: string`                            | 返回 `UserInfo`（含 phone）                      |
| `wxGetUserInfo()`                 | GET  | `/api/wx/userinfo`  | -                                         | 需登录；返回最新 `UserInfo`                      |
| `wxUpdateUserInfo(params)`        | PUT  | `/api/wx/userinfo`  | `{ nickname?, avatarUrl? }`               | 需登录；**空字符串/undefined 字段会被过滤**      |

### 点赞

| 函数                       | 方法 | 路径                | 入参                | 出参/备注                                    |
| -------------------------- | ---- | ------------------- | ------------------- | -------------------------------------------- |
| `toggleLike(albumId)`      | POST | `/api/like`         | `albumId: number`   | 需登录；返回 `{ liked, likeCount }`           |
| `getLikeStatus(albumIds)`  | GET  | `/api/like/status`  | `albumIds: string`  | 需登录；逗号拼接；返回数组                    |

### 收藏

| 函数                                | 方法 | 路径                     | 入参                | 出参/备注                            |
| ----------------------------------- | ---- | ------------------------ | ------------------- | ------------------------------------ |
| `toggleFavorite(albumId)`           | POST | `/api/favorite`          | `albumId: number`   | 需登录；返回 `{ favorited }`         |
| `getFavoriteStatus(albumIds)`       | GET  | `/api/favorite/status`   | `albumIds: string`  | 需登录                               |
| `getFavoriteList(shopId?)`          | GET  | `/api/favorite/list`     | `shopId?: number`   | 需登录；**一次性返回全部**，无分页   |

### 搜索

| 函数                                     | 方法 | 路径           | 入参                               | 出参/备注                           |
| ---------------------------------------- | ---- | -------------- | ---------------------------------- | ----------------------------------- |
| `searchAlbums(keyword, page=1, size=10)` | GET  | `/api/search`  | `keyword, page, size`              | 公开；返回 `SearchPageResult`       |

### 店铺与中台配置

| 函数               | 方法 | 路径               | 入参 | 出参/备注                                       |
| ------------------ | ---- | ------------------ | ---- | ----------------------------------------------- |
| `getShops()`       | GET  | `/api/shops`       | -    | 公开；返回 `ShopInfo[]`                         |
| `getPageConfig()`  | GET  | `/api/page-config` | -    | 公开；返回 `{ menuItems, banners }` 或 items 数组 |

## 调用约定

1. **统一使用 `await`**，配 `try/catch` 处理异常（401 已由 `http.uts` 统一处理，业务无需捕获）
2. **所有接口 `showLoading: false`**：页面自行控制 loading UI
3. **参数透传**：`getAlbumList` 的子分类 `query` 对象直接展开透传（parentId / childId / subName 等）
4. **逗号拼接 ID**：`getLikeStatus` / `getFavoriteStatus` 的 `albumIds` 是字符串（前端 `ids.join(',')`)
5. **认证要求**：
   - 公开接口：`getImage`、`getCategories`、`getAlbumList`、`getalbumDetail`、`searchAlbums`、`getShops`、`getPageConfig`
   - 需登录：`wxGetUserInfo`、`wxUpdateUserInfo`、点赞/收藏全部、`getFavoriteList`
   - `wxLogin`、`wxBindPhone` 本身是登录过程，不依赖 token

## 常见模式

### 标准调用

```typescript
try {
  const res = await getAlbumList({ shopId: 1, parentId: 2, childId: 3, page: 1, size: 10 })
  if (res.code === 200) {
    this.albumList = res.data.albums
    this.albumTotal = res.data.total
  } else {
    uni.showToast({ title: res.message || '加载失败', icon: 'none' })
  }
} catch (e) {
  console.error('getAlbumList failed:', e)
}
```

### 合并写入（登录/更新）

```typescript
const updateRes = await wxUpdateUserInfo({
  nickname: nickname !== '' ? nickname : undefined,
  avatarUrl: avatarUrl !== '' ? avatarUrl : undefined
})
if (updateRes.code === 200 && updateRes.data) {
  mergeUserInfo(updateRes.data)   // 合并，不覆盖
}
```

## 扩展指南

### 新增接口

```typescript
export const newApi = async (params: { foo: string }) => {
  const res = await request({
    url: '/api/new-endpoint',
    method: 'POST',
    data: params,
    showLoading: false,
  })
  return res as { code: number, message: string, data: YourData }
}
```

### 命名约定

- 微信相关：`wx` 前缀（`wxLogin`、`wxBindPhone`、`wxGetUserInfo`、`wxUpdateUserInfo`）
- 业务动作：动词前缀（`getXxx`、`toggleXxx`、`searchXxx`）
- 兼容旧命名：`getImage / getalbum / getalbumDetail` 保留（历史接口，未全驼峰命名；新接口不沿用此风格）

## 关联规范

- HTTP 底层封装：`modules/src-utils.spec.md` §http.uts
- 401 自动登出：同上
- `X-App-Code` 头注入：`global/profile-management.spec.md`
- 登录流程：`global/wechat-auth-compliance.spec.md`
