---
specanchor:
  level: module
  module_name: src-api-wechat
  module_path: src/utils/api.uts
  version: "1.2.0"
  owner: "@team"
  status: active
  last_synced: "2026-05-07"
---

# Module Spec: 微信小程序 API 模块

## 模块路径

`src/utils/api.uts` (扩展)

## 模块职责

在现有API基础上，新增微信小程序登录、点赞、收藏、搜索、店铺等接口定义，支持小程序端优化需求。

## 接口分类

### 1. 微信登录模块

#### 1.1 wxLogin(code, nickname?, avatarUrl?)

微信登录，code 换 token

- **接口**: `POST /api/wx/login`
- **认证**: 无需认证
- **参数**:

  ```typescript
  {
    code: string        // wx.login() 返回的 code
    nickname?: string   // 微信昵称（可选）
    avatarUrl?: string  // 微信头像 URL（可选）
  }
  ```

- **返回**:

  ```typescript
  {
    code: number
    message: string
    data: {
      token: string
      userInfo: {
        id: number
        openid: string
        phone: string | null
        nickname: string | null
        avatarUrl: string | null
      }
    }
  }
  ```

- **错误响应**:

  ```typescript
  {
    code: 500
    message: string  // 如 "登录失败：微信 appId/appSecret 未配置"
    data: null
  }
  ```

#### 1.2 wxBindPhone(code)

绑定手机号（需登录）

- **接口**: `POST /api/wx/phone`
- **认证**: 需要 Bearer Token
- **参数**:

  ```typescript
  {
    code: string  // getPhoneNumber 返回的 code
  }
  ```

- **返回**:

  ```typescript
  {
    code: number
    message: string
    data: {
      id: number
      openid: string
      phone: string
      nickname: string
      avatarUrl: string
    }
  }
  ```

#### 1.3 wxGetUserInfo()

获取当前登录用户信息（需登录）

- **接口**: `GET /api/wx/userinfo`
- **认证**: 需要 Bearer Token
- **参数**: 无
- **返回**:

  ```typescript
  {
    code: number
    message: string
    data: {
      id: number
      openid: string
      phone: string
      nickname: string
      avatarUrl: string
    }
  }
  ```

#### 1.4 wxUpdateUserInfo(params)

更新当前登录用户头像/昵称（需登录）

- **接口**: `PUT /api/wx/userinfo`
- **认证**: 需要 Bearer Token
- **参数**:

  ```typescript
  {
    nickname?: string
    avatarUrl?: string
  }
  ```

- **返回**: 更新后的 `UserInfo`

### 2. 点赞模块

#### 2.1 toggleLike(albumId)

点赞/取消点赞（toggle）

- **接口**: `POST /api/like`
- **认证**: 需要 Bearer Token
- **参数**:

  ```typescript
  {
    albumId: number
  }
  ```

- **返回**:

  ```typescript
  {
    code: number
    data: {
      liked: boolean    // true: 已点赞, false: 已取消
      likeCount: number // 当前点赞数
    }
  }
  ```

#### 2.2 getLikeStatus(albumIds)

批量查询点赞状态（需登录）

- **接口**: `GET /api/like/status?albumIds=1,2,3`
- **认证**: 需要 Bearer Token
- **参数**:

  ```typescript
  {
    albumIds: string  // 逗号分隔的相册 ID，如 "1,2,3"
  }
  ```

- **返回**:

  ```typescript
  {
    code: number
    data: Array<{
      albumId: number
      liked: boolean
      likeCount: number
    }>
  }
  ```

### 3. 收藏模块

#### 3.1 toggleFavorite(albumId)

收藏/取消收藏（toggle）

- **接口**: `POST /api/favorite`
- **认证**: 需要 Bearer Token
- **参数**:

  ```typescript
  {
    albumId: number
  }
  ```

- **返回**:

  ```typescript
  {
    code: number
    data: {
      favorited: boolean  // true: 已收藏, false: 已取消
    }
  }
  ```

#### 3.2 getFavoriteStatus(albumIds)

批量查询收藏状态（需登录）

- **接口**: `GET /api/favorite/status?albumIds=1,2,3`
- **认证**: 需要 Bearer Token
- **参数**:

  ```typescript
  {
    albumIds: string  // 逗号分隔的相册 ID
  }
  ```

