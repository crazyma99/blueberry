# 蓝梅旅拍 C 端小程序 Design Token（三层体系 v2）

> 来源：Figma 设计稿「lm」完整首页画板（node 2060:394 Home-whole，750 × 3716px）+ 2026-09-06 四张 AI 生成 4-Tab 设计稿（assets/mp/门店Tab·品牌馆Tab·价目表Tab·我的页Tab）
> 版本：v2（2026-09-06 三层 Token 体系重构：基础 → 语义 → 组件）
> 设计稿基准宽度：750px（小程序 rpx 1:1 转换，1px = 1rpx）
> 风格流派：黑金高端国风（玄墨 + 鎏金 + 月晕暖光 + 朱砂/竹青/黛蓝点缀）；字体 Noto Serif SC 标题 + HarmonyOS Sans 正文（既有口径不变）

## 0. 三层 Token 体系约定

| 层 | 定义 | 命名 | 例 |
|---|---|---|---|
| 第一层 基础（Global/Seed） | 原始设计值，无业务语义 | `--lm-ink-900` `--lm-gold-300` `--lm-spacing-20` | #160F04 |
| 第二层 语义（Alias） | 回答「用来做什么」，引用基础值 | `--lm-color-bg` `--lm-text-primary` `--lm-radius-card` | var(--lm-ink-900) |
| 第三层 组件（Component） | 回答「用在哪」，绑定具体组件 | `--lm-button-primary-bg` `--lm-tabbar-item-active` | var(--lm-gold-300) |

落地原则：代码只消费第二、三层；换肤/调色只改第一层；禁止组件直接引用基础层。

---

# 第一部分 · Color

## 1. 第一层 · 基础色板（Seed）

### 1.1 玄墨 Ink（暖黑褐阶，取意国画「焦浓重淡清」）

| Token | 值 | 说明 |
|---|---|---|
| ink-950 | #0D0802 | 焦墨 · 最深（遮罩底） |
| ink-900 | #160F04 | 玄墨 · 页面主背景（沿用 color-bg） |
| ink-800 | #1D1105 | 浓墨 · 卡片面（沿用 color-surface） |
| ink-700 | #241708 | 深面 · 浮层 raised（新增） |
| ink-600 | #2B2113 | 卡片深面（设计稿胶囊/搜索底） |
| ink-500 | #3A2C18 | 分隔/描边/图标深 |
| ink-400 | #4A3B20 | 深占位/暗图标 |
| ink-300 | #8A7A62 | 灰褐 · 辅助文字 |
| ink-200 | #C9BFA9 | 浅褐 · 说明文字 |
| ink-100 | #E8DCC2 | 米褐 · 浅正文 |
| ink-050 | #F7EFE1 | 象牙白 · 最亮面 |

### 1.2 鎏金 Gold（7 阶）

| Token | 值 | 说明 |
|---|---|---|
| gold-700 | #6E4E25 | 最金深（阴影/深描边） |
| gold-600 | #8A6432 | 金深二 |
| gold-500 | #B28A56 | 金深（沿用 color-primary-deep） |
| gold-400 | #D9B97E | 金中（图标点缀） |
| gold-300 | #F1CD91 | 品牌金（沿用 color-primary） |
| gold-200 | #F6DDB0 | 浅金（按钮高光/渐变亮端） |
| gold-100 | #FBEED6 | 极浅金（金底文字区） |

### 1.3 月晕 Amber（暖橙氛围，取意「月上柳梢」）

| Token | 值 | 说明 |
|---|---|---|
| amber-400 | #D98E4A | 月晕深（氛围光晕） |
| amber-300 | #E8A25A | 月晕（AI 徽标/角标/敬请期待） |
| amber-200 | #F2C08A | 浅晕 |

### 1.4 国风点缀 Accent（朱砂/竹青/黛蓝/月白）

| Token | 值 | 说明 |
|---|---|---|
| cinnabar-500 | #A8352A | 朱砂 · 错误/警示 |
| cinnabar-300 | #C4553F | 朱砂浅 · 角标 |
| bamboo-500 | #6E8B6A | 竹青 · 成功/可用 |
| bamboo-300 | #8FA98B | 竹青浅 |
| azure-500 | #3E5C76 | 黛蓝 · 信息/冷调点缀 |
| azure-300 | #5E7C96 | 黛蓝浅 |
| moon-100 | #EDE6D6 | 月白 · 高对比亮面 |

