---
specanchor:
  level: module
  module_name: src-pages-webview
  module_path: src/pages/webview
  version: "1.0.0"
  owner: "@team"
  status: active
  last_synced: "2026-05-11"
---

# Module Spec: Webview 外链承载页模块

## 模块路径

`src/pages/webview/index.uvue`

## 模块职责

以微信小程序内嵌 `<web-view>` 的方式承载任意外部 URL，是小程序内跳转到 H5 页面的唯一出口。

## 关键文件

- `src/pages/webview/index.uvue` — 唯一入口，约 28 行

## 实现约定

- 页面通过 URL 参数 `url` 接收目标地址：`/pages/webview/index?url=<encodeURIComponent(xxx)>`
- `onLoad(options)` 读取 `options.url`，调用 `decodeURIComponent` 还原后赋值给 `this.url`
- 模板只有一个 `<web-view :src="url">`，容器样式撑满视口（`width: 100%; height: 100vh`）

## 调用方

常见调用来源：

- 我的页金刚区菜单：`handleMenuClick(item)` 中 `linkType === 'webview'` 的项走这里
- Banner 点击：`handleBannerClick(banner)` 中带 URL 字段的项走这里

调用方必须对 URL 进行 `encodeURIComponent` 后再拼接，否则 URL 里的 `?` / `&` / `=` 会被截断。

## 合规性

- 微信小程序 `<web-view>` 要求目标域名在小程序后台 **业务域名** 中白名单备案
- 非备案域名在真机上会直接阻断加载；开发者工具可能不报错，需真机回归

## 关键约定

1. **URL 必须 encodeURIComponent**：调用方负责 encode，承载页负责 decode。
2. **`navigationBarTitleText: ''`**：本页标题由目标 H5 的 `<title>` 决定（微信默认行为），`pages.json` 中刻意留空。
3. **不放业务逻辑**：本页仅做通用承载，任何业务定制（上报、登录、分享）都不应写在此文件中。
4. **域名白名单**：新增跳转目标前，检查业务域名是否已配置在小程序后台。

## 关联规范

- `global/project-setup.spec.md` — 页面清单登记
- `modules/src-pages-mine.spec.md` — 金刚区 / Banner 跳转入口