- **返回**:

  ```typescript
  {
    code: number
    data: Array<{
      albumId: number
      favorited: boolean
    }>
  }
  ```

#### 3.3 getFavoriteList(shopId?)

我的收藏列表（需登录，支持门店筛选）

- **接口**: `GET /api/favorite/list`
- **认证**: 需要 Bearer Token
- **参数**:

  ```typescript
  {
    shopId?: number  // 可选，按门店筛选
  }
  ```

- **返回**:

  ```typescript
  {
    code: number
    data: Array<{
      id: number
      title: string
      coverImageUrl: string
      shopId: number
      likeCount: number
    }>
  }
  ```

### 4. 搜索模块

#### 4.1 searchAlbums(keyword, page?, size?)

相册模糊搜索（公开，无需登录，支持分页）

- **接口**: `GET /api/search?keyword=写真&page=1&size=10`
- **认证**: 无需认证
- **参数**:

  ```typescript
  {
    keyword: string    // 搜索关键词
    page?: number      // 页码，默认 1
    size?: number      // 每页数量，默认 10
  }
  ```

- **返回**:

  ```typescript
  {
    code: number
    data: {
      list: Array<{
        id: number
        title: string
        coverImageUrl: string
        shopId: number
        price?: number
        likeCount: number
      }>
      total: number
      page: number
      pageSize: number
      totalPages: number
    }
  }
  ```

- **空结果处理**: 返回 `{ code: 200, data: { list: [], ... } }`，小程序端展示：「抱歉没有检索到您搜索的内容，请换个搜索词试试～」

### 5. 店铺模块

#### 5.1 getShops()

获取启用的店铺列表（公开，无需登录）

- **接口**: `GET /api/shops`
- **认证**: 无需认证
- **参数**: 无
- **返回**:

  ```typescript
  {
    code: number
    data: Array<{
      id: number
      shopName: string
      displayName: string
      displayNameEn: string
      homeImage: string
      priceImage: string
      sortOrder: number
    }>
  }
  ```

### 6. 客片展示模块

#### 6.1 GET /wechat/album

获取店铺下所有相册（按分类层级），支持分页（公开，无需登录）。

**请求参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| type | string | 否 | - | 搜索栏内容 |
| page | Integer | 否 | - | 页码，从0开始。不传则返回全部（兼容老版本） |
| size | Integer | 否 | 10 | 每页数量 |

**成功响应（带分页）：**

`GET /wechat/album?type=生日&page=0&size=10`

```json
{
  "code": 200,
  "message": "",
  "data": {
    "alltabs": [
      {
        "id": -1,
        "parentName": "全部",
        "sortOrder": 0,
        "subCategory": [
          {
            "id": -1,
            "name": "全部",
            "parentId": -1,
            "sortOrder": 0,
            "albumTotal": 35,
            "albumList": [
              {
                "id": 26,
                "title": "花神",
                "coverImageUrl": "https://...",
                "price": 198.0,
                "packageDesc": "花神"
              }
            ]
          }
        ]
      },
      {
        "id": 1,
        "parentName": "儿童写真",
        "sortOrder": 1,
        "subCategory": [
          {
            "id": -1,
            "name": "全部",
            "parentId": 1,
            "sortOrder": -1,
            "albumTotal": 12,
            "albumList": [...]
          },
          {
            "id": 5,
            "name": "新生儿照",
            "parentId": 1,
            "sortOrder": 1,
            "albumTotal": 8,
            "albumList": [...]
          }
        ]
      }
    ]
  }
}
```

**分页说明：**

- 不传 `page` 参数：返回全部相册，`albumTotal` 不返回（兼容老版本调用）
- 传 `page` 参数：每个子分类的 `albumList` 按分页返回，`albumTotal` 返回该子分类的相册总数
- 前端判断是否还有更多：`(page + 1) * size < albumTotal`

**数据结构：**

