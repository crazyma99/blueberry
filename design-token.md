# 蓝梅旅拍 C 端小程序 Design Token

> 来源：Figma 设计稿「lm」完整首页画板（node 2060:394 Home-whole，750 × 3716px）
> 提取日期：2026-09-03 ｜ 设计稿基准宽度：750px（小程序 rpx 1:1 转换）
> 备注：设计稿字体 MiSans VF 已按线上实际统一为 HarmonyOS Sans（老板口径 2026-09-03）
>
> 设计稿画布全景（canvas 2057:2 app）：
> - 2060:394 Home-whole 完整首页 750×3716（背景图 + 客片欣赏 + 服务保障 slogan + 联系我们二维码 + 页脚 + 底部 tabbar）
> - 2058:15 Home 首页局部 750×1667（仅背景图 + 客片欣赏，为 Home-whole 的截断副本）
> - 2069:853 Album List 相册列表页 750×2269
> - 2072:228 Album detail 相册详情页 750×1832

## 0. 画布与换算（老板口径 2026-09-03 确认）

- 设计稿画布：750px 宽基准
- 小程序代码画布：750rpx 宽基准（uni-app x rpx 定义 = 屏幕宽）
- **换算：1px = 1rpx**，设计稿数值可直接写入代码，无需缩放

现有代码与设计稿抽查差异（即 UI 改版要对齐的点）：

| 元素 | 设计稿 | 现有代码 | 状态 |
|---|---|---|---|
| 图片卡片圆角 | 14px | 12rpx | 待对齐 |
| 图片卡片高度 | 182px | 183rpx | 待对齐 |
| 内容区圆角 | 24px 四角 | 仅下方两角 | 待对齐 |
| 顶部视觉 | 静态背景图 1000px + 顶部栏 62px | 轮播 hero 794rpx、无顶部栏 | 结构待定 |

## 1. 颜色 Color

### 1.1 品牌核心色

| Token | 值 | 用途 |
|---|---|---|
| color-bg | #160F04 | 页面主背景（深褐） |
| color-primary | #F1CD91 | 品牌金：标题 / 强调文字 / 按钮文字 |
| color-primary-deep | #B28A56 | 金色深变体 |
| color-topbar-end | #16130F | 顶部渐层终点深色 |
| color-surface | #1D1105 | 次级深色面（卡片/容器） |

### 1.2 金色透明度变体

| Token | 值 | 用途 |
|---|---|---|
| color-primary-70 | rgba(241,205,145,0.7) | 副标题 / 次要文字（如 COLLECTION） |
| color-primary-50 | rgba(241,205,145,0.5) | 中性强调 |
| color-primary-30 | rgba(241,205,145,0.3) | 服务保障条目边框等 |
| color-primary-20 | rgba(241,205,145,0.2) | 图片卡片描边 |
| color-primary-10 | rgba(241,205,145,0.1) | 弱分割 / 浅底 |
| color-primary-06 | rgba(241,205,145,0.06) | 极浅金底 |
| color-border-soft | rgba(255,255,221,0.3) | 内容区块边框 |
| color-scrim | rgba(22,15,4,0.8) 到 rgba(22,15,4,0.1) | 卡片图片底部渐深遮罩 |
| color-topbar-bg | rgba(0,0,0,0.2) | 顶部状态栏遮罩 |

## 2. 字体 Typography

| Token | 字体族 | 字重 | 字号 | 字距 | 用途 |
|---|---|---|---|---|---|
| font-display-xl | Noto Serif SC | 700 | 46px | 13.2/13.8px | 大标题（原创摄影作品集） |
| font-display | Noto Serif SC | 700 | 38px | 0 | 区块主标题（客片欣赏） |
| font-slogan | Noto Serif SC | 700 | 34px | 0 | 主标语 / 区块标题（蓝梅，让世界看见东方美 / 长按下面二维码添加客服） |
| font-body-lg | HarmonyOS Sans | 500 | 26px | 0 | 卡片标题（店铺名） |
| font-body | HarmonyOS Sans | 400 | 24px | 0 | 正文 / 按钮（更多） |
| font-body-sm | HarmonyOS Sans | 400 | 22px | 0 | 次级说明文案 |
| font-body-xs | HarmonyOS Sans | 400 | 20px | 0 | 服务保障条目文案 |
| font-caption-md | HarmonyOS Sans | 400 | 18px | 0 | 小型说明 |
| font-caption | HarmonyOS Sans | 400 | 14px | 6.44px | 英文副标题（COLLECTION） |

## 3. 间距 Spacing（20px 为核心栅格）

| Token | 值 | 用途 |
|---|---|---|
| spacing-2xs | 6px | 微小内边距 |
| spacing-xs | 10px | 紧凑间距 |
| spacing-sm | 20px | 核心间距：卡片 gap / 区块 padding / 页面左右边距 |
| spacing-md | 28px | 服务保障条目间距 / 区块内 gap |
| spacing-lg | 32px | 区块外边距 |

## 4. 圆角 Radius

| Token | 值 | 用途 |
|---|---|---|
| radius-card | 14px | 图片卡片 |
| radius-item | 18px | 服务保障条目容器 |
| radius-container | 24px | 内容区块容器 |
| radius-pill | 39px | 近圆形容器（二维码图容器等） |

## 5. 边框 Border

| Token | 值 | 用途 |
|---|---|---|
| border-container | 2px solid rgba(255,255,221,0.3) | 内容区块 |
| border-card | 1px solid rgba(241,205,145,0.2) | 图片卡片 |

## 6. 渐变 Gradient

| Token | 值 |
|---|---|
| gradient-page | to bottom, rgba(22,15,4,0) 到 #160F04 78%（背景图渐入页面底色） |
| gradient-card-scrim | to bottom, rgba(22,15,4,0.1) 到 rgba(22,15,4,0.8) 60%（卡片图片遮罩） |
| gradient-topbar | to top, #16130F 到 rgba(22,19,15,0) |

## 7. 组件级尺寸（首页）

| 组件 | 尺寸 |
|---|---|
| 页面画板 | 750 × 1667px |
| 内容区块 | 左边距 20px，宽 710px，padding 20px，圆角 24px，内部 gap 20px |
| 图片卡片 | 325 × 182px（两列，列间距 20px），圆角 14px |
| 卡片文字容器 | 距卡片底部 19px，标题 26px + 副标题 14px |
| 顶部状态栏 | 高 62px |

## 8. 与现有代码的对照（收敛建议）

- 现有 #160F04 / #F1CD91 硬编码约 60 处 → 统一收口 color-bg / color-primary
- 现有 font-harmony（HarmonyOS Sans 子集字体）与 token 的 HarmonyOS Sans 一致
- 现有 NotoSerifSC-Bold 与 font-display 系列一致
- 半径：首页内容区 24px、卡片 14px 已与设计稿一致

