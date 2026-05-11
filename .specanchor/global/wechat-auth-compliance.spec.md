---
specanchor:
  level: global
  type: wechat-auth-compliance
  version: "1.0.0"
  last_updated: "2026-05-11"
---

# WeChat Auth & Compliance Spec

> 规范微信小程序登录、用户信息授权、协议合规弹窗的实现。本 Spec 沉淀现有「微信用户信息授权实现方案」为可约束文档。

## 登录三步骤协议

### 流程

```
用户点击「一键登录」（前置：已勾选同意协议）
   │
   ├─ step0: getPhoneNumber 回调  → phoneCode
   ├─ step1: uni.login({ provider: 'weixin' })  → wxCode
   ├─ step2: wxLogin({ code: wxCode })          → { token, userInfo }
   │          loginSuccess(token, userInfo)      // 写 storage
   ├─ step3: wxBindPhone(phoneCode)              → phoneData（含 phone，可能含 nickname/avatar）
   │          mergeUserInfo(phoneData)            // 合并写入，不覆盖已有字段
   └─ step4: 判断是否已补齐 nickname + avatarUrl
            ├─ 都齐 → 直接登录完成
            └─ 缺其一 → 拉起「头像昵称授权弹窗」
```

### 参考实现

`src/pages/mine/index.uvue` 的 `onGetPhoneNumber`（line 300-382）为权威实现。其它页面（如首页登录弹窗）复用同一协议。

## 授权触发判断

### 何时需要拉起「头像昵称授权弹窗」

```typescript
const phoneHasFullProfile =
  pNick != null && pNick !== '' &&
  pAvatar != null && pAvatar !== ''
if (!phoneHasFullProfile) this.openProfilePopup()
```

- 昵称判空：`nickname == null || nickname === ''`
- 头像判空：`avatarUrl == null || avatarUrl === ''`
- 已登录用户在「我的」页点击头像也可触发 `openProfilePopup` 修改资料

## 头像昵称授权合规实现

### 必须使用官方授权组件（不可自行跳转）

1. **头像**：`<button open-type="chooseAvatar" @chooseavatar="onChooseAvatar">`
   - 回调拿到 `e.detail.avatarUrl`，赋给 `profileAvatarUrl`
   - 本地先乐观写入 storage，避免后端未返回 `avatarUrl` 时 UI 回退
2. **昵称**：`<input type="nickname" v-model="profileNickname" />`
   - 微信提供的昵称选择键盘组件，用户可从微信昵称选择
3. **提交**：`wxUpdateUserInfo({ nickname?, avatarUrl? })`（`PUT /api/wx/userinfo`）
   - 只传有值的字段，避免用空串覆盖后端
   - 响应后 `mergeUserInfo(updateRes.data)` 再次合并

## UI 状态分支（用户区域渲染）

### 在 `mine` 页的权威实现

| 登录状态 | userAvatarUrl | userNickname | 展示                                          |
| -------- | ------------- | ------------ | --------------------------------------------- |
| 未登录   | -             | -            | 灰底圆形 DOM（`.avatar` 仅背景色，不渲染 image） + 昵称「点击立即登陆」 |
| 已登录   | 空            | 空           | 灰底圆形 + 昵称「点击获取用户信息」           |
| 已登录   | 有值          | 空           | 头像 image + 昵称「点击获取用户信息」         |
| 已登录   | 空            | 有值         | 灰底圆形 + 昵称显示                           |
| 已登录   | 有值          | 有值         | 头像 image + 昵称显示                         |

### 关键实现约束

1. **不使用任何兜底头像图**：未登录 / 无头像时 `<image>` 元素不渲染，露出 `.avatar` 的灰色背景 DOM（`background: #333`）
2. **响应式拆平**：`userAvatarUrl / userNickname` 必须是 `data` 顶层基础类型字段，**禁止** 依赖 `userInfo.avatarUrl` 这种嵌套路径（uvue 追踪不可靠）
3. **兜底刷新**：页面 `onShow` 检测到已登录但 `userAvatarUrl === ''` 时，主动 `wxGetUserInfo()` 拉一次后端最新信息并 `mergeUserInfo`

