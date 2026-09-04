# 蓝莓小程序（blueberry）CHANGELOG

> 记录小程序 C 端每次实质性改动，最新在上。多人合作提交前先补本文件（与代码同一提交）。

## 2026-09-04 · 品牌馆中台 + banner 跳转 + 版权第二行（6 项，PR #2）

- **品牌馆中台页面**：新增 `pages/brandHub/index`，首页左上角圆形「馆」按钮进入；品牌列表复用后端 `GET /api/brands`（后端零改动）；点品牌卡 → 写入品牌上下文并切回首页（首页按品牌维度加载）；记住上次品牌（`utils/brand.uts` storage 持久化）。
- **首页修复**：`reloadHomeData` 移入 `methods`（原顶层定义导致 `not a function`，骨架屏卡死）；`getPageConfig` 缓存加品牌维度键（中台切换品牌后服务保障/联系我们/版权字段立即刷新）。
- **版权第二行**：`AppFooter` 全站新增「小程序及AI技术能力由 蓝梅网络 提供支持」（默认固定文案，OPS 版权配置 `supportText` 可覆盖；仅超管可配）。
- **banner 点击跳转**：首页轮播 `hero-image` 点击 → `onBannerClick`（300ms 防重复 + 触感 + 前端白名单兜底；`/pages/` → navigateTo/switchTab，http(s) → webview 页）。数据源 `linkUrl` 由后端 `/wechat/carousels` 下发（配合后端 keep-admin-changes 分支）。
- **hero-mask 调整**：50% 高 + `bottom: 0` + 两 stop 渐变（透明 20% → 背景色 96%）。
- **退出登录间距**：`BottomActionBarSecondary` 的 `bottomOffset` 改固定 `116rpx`（`env(safe-area-inset-bottom)` 真机失效）。

## 2026-09-03 · UI 品牌化大改造（PR #1，squash af81a01）

- Design Token 体系（design-token.md + 全局 CSS 变量：颜色/字号/圆角/间距/渐变/图标）。
- 组件化：LoginPopup/ProfilePopup 弹窗、AppInput/AppSelector/AppSegment/AppPhotoPicker 表单、BottomActionBar/BottomActionBarSecondary 底部栏。
- 我的页视觉换新（Noto Serif 标题体系、金色氛围、用户卡片质感、列表合成一块）。
- 全站交互：按压态（press-dim/press-row）、触感振动（utils/haptics.uts）、150/250ms 过渡、图片渐显。
- 弹窗统一居中方案（底部弹层在 skyline 不稳定）；字重统一默认 400。