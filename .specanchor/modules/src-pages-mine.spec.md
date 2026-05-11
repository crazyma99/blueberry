---
specanchor:
  level: module
  module_name: src-pages-mine
  module_path: src/pages/mine
  version: "1.0.0"
  owner: "@team"
  status: active
  last_synced: "2026-05-11"
---

# Module Spec: 我的模块

## 模块路径

`src/pages/mine/index.uvue`

## 模块职责

承载用户登录入口、登录后信息展示、金刚区快捷菜单、轮播 Banner 以及退出登录。是项目唯一实现完整微信小程序登录合规流程的页面。

## 关键文件

- `src/pages/mine/index.uvue` — 唯一入口文件，包含登录三步骤、头像昵称合规授权、退出登录。

## 页面状态机

| 状态 | 条件 | UI |
|------|------|----|
| `loading` | `onLoad` 初始化中 | 骨架屏 (`.sk-*`) |
| 未登录 | `isLoggedIn === false` | 头像显示灰色占位圆；昵称显示「点击登录」；不显示「退出登录」按钮 |
| 已登录 | `isLoggedIn === true` | 头像渲染 `userInfo.avatarUrl`（失败时仍露灰底）；昵称渲染 `userInfo.nickname`；显示「退出登录」 |

## 登录流程（三步协议）

点击「获取手机号」（`<button open-type="getPhoneNumber" @getphonenumber="onGetPhoneNumber">`）后：

1. **step0 — getPhoneNumber 回调**：从 `e.detail.code` 取 `phoneCode`。若 `errMsg !== 'getPhoneNumber:ok'` 或缺 code，按拒绝/失败提示并中断。
2. **step1 — `uni.login({ provider: 'weixin' })`**：拿到 `loginRes.code`（wx code）。
3. **step2 — `wxLogin({ code: loginRes.code })`**：后端用 wx code 换 token；成功时 `loginSuccess(token, userInfo)` 写入 storage。
4. **step3 — `wxBindPhone(phoneCode)`**：用 phoneCode 绑定手机号；必须用 `mergeUserInfo(data)` 而非 `setUserInfo`，避免该响应的 null 字段覆盖 step2 的头像昵称。
5. **step4 — 头像昵称补齐判断**：
   - 若 step3 返回的 `nickname` 与 `avatarUrl` 均非空 → 直接 toast「登录成功」并 `updateLoginState()` 刷新 UI
   - 否则 → 关闭手机号登录弹窗，调用 `openProfilePopup()` 弹出头像昵称授权弹窗

## 头像昵称合规实现

- **头像**：`<button open-type="chooseAvatar" @chooseavatar="onChooseAvatar">` → 从 `e.detail.avatarUrl` 取微信官方原图 URL。
- **昵称**：`<input type="nickname">`（微信合规 input 类型，用户可在原生面板中使用推荐昵称）。
- **提交**：`confirmProfile()` 调 `wxUpdateUserInfo({ nickname, avatarUrl })`，成功后 `mergeUserInfo(res.data)` 再关闭弹窗。

## 协议同意约束

登录弹窗和 profile 弹窗都要求勾选同意《用户协议》《隐私政策》后才能提交：

- 未勾选时调 `showLoginAgreementToast()` 提示
- 协议链接通过 `openUserAgreement()` / `openPrivacyPolicy()`（来自 `src/utils/legal.uts`）跳转

## 已登录兜底入口

`handleUserClick()`：已登录用户再次点击用户区域时调 `openProfilePopup()`，允许补齐/修改头像昵称（解决首页或详情页「跳过 profile 授权」场景的后续补齐）。

## 金刚区 / Banner

- 菜单项和 Banner 数据由后端配置页接口 `getPageConfig()` 返回，分别渲染到 `menuItems` 和 `banners`。
- 菜单点击走 `handleMenuClick(item)`：根据 `item.linkType` / `item.linkUrl` 执行 switchTab、navigateTo 或 webview 跳转。

## 退出登录

- 仅在 `isLoggedIn === true` 时显示
- `confirmLogout()` 调 `uni.showModal` 二次确认 → 调 `logout()`（来自 `auth.uts`，清除 token 与 userInfo）→ `updateLoginState()` 刷新 UI

## 依赖

- `src/utils/api.uts` — `wxLogin` / `wxBindPhone` / `wxUpdateUserInfo` / `getPageConfig`
- `src/utils/auth.uts` — `isLoggedIn` / `getUserInfo` / `loginSuccess` / `mergeUserInfo` / `logout`
- `src/utils/legal.uts` — `openUserAgreement` / `openPrivacyPolicy`

## 关键约定

1. **mergeUserInfo 优先于 setUserInfo**：任何从 `wxBindPhone` / `wxUpdateUserInfo` 返回的数据都必须走 `mergeUserInfo`，防止 null 回写。
2. **头像加载失败不兜底图**：`.avatar` 自带灰色背景；`.avatar-img` 仅在 `displayAvatar !== ''` 时渲染；加载失败透明显示，始终露出灰底。
3. **登录链路日志规范**：每个 step 前缀 `[login] stepN`，便于排查。
4. **弹窗互斥**：登录弹窗与 profile 弹窗不同时展示；手机号登录成功后先关 login popup 再开 profile popup。

## 关联规范

- `global/wechat-auth-compliance.spec.md` — 登录三步骤协议、头像昵称合规实现
- `modules/src-utils.spec.md` — auth.uts 的 `mergeUserInfo` 语义
- `modules/src-utils-api.spec.md` — 登录相关 API 定义