## 合规弹窗调用

### 协议勾选前置条件

登录按钮逻辑分支（`mine/index.uvue:88-98`）：

```html
<!-- 已勾选同意 → 才允许原生 getPhoneNumber 按钮 -->
<button v-if="loginAgreementChecked" class="login-phone-btn"
        open-type="getPhoneNumber" @getphonenumber="onGetPhoneNumber">一键登录</button>
<!-- 未勾选 → 点击提示"请先同意协议" -->
<button v-else class="login-phone-btn"
        @click="showLoginAgreementToast">一键登录</button>
```

> 这是微信合规审核核心检查点：**用户未同意协议前，不得触发任何授权请求**。

### 协议命名与跳转

- 协议名统一从 `src/utils/legal.uts` 读取：`USER_AGREEMENT_NAME` / `PRIVACY_POLICY_NAME`
- 跳转统一调用 `openUserAgreement()` / `openPrivacyPolicy()`，禁止直接写 `/pages/policies/...`

## 合并写入语义（auth.uts.mergeUserInfo）

### 为什么必须 merge，不能 set

- `wxBindPhone` 响应只包含 `phone` 及部分字段，若用 `setUserInfo` 直接覆盖，step2 `wxLogin` 写入的 nickname/avatarUrl 会被抹成 null
- `wxUpdateUserInfo` 响应可能不包含 `phone`，同样存在覆盖风险

### merge 规则

`mergeUserInfo(partial)`（`auth.uts:92-106`）：

- 对每个字段：若 `partial` 的该字段**非 null 且非空串**，用新值；否则保留旧值
- `id === 0` 视为缺省；`openid / phone / nickname / avatarUrl` 空串视为缺省

### 调用点清单

| 调用点                              | 场景                                   |
| ----------------------------------- | -------------------------------------- |
| `loginSuccess(token, userInfo)`     | `wxLogin` 之后首次完整写入（setUserInfo）|
| `mergeUserInfo(phoneData)`          | `wxBindPhone` 后合并手机号等           |
| `mergeUserInfo(optimistic)`         | 用户点「确认」提交头像昵称前乐观合并    |
| `mergeUserInfo(updateRes.data)`     | `wxUpdateUserInfo` 响应后合并          |
| `mergeUserInfo(res.data)` in onShow | 兜底拉取最新用户信息                   |

## Token 与 Storage 约定

| key        | 用途          | 读取                | 写入             | 清除          |
| ---------- | ------------- | ------------------- | ---------------- | ------------- |
| `token`    | Bearer token  | `getToken()`        | `setToken()`     | `clearToken()`|
| `userInfo` | 用户信息对象  | `getUserInfo()`     | `setUserInfo()` / `mergeUserInfo()` | `clearUserInfo()` |

- `isLoggedIn()` 判定：`token !== '' && token !== 'undefined' && token !== 'null'`
- `logout()`：同时 `clearToken()` + `clearUserInfo()`，并提示 toast

## 安全与错误处理

1. `getPhoneNumber` 返回 `detail.errMsg !== 'getPhoneNumber:ok'` 时按 deny/cancel 或其它失败分流提示
2. `uni.login` 失败（无 code）→ 统一 toast 提示，不继续后续步骤
3. `wxLogin` 失败（`code !== 200`）→ 提前 `uni.hideLoading` 并 toast 原因
4. 任意 step 抛异常 → `catch` 中 hideLoading + 统一 toast「登录失败，请重试」
5. 401 由 `http.uts` 统一处理；本层不需要额外判断

## 退出登录

```
用户点「退出登录」 → uni.showModal 二次确认
   确认 → logout()  // 清 token + 清 userInfo
         → 重置所有弹窗状态
         → updateLoginState()
         → toast「已退出登录」
```

参考 `mine/index.uvue:confirmLogout`。