### 1.5 中性墨灰 Neutral（弹窗体系，沿既有设计稿）

| Token | 值 | 说明 |
|---|---|---|
| neutral-900 | #1A1A1A | 弹窗面板（沿用 --color-popup） |
| neutral-800 | #262626 | 弹窗内卡片（沿用 --color-popup-card） |
| neutral-600 | #404040 | 弹窗占位/图标 |

### 1.6 金色透明度变体（gold-300 的 α 阶梯，沿用现值）

| Token | 值 | 用途 |
|---|---|---|
| gold-alpha-70 | rgba(241,205,145,0.7) | 副标题/次要文字 |
| gold-alpha-50 | rgba(241,205,145,0.5) | 中性强调/强描边 |
| gold-alpha-30 | rgba(241,205,145,0.3) | 内容边框/分隔 |
| gold-alpha-20 | rgba(241,205,145,0.2) | 卡片描边 |
| gold-alpha-10 | rgba(241,205,145,0.1) | 弱分隔/浅底 |
| gold-alpha-06 | rgba(241,205,145,0.06) | 极浅金底 |

## 2. 第二层 · 语义 Token（Alias）

### 2.1 背景

| Token | 值 | 用途 |
|---|---|---|
| --lm-bg-page | var(--lm-ink-900) | 页面主背景 |
| --lm-bg-surface | var(--lm-ink-800) | 卡片/容器面 |
| --lm-bg-raised | var(--lm-ink-700) | 浮层/强调面 |
| --lm-bg-elevated | var(--lm-ink-600) | 深色面板（胶囊行等） |
| --lm-bg-popup | var(--lm-neutral-900) | 弹窗面板 |
| --lm-bg-popup-card | var(--lm-neutral-800) | 弹窗内卡片 |
| --lm-bg-mask | rgba(13,8,2,0.7) | 遮罩（ink-950 α0.7） |
| --lm-bg-gold-soft | var(--lm-gold-alpha-06) | 金底浅衬 |

### 2.2 文字

| Token | 值 | 用途 |
|---|---|---|
| --lm-text-title | var(--lm-gold-300) | 区块大标题（衬线金） |
| --lm-text-primary | var(--lm-ink-050) | 正文主色（米白） |
| --lm-text-secondary | var(--lm-gold-300) | 强调文字/按钮文字 |
| --lm-text-tertiary | var(--lm-gold-alpha-70) | 次强调（英文副标） |
| --lm-text-muted | var(--lm-ink-300) | 辅助说明 |
| --lm-text-disabled | var(--lm-ink-500) | 禁用/占位 |
| --lm-text-on-gold | var(--lm-ink-900) | 金底上的深字 |

### 2.3 品牌与氛围

| Token | 值 | 用途 |
|---|---|---|
| --lm-brand-primary | var(--lm-gold-300) | 品牌金 |
| --lm-brand-deep | var(--lm-gold-500) | 深金 |
| --lm-brand-glow | var(--lm-amber-300) | 月晕氛围（AI/角标/光晕） |
| --lm-brand-highlight | var(--lm-gold-200) | 按钮高光亮端 |

### 2.4 边框

| Token | 值 | 用途 |
|---|---|---|
| --lm-border-strong | var(--lm-gold-alpha-50) | 强描边（重点容器） |
| --lm-border-soft | rgba(255,255,221,0.3) | 内容区块描边（沿用） |
| --lm-border-subtle | var(--lm-gold-alpha-20) | 卡片描边 |
| --lm-border-faint | var(--lm-gold-alpha-10) | 弱分隔 |

### 2.5 反馈（国风语义色）