```typescript
interface AlbumTab {
  id: number
  parentName: string
  sortOrder: number
  subCategory: AlbumSubCategory[]
}

interface AlbumSubCategory {
  id: number
  name: string
  parentId: number
  sortOrder: number
  albumTotal?: number      // 仅分页模式返回
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

#### 6.2 GET /wechat/album/detail

获取客片详情（公开，无需登录）。

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| albumId | number | 是 | 相册 ID |
| type | string | 否 | 门店标识 |

**返回：**

```typescript
{
  code: number
  data: {
    title: string
    price: number
    packageDesc: string
    images: Array<{ imageUrl: string }>
  }
}
```

### 7. 中台页配置

#### 7.1 getPageConfig()

获取中台页配置（金刚区+Banner，公开，无需登录）

- **接口**: `GET /api/page-config`
- **说明**: 已实现，详见 admin-api.md

## 认证机制

### Token 管理

- **获取**: 通过 `/api/wx/login` 获取 token
- **存储**: 使用 `uni.setStorageSync('token', token)` 存储
- **携带**: 在需要认证的接口 Header 中携带 `Authorization: Bearer <token>`
- **有效期**: 24 小时
- **过期处理**: 返回 401 状态码，需重新登录

### 用户信息管理

- **获取**: 登录成功后从 `/api/wx/login` 响应中获取 `userInfo`
- **存储**: 使用 `uni.setStorageSync('userInfo', userInfo)` 全局存储
- **读取**: 页面需要用户信息时优先从 storage 读取
- **刷新**: 必要时可调用 `/api/wx/userinfo` 接口刷新用户信息
- **清除**: 登出时清除 token 和用户信息

### 认证接口标识

文档中标记为 🔒 的接口需要认证：

- `/api/wx/phone`
- `/api/wx/userinfo`
- `/api/like` (POST)
- `/api/like/status` (GET)
- `/api/favorite` (POST)
- `/api/favorite/status` (GET)
- `/api/favorite/list` (GET)

## 错误码

| code | 含义 |
|------|------|
| 200 | 成功 |
| 401 | 未登录或 token 过期 |
| 500 | 服务端错误 |

## 数据结构定义

### UserInfo

用户信息接口（定义在 `auth.uts` 中）

```typescript
interface UserInfo {
  id: number
  openid: string
  phone: string | null
  nickname: string | null
  avatarUrl: string | null
}
```

**存储位置**: `uni.storage` 的 `userInfo` 键

### AlbumBasic

```typescript
interface AlbumBasic {
  id: number
  title: string
  coverImageUrl: string
  shopId: number
  price?: number
  likeCount: number
}
```

### ShopInfo

```typescript
interface ShopInfo {
  id: number
  shopName: string
  displayName: string
  displayNameEn: string
  homeImage: string
  priceImage: string
  sortOrder: number
}
```

## 实现建议

### 1. Token 和用户信息管理工具

建议在 `src/utils/` 下新增 `auth.uts`：

```typescript
// ============ Token 管理 ============

// 获取 token
export const getToken = (): string => {
  return uni.getStorageSync('token') || ''
}

// 设置 token
export const setToken = (token: string): void => {
  uni.setStorageSync('token', token)
}

// 清除 token
export const clearToken = (): void => {
  uni.removeStorageSync('token')
}

// 检查是否已登录
export const isLoggedIn = (): boolean => {
  return !!getToken()
}

// ============ 用户信息管理 ============

interface UserInfo {
  id: number
  openid: string
  phone: string | null
  nickname: string | null
  avatarUrl: string | null
}

// 获取用户信息
export const getUserInfo = (): UserInfo | null => {
  try {
    const userInfo = uni.getStorageSync('userInfo')
    return userInfo ? (userInfo as UserInfo) : null
  } catch (e) {
    return null
  }
}

// 设置用户信息
export const setUserInfo = (userInfo: UserInfo): void => {
  uni.setStorageSync('userInfo', userInfo)
}

// 清除用户信息
export const clearUserInfo = (): void => {
  uni.removeStorageSync('userInfo')
}

// ============ 登录状态管理 ============

// 完整登录（保存 token 和用户信息）
export const loginSuccess = (token: string, userInfo: UserInfo): void => {
  setToken(token)
  setUserInfo(userInfo)
}

// 完整登出（清除所有认证信息）
export const logout = (): void => {
  clearToken()
  clearUserInfo()
}
```

### 2. HTTP 请求增强

需要修改 `http.uts` 以支持：

- 动态 token 注入（从 storage 读取）
- 401 错误统一处理（跳转登录页或提示登录）

修改示例：

```typescript
import { getHttpConfig } from './config.uts'
import { getToken } from './auth.uts'

