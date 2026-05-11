---
specanchor:
  level: module
  module_name: src-pages-policies
  module_path: src/pages/policies
  version: "1.0.0"
  owner: "@team"
  status: active
  last_synced: "2026-05-11"
---

# Module Spec: 合规协议页模块

## 模块路径

`src/pages/policies/`

## 模块职责

承载微信小程序合规要求的《用户协议》与《隐私政策》两份全文。所有登录弹窗/授权弹窗中的协议链接都跳转到这两个页面。

## 关键文件

- `src/pages/policies/user.uvue` — 用户服务协议
- `src/pages/policies/privacy.uvue` — 隐私政策

## 路由与标题

两个页面均在 `src/pages.json` 的 `pages` 数组中注册，且 `apply-profile.mjs` 的 `requiredRoutes` 会自动补齐（换仓后的 pages.json 如果缺少这两条，注入脚本会报错中断）。

| 路由 | 标题 |
|------|------|
| `/pages/policies/user` | 用户协议 |
| `/pages/policies/privacy` | 隐私政策 |

## 品牌注入

页面中所有提及小程序名称的地方（标题、协议正文）**不得硬编码**，必须绑定 `legal.uts` 导出的 `MINI_APP_NAME`：

```uts
import { MINI_APP_NAME } from '../../utils/legal.uts'

data() {
  return { miniAppName: MINI_APP_NAME }
}
```

模板里统一用 `{{ miniAppName }}` 插值。`apply-profile.mjs` 会替换 `legal.uts` 顶部的 `MINI_APP_NAME` 常量，从而让两个 profile（blueberry / huahua）显示正确的品牌名。

## 跳转入口

协议页由 `legal.uts` 的 `openUserAgreement()` / `openPrivacyPolicy()` 统一调用，使用 `uni.navigateTo` 跳转。不要在其他页面里重复写裸路径 `/pages/policies/...`——所有入口必须走这两个导出函数。

## 正文规范

- 日期需要手动维护（`更新日期` / `生效日期`）
- 公司名称、邮箱等工商信息当前是硬编码的"弥勒蓝梅网络传媒有限公司 / <m1130254909@gmail.com>"。换主体时需要手动修改，这一层 profile 目前未注入（潜在扩展点）
- 不得在协议页嵌入第三方图片、外链或 webview

## 关键约定

1. **必须走 legal.uts**：小程序名称统一通过 `MINI_APP_NAME` 注入，不得在 template 里硬编码"蓝梅旅拍 SKILL"等字面量。
2. **路由必存**：`pages.json` 缺少这两个路由会导致 profile 注入失败，不得删除或改名。
3. **无登录要求**：协议页完全静态，不依赖 token/userInfo。
4. **入口统一**：其他页面跳转协议页必须调 `openUserAgreement` / `openPrivacyPolicy`。

## 关联规范

- `global/wechat-auth-compliance.spec.md` — 登录合规弹窗对协议同意的强制要求
- `global/profile-management.spec.md` — `MINI_APP_NAME` 注入路径
- `modules/src-pages-mine.spec.md` — 登录弹窗里的协议跳转入口
