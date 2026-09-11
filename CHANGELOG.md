# 蓝莓小程序（blueberry）CHANGELOG

> 记录小程序 C 端每次实质性改动，最新在上。多人合作提交前先补本文件（与代码同一提交）。

## 2026-09-11 · 我的页 banner 位废弃（主人指示）

- **我的页移除轮播 banner**：`pages/mine/index.uvue` 删除「AI试衣」下方 banner 位（swiper 区块、骨架屏 sk-banner、`banners` 数据、`handleBannerClick`、banner 系列 CSS 与 `cosThumb` 导入）；金刚区 icon_grid 配置照常保留。
- **联动后端**：`/api/page-config` 不再下发 `banner` 组件；OPS「我的页配置」不再提供 banner 类型（admin-web 同批移除 BannerPanel）；后端禁止再创建 banner 组件。
- **修复我的页崩溃（主人真机发现）**：品牌未配置金刚区 icon_grid 时 `filter(...)[0].items` 取 undefined 崩溃——前端防御式兜底（缺失用默认菜单），后端品牌缺金刚区时回退全局（与 share_card 同策略）。
- **金刚区 icon_grid 全面废除（主人指示 2026-09-11）**：我的页不再拉取中台页配置，菜单仅保留代码默认入口（我的喜欢 / AI试衣）；后端 /api/page-config 停止下发 icon_grid 并禁止再创建；OPS「我的页配置」页面与菜单项整页移除（admin-web）。
- **价目表二级页渲染套餐条目（主人指示 2026-09-11，仅展示）**：`pages/priceList` 在价目图下新增「套餐」区——1:1 头图（无图占位）/ 名称 / 内容 / 售价，数据复用公开接口 `GET /wechat/packages`（仅启用、按 sortOrder 升序，后端零改动）；后台套餐页继续配置这些字段。
- **价目表页店铺级 banner 下线（主人指示 2026-09-11）**：`pages/priceList` 移除顶部轮播（模板/数据/请求/CSS），页面只剩 价目图 + 套餐区 + 页脚；后端 `/wechat/carousels` 店铺维度停发（旧客户端拿到空列表不渲染）。
- **banner 跳转上下文补齐（主人指示 2026-09-11）**：新增 `utils/navigate.uts` 统一跳转——按店页面（相册列表/AI试衣/AI推荐/价目表）缺门店参数时自动补「品牌默认门店」，相册详情缺相册 ID 改跳相册列表，外链走 webview，tab 页走 switchTab；`index.onBannerClick` 改走统一跳转；`demoDetail` 无 idx 时兜底解析品牌默认门店（不再白页）；`aiTryOn` 支持 `albumId=random`——banner 配置「随机相册」时进页随机解析该门店可试衣相册（tryonDisabled 排除）。

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