---
specanchor:
  level: global
  type: coding-standards
  version: "1.1.0"
  last_updated: "2026-05-11"
---

# Coding Standards Spec

## 文件命名

- 页面：统一使用 `index.uvue`，放在对应页面目录下（如 `pages/mine/index.uvue`）
- 工具：小驼峰，扩展名 `.uts`（如 `config.uts`、`legal.uts`）
- 组件：PascalCase（预留 `src/components/`）
- 静态资源：小驼峰或 kebab-case，原始扩展名

## UVue 文件结构

```vue
<template>
  <!-- 模板 -->
</template>

<script lang="uts">
  // 逻辑
</script>

<style>
  /* 样式 */
</style>
```

## 命名约定

| 类型     | 约定              | 示例                     |
| -------- | ----------------- | ------------------------ |
| 变量/函数 | camelCase         | `userInfo`、`getToken()` |
| 常量      | UPPER_SNAKE_CASE  | `MINI_APP_NAME`          |
| 类型/组件 | PascalCase        | `UserInfo`、`AlbumItem`  |
| CSS 类    | kebab-case        | `hide-scrollbar`         |

## 样式规范

1. 全局样式：`src/App.uvue`、`src/uni.scss`
2. 页面样式：页面 `<style>` 标签
3. 隐藏滚动条：使用 `.hide-scrollbar` 类
4. 单位统一使用 `rpx`；字体大小绝大多数用 rpx，个别像素敏感场景允许 `px`
5. 深色主题：正文页面背景 `#000`，协议页背景 `#fff`

## HTTP 调用约定（详见 `modules/src-utils.spec.md` 与 `modules/src-utils-api.spec.md`）

1. HTTP 请求统一通过 `src/utils/http.uts` 的 `request / get / post`，不直接调用 `uni.request`
2. API 接口定义集中在 `src/utils/api.uts`；业务层只 import 接口函数，不关心 URL 拼接
3. 请求头由 `http.uts` 统一注入：
   - `Content-Type: application/json`
   - `X-App-Code: <profile 注入>`（默认 `blueBerry`，由 profile 覆盖）
   - `Authorization: Bearer {token}`（`auth.uts.getToken()` 有值时自动添加）
4. 401 处理：`http.uts` 已统一清 token + 清 userInfo + 弹 toast + reject；页面不需要重复处理 401
5. 接口响应统一结构 `{ code, message?, data }`；业务仅在 `code === 200` 时使用 `data`

## 认证状态约定

1. token 与 userInfo 均存于 `uni.Storage`，读写必须通过 `src/utils/auth.uts` 的方法，不直接 `uni.getStorageSync('token')`
2. 需要合并写入（某接口返回字段不全时）必须使用 `mergeUserInfo`，禁止用 `setUserInfo` 覆盖以防抹掉头像/昵称
3. 未登录判断统一用 `isLoggedIn()`，不自行判空

## 协议命名约定

1. 小程序名、用户协议名、隐私政策名统一来自 `src/utils/legal.uts` 的 `MINI_APP_NAME / USER_AGREEMENT_NAME / PRIVACY_POLICY_NAME`
2. 协议页跳转统一调用 `openUserAgreement()` / `openPrivacyPolicy()`，禁止在业务代码里写死 `/pages/policies/...` 路径
3. `MINI_APP_NAME` 是 profile 注入点，不得在业务代码里硬编码小程序名称

## 条件编译

uni-app x 跨平台场景才使用条件编译；本项目当前只出微信小程序，一般无需：

```typescript
// #ifdef MP-WEIXIN
// 仅微信小程序逻辑
// #endif
```

## 静态资源引用

1. 引用路径使用 uni 运行时路径 `/static/xxx`，**不使用相对路径**
2. 引用的资源必须在 `src/static/` 真实存在；代码里写的任何 `/static/...` 若资源缺失即视为错误
3. profile 差异化资源通过 `profiles/<key>/static/` 覆盖 `src/static/`

## 响应式与数据结构

1. `computed` 属性避免依赖嵌套对象路径（如 `userInfo.avatarUrl`）——uvue 对嵌套路径的追踪不可靠
2. 需响应式刷新的字段优先拆平为基础类型 `data` 字段（见 `mine/index.uvue` 的 `userAvatarUrl / userNickname`）
3. 尽量避免 `reactive` 嵌套；复杂对象放到 `data` 顶层基本类型字段

## 注意事项

1. 页面路径必须在 `src/pages.json` 注册，否则构建失败
2. TabBar 页面必须配置在 `tabBar.list`
3. 配置值（appid / baseURL / 小程序名等）不得硬编码，通过 profile 注入
4. 源码根为 `src/`；不新增根目录 `pages/`、`static/`、`utils/` 或入口文件副本
5. 日志 `console.log` / `console.error` 可用于开发，上线前勿遗漏敏感信息输出