// 在 request 函数中替换硬编码 token
const token = getToken()  // 替换原有的硬编码
if (token) {
  finalHeader['Authorization'] = `Bearer ${token}`
}
```

### 3. API 接口实现模式

在 `src/utils/api.uts` 中新增接口定义：

```typescript
// ============ 微信登录模块 ============

export const wxLogin = async (params: {
  code: string
  nickname?: string
  avatarUrl?: string
}) => {
  const res = await request({
    url: '/api/wx/login',
    method: 'POST',
    data: params,
    showLoading: false,
  })
  // 登录成功后，调用 auth.uts 中的 loginSuccess 方法存储 token 和 userInfo
  // if (res.code === 200) {
  //   loginSuccess(res.data.token, res.data.userInfo)
  // }
  return res as { code: number, message: string, data: { token: string, userInfo: UserInfo } }
}

export const wxBindPhone = async (code: string) => {
  const res = await request({
    url: '/api/wx/phone',
    method: 'POST',
    data: { code },
    showLoading: false,
  })
  return res as { code: number, message: string, data: UserInfo }
}

export const wxGetUserInfo = async () => {
  const res = await request({
    url: '/api/wx/userinfo',
    method: 'GET',
    showLoading: false,
  })
  return res as { code: number, message: string, data: UserInfo }
}

export const wxUpdateUserInfo = async (params: {
  nickname?: string
  avatarUrl?: string
}) => {
  const body: Record<string, any> = {}
  if (params.nickname != null && params.nickname !== '') body.nickname = params.nickname
  if (params.avatarUrl != null && params.avatarUrl !== '') body.avatarUrl = params.avatarUrl
  const res = await request({
    url: '/api/wx/userinfo',
    method: 'PUT',
    data: body,
    showLoading: false,
  })
  return res as { code: number, message: string, data: UserInfo }
}

// ============ 点赞模块 ============

export const toggleLike = async (albumId: number) => {
  const res = await request({
    url: '/api/like',
    method: 'POST',
    data: { albumId },
    showLoading: false,
  })
  return res as { code: number, data: { liked: boolean, likeCount: number } }
}

export const getLikeStatus = async (albumIds: string) => {
  const res = await request({
    url: '/api/like/status',
    method: 'GET',
    data: { albumIds },
    showLoading: false,
  })
  return res as { code: number, data: Array<{ albumId: number, liked: boolean, likeCount: number }> }
}

// ============ 收藏模块 ============

export const toggleFavorite = async (albumId: number) => {
  const res = await request({
    url: '/api/favorite',
    method: 'POST',
    data: { albumId },
    showLoading: false,
  })
  return res as { code: number, data: { favorited: boolean } }
}

export const getFavoriteStatus = async (albumIds: string) => {
  const res = await request({
    url: '/api/favorite/status',
    method: 'GET',
    data: { albumIds },
    showLoading: false,
  })
  return res as { code: number, data: Array<{ albumId: number, favorited: boolean }> }
}

export const getFavoriteList = async (shopId?: number) => {
  const res = await request({
    url: '/api/favorite/list',
    method: 'GET',
    data: shopId ? { shopId } : undefined,
    showLoading: false,
  })
  return res as { code: number, data: AlbumBasic[] }
}

// ============ 搜索模块 ============

export const searchAlbums = async (keyword: string, page: number = 1, size: number = 10) => {
  const res = await request({
    url: '/api/search',
    method: 'GET',
    data: { keyword, page, size },
    showLoading: false,
  })
  return res as {
    code: number
    data: {
      list: AlbumBasic[]
      total: number
      page: number
      pageSize: number
      totalPages: number
    }
  }
}

// ============ 店铺模块 ============

export const getShops = async () => {
  const res = await request({
    url: '/api/shops',
    method: 'GET',
    showLoading: false,
  })
  return res as { code: number, data: ShopInfo[] }
}
```

### 4. 类型定义

建议在 `api.uts` 顶部添加类型定义：

```typescript
interface UserInfo {
  id: number
  openid: string
  phone: string | null
  nickname: string | null
  avatarUrl: string | null
}

interface AlbumBasic {
  id: number
  title: string
  coverImageUrl: string
  shopId: number
  price?: number
  likeCount: number
}

