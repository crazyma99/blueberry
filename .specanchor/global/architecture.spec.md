---
specanchor:
  level: global
  type: architecture
  version: "1.1.0"
  last_updated: "2026-05-11"
---

# Architecture Spec

## 架构分层

```
┌─────────────────────────────────────────────┐
│ 页面层 (src/pages/*.uvue)                    │
│   - TabBar 页面、业务页面、协议页、WebView   │
├─────────────────────────────────────────────┤
│ 工具层 (src/utils/*.uts)                     │
│   - config / http / api / auth / legal       │
├─────────────────────────────────────────────┤
│ 运行时 (uni-app x / @dcloudio/*)            │
├─────────────────────────────────────────────┤
│ 目标平台 (微信小程序 mp-weixin)              │
└─────────────────────────────────────────────┘

构建 / 发布侧（不进运行时）：
┌─────────────────────────────────────────────┐
│ 脚本层 (scripts/*.sh + scripts/lib/*.mjs)    │
│   - profile 差异化注入、构建流水线、校验     │
└─────────────────────────────────────────────┘
```

## 模块划分

### 页面模块

| 模块     | 路径                                                      | 说明                                            |
| -------- | --------------------------------------------------------- | ----------------------------------------------- |
| 首页     | `src/pages/index/`                                        | 应用入口，品牌展示、客片预览、店铺入口          |
| 价目表   | `src/pages/priceHomePage/`、`src/pages/priceList/`        | 店铺价目表与价目详情                            |
| 客片展示 | `src/pages/demoDetail/`、`src/pages/targetPhotoDetail/`   | 客片列表（分类/搜索/点赞）与详情页              |
| 我的     | `src/pages/mine/`                                         | 登录态、快捷入口、中台 Banner、退出登录         |
| 收藏     | `src/pages/favorites/`                                    | 我的收藏列表 + 搜索                             |
| 协议     | `src/pages/policies/`                                     | 用户协议 (`user`) 与隐私政策 (`privacy`)        |
| WebView  | `src/pages/webview/`                                      | 承载外部链接                                    |

### 工具模块

| 模块 | 路径                  | 职责                                                     |
| ---- | --------------------- | -------------------------------------------------------- |
| 配置 | `src/utils/config.uts`| HTTP baseURL 与 timeout（profile 注入点）                |
| HTTP | `src/utils/http.uts`  | `uni.request` 封装、token 注入、401 自动登出、错误处理   |
| API  | `src/utils/api.uts`   | 业务接口定义（客片/登录/点赞/收藏/搜索/店铺/中台）       |
| 认证 | `src/utils/auth.uts`  | token 与 userInfo 的 storage 管理、登录态判断、合并写入  |
| 合规 | `src/utils/legal.uts` | 协议命名常量与协议页跳转方法                             |

### 脚本层（profile 体系）

详见 `global/profile-management.spec.md` 与 `modules/src-scripts.spec.md`。

## 数据流

### 业务请求链路

```
页面 → api.uts(业务接口) → http.uts(request) → config.uts(baseURL/timeout) → uni.request → 后端
                                ↓
                          auth.uts(token)
                          注入 Authorization 头
```

### 401 自动登出链路

`http.uts` 收到 `statusCode === 401` 时：

1. `clearToken()` 清除本地 token
2. `clearUserInfo()` 清除用户信息
3. 统一弹 toast：`登录已过期，请重新登录`
4. reject Promise，页面自行决定下一步（通常在 `onShow` 中重新判断登录态）

### 登录链路（详见 `global/wechat-auth-compliance.spec.md`）

```
用户点击登录 → uni.login(code) → wxLogin → 拿 token+userInfo → mergeUserInfo
              → wxBindPhone(phoneCode) → 补齐手机号
              → [若缺 nickname/avatar] → chooseAvatar + nickname input → wxUpdateUserInfo
```

### Profile 注入链路（构建期，不进运行时）

```
profiles/<key>/project.env → scripts/apply-profile.sh → scripts/lib/apply-profile.mjs
      → 写入 package.json / project.config.json / src/manifest.json / src/pages.json
      → 写入 src/utils/config.uts (baseURL)
      → 写入 src/utils/http.uts (X-App-Code 头)
      → 写入 src/utils/legal.uts (MINI_APP_NAME)
      → 写入部分页面文案与静态资源
```

## 扩展指南

1. **新增页面**：在 `src/pages/` 创建目录 + `index.uvue`，并在 `src/pages.json` 注册
2. **新增工具**：在 `src/utils/` 新建 `.uts` 文件；如涉及网络请求，业务接口统一放 `api.uts`
3. **新增 API**：在 `src/utils/api.uts` 添加 export，使用 `request()` 调用；响应结构按 `{ code, message, data }` 约定
4. **静态资源**：存放于 `src/static/`；profile 差异化资源通过 `profiles/<key>/static/` 覆盖
5. **profile 注入点**：仅限 `scripts/lib/apply-profile.mjs` 中 `required` 数组声明的键；新增字段需同步更新脚本与本文档
6. **根目录副本禁令**：不得在仓库根新建 `pages/`、`static/`、`utils/` 或同名入口文件副本
