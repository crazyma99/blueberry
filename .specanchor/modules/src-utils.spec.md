---
specanchor:
  level: module
  module_name: src-utils
  module_path: src/utils
  version: "1.2.0"
  owner: "@team"
  status: active
  last_synced: "2026-05-11"
---

# Module Spec: 工具模块

## 模块路径

`src/utils/`

## 模块职责

提供全局通用的网络请求、配置、认证状态与合规命名能力。**业务 API 接口定义集中在 `api.uts`，单独有 Module Spec：`src-utils-api.spec.md`**，本 Spec 不再重复枚举接口。

## 文件结构

```
src/utils/
├── config.uts    # baseURL / timeout 配置
├── http.uts      # uni.request 封装、token 注入、401 自动登出
├── api.uts       # 业务接口（详见 src-utils-api.spec.md）
├── auth.uts      # token 与 userInfo 的 storage 管理
└── legal.uts     # 协议命名常量与协议页跳转
```

## config.uts - HTTP 基础配置

### 接口

```typescript
interface HttpConfig {
  baseURL: string
  timeout: number
}
function getHttpConfig(): HttpConfig
```

### 当前默认

- `baseURL`: `'https://www.lanmei66.clound'`（由 profile `API_BASE_URL` 注入）
- `timeout`: `15000` ms

### 约定

1. `baseURL` 是 profile 注入点；禁止业务代码直接引用硬编码域名
2. 超时 15s 覆盖绝大多数接口；个别长请求需由调用方在 `uni.request` 外层加超时控制

## http.uts - HTTP 封装

### 核心类型

```typescript
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface RequestOptions {
  url: string
  method?: HttpMethod          // 默认 GET
  data?: any
  header?: Record<string, string>
  showLoading?: boolean        // 默认 false
}
```

### 导出方法

| 方法                                                      | 说明                     |
| --------------------------------------------------------- | ------------------------ |
| `request<T>(opts: RequestOptions): Promise<T>`            | 通用请求                 |
| `get<T>(url, params?, options?): Promise<T>`              | GET 快捷                 |
| `post<T>(url, data?, options?): Promise<T>`               | POST 快捷                |

### 请求处理流程

1. `withBaseURL(url)`：`http(s)://` 开头直接用，否则拼 `baseURL`
2. 读 `getToken()`（`auth.uts`）
3. 构造 `finalHeader`：
   - `Content-Type: application/json`
   - `X-App-Code: blueBerry`（profile `APP_CODE` 注入）
   - 可选 `Authorization: Bearer <token>`（token 非空才加）
   - 外部 `opts.header` 合并覆盖
4. `showLoading=true` 时 `uni.showLoading({ title: '加载中', mask: true })`
5. `uni.request` 发起，使用 `config.timeout`
6. 响应处理：
   - `status === 401` → `clearToken()` + `clearUserInfo()` + toast「登录已过期」+ reject
   - `200 <= status < 300` → `resolve(res.data)`
   - 其它 → `reject(new Error('请求失败: <status>'))`
7. `complete` 中 `uni.hideLoading`（若曾开启）

### 认证机制

- Token 从 `auth.uts` 动态读取，不缓存
- 401 统一登出，业务层不需要重复处理
- `X-App-Code` 头是后端区分多项目的关键；profile 可通过 `APP_CODE` 覆盖

### 不实现事项

- 没有请求重试
- 没有请求/响应拦截器链
- 没有 token 自动刷新

## auth.uts - 认证状态

### 接口定义

```typescript
interface UserInfo {
  id: number
  openid: string
  phone: string | null
  nickname: string | null
  avatarUrl: string | null
}
```

### 导出方法

| 方法                                        | 说明                                 |
| ------------------------------------------- | ------------------------------------ |
| `getToken(): string`                        | 读 storage 的 `token`，无则返回 `''` |
| `setToken(token: string): void`             | 写 storage                           |
| `clearToken(): void`                        | 清 storage                           |
| `getUserInfo(): UserInfo \| null`           | 读 storage 的 `userInfo`             |
| `setUserInfo(userInfo: UserInfo): void`     | 直接覆盖写入                         |
| `mergeUserInfo(partial: UserInfo): void`    | **合并写入**，空值不覆盖已有字段     |
| `clearUserInfo(): void`                     | 清 storage                           |
| `isLoggedIn(): boolean`                     | `token !== ''` 且非 `'undefined'`/`'null'` |
| `loginSuccess(token, userInfo): void`       | 一次性写 token + userInfo            |
| `logout(): void`                            | 同时清 token + userInfo              |

### mergeUserInfo 语义（关键）

对每个字段：若 `partial` 的该字段**非 null 且非空串**，取新值；否则保留旧值。

- `id === 0` 视为缺省
- `openid / phone / nickname / avatarUrl` 空串视为缺省

> 详见 `global/wechat-auth-compliance.spec.md` 的「合并写入语义」。

### 约束

1. 业务代码**必须**通过本模块的 getter/setter 访问，禁止直接 `uni.getStorageSync('token')`
2. 登录后只用 `loginSuccess` 写入；后续分步补齐必须用 `mergeUserInfo`

## legal.uts - 合规命名

### 导出常量与方法

```typescript
export const MINI_APP_NAME = '蓝梅旅拍 SKILL'              // profile 注入
export const USER_AGREEMENT_NAME = '《... 用户协议》'
export const PRIVACY_POLICY_NAME = '《... 隐私政策》'
export function openUserAgreement(): void
export function openPrivacyPolicy(): void
```

### 约束

1. `MINI_APP_NAME` 是 profile 注入点（`apply-profile.mjs` 替换）
2. 用户协议、隐私政策的命名**必须**从本模块导入，不允许在业务代码硬编码
3. 协议页跳转**必须**用 `openUserAgreement()` / `openPrivacyPolicy()`，不得写 `uni.navigateTo({ url: '/pages/policies/...' })`

## 依赖关系

```
api.uts → http.uts ─┬→ config.uts (baseURL / timeout)
                    └→ auth.uts   (token / clearToken / clearUserInfo)

页面 → auth.uts  (isLoggedIn / getUserInfo / logout / mergeUserInfo)
页面 → legal.uts (MINI_APP_NAME / openUserAgreement / openPrivacyPolicy)
```

## 扩展指南

- **修改请求头/拦截逻辑** → 只改 `http.uts` 的 `finalHeader` 块与 success 处理
- **新增全局配置** → 扩展 `HttpConfig` 并同步更新 `getHttpConfig()` 与 profile 注入脚本
- **新增认证能力** → 在 `auth.uts` 增方法；不破坏现有 `mergeUserInfo` 语义
- **新增协议页** → 在 `legal.uts` 加常量 + 跳转方法；业务代码复用该方法
- **新增业务接口** → 见 `src-utils-api.spec.md`
