---
specanchor:
  level: module
  module_name: src-utils
  module_path: src/utils
  version: "1.1.0"
  owner: "@team"
  status: active
  last_synced: "2026-05-07"
---

# Module Spec: 工具模块

## 模块路径

`src/utils/`

## 模块职责

工具模块提供全局通用的网络请求、API 接口定义、认证状态和配置管理功能。

## 文件结构

```
src/utils/
├── config.uts    # 配置管理
├── http.uts      # HTTP 请求封装
├── api.uts       # API 接口定义
└── auth.uts      # token 与用户信息管理
```

## config.uts - 配置管理

### 职责

提供 HTTP 请求的基础配置 (域名、超时时间等)。

### 接口定义

```typescript
interface HttpConfig {
  baseURL: string
  timeout: number
}

function getHttpConfig(): HttpConfig
```

### 当前配置

- `baseURL`: `https://lanmei66.cloud`
- `timeout`: `15000` (15 秒)

### 注意事项

1. 域名配置为硬编码,生产环境建议通过环境变量管理
2. 超时时间应根据网络环境调整

## http.uts - HTTP 请求封装

### 职责

封装 `uni.request`,提供统一的请求接口、错误处理和认证机制。

### 核心类型

```typescript
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface RequestOptions {
  url: string
  method?: HttpMethod
  data?: any
  header?: Record<string, string>
  showLoading?: boolean
}
```

### 导出方法

1. **request<T>(opts)**: 通用请求方法
   - 参数: `RequestOptions`
   - 返回: `Promise<T>`
   - 功能: 拼接完整 URL、添加认证头、处理响应

2. **get<T>(url, params, options)**: GET 请求快捷方法
   - 返回: `Promise<T>`

3. **post<T>(url, data, options)**: POST 请求快捷方法
   - 返回: `Promise<T>`

### 请求处理流程

1. 拼接完整 URL (`baseURL` + `url`)
2. 添加请求头:
   - `Content-Type: application/json`
   - `Authorization: Bearer <token>` (登录后由 `auth.uts` 提供)
3. 可选显示 Loading 提示
4. 发起请求
5. 处理响应:
   - 状态码 200-299: resolve
   - 其他状态码: reject
6. 隐藏 Loading (如果显示过)

### 认证机制

`http.uts` 从 `auth.uts` 读取 token。响应状态码为 401 时清除 token 和用户信息,并提示重新登录。

### 注意事项

1. token 不在 `http.uts` 内硬编码
2. 未实现请求重试机制
3. Loading 提示需手动控制 (`showLoading` 参数)

## api.uts - API 接口定义

### 职责

定义业务 API 接口,封装请求参数和响应处理。

### 导出接口

#### 1. getImage(method, params)

获取轮播图/图片数据

- **参数**:
  - `method`: HTTP 方法
  - `params`: 查询参数 (如 `{ type: 0 }`)
- **返回**: `Promise<any>`
- **接口**: `/wechat/carousels`
- **用途**: 首页轮播图、价目表轮播图

#### 2. getalbum(method, params)

获取客片一级列表

- **参数**:
  - `method`: HTTP 方法
  - `params`: 查询参数 (如 `{ type: id }`)
- **返回**: `Promise<any>`
- **接口**: `/wechat/album`
- **用途**: 客片列表页数据

#### 3. getalbumDetail(method, params)

获取客片详情

- **参数**:
  - `method`: HTTP 方法
  - `params`: 查询参数 (如 `{ albumId, type }`)
- **返回**: `Promise<any>`
- **接口**: `/wechat/album/detail`
- **用途**: 客片详情页数据

#### 4. getCategories(shopId)

- **接口**: `/wechat/categories`
- **用途**: 客片列表页分类

#### 5. getAlbumList(params)

- **接口**: `/wechat/albums`
- **用途**: 客片列表页分页、分类和搜索

#### 6. getShops()

- **接口**: `/api/shops`
- **用途**: 首页和价目表首页的店铺入口

#### 7. 登录/用户接口

- `wxLogin(params)`: `POST /api/wx/login`
- `wxBindPhone(code)`: `POST /api/wx/phone`
- `wxGetUserInfo()`: `GET /api/wx/userinfo`
- `wxUpdateUserInfo(params)`: `PUT /api/wx/userinfo`

#### 8. 点赞/收藏/搜索/配置接口

- `toggleLike(albumId)`, `getLikeStatus(albumIds)`
- `toggleFavorite(albumId)`, `getFavoriteStatus(albumIds)`, `getFavoriteList(shopId?)`
- `searchAlbums(keyword, page?, size?)`
- `getPageConfig()`

## auth.uts - 认证状态

### 职责

集中管理 token 和用户信息,供 `http.uts` 与页面读取。

### 导出方法

- `getToken()`, `setToken(token)`, `clearToken()`
- `getUserInfo()`, `setUserInfo(userInfo)`, `mergeUserInfo(userInfo)`, `clearUserInfo()`
- `isLoggedIn()`
- `loginSuccess(token, userInfo)`, `logout()`

### 接口调用规范

所有 API 接口遵循统一的调用模式:

```typescript
const res = await apiName('get', { param1, param2 })
const { code, data } = res
if (code !== 200) return
// 处理 data
```

### 注意事项

1. 所有接口使用 `showLoading: false`,需页面自行控制加载状态
2. 旧接口仍保留 `method` 参数以兼容调用方,新增接口直接固定 HTTP 方法
3. 错误处理在页面层进行

## 依赖关系

```
api.uts → http.uts → config.uts
           ↓
        auth.uts
           ↓
       uni.request
```

## 扩展指南

### 新增 API 接口

在 `src/utils/api.uts` 中添加新方法:

```typescript
export const newApi = async (method: string, params?: any) => {
  const res = await request({
    url: '/wechat/new-endpoint',
    method: (method || 'GET').toUpperCase() as any,
    data: params,
    showLoading: false,
  })
  return res
}
```

### 修改配置

在 `src/utils/config.uts` 中修改 `getHttpConfig()` 返回值。

### 增强 HTTP 请求

可在 `src/utils/http.uts` 中添加:
- 请求拦截器
- 响应拦截器
- 错误重试机制
- Token 刷新逻辑