| Token | 值 | 用途 |
|---|---|---|
| --lm-feedback-success | var(--lm-bamboo-500) | 成功（竹青） |
| --lm-feedback-success-bg | rgba(111,139,106,0.15) | 成功底 |
| --lm-feedback-warning | var(--lm-amber-300) | 提示（月晕） |
| --lm-feedback-error | var(--lm-cinnabar-500) | 错误（朱砂） |
| --lm-feedback-error-bg | rgba(168,53,42,0.15) | 错误底 |
| --lm-feedback-info | var(--lm-azure-500) | 信息（黛蓝） |

### 2.6 遮罩

| Token | 值 | 用途 |
|---|---|---|
| --lm-scrim-strong | rgba(13,8,2,0.8) | 图片底部深遮罩端 |
| --lm-scrim-soft | rgba(22,15,4,0.1) | 遮罩浅端 |

## 3. 第三层 · 组件 Token（Component）

### 3.1 底部导航 TabBar

| Token | 值 |
|---|---|
| --lm-tabbar-bg | rgba(13,8,2,0.92) |
| --lm-tabbar-border | var(--lm-gold-alpha-10) |
| --lm-tabbar-item-active | var(--lm-gold-300) |
| --lm-tabbar-item-idle | var(--lm-ink-300) |
| --lm-tabbar-height | 116rpx + 底部安全区 |

### 3.2 门店头 StoreHeader

| Token | 值 |
|---|---|
| --lm-store-header-name | var(--lm-text-primary) |
| --lm-store-header-addr | var(--lm-ink-200) |
| --lm-store-switch-bg | var(--lm-gold-alpha-15) |
| --lm-store-switch-border | var(--lm-gold-alpha-50) |
| --lm-store-switch-text | var(--lm-gold-300) |
| --lm-store-header-scrim | linear-gradient(180deg, rgba(13,8,2,0) 0%, rgba(13,8,2,0.7) 100%) |

### 3.3 功能胶囊 FeaturePillBar

