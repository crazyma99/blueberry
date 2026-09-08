# 变更日志

## 2026-09-09 · 防截屏污染修复 + 试衣结果下载永久买断（分支 fix/download-buyout）

- **防截屏污染修复**：AI试衣页补 `onUnload` 恢复截屏设置——此前 redirectTo/reLaunch 销毁页面只触发 onUnload 不触发 onHide，导致 wx.setVisualEffectOnCapture(hidden) 残留全局、其他页面乃至整个小程序无法截屏；
- **下载永久买断**：结果页保存按钮新增 taskBought 态——付款一次该结果永久解锁（后端下发 taskBought），保存不再因余额 0 重复拉起支付；充值订单携带 taskId；支付到账提示「该结果已永久解锁」并自动重试保存；扣费成功本地标记已解锁。

## 2026-09-08 · Hero 轮播双层 + 上层配置 + 防截屏 + UI 统一（分支 feat/hero-parallax-overlay）

- **Hero 双层改造（最终方案）**：背景图滑动仅渐隐渐显（当前页 opacity 1 / 其他 0.3，500ms 过渡，位移交给 swiper 原生）；前景层（上层文字/图片 2 选 1）换页按 fgTick 重挂载，两段式 opacity 渐入（无位移）；文字层位于 hero-mask 之上、bottom:0+height:25% 内水平垂直居中；图片型全幅覆盖背景严丝合缝；标题字距 0.1em / 副标题 0.2em；保留 onHeroImageLoad 高度自适应、cosThumb、点击节流等原逻辑。
- **下拉刷新**：首页 + 客片展示页启用原生下拉刷新（enablePullDownRefresh + backgroundTextStyle light）；首页刷新 banner 带时间戳防缓存并重播前景动效，店铺/分享卡片同步刷新。
- **标题字体统一 Noto Serif**：AI试衣记录、AI分析结果、推荐服饰风格、我的页菜单（CustomNavBar 全局导航本就 Noto）；客片详情页补返回按钮样式。
- **防截屏**：AI试衣页 + AI试衣结果页（aiTryOnResult）`#ifdef MP-WEIXIN` 调用 wx.setVisualEffectOnCapture(hidden)，onShow 开启/离页恢复，canIUse+try/catch 兼容安卓/iOS 低版本；支付面板打断 onShow 时序后重断言。
- 上层配置数据源：GET /wechat/carousels 新增 title/subtitle/overlayType/overlayImage 字段（后端同分支下发）。
## 2026-09-05 · 分享卡片品牌差异化

- 新增 `src/utils/share.uts`：分享卡片三层兜底解析（品牌 share_card 槽位 → 中台全局同键 → 代码默认），title/imageUrl 字段级兜底；标题 `{brand}` 占位符自动替换为当前品牌名（品牌名解析 60s 缓存，品牌上下文切换自动失效）。
- 首页 / 相册详情 / 客片详情三页 `onShareAppMessage`（首页含 `onShareTimeline`）改为读取 `resolveShareCard()`：onLoad / 品牌切换后异步解析覆盖 data.shareCard，解析失败保留原硬编码默认（绝不白屏）。
- 配置数据源复用现有 `GET /api/page-config`（后端 share_card 组件，组件级/槽位级回退见后端仓库 CHANGELOG 同日条目），零新接口。