interface ShopInfo {
  id: number
  shopName: string
  displayName: string
  displayNameEn: string
  homeImage: string
  priceImage: string
  sortOrder: number
}
```

## Open Questions（已解答）

以下问题已由用户确认：

### Q1: 现有 http.uts 的 token 机制如何改造？ ✅ 已确认

**当前状态**: `http.uts` 已从 `auth.uts` 动态读取 storage 中的 token。

**决策**: token 统一由 `auth.uts` 管理,不在 `http.uts` 中硬编码。

- 新增 `auth.uts` 工具模块管理 token
- 修改 `http.uts` 中的 token 获取逻辑
- 需要处理未登录状态（token 为空的情况）

### Q2: 用户信息存储策略？ ✅ 已确认

**决策**: 全局存储一份用户信息。

- 登录成功后，将 `userInfo` 存储在 `uni.storage` 中
- 使用 `uni.setStorageSync('userInfo', userInfo)` 存储
- 页面需要用户信息时优先从 storage 读取
- 必要时可调用 `/api/wx/userinfo` 接口刷新用户信息

### Q3: 收藏功能迁移策略？ ✅ 已确认

**决策**: 放弃本地存储的所有收藏数据，直接切换至云端收藏功能。

- 不需要数据迁移
- 不需要兼容模式
- 直接调用云端 API 即可

### Q4: 搜索功能的入口和交互？ ✅ 已确认

**决策**: 搜索功能放在客片列表页（`pages/demoDetail`）。

### Q5: 多店铺场景下的数据展示？ ✅ 已确认

**决策**:

- 首页展示所有店铺列表
- 用户点击店铺后进入对应店铺的客片列表页
- 店铺 ID 通过路由参数传递给客片列表页

### Q6: 点赞数的展示来源？ ✅ 已确认

**决策**: 点赞接口会下发 `likeCount` 字段，列表页通过调用批量点赞状态接口获取点赞数。

### Q7: Base URL 配置？ ✅ 已确认

**决策**: 使用现有项目中的 base URL：`https://lanmei66.cloud`（来自 `config.uts`）

- 新接口的完整 URL 为：`https://lanmei66.cloud/api/xxx`

## 开发任务分解

基于上述接口，建议的开发任务顺序：

### Phase 1: 基础设施（认证体系）

1. 创建 `auth.uts` 工具模块（包含 token 和用户信息管理）
2. 改造 `http.uts` 支持动态 token
3. 实现微信登录流程（`wxLogin`），登录成功后全局存储 token 和 userInfo
4. 实现用户信息刷新（`wxGetUserInfo`，可选）

### Phase 2: 核心交互（点赞 + 收藏）

5. 实现点赞接口（`toggleLike`, `getLikeStatus`）
2. 实现收藏接口（`toggleFavorite`, `getFavoriteStatus`, `getFavoriteList`）
3. 改造客片展示模块，使用云端收藏替代本地存储

### Phase 3: 增值功能（搜索 + 店铺）

8. 实现搜索功能（`searchAlbums`）
2. 实现店铺列表（`getShops`）
3. 整合店铺选择逻辑

### Phase 4: 手机号绑定

11. 实现手机号绑定（`wxBindPhone`）
2. 完善用户信息展示

## 注意事项

1. **向后兼容**: 新增接口不应影响现有功能
2. **错误处理**: 所有接口需处理网络异常和业务错误
3. **Loading 状态**: 页面层自行控制加载状态
4. **类型安全**: 建议定义完整的 TypeScript 接口类型
5. **空状态处理**: 搜索无结果、收藏列表为空等场景需友好提示

## 依赖关系

```
页面层 (Pages)
    ↓
API 层 (api.uts)
    ↓
HTTP 层 (http.uts)
    ↓
认证层 (auth.uts) [新增]
    ↓
配置层 (config.uts)
```

## 测试建议

1. **登录流程**: 模拟微信 code，验证 token 获取和存储
2. **认证接口**: 验证 token 过期时的 401 处理
3. **点赞/收藏**: 验证 toggle 逻辑和状态同步
4. **搜索**: 验证空结果、特殊字符、模糊匹配
5. **边界情况**: 网络异常、接口超时、数据格式异常
