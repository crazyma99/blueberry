# 变更日志

## 2026-09-05 · 分享卡片品牌差异化

- 新增 `src/utils/share.uts`：分享卡片三层兜底解析（品牌 share_card 槽位 → 中台全局同键 → 代码默认），title/imageUrl 字段级兜底；标题 `{brand}` 占位符自动替换为当前品牌名（品牌名解析 60s 缓存，品牌上下文切换自动失效）。
- 首页 / 相册详情 / 客片详情三页 `onShareAppMessage`（首页含 `onShareTimeline`）改为读取 `resolveShareCard()`：onLoad / 品牌切换后异步解析覆盖 data.shareCard，解析失败保留原硬编码默认（绝不白屏）。
- 配置数据源复用现有 `GET /api/page-config`（后端 share_card 组件，组件级/槽位级回退见后端仓库 CHANGELOG 同日条目），零新接口。