| Token | 值 |
|---|---|
| --lm-pill-primary-bg | linear-gradient(135deg, #FFDF9F 0%, #F1CD91 45%, #D9A75C 100%) |
| --lm-pill-primary-text | var(--lm-text-on-gold) |
| --lm-pill-secondary-bg | var(--lm-bg-elevated) |
| --lm-pill-secondary-border | var(--lm-gold-alpha-30) |
| --lm-pill-secondary-text | var(--lm-gold-300) |
| --lm-pill-soon-badge-bg | var(--lm-brand-glow) |
| --lm-pill-soon-badge-text | var(--lm-ink-900) |

### 3.4 搜索框 SearchBar

| Token | 值 |
|---|---|
| --lm-search-bg | var(--lm-ink-600) |
| --lm-search-text | var(--lm-ink-100) |
| --lm-search-placeholder | var(--lm-ink-300) |

### 3.5 AI 智能推荐卡

| Token | 值 |
|---|---|
| --lm-ai-card-bg | linear-gradient(135deg, var(--lm-ink-700), var(--lm-ink-800)) |
| --lm-ai-card-border | var(--lm-gold-alpha-30) |
| --lm-ai-card-title | var(--lm-gold-300) |
| --lm-ai-badge-bg | linear-gradient(135deg, var(--lm-amber-200), var(--lm-amber-400)) |
| --lm-ai-badge-text | var(--lm-ink-900) |

### 3.6 筛选 CategoryTabBar

| Token | 值 |
|---|---|
| --lm-filter-active | var(--lm-gold-300) |
| --lm-filter-idle | var(--lm-ink-200) |
| --lm-filter-border | var(--lm-gold-alpha-20) |

### 3.7 套系卡 AlbumCard

| Token | 值 |
|---|---|
| --lm-album-card-bg | var(--lm-bg-surface) |
| --lm-album-card-border | var(--lm-border-subtle) |
| --lm-album-title | var(--lm-text-primary) |
| --lm-album-price | var(--lm-gold-300) |
| --lm-album-like | var(--lm-ink-300) |
| --lm-album-scrim | linear-gradient(180deg, var(--lm-scrim-soft), var(--lm-scrim-strong) 60%) |
| --lm-album-tryon-bg | var(--lm-pill-primary-bg) |
| --lm-album-tryon-text | var(--lm-text-on-gold) |

### 3.8 价目行 PriceRow

| Token | 值 |
|---|---|
| --lm-price-row-bg | var(--lm-bg-elevated) |
| --lm-price-row-title | var(--lm-ink-100) |
| --lm-price-row-desc | var(--lm-ink-300) |
| --lm-price-row-price | var(--lm-gold-300) |

### 3.9 我的页

| Token | 值 |
|---|---|
| --lm-user-card-bg | linear-gradient(135deg, var(--lm-ink-700), var(--lm-ink-800)) |
| --lm-user-card-name | var(--lm-gold-300) |
| --lm-mine-row-bg | var(--lm-bg-elevated) |
| --lm-mine-row-text | var(--lm-ink-100) |
| --lm-mine-row-icon | var(--lm-gold-400) |

### 3.10 按钮 Button

| Token | 值 |
|---|---|
| --lm-button-primary-bg | var(--lm-pill-primary-bg) |
| --lm-button-primary-text | var(--lm-text-on-gold) |
| --lm-button-secondary-bg | var(--lm-bg-elevated) |
| --lm-button-secondary-border | var(--lm-gold-alpha-30) |
| --lm-button-secondary-text | var(--lm-gold-300) |
| --lm-button-disabled-bg | var(--lm-ink-500) |
| --lm-button-disabled-text | var(--lm-ink-300) |

### 3.11 弹窗 Popup / Toast

| Token | 值 |
|---|---|
| --lm-popup-mask | var(--lm-bg-mask) |
| --lm-popup-panel | var(--lm-bg-popup) |
| --lm-popup-card | var(--lm-bg-popup-card) |
| --lm-popup-title | var(--lm-text-primary) |
| --lm-toast-bg | var(--lm-ink-700) |
| --lm-toast-text | var(--lm-ink-050) |
| --lm-toast-border | var(--lm-gold-alpha-20) |

### 3.12 页脚 / 骨架 / 状态标签

| Token | 值 |
|---|---|
| --lm-footer-text | var(--lm-ink-300) |
| --lm-footer-divider | var(--lm-gold-alpha-10) |
| --lm-skeleton-base | var(--lm-ink-600) |
| --lm-skeleton-highlight | var(--lm-ink-500) |
| --lm-tag-ai-bg | linear-gradient(135deg, var(--lm-amber-200), var(--lm-amber-400)) |
| --lm-tag-ai-text | var(--lm-ink-900) |

---

# 第二部分 · Layout

## 4. 第一层 · 基础尺度（Seed）

### 4.1 间距（20 为核心栅格）

| Token | 值 |
|---|---|
| spacing-2 | 2rpx |
| spacing-4 | 4rpx |
| spacing-6 | 6rpx |
| spacing-8 | 8rpx |
| spacing-10 | 10rpx |
| spacing-12 | 12rpx |
| spacing-16 | 16rpx |
| spacing-20 | 20rpx |
| spacing-24 | 24rpx |
| spacing-28 | 28rpx |
| spacing-32 | 32rpx |
| spacing-40 | 40rpx |
| spacing-48 | 48rpx |
| spacing-64 | 64rpx |
| spacing-80 | 80rpx |
| spacing-96 | 96rpx |

### 4.2 圆角

| Token | 值 |
|---|---|
| radius-0 | 0 |
| radius-4 | 4rpx |
| radius-8 | 8rpx |
| radius-12 | 12rpx |
| radius-14 | 14rpx |
| radius-16 | 16rpx |
| radius-18 | 18rpx |
| radius-20 | 20rpx |
| radius-24 | 24rpx |
| radius-32 | 32rpx |
| radius-39 | 39rpx |
| radius-44 | 44rpx |
| radius-48 | 48rpx |
| radius-64 | 64rpx |
| radius-full | 999rpx |

### 4.3 描边宽 / 阴影 / 层级

| Token | 值 |
|---|---|
| border-w-1 | 1rpx |
| border-w-2 | 2rpx |
| shadow-1 | 0 4rpx 16rpx rgba(13,8,2,0.4) |
| shadow-2 | 0 8rpx 32rpx rgba(13,8,2,0.5) |
| z-content | 10 |
| z-tabbar | 50 |
| z-popup | 100 |
| z-toast | 200 |
| z-login | 300 |

### 4.4 控件尺寸

| Token | 值 |
|---|---|
| icon-xs | 32rpx |
| icon-sm | 40rpx |
| icon-md | 48rpx |
| control-h-sm | 64rpx |
| control-h-md | 72rpx |
| control-h-lg | 88rpx |
| tabbar-h | 116rpx + 安全区 |
| nav-h | 44rpx + 状态栏 |
| page-pad-x | 20rpx |
| album-card-h | 182rpx（图区，两列 325rpx 宽） |

## 5. 第二层 · 语义 Token（Alias）

| Token | 值 | 用途 |
|---|---|---|
| --lm-spacing-page | var(--lm-spacing-20) | 页面左右边距 |
| --lm-spacing-section | var(--lm-spacing-28) | 区块间距 |
| --lm-spacing-card-gap | var(--lm-spacing-20) | 卡片间隙 |
| --lm-spacing-item-gap | var(--lm-spacing-16) | 列表项内间距 |
| --lm-radius-card | var(--lm-radius-14) | 图片卡片 |
| --lm-radius-container | var(--lm-radius-24) | 内容容器 |
| --lm-radius-popup | var(--lm-radius-32) | 弹窗 |
| --lm-radius-pill | var(--lm-radius-full) | 胶囊 |
| --lm-border-container | 2rpx solid var(--lm-border-soft) | 内容区块描边 |
| --lm-border-card | 1rpx solid var(--lm-border-subtle) | 卡片描边 |
| --lm-elevation-popup | var(--lm-shadow-2) | 弹窗投影 |

## 6. 第三层 · 组件 Token（Component）

| Token | 值 |
|---|---|
| --lm-store-header-pad | 20rpx 24rpx |
| --lm-store-switch-h | 48rpx |
| --lm-banner-h | 140rpx |
| --lm-banner-radius | var(--lm-radius-container) |
| --lm-pill-h | 64rpx |
| --lm-pill-gap | 16rpx |
| --lm-search-h | 64rpx |
| --lm-ai-card-pad | 20rpx |
| --lm-filter-h | 68rpx |
| --lm-filter-text | 24rpx |
| --lm-album-grid-cols | 2 |
| --lm-album-grid-gap | var(--lm-spacing-card-gap) |
| --lm-album-card-pad-b | 19rpx |
| --lm-price-row-pad | 20rpx |
| --lm-price-row-gap | 12rpx |
| --lm-mine-row-h | 88rpx |
| --lm-popup-pad | 40rpx |
| --lm-button-h | var(--lm-control-h-lg) |

---

## 7. 旧 Token → 新 Token 迁移对照（代码落地用）

| 旧（--color-*） | 新 | 备注 |
|---|---|---|
| --color-bg | --lm-bg-page (ink-900) | 值不变 |
| --color-primary | --lm-brand-primary (gold-300) | 值不变 |
| --color-primary-deep | --lm-brand-deep (gold-500) | 值不变 |
| --color-surface | --lm-bg-surface (ink-800) | 值不变 |
| --color-primary-70/50/30/20/10/06 | --lm-gold-alpha-* | 值不变 |
| --color-border-soft | --lm-border-soft | 值不变 |
| --color-popup / popup-card | --lm-bg-popup / popup-card (neutral) | 值不变 |
| --gradient-btn-primary | --lm-pill-primary-bg | 值不变 |
| --radius-* / --spacing-* | 并入三层（第一层同名，语义层换 --lm-* 名） | 兼容保留 |
| 新增 | --lm-brand-glow(amber) / surface-raised(ink-700) / 朱砂竹青黛蓝反馈色 | 本次丰富 |

## 8. 落地建议

1. 在 `src/uni.scss` 或 `App.uvue` `:root/page` 中新增三层变量（第一层直写色值，第二/三层 `var()` 引用）；
2. 现有 `--color-*` 名先做别名兼容（`--color-bg: var(--lm-bg-page)`），页面分批替换，零视觉回归；
3. 组件层 Token 随「4-Tab 组件化拆分清单」一起落地（StoreHeader/AlbumCard 等新组件直接用第三层变量）。
